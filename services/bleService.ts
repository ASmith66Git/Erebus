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
type ReconnectionCallback = () => Promise<void>;

class BleService {
  private manager: any = null;
  private connectedDevice: any = null;
  private connectedDeviceId: string | null = null; // Store device ID separately for reconnection
  private isInitialized: boolean = false;
  private deviceFoundCallbacks: DeviceFoundCallback[] = [];
  private connectionStateCallbacks: ConnectionStateCallback[] = [];
  private reconnectionCallbacks: ReconnectionCallback[] = [];

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
      console.log('BLE: Connecting to device:', deviceId);

      const device = await this.manager.connectToDevice(deviceId, {
        timeout: 12000, // Match Subsurface's BLE_TIMEOUT (12 seconds)
        requestMTU: 512,
      });
      console.log('BLE: Connected, discovering services...');
      
      await device.discoverAllServicesAndCharacteristics();
      console.log('BLE: Services discovered');
      
      // Log discovered services for debugging
      const services = await device.services();
      console.log('BLE: Found', services.length, 'services');
      for (const service of services) {
        console.log('BLE: Service UUID:', service.uuid);
        const characteristics = await service.characteristics();
        for (const char of characteristics) {
          console.log('  - Characteristic:', char.uuid, 
            'props: write=', char.isWritableWithResponse, 
            'writeNoResp=', char.isWritableWithoutResponse,
            'notify=', char.isNotifiable);
        }
      }
      
      // Small delay to ensure GATT is fully ready
      await new Promise(resolve => setTimeout(resolve, 500));
      
      this.connectedDevice = device;
      this.connectedDeviceId = deviceId; // Store device ID for potential reconnection

      this.notifyConnectionState({
        connected: true,
        deviceId: device.id,
        deviceName: device.name,
      });

      device.onDisconnected(() => {
        console.log('BLE: Device disconnected (ID preserved for reconnection:', this.connectedDeviceId, ')');
        this.connectedDevice = null;
        // IMPORTANT: Do NOT clear connectedDeviceId here - it's needed for reconnection
        // The ID will be cleared on explicit disconnect() call instead
        this.notifyConnectionState({
          connected: false,
          deviceId: this.connectedDeviceId, // Keep the ID in state for potential reconnection
          deviceName: null,
        });
      });

      console.log('BLE: Connection complete, ready for communication');
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
    
    // Log full error details for debugging - this is critical for diagnosis
    console.error('BLE Error Details:', JSON.stringify({
      message: errorMessage,
      reason: errorReason,
      errorCode,
      androidErrorCode,
      iosErrorCode,
      attErrorCode,
      name: error?.name,
      stack: error?.stack?.substring(0, 500)
    }, null, 2));
    
    // PRIORITY 1: Check the reason property first - this often contains the actual error
    if (errorReason && errorReason.length > 0) {
      // Check for common reason patterns
      if (errorReason.includes('MissingBackpressureException')) {
        return `Buffer overflow - device sending data too fast. Try again. (reason: ${errorReason})`;
      }
      if (errorReason.includes('GATT_')) {
        return `GATT error: ${errorReason}`;
      }
      if (errorReason.includes('status')) {
        return `BLE status error: ${errorReason}`;
      }
      return `BLE error: ${errorReason}`;
    }
    
    // PRIORITY 2: Handle Android-specific error codes
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
    
    // PRIORITY 3: Handle errorCode from react-native-ble-plx
    if (errorCode !== undefined && errorCode !== null && errorCode !== 0) {
      const bleErrorCodes: Record<number, string> = {
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
      return `BLE error code ${errorCode}: ${errorMessage}`;
    }
    
    // PRIORITY 4: For errorCode 0 with "Unknown error", show a helpful message with all available info
    if (errorMessage.includes('Unknown error') || errorMessage.includes('This is probably a bug')) {
      const details = [
        errorCode !== undefined ? `code=${errorCode}` : '',
        androidErrorCode !== undefined ? `android=${androidErrorCode}` : '',
        attErrorCode !== undefined ? `att=${attErrorCode}` : '',
      ].filter(Boolean).join(', ');
      
      return `Unexpected BLE error${details ? ` (${details})` : ''}. Try: 1) Move closer to device, 2) Toggle Bluetooth off/on, 3) Put dive computer in transfer mode`;
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
    
    // Clear device ID on explicit disconnect (user-initiated)
    this.connectedDeviceId = null;

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

    const maxRetries = 5;
    const baseRetryDelay = 3000; // Match Subsurface's longer delays
    let lastError: Error | null = null;
    const deviceId = this.connectedDevice?.id || 'unknown';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check if device is still connected before each attempt
        if (!this.connectedDevice) {
          throw new Error('Device disconnected during write operation');
        }
        
        // Check connection state
        const isConnected = await this.connectedDevice.isConnected();
        if (!isConnected) {
          throw new Error('Device is no longer connected');
        }
        
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
        return; // Success
      } catch (error: any) {
        lastError = error;
        const errorMsg = error?.message || String(error);
        const errorCode = error?.errorCode || error?.code;
        
        console.error(`Write attempt ${attempt}/${maxRetries} to device ${deviceId} failed:`, errorMsg, 'Code:', errorCode);
        
        // Check if we should attempt reconnection
        const isServiceError = errorCode === 302 || errorMsg.includes('not found') || errorMsg.includes('302') || errorMsg.includes('device ?');
        const isDisconnectError = errorMsg.includes('disconnected') || errorMsg.includes('no longer connected') || errorCode === 305;
        const isCancelledError = errorCode === 2 || errorMsg.includes('cancelled');
        
        // Retry with reconnection for service errors and disconnection errors
        if ((isServiceError || isDisconnectError) && attempt < maxRetries && this.connectedDeviceId) {
          // Increase delay progressively for later attempts
          const currentDelay = baseRetryDelay + (attempt * 1000);
          console.log(`BLE issue detected (${isDisconnectError ? 'disconnect' : 'service error'}), recovery in ${currentDelay}ms... (attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, currentDelay));
          
          // Strategy: Try GATT refresh first (faster), then full reconnect if that fails
          let recovered = false;
          
          // First: Try re-discovery if we still have a device reference (GATT cache refresh)
          if (this.connectedDevice && isServiceError) {
            try {
              console.log('BLE: Attempting GATT refresh (re-discovery)...');
              const stillConnected = await this.connectedDevice.isConnected();
              if (stillConnected) {
                await this.connectedDevice.discoverAllServicesAndCharacteristics();
                await new Promise(resolve => setTimeout(resolve, 500));
                console.log('BLE: GATT refresh successful');
                recovered = true;
              } else {
                console.log('BLE: Device reports disconnected, will do full reconnect');
              }
            } catch (refreshError: any) {
              console.log('BLE: GATT refresh failed:', refreshError?.message);
            }
          }
          
          // Second: Full reconnection if GATT refresh didn't work
          if (!recovered) {
            try {
              console.log('BLE: Attempting full reconnection...');
              await this.reconnect();
              console.log('BLE: Full reconnection successful');
              recovered = true;
            } catch (reconnectError: any) {
              console.warn('BLE: Reconnection failed:', reconnectError?.message);
            }
          }
          
          if (recovered) {
            console.log('BLE: Recovery successful, retrying write...');
          }
        } else if (isCancelledError) {
          // User cancelled, don't retry
          console.log('Operation cancelled by user, stopping retries');
          break;
        } else if (!this.connectedDeviceId) {
          // No device ID to reconnect to
          console.log('No device ID available for reconnection, stopping retries');
          break;
        } else {
          // Other non-retryable error or max retries reached
          if (attempt >= maxRetries) {
            console.log('Max retries reached');
          }
          break;
        }
      }
    }

    // All retries failed
    const friendlyMessage = this.parseBleError(lastError);
    throw new Error(`Write failed: ${friendlyMessage}`);
  }

  async monitorCharacteristic(
    serviceUUID: string,
    characteristicUUID: string,
    onData: (data: string) => void,
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
          const friendlyMessage = this.parseBleError(error);
          console.error('Monitor error (parsed):', friendlyMessage);
          if (onError) {
            onError(new Error(`Monitor failed: ${friendlyMessage}`));
          }
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

  async reconnect(): Promise<boolean> {
    if (!this.connectedDeviceId) {
      throw new Error('No device ID stored for reconnection');
    }
    
    const deviceId = this.connectedDeviceId;
    console.log('BLE: Full reconnection to device:', deviceId);
    
    // Clear the old device reference first (don't cancel - it may already be disconnected)
    const oldDevice = this.connectedDevice;
    this.connectedDevice = null;
    
    // Only try to cancel if we have an old device, and ignore ALL errors
    if (oldDevice) {
      try {
        // Check if still connected before cancelling
        const isConnected = await oldDevice.isConnected();
        if (isConnected) {
          console.log('BLE: Old device still connected, cancelling...');
          await oldDevice.cancelConnection();
        } else {
          console.log('BLE: Old device already disconnected');
        }
      } catch (e: any) {
        // Completely ignore - device may already be disconnected
        console.log('BLE: Cancel cleanup (ignored):', e?.message || 'unknown');
      }
    }
    
    // Wait for BLE stack to settle (Shearwater needs time to be discoverable again)
    console.log('BLE: Waiting for BLE stack to settle...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Reconnect using stored device ID - use 12 sec timeout like Subsurface
    console.log('BLE: Attempting connectToDevice:', deviceId);
    const device = await this.manager.connectToDevice(deviceId, {
      timeout: 12000, // Match Subsurface's BLE_TIMEOUT
      requestMTU: 512,
    });
    
    console.log('BLE: Reconnected, discovering services...');
    await device.discoverAllServicesAndCharacteristics();
    
    // Wait for GATT to stabilize - Shearwater needs extra time for service enumeration
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const services = await device.services();
    console.log('BLE: Found', services.length, 'services after reconnection');
    
    this.connectedDevice = device;
    
    // Re-register disconnect listener
    device.onDisconnected(() => {
      console.log('BLE: Device disconnected (ID preserved for reconnection:', this.connectedDeviceId, ')');
      this.connectedDevice = null;
      this.notifyConnectionState({
        connected: false,
        deviceId: this.connectedDeviceId,
        deviceName: null,
      });
    });
    
    // Invoke all reconnection callbacks to let protocols re-establish their subscriptions
    console.log('BLE: Invoking', this.reconnectionCallbacks.length, 'reconnection callbacks...');
    for (const callback of this.reconnectionCallbacks) {
      try {
        await callback();
      } catch (e: any) {
        console.error('BLE: Reconnection callback error:', e?.message);
      }
    }
    console.log('BLE: Reconnection callbacks completed');
    
    return true;
  }
  
  registerReconnectionCallback(callback: ReconnectionCallback): void {
    this.reconnectionCallbacks.push(callback);
  }
  
  unregisterReconnectionCallback(callback: ReconnectionCallback): void {
    const index = this.reconnectionCallbacks.indexOf(callback);
    if (index > -1) {
      this.reconnectionCallbacks.splice(index, 1);
    }
  }

  async rediscoverServices(): Promise<void> {
    if (!this.connectedDevice) {
      throw new Error('No device connected');
    }
    
    console.log('BLE: Re-discovering services...');
    await this.connectedDevice.discoverAllServicesAndCharacteristics();
    
    // Log discovered services again
    const services = await this.connectedDevice.services();
    console.log('BLE: Found', services.length, 'services after re-discovery');
    for (const service of services) {
      console.log('BLE: Service UUID:', service.uuid);
    }
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
