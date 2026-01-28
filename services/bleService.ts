import { Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer';

// polyfill Buffer globally for Replit/Expo environment
if (typeof global.Buffer === 'undefined') {
  (global as any).Buffer = Buffer;
}

let BleManager: any = null;
let bleManagerInstance: any = null;

// ============================================================================
// MULTI-RANGE UUID CONFIGURATION (Handles Standard and Vendor-Specific)
// ============================================================================
const UUID_RANGES = {
  STANDARD: {
    SERVICE: 'fe25c237-0ece-443c-b0aa-e02033e7029d',
    WRITE:   'fe25c237-0ece-443c-b0aa-e02033e7029e',
    NOTIFY:  'fe25c237-0ece-443c-b0aa-e02033e7029f'
  },
  VENDOR: {
    SERVICE: '27b7570b-359e-45a3-91bb-cf7e70049bd2',
    WRITE:   '27b7570b-359e-45a3-91bb-cf7e70049bd3',
    NOTIFY:  '27b7570b-359e-45a3-91bb-cf7e70049bd4'
  }
};

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
  
  // Dynamic state for the current session
  private activeService = '';
  private activeWrite = '';
  private activeNotify = '';

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
   * TRANSACTIONAL COMMAND (Verbatim Stop-and-Wait)
   * This forces the JS thread to 'block' until the hardware responds.
   * Uses numeric expectedAck for cleaner byte comparison (e.g., 0x75 for 0x35 handshake)
   * Handles unified IDs where Write and Notify may share the same characteristic
   */
  async executeUDSCommand(command: number, payload: number[] = [], expectedAck: number): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      let resolved = false;

      // 1. Setup 'Ear' (Listener)
      const subscription = this.connectedDevice.monitorCharacteristicForService(
        this.activeService,
        this.activeNotify,
        (error: any, char: any) => {
          if (error || resolved) return;
          const data = Buffer.from(char.value, 'base64');
          
          // Shearwater ACK: Check byte at index 4 (0x35 -> 0x75)
          if (data[4] === expectedAck) {
            bleLog('RX', `ACK 0x${expectedAck.toString(16)} received.`);
            resolved = true;
            subscription.remove();
            resolve(data);
          }
        }
      );

      // 2. MANDATORY SETTLE: Wait 1000ms for subscription to activate
      // Increased from 500ms to 1000ms to ensure iOS internal state is ready
      await new Promise(r => setTimeout(r, 1000));

      // 3. Send the command
      try {
        const frame = this.wrapUDSCommand(command, payload);
        bleLog('TX', `Sending 0x${command.toString(16)} to ${this.activeWrite.slice(-4)}`);
        
        // Use writeWithoutResponse for high-speed handshake
        await this.connectedDevice.writeCharacteristicWithoutResponseForService(
          this.activeService,
          this.activeWrite,
          frame
        );
      } catch (e) {
        subscription.remove();
        reject(e);
      }

      // 4. Verbatim 10s Timeout
      setTimeout(() => {
        if (!resolved) {
          subscription.remove();
          reject(new Error(`Timeout waiting for ACK 0x${expectedAck.toString(16)}`));
        }
      }, 10000);
    });
  }

  /**
   * Main connection sequence with Synchronous Simulation & Auto-Detection
   */
  async connectAndEstablishSession(deviceId: string): Promise<boolean> {
    try {
      this.manager.stopDeviceScan();
      bleLog('CONNECT', `Connecting to ${deviceId}...`);
      
      // Verbatim libdc: Standard connection with long timeout
      let device = await this.manager.connectToDevice(deviceId, { timeout: 15000 });
      
      // Initial Interrogation
      await device.discoverAllServicesAndCharacteristics();
      await device.requestMTU(512);

      // Mandatory Subsurface-style stabilization window
      bleLog('STABILIZE', 'Waiting 3000ms for warm-up...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // INTERROGATION & AUTO-DETECTION LOOP
      let foundRange = false;
      for (let i = 0; i < 5; i++) {
        bleLog('DISCOVER', `Polling attempt ${i + 1}/5...`);
        
        const services = await device.services();
        for (const s of services) {
          const uuid = s.uuid.toLowerCase();
          const isStandard = uuid === UUID_RANGES.STANDARD.SERVICE.toLowerCase();
          const isVendor = uuid === UUID_RANGES.VENDOR.SERVICE.toLowerCase();

          if (isStandard || isVendor) {
            this.activeService = uuid;
            const chars = await s.characteristics();
            
            // Find characteristics by what they DO, not just their UUIDs
            const writeChar = chars.find((c: any) => c.isWritableWithoutResponse || c.isWritableWithResponse);
            const notifyChar = chars.find((c: any) => c.isNotifiable || c.isIndicatable);
            
            chars.forEach((c: any) => bleLog('DEBUG_CHAR', `UUID: ${c.uuid.slice(-4)} W:${c.isWritableWithoutResponse || c.isWritableWithResponse} N:${c.isNotifiable || c.isIndicatable}`));

            if (writeChar && notifyChar) {
              this.activeWrite = writeChar.uuid;
              this.activeNotify = notifyChar.uuid;
              bleLog('AUTO_DETECT', `Found Write: ${this.activeWrite.slice(-4)}, Notify: ${this.activeNotify.slice(-4)}`);
              foundRange = true;
              break;
            }
          }
        }
        if (foundRange) break;
        
        bleLog('RECOVERY', 'Range not found. Retrying discovery...');
        await device.discoverAllServicesAndCharacteristics();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (!foundRange) throw new Error("Could not detect Shearwater UDS range.");

      this.connectedDevice = device;
      
      // TRANSACTIONAL HANDSHAKE: Forces the app to wait for the 0x75 ACK
      bleLog('HANDSHAKE', 'Starting transactional 0x35 handshake...');
      await this.executeUDSCommand(0x35, [], UDS.HANDSHAKE_ACK);
      
      bleLog('SUCCESS', 'Session established.');
      return true;
    } catch (e: any) {
      bleLog('ERROR', e.message);
      return false;
    }
  }

  /**
   * Dynamic Write Logic to satisfy iOS GATT permissions
   */
  private async safeWrite(charUUID: string, base64Data: string) {
    const characteristics = await this.connectedDevice.characteristicsForService(this.activeService);
    const char = characteristics.find((c: any) => c.uuid.toLowerCase() === charUUID.toLowerCase());

    if (!char) throw new Error(`Characteristic ${charUUID} not found`);

    if (char.isWritableWithoutResponse) {
      return await this.connectedDevice.writeCharacteristicWithoutResponseForService(
        this.activeService, charUUID, base64Data
      );
    } else {
      return await this.connectedDevice.writeCharacteristicWithResponseForService(
        this.activeService, charUUID, base64Data
      );
    }
  }

  /**
   * UDS Read Data (0x22) - Request Log Manifest
   */
  async getLogManifest(): Promise<any> {
    bleLog('MANIFEST', 'Requesting dive list (0x22)...');
    const data = await this.executeUDSCommand(0x22, [0x80, 0x20], UDS.READ_ACK);
    return {
      diveCount: data.readUInt16BE(7),
      latestId: data.readUInt16BE(9),
      oldestId: data.readUInt16BE(11)
    };
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