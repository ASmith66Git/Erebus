import { Platform, PermissionsAndroid } from 'react-native';

let BleManager: any = null;
let bleManagerInstance: any = null;

if (Platform.OS !== 'web') {
  try {
    const blePlx = require('react-native-ble-plx');
    BleManager = blePlx.BleManager;
  } catch (e) {
    console.warn('react-native-ble-plx not available:', e);
  }
}

export interface BleDevice {
  id: string;
  name: string | null;
  rssi: number | null;
  manufacturerData: string | null;
}

export interface BleConnectionState {
  connected: boolean;
  deviceId: string | null;
  deviceName: string | null;
}

export interface DownloadProgress {
  current: number;
  total: number;
  percentage: number;
  status: 'scanning' | 'connecting' | 'downloading' | 'parsing' | 'complete' | 'error';
  message: string;
}

type DownloadProgressCallback = (progress: DownloadProgress) => void;
type DeviceFoundCallback = (device: BleDevice) => void;
type ConnectionStateCallback = (state: BleConnectionState) => void;

class BleService {
  private manager: any = null;
  private connectedDevice: any = null;
  private isInitialized: boolean = false;
  private deviceFoundCallbacks: DeviceFoundCallback[] = [];
  private connectionStateCallbacks: ConnectionStateCallback[] = [];

  async initialize(): Promise<boolean> {
    if (Platform.OS === 'web') {
      console.log('BLE not available on web platform');
      return false;
    }

    if (!BleManager) {
      console.error('BLE library not loaded - react-native-ble-plx may not be installed properly');
      return false;
    }

    try {
      if (!bleManagerInstance) {
        bleManagerInstance = new BleManager();
      }

      this.manager = bleManagerInstance;
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize BLE:', error);
      return false;
    }
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') {
      return false;
    }

    if (Platform.OS === 'android') {
      try {
        const apiLevel = Platform.Version;
        
        if (apiLevel >= 31) {
          const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ]);
          
          return (
            granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
            granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
            granted['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED
          );
        } else {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
      } catch (error) {
        console.error('Permission request error:', error);
        return false;
      }
    }

    return true;
  }

  async startScanning(
    serviceUUIDs: string[] | null,
    onDeviceFound: DeviceFoundCallback
  ): Promise<void> {
    if (!this.manager || !this.isInitialized) {
      throw new Error('BLE not initialized');
    }

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Bluetooth permissions not granted');
    }

    const state = await this.manager.state();
    if (state !== 'PoweredOn') {
      throw new Error('Bluetooth is not enabled');
    }

    this.deviceFoundCallbacks.push(onDeviceFound);

    this.manager.startDeviceScan(serviceUUIDs, null, (error: any, device: any) => {
      if (error) {
        console.error('Scan error:', error);
        return;
      }

      if (device && device.name) {
        const bleDevice: BleDevice = {
          id: device.id,
          name: device.name,
          rssi: device.rssi,
          manufacturerData: device.manufacturerData,
        };

        this.deviceFoundCallbacks.forEach(callback => callback(bleDevice));
      }
    });
  }

  stopScanning(): void {
    if (this.manager) {
      this.manager.stopDeviceScan();
    }
    this.deviceFoundCallbacks = [];
  }

  async connect(deviceId: string): Promise<boolean> {
    if (!this.manager || !this.isInitialized) {
      throw new Error('BLE not initialized');
    }

    try {
      this.stopScanning();

      const device = await this.manager.connectToDevice(deviceId, {
        timeout: 10000,
        requestMTU: 512,
      });
      await device.discoverAllServicesAndCharacteristics();
      
      this.connectedDevice = device;

      this.notifyConnectionState({
        connected: true,
        deviceId: device.id,
        deviceName: device.name,
      });

      device.onDisconnected(() => {
        this.connectedDevice = null;
        this.notifyConnectionState({
          connected: false,
          deviceId: null,
          deviceName: null,
        });
      });

      return true;
    } catch (error: any) {
      console.error('Connection error:', error);
      const friendlyMessage = this.parseBleError(error);
      throw new Error(friendlyMessage);
    }
  }

  private parseBleError(error: any): string {
    // Extract all available error properties from BleError
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    const errorReason = error?.reason || '';
    const errorCode = error?.errorCode;
    const androidErrorCode = error?.androidErrorCode;
    const iosErrorCode = error?.iosErrorCode;
    const attErrorCode = error?.attErrorCode;
    
    // Log full error details for debugging
    console.error('BLE Error Details:', {
      message: errorMessage,
      reason: errorReason,
      errorCode,
      androidErrorCode,
      iosErrorCode,
      attErrorCode,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
    });
    
    // Handle Android-specific error codes
    if (androidErrorCode !== undefined && androidErrorCode !== null) {
      const androidErrors: Record<number, string> = {
        0: 'Success (unexpected)',
        1: 'GATT read not permitted',
        2: 'GATT write not permitted', 
        3: 'GATT request not supported',
        5: 'GATT authentication failure - device may need pairing',
        6: 'GATT request not supported',
        7: 'GATT offset invalid',
        13: 'GATT attribute length invalid',
        14: 'GATT encryption insufficient',
        133: 'GATT connection timeout or device out of range',
        137: 'GATT characteristic unavailable',
        143: 'GATT connection congested',
        257: 'Bluetooth adapter not initialized',
      };
      
      const androidMessage = androidErrors[androidErrorCode];
      if (androidMessage) {
        return `${androidMessage} (Android error ${androidErrorCode})`;
      }
      return `Android Bluetooth error ${androidErrorCode}: ${errorMessage}`;
    }
    
    // Handle reason property (common in react-native-ble-plx)
    if (errorReason) {
      return `Connection failed: ${errorReason}`;
    }
    
    // Handle errorCode from react-native-ble-plx
    if (errorCode !== undefined && errorCode !== null) {
      const bleErrorCodes: Record<number, string> = {
        0: 'Unknown error',
        1: 'Bluetooth manager destroyed',
        2: 'Operation cancelled',
        3: 'Invalid IDs or UUIDs',
        4: 'Bluetooth not supported',
        5: 'Bluetooth powered off',
        6: 'Bluetooth unauthorized',
        7: 'Bluetooth state resetting',
        8: 'Bluetooth state unknown',
        100: 'Device not connected',
        101: 'Characteristic write failed',
        102: 'Characteristic read failed',
        103: 'Characteristic notify change failed',
        104: 'Device mtu change failed',
        105: 'Services discovery failed',
        200: 'Scanning start failed',
        201: 'Location services disabled',
        300: 'Connection failed',
        301: 'Device already connected',
        302: 'Device not found',
        303: 'Operation timeout',
        304: 'Operation rejected',
        305: 'Device disconnected',
        600: 'Peripheral not found',
        601: 'Service not found',
        602: 'Characteristic not found',
      };
      
      const bleMessage = bleErrorCodes[errorCode];
      if (bleMessage) {
        return `${bleMessage} (error code ${errorCode})`;
      }
    }
    
    if (errorMessage.includes('Unknown error') || errorMessage.includes('This is probably a bug')) {
      return 'Connection failed unexpectedly. Please try: 1) Move closer to the device, 2) Turn Bluetooth off and on, 3) Put dive computer in transfer mode, 4) Restart the app.';
    }
    
    if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
      return 'Connection timed out. Make sure your dive computer is in transfer mode and close to your phone.';
    }
    
    if (errorMessage.includes('disconnected') || errorMessage.includes('Disconnected')) {
      return 'Device disconnected during connection. Please try again and keep devices close together.';
    }
    
    if (errorMessage.includes('not found') || errorMessage.includes('Not found')) {
      return 'Device not found. Please scan again and make sure your dive computer is discoverable.';
    }
    
    if (errorMessage.includes('pairing') || errorMessage.includes('Pairing')) {
      return 'Pairing required. Check your phone for a pairing request from the dive computer.';
    }
    
    if (errorMessage.includes('services') || errorMessage.includes('characteristics')) {
      return 'Could not read device services. Your dive computer may not support direct BLE downloads.';
    }
    
    return `Connection error: ${errorMessage}`;
  }

  async disconnect(): Promise<void> {
    if (this.connectedDevice) {
      try {
        await this.connectedDevice.cancelConnection();
      } catch (error) {
        console.error('Disconnect error:', error);
      }
      this.connectedDevice = null;
    }

    this.notifyConnectionState({
      connected: false,
      deviceId: null,
      deviceName: null,
    });
  }

  async readCharacteristic(serviceUUID: string, characteristicUUID: string): Promise<string | null> {
    if (!this.connectedDevice) {
      throw new Error('No device connected');
    }

    try {
      const characteristic = await this.connectedDevice.readCharacteristicForService(
        serviceUUID,
        characteristicUUID
      );
      return characteristic.value;
    } catch (error) {
      console.error('Read error:', error);
      throw error;
    }
  }

  async writeCharacteristic(
    serviceUUID: string,
    characteristicUUID: string,
    data: string,
    withResponse: boolean = true
  ): Promise<void> {
    if (!this.connectedDevice) {
      throw new Error('No device connected');
    }

    try {
      if (withResponse) {
        await this.connectedDevice.writeCharacteristicWithResponseForService(
          serviceUUID,
          characteristicUUID,
          data
        );
      } else {
        await this.connectedDevice.writeCharacteristicWithoutResponseForService(
          serviceUUID,
          characteristicUUID,
          data
        );
      }
    } catch (error) {
      console.error('Write error:', error);
      throw error;
    }
  }

  async monitorCharacteristic(
    serviceUUID: string,
    characteristicUUID: string,
    onData: (data: string) => void
  ): Promise<() => void> {
    if (!this.connectedDevice) {
      throw new Error('No device connected');
    }

    const subscription = this.connectedDevice.monitorCharacteristicForService(
      serviceUUID,
      characteristicUUID,
      (error: any, characteristic: any) => {
        if (error) {
          console.error('Monitor error:', error);
          return;
        }
        if (characteristic && characteristic.value) {
          onData(characteristic.value);
        }
      }
    );

    return () => subscription.remove();
  }

  onConnectionStateChange(callback: ConnectionStateCallback): () => void {
    this.connectionStateCallbacks.push(callback);
    return () => {
      const index = this.connectionStateCallbacks.indexOf(callback);
      if (index > -1) {
        this.connectionStateCallbacks.splice(index, 1);
      }
    };
  }

  private notifyConnectionState(state: BleConnectionState): void {
    this.connectionStateCallbacks.forEach(callback => callback(state));
  }

  isConnected(): boolean {
    return this.connectedDevice !== null;
  }

  getConnectedDevice(): BleDevice | null {
    if (!this.connectedDevice) return null;
    return {
      id: this.connectedDevice.id,
      name: this.connectedDevice.name,
      rssi: null,
      manufacturerData: null,
    };
  }

  destroy(): void {
    this.disconnect();
    this.deviceFoundCallbacks = [];
    this.connectionStateCallbacks = [];
  }
}

export const bleService = new BleService();
export default bleService;
