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
   * TRANSACTIONAL COMMAND (Build 27 - Android Emulation Write)
   * - Uses discovered characteristics with minimum MTU for iOS
   * - writeWithoutResponse exclusively to prevent iOS ACK validation
   * - Subscribe to notify BEFORE write so we catch immediate response
   */
  async executeUDSCommand(command: number, payload: number[] = [], expectedAck: number, forceWithResponse: boolean = false): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      let resolved = false;

      // Ensure we have a valid locked path before starting
      if (!this.activeService || !this.activeNotify) {
        return reject(new Error("GATT path not locked. Discovery failed."));
      }

      // Build 25: Setup Listener FIRST - must be ready before blind write
      bleLog('SUBSCRIBE', `Setting up notify listener on ${this.activeNotify.slice(-4)}...`);
      const subscription = this.connectedDevice.monitorCharacteristicForService(
        this.activeService,
        this.activeNotify,
        (error: any, char: any) => {
          if (error) {
            bleLog('NOTIFY_ERR', error.message);
            return;
          }
          if (resolved) return;
          
          const data = Buffer.from(char.value, 'base64');
          bleLog('DATA_IN', `Bytes: ${data.toString('hex')}`);

          if (data[4] === expectedAck) {
            bleLog('RX', `ACK 0x${expectedAck.toString(16)} received.`);
            resolved = true;
            subscription.remove();
            resolve(data);
          }
        }
      );

      // Build 25: Short delay to ensure subscription is active
      await new Promise(r => setTimeout(r, 500));

      try {
        const frame = this.wrapUDSCommand(command, payload);
        bleLog('TX', `Sending 0x${command.toString(16)} via blind write to ${this.activeWrite.slice(-4)}`);
        
        // Build 25: ALWAYS use writeWithoutResponse for handshake (0x35)
        // This bypasses iOS's handle validation that was blocking us
        if (command === UDS.REQUEST_DOWNLOAD) {
          bleLog('BLIND_WRITE', 'Using writeWithoutResponse to bypass iOS handle validation...');
          await this.connectedDevice.writeCharacteristicWithoutResponseForService(
            this.activeService,
            this.activeWrite,
            frame
          );
          bleLog('BLIND_WRITE', 'Write sent (no iOS ACK required)');
        } else {
          // For other commands after session established, use withResponse
          await this.connectedDevice.writeCharacteristicWithResponseForService(
            this.activeService,
            this.activeWrite,
            frame
          );
        }
      } catch (e: any) {
        bleLog('WRITE_ERR', e.message);
        subscription.remove();
        reject(e);
      }

      setTimeout(() => {
        if (!resolved) {
          subscription.remove();
          reject(new Error(`Timeout waiting for ACK 0x${expectedAck.toString(16)}`));
        }
      }, 12000);
    });
  }

  /**
   * Main connection sequence (Build 27) - Android Emulation
   * - Android works because it's "handle-oriented" not "service-oriented"
   * - iOS tries to negotiate 256-byte MTU which may trigger disconnect
   * - Solution: Force minimum MTU (23 bytes) to emulate Android behavior
   * - Use whatever service we find but target characteristics by handle
   */
  async connectAndEstablishSession(deviceId: string): Promise<boolean> {
    try {
      this.manager.stopDeviceScan();
      bleLog('CONNECT', `Connecting to ${deviceId}...`);
      
      let device = await this.manager.connectToDevice(deviceId, { timeout: 15000 });
      this.connectedDevice = device;

      // Build 27: Platform-specific connection tuning
      if (Platform.OS === 'android') {
        bleLog('PRIORITY', 'Requesting high connection priority...');
        await device.requestConnectionPriority(1); // 1 = ConnectionPriority.High
      }

      // Build 27: Force minimum MTU on iOS to emulate Android default behavior
      // Android often uses 23-byte MTU, iOS tries 256+ which may trigger disconnect
      if (Platform.OS === 'ios') {
        bleLog('MTU_FORCE', 'Forcing minimum MTU (23 bytes) to emulate Android...');
        try {
          await device.requestMTU(23);
          bleLog('MTU_SUCCESS', 'MTU negotiated to minimum (23 bytes)');
        } catch (mtuErr: any) {
          bleLog('MTU_WARN', `MTU negotiation failed: ${mtuErr.message} - continuing anyway`);
        }
      }

      // Build 27: Shearwater characteristic suffixes we look for
      const SHEARWATER_CHAR_SUFFIXES = ['029e', '029f', '9bd2', '9bd3', '9bd4'];

      let foundValidPath = false;
      const MAX_DISCOVERY_ATTEMPTS = 3;

      // Build 27: Discovery - accept ANY Shearwater service, focus on characteristics
      for (let attempt = 1; attempt <= MAX_DISCOVERY_ATTEMPTS && !foundValidPath; attempt++) {
        bleLog('DISCOVER', `GATT discovery attempt ${attempt}/${MAX_DISCOVERY_ATTEMPTS}...`);
        await device.discoverAllServicesAndCharacteristics();
        
        if (attempt > 1) {
          bleLog('SETTLE', 'Waiting 1s for GATT table to populate...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const services = await device.services();
        bleLog('GATT_MAP', `Found ${services.length} services`);
        
        // Build 27: Log all services for debugging
        services.forEach((s: any) => {
          bleLog('SVC_DETAIL', `Service: ${s.uuid.slice(-4)} (full: ${s.uuid})`);
        });
        
        // Build 27: Accept ANY Shearwater service (029d OR 9bd2)
        const shearwaterService = services.find((s: any) => {
          const uuid = s.uuid.toLowerCase();
          return uuid.includes('029d') || uuid.includes('9bd2');
        });
        
        if (shearwaterService) {
          const svcUUID = (shearwaterService as any).uuid.toLowerCase();
          bleLog('SERVICE_FOUND', `Using Shearwater Service: ${svcUUID.slice(-4)}`);
          
          let chars;
          try {
            chars = await device.characteristicsForService(svcUUID);
          } catch (e) {
            chars = await (shearwaterService as any).characteristics();
          }
          
          bleLog('GATT_MAP', `Service has ${chars.length} characteristics`);
          chars.forEach((c: any) => {
            bleLog('CHAR_DETAIL', `  -> ${c.uuid.slice(-4)} | Write: ${c.isWritableWithResponse || c.isWritableWithoutResponse} | Notify: ${c.isNotifiable || c.isIndicatable}`);
          });
          
          // Build 27: Find ANY writable Shearwater characteristic
          const writeChar = chars.find((c: any) => {
            const charUUID = c.uuid.toLowerCase();
            const isWritable = c.isWritableWithResponse || c.isWritableWithoutResponse;
            return isWritable && SHEARWATER_CHAR_SUFFIXES.some(suffix => charUUID.includes(suffix));
          });
          
          // Build 27: Find ANY notifiable Shearwater characteristic  
          const notifyChar = chars.find((c: any) => {
            const charUUID = c.uuid.toLowerCase();
            const isNotifiable = c.isNotifiable || c.isIndicatable;
            return isNotifiable && SHEARWATER_CHAR_SUFFIXES.some(suffix => charUUID.includes(suffix));
          });
          
          if (writeChar && notifyChar) {
            this.activeService = svcUUID;
            this.activeWrite = writeChar.uuid;
            this.activeNotify = notifyChar.uuid;
            bleLog('LOCK_SUCCESS', `Handle Lock -> Svc: ${svcUUID.slice(-4)}, Write: ${writeChar.uuid.slice(-4)}, Notify: ${notifyChar.uuid.slice(-4)}`);
            foundValidPath = true;
          }
        }
      }

      // Build 27: If nothing found, fail with clear message
      if (!foundValidPath) {
        throw new Error("No compatible Shearwater GATT path found after " + MAX_DISCOVERY_ATTEMPTS + " attempts.");
        foundValidPath = true; // Optimistic - will fail at handshake if wrong
      }

      // Build 24: 500ms pre-handshake breath for iOS GATT stack stabilization
      bleLog('SETTLE', 'Waiting 500ms for iOS GATT stack...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // Build 24: MTU negotiation BEFORE handshake for full device readiness
      bleLog('MTU', 'Requesting MTU 256...');
      await device.requestMTU(256);

      // Build 24: Handshake with explicit writeWithResponse for hardware ACK
      bleLog('HANDSHAKE', 'Starting 0x35 handshake (withResponse)...');
      const result = await this.executeUDSCommand(UDS.REQUEST_DOWNLOAD, [], UDS.HANDSHAKE_ACK, true);
      
      bleLog('SUCCESS', 'Session established.');
      return true;

    } catch (e: any) {
      bleLog('SESSION_ERR', e.message);
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