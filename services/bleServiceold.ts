import { Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer';

// polyfill Buffer globally for Replit/Expo environment
if (typeof global.Buffer === 'undefined') {
  (global as any).Buffer = Buffer;
}

let BleManager: any = null;
let bleManagerInstance: any = null;

// ============================================================================
// SHEARWATER PROTOCOL CONSTANTS (Subsurface/libdc)
// ============================================================================
const SHEARWATER_SERVICE_UUID = 'fe25c237-0ece-443c-b0aa-e02033e7029d';
const SHEARWATER_WRITE_CHAR = 'fe25c237-0ece-443c-b0aa-e02033e7029e';
const SHEARWATER_NOTIFY_CHAR = 'fe25c237-0ece-443c-b0aa-e02033e7029f';

const UDS = {
  REQUEST_DOWNLOAD: 0x35, // Session Init
  READ_DATA: 0x22,        // RDBI
  READ_ACK: 0x62,         // 0x22 + 0x40
  HANDSHAKE_ACK: 0x75,    // 0x35 + 0x40
};

const bleLog = (category: string, message: string, data?: any) => {
  const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
  console.warn(`[BLE ${timestamp}] [${category}] ${message}`, data || '');
};

if (Platform.OS !== 'web') {
  try {
    const blePlx = require('react-native-ble-plx');
    BleManager = blePlx.BleManager;
  } catch (e) {
    console.warn('react-native-ble-plx not available');
  }
}

class BleService {
  private manager: any = null;
  private connectedDevice: any = null;
  private isInitialized: boolean = false;

  async initialize(): Promise<boolean> {
    if (!BleManager) return false;
    if (!bleManagerInstance) bleManagerInstance = new BleManager();
    this.manager = bleManagerInstance;
    this.isInitialized = true;
    return true;
  }

  // Helper to wrap commands in Shearwater UDS framing
  private wrapUDSCommand(command: number, payload: number[] = []): string {
    const header = [0xFF, 0x01];
    const length = payload.length + 1; // payload bytes + command byte
    const frame = [...header, length, 0x00, command, ...payload, 0xC0];
    return Buffer.from(frame).toString('base64');
  }

  async startScanning(onDeviceFound: (device: any) => void) {
    if (!this.manager) return;
    // Perform unfiltered scan to bypass iOS caching issues
    this.manager.startDeviceScan(null, null, (error: any, device: any) => {
      if (device && device.name && device.name.includes('Perdix')) {
        onDeviceFound(device);
      }
    });
  }

  /**
   * Main connection sequence mimicking Subsurface stability
   */
  async connectAndEstablishSession(deviceId: string): Promise<boolean> {
    try {
      bleLog('CONNECT', `Connecting to ${deviceId}...`);
      const device = await this.manager.connectToDevice(deviceId, { timeout: 15000 });
      await device.discoverAllServicesAndCharacteristics();

      // Negotiate MTU to trigger GATT stability
      await device.requestMTU(512);

      // Subsurface-style stabilization delay
      bleLog('STABILIZE', 'Waiting 3000ms for GATT warm-up...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      this.connectedDevice = device;

      // START HANDSHAKE
      return await this.performUDSHandshake();
    } catch (e: any) {
      bleLog('ERROR', e.message);
      return false;
    }
  }

  private async performUDSHandshake(): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      let resolved = false;

      // 1. Setup Listener BEFORE writing
      const subscription = this.connectedDevice.monitorCharacteristicForService(
        SHEARWATER_SERVICE_UUID,
        SHEARWATER_NOTIFY_CHAR,
        (error: any, char: any) => {
          if (error) return;
          const hex = Buffer.from(char.value, 'base64').toString('hex');
          bleLog('RX', `Data received: ${hex}`);

          // Look for 0x75 (Handshake ACK)
          if (hex.includes('75')) {
            bleLog('HANDSHAKE', 'Success! 0x75 ACK received.');
            resolved = true;
            subscription.remove();
            resolve(true);
          }
        }
      );

      // 2. Send 0x35 frame
      try {
        const handshakeFrame = this.wrapUDSCommand(UDS.REQUEST_DOWNLOAD, [0x00, 0x34]);

        // Use writeWithoutResponse (false) for modern Shearwater characteristics
        await this.connectedDevice.writeCharacteristicWithoutResponseForService(
          SHEARWATER_SERVICE_UUID,
          SHEARWATER_WRITE_CHAR,
          handshakeFrame
        );
      } catch (e) {
        subscription.remove();
        reject(e);
      }

      // 3. Timeout matching Subsurface (12s)
      setTimeout(() => {
        if (!resolved) {
          subscription.remove();
          reject(new Error('UDS Handshake Timeout'));
        }
      }, 12000);
    });
  }

  /**
   * Fetch log manifest (0x8020) to check dive count
   */
  async getLogManifest() {
    const frame = this.wrapUDSCommand(UDS.READ_DATA, [0x80, 0x20]);
    await this.connectedDevice.writeCharacteristicWithoutResponseForService(
      SHEARWATER_SERVICE_UUID,
      SHEARWATER_WRITE_CHAR,
      frame
    );
  }

  async disconnect() {
    if (this.connectedDevice) {
      await this.connectedDevice.cancelConnection();
      this.connectedDevice = null;
    }
  }
}

export const bleService = new BleService();
export default bleService;