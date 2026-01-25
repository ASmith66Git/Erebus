import { Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer';

// polyfill Buffer globally for Replit/Expo environment
if (typeof global.Buffer === 'undefined') {
  (global as any).Buffer = Buffer;
}

let BleManager: any = null;
let bleManagerInstance: any = null;

// ============================================================================
// SHEARWATER PROTOCOL CONSTANTS (libdivecomputer standard)
// ============================================================================
const SHEARWATER_SERVICE_UUID = 'fe25c237-0ece-443c-b0aa-e02033e7029d';
const SHEARWATER_WRITE_CHAR = 'fe25c237-0ece-443c-b0aa-e02033e7029e';
const SHEARWATER_NOTIFY_CHAR = 'fe25c237-0ece-443c-b0aa-e02033e7029f';

const UDS = {
  REQUEST_DOWNLOAD: 0x35, // Session Init
  READ_DATA: 0x22,        // Read Data By Identifier (RDBI)
  HANDSHAKE_ACK: 0x75,    // 0x35 + 0x40
  READ_ACK: 0x62,         // 0x22 + 0x40
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

  /**
   * Helper to wrap commands in Shearwater UDS framing
   */
  public wrapUDSCommand(command: number, payload: number[] = []): string {
    const header = [0xFF, 0x01];
    let frame: number[];

    if (command === UDS.REQUEST_DOWNLOAD) {
      // libdivecomputer 0x35 frame: FF 01 0B 00 35 00 34 00 00 00 00 00 00 01 C0
      frame = [...header, 0x0B, 0x00, 0x35, 0x00, 0x34, 0, 0, 0, 0, 0, 0, 1, 0xC0];
    } else {
      const length = payload.length + 1; // cmd byte + payload bytes
      frame = [...header, length, 0x00, command, ...payload, 0xC0];
    }
    return Buffer.from(frame).toString('base64');
  }

  async startScanning(onDeviceFound: (device: any) => void) {
    if (!this.manager) return;
    bleLog('SCAN', 'Starting unfiltered scan...');
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
      this.manager.stopDeviceScan();
      bleLog('CONNECT', `Connecting to ${deviceId}...`);

      const device = await this.manager.connectToDevice(deviceId, { timeout: 15000 });
      await device.discoverAllServicesAndCharacteristics();

      // Trigger GATT stability via MTU
      await device.requestMTU(512);

      // Subsurface-style GATT stabilization window
      bleLog('STABILIZE', 'Waiting 3000ms for GATT warm-up...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      this.connectedDevice = device;

      // Establish the secure UDS session
      return await this.performUDSHandshake();
    } catch (e: any) {
      bleLog('ERROR', e.message);
      return false;
    }
  }

  private async performUDSHandshake(): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      let resolved = false;

      // 1. Subscribe FIRST so we don't miss the ACK
      bleLog('HANDSHAKE', 'Setting up listener on ...9f');
      const subscription = this.connectedDevice.monitorCharacteristicForService(
        SHEARWATER_SERVICE_UUID,
        SHEARWATER_NOTIFY_CHAR,
        (error: any, char: any) => {
          if (error) {
            bleLog('RX_ERR', error.message);
            return;
          }
          const hex = Buffer.from(char.value, 'base64').toString('hex');
          bleLog('RX', `Data: ${hex}`);

          // Check for 0x75 ACK (Positive response to 0x35)
          if (hex.includes('75')) {
            bleLog('HANDSHAKE', 'Success! Session initialized.');
            resolved = true;
            subscription.remove();
            resolve(true);
          }
        }
      );

      // 2. Send the 0x35 Session Init frame
      try {
        const handshakeFrame = this.wrapUDSCommand(UDS.REQUEST_DOWNLOAD);
        bleLog('TX', 'Sending 0x35 Handshake');

        // Dynamic Write Selection: Fixes "Writing not permitted"
        await this.safeWrite(SHEARWATER_WRITE_CHAR, handshakeFrame);
      } catch (e) {
        subscription.remove();
        reject(e);
      }

      // 3. Handshake timeout (Matching Subsurface 12s)
      setTimeout(() => {
        if (!resolved) {
          subscription.remove();
          reject(new Error('UDS Handshake Timeout'));
        }
      }, 12000);
    });
  }

  /**
   * Dynamic Write Logic to satisfy iOS GATT permissions
   */
  private async safeWrite(charUUID: string, base64Data: string) {
    const characteristics = await this.connectedDevice.characteristicsForService(SHEARWATER_SERVICE_UUID);
    const char = characteristics.find((c: any) => c.uuid.toLowerCase() === charUUID.toLowerCase());

    if (!char) throw new Error(`Characteristic ${charUUID} not found`);

    if (char.isWritableWithoutResponse) {
      return await this.connectedDevice.writeCharacteristicWithoutResponseForService(
        SHEARWATER_SERVICE_UUID, charUUID, base64Data
      );
    } else {
      return await this.connectedDevice.writeCharacteristicWithResponseForService(
        SHEARWATER_SERVICE_UUID, charUUID, base64Data
      );
    }
  }

  /**
   * UDS Read Data (0x22) - Request Log Manifest
   */
  async getLogManifest(): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const subscription = this.connectedDevice.monitorCharacteristicForService(
        SHEARWATER_SERVICE_UUID,
        SHEARWATER_NOTIFY_CHAR,
        (error: any, char: any) => {
          if (error) return;
          const data = Buffer.from(char.value, 'base64');

          // Look for 0x62 ACK (Positive response to 0x22)
          if (data[4] === UDS.READ_ACK) {
            subscription.remove();
            resolve({
              diveCount: data.readUInt16BE(7),
              latestDiveId: data.readUInt16BE(9),
              oldestDiveId: data.readUInt16BE(11)
            });
          }
        }
      );

      const frame = this.wrapUDSCommand(UDS.READ_DATA, [0x80, 0x20]);
      await this.safeWrite(SHEARWATER_WRITE_CHAR, frame);
    });
  }

  async disconnect() {
    if (this.connectedDevice) {
      await this.connectedDevice.cancelConnection();
      this.connectedDevice = null;
    }
  }

  /**
   * Stop BLE scanning
   */
  stopScanning() {
    if (this.manager) {
      this.manager.stopDeviceScan();
    }
  }

  /**
   * Monitor a characteristic for notifications
   * Returns a function to unsubscribe
   */
  async monitorCharacteristic(
    serviceUUID: string,
    characteristicUUID: string,
    onData: (base64Data: string) => void,
    onError?: (error: Error) => void
  ): Promise<() => void> {
    if (!this.connectedDevice) {
      throw new Error('No device connected');
    }

    const subscription = this.connectedDevice.monitorCharacteristicForService(
      serviceUUID,
      characteristicUUID,
      (error: any, characteristic: any) => {
        if (error) {
          bleLog('MONITOR_ERR', error.message);
          if (onError) onError(error);
          return;
        }
        if (characteristic?.value) {
          onData(characteristic.value);
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }

  /**
   * Write data to a characteristic
   * @param serviceUUID - The service UUID
   * @param characteristicUUID - The characteristic UUID
   * @param base64Data - The data to write (base64 encoded)
   * @param withResponse - If true, use write with response; if false, use write without response
   */
  async writeCharacteristic(
    serviceUUID: string,
    characteristicUUID: string,
    base64Data: string,
    withResponse: boolean = false
  ): Promise<void> {
    if (!this.connectedDevice) {
      throw new Error('No device connected');
    }

    bleLog('TX', `Writing to ${characteristicUUID.slice(-4)} (withResponse=${withResponse})`);

    if (withResponse) {
      await this.connectedDevice.writeCharacteristicWithResponseForService(
        serviceUUID,
        characteristicUUID,
        base64Data
      );
    } else {
      await this.connectedDevice.writeCharacteristicWithoutResponseForService(
        serviceUUID,
        characteristicUUID,
        base64Data
      );
    }
  }

  /**
   * Get the currently connected device
   */
  getConnectedDevice(): any {
    return this.connectedDevice;
  }

  /**
   * Check if a device is connected
   */
  isConnected(): boolean {
    return this.connectedDevice !== null;
  }
}

export const bleService = new BleService();
export default bleService;