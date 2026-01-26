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

  /**
   * Request BLE permissions (Android 12+ requires runtime permissions)
   */
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      try {
        const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(Platform.Version, 10);
        
        if (apiLevel >= 31) {
          // Android 12+ needs BLUETOOTH_SCAN and BLUETOOTH_CONNECT
          const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ]);
          
          return (
            granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
            granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
          );
        } else {
          // Older Android just needs location
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
      } catch (err) {
        bleLog('PERMISSION', 'Error requesting permissions', err);
        return false;
      }
    }
    // iOS handles permissions automatically via Info.plist
    return true;
  }

  /**
   * Start scanning for BLE devices
   * @param serviceUUIDs - Optional array of service UUIDs to filter (null for all devices)
   * @param onDeviceFound - Callback when a device is found
   */
  async startScanning(serviceUUIDs: string[] | null, onDeviceFound: (device: any) => void) {
    if (!this.manager) {
      bleLog('SCAN', 'Manager not initialized');
      return;
    }
    bleLog('SCAN', 'Starting scan...', { serviceUUIDs });
    
    this.manager.startDeviceScan(serviceUUIDs, null, (error: any, device: any) => {
      if (error) {
        bleLog('SCAN_ERR', error.message);
        return;
      }
      if (device && device.name) {
        onDeviceFound({
          id: device.id,
          name: device.name,
          rssi: device.rssi,
        });
      }
    });
  }

  /**
   * Connect to a device by ID (wrapper for UI compatibility)
   */
  async connect(deviceId: string): Promise<boolean> {
    return this.connectAndEstablishSession(deviceId);
  }

  /**
   * Main connection sequence mimicking Subsurface stability
   */
  async connectAndEstablishSession(deviceId: string): Promise<boolean> {
    try {
      this.manager.stopDeviceScan();
      bleLog('CONNECT', `Connecting to ${deviceId}...`);
      
      let device = await this.manager.connectToDevice(deviceId, { timeout: 15000 });
      
      // Initial Interrogation
      await device.discoverAllServicesAndCharacteristics();
      await device.requestMTU(512);

      let charFound = false;
      for (let i = 0; i < 3; i++) {
        bleLog('DISCOVER', `Verification attempt ${i + 1}/3...`);
        
        // Explicitly fetch all services to force the bridge to refresh
        const services = await device.services();
        for (const service of services) {
          if (service.uuid.toLowerCase() === SHEARWATER_SERVICE_UUID.toLowerCase()) {
            const chars = await service.characteristics();
            if (chars.some((c: any) => c.uuid.toLowerCase() === SHEARWATER_WRITE_CHAR.toLowerCase())) {
              charFound = true;
              break;
            }
          }
        }

        if (charFound) break;

        // Verbatim Recovery: Nuclear Refresh
        bleLog('RECOVERY', `Attempt ${i + 1}: Char missing, forcing GATT refresh...`);
        await this.manager.cancelDeviceConnection(deviceId);
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Reconnect with explicit refreshGatt flag
        device = await this.manager.connectToDevice(deviceId, { refreshGatt: true });
        await device.discoverAllServicesAndCharacteristics();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (!charFound) throw new Error("Verbatim Discovery Failed: Write characteristic not found");

      this.connectedDevice = device;
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