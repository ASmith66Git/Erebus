import { Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer';

let BleManager: any = null;
let bleManagerInstance: any = null;

// Detailed BLE logging helper - uses console.warn so it gets captured by error logging system
const bleLog = (category: string, message: string, data?: any) => {
  const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
  const prefix = `[BLE ${timestamp}] [${category}]`;
  if (data !== undefined) {
    console.warn(prefix, message, typeof data === 'object' ? JSON.stringify(data) : data);
  } else {
    console.warn(prefix, message);
  }
};

// Convert base64 to hex for logging
const base64ToHex = (base64: string): string => {
  try {
    return Buffer.from(base64, 'base64').toString('hex').toUpperCase();
  } catch {
    return '<invalid base64>';
  }
};

// Convert hex to readable format with spacing
const formatHex = (hex: string): string => {
  return hex.match(/.{1,2}/g)?.join(' ') || hex;
};

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
      bleLog('INIT', 'BLE not available on web platform');
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

  // Get bonded/paired devices that match service UUIDs
  async getBondedDevices(serviceUUIDs: string[]): Promise<BleDevice[]> {
    if (!this.manager || !this.isInitialized) {
      return [];
    }

    try {
      bleLog('BONDED', 'Checking for bonded devices with service UUIDs:', serviceUUIDs);
      
      // Use connectedDevices to find devices that are already bonded/connected
      // This is essential for Android 12+ where bonded devices may not advertise
      const connectedDevices = await this.manager.connectedDevices(serviceUUIDs);
      
      bleLog('BONDED', `Found ${connectedDevices?.length || 0} connected devices`);
      
      if (connectedDevices && connectedDevices.length > 0) {
        return connectedDevices.map((device: any) => ({
          id: device.id,
          name: device.name || 'Unknown Device',
          rssi: device.rssi,
          manufacturerData: device.manufacturerData,
        }));
      }
      
      return [];
    } catch (error: any) {
      bleLog('BONDED', 'Error checking bonded devices:', error?.message);
      return [];
    }
  }

  // Get all known/bonded devices (Android specific)
  async getKnownDevices(deviceIds: string[]): Promise<BleDevice[]> {
    if (!this.manager || !this.isInitialized || Platform.OS !== 'android') {
      return [];
    }

    try {
      bleLog('KNOWN', 'Checking for known devices:', deviceIds);
      
      // devices() returns devices from cache or system bonded list
      const devices = await this.manager.devices(deviceIds);
      
      bleLog('KNOWN', `Found ${devices?.length || 0} known devices`);
      
      if (devices && devices.length > 0) {
        return devices.map((device: any) => ({
          id: device.id,
          name: device.name || 'Bonded Device',
          rssi: null,
          manufacturerData: null,
        }));
      }
      
      return [];
    } catch (error: any) {
      bleLog('KNOWN', 'Error checking known devices:', error?.message);
      return [];
    }
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
    
    // IMPORTANT: For Android 12+, check bonded devices first before scanning
    // Bonded devices may not advertise, so we need to check connectedDevices()
    if (Platform.OS === 'android' && serviceUUIDs && serviceUUIDs.length > 0) {
      bleLog('SCAN', 'Checking bonded devices first (Android 12+ requirement)...');
      
      try {
        const bondedDevices = await this.getBondedDevices(serviceUUIDs);
        
        // Report bonded devices immediately
        for (const device of bondedDevices) {
          bleLog('SCAN', `Found bonded device: ${device.name} (${device.id})`);
          this.deviceFoundCallbacks.forEach(callback => callback(device));
        }
        
        if (bondedDevices.length > 0) {
          bleLog('SCAN', `Reported ${bondedDevices.length} bonded device(s), continuing with scan for more...`);
        }
      } catch (bondedError: any) {
        bleLog('SCAN', 'Bonded device check failed, continuing with normal scan:', bondedError?.message);
      }
    }

    bleLog('SCAN', 'Starting BLE scan with service UUIDs:', serviceUUIDs);
    
    this.manager.startDeviceScan(serviceUUIDs, null, (error: any, device: any) => {
      if (error) {
        console.error('Scan error:', error);
        bleLog('SCAN', 'Scan error:', error?.message);
        return;
      }

      if (device && device.name) {
        bleLog('SCAN', `Discovered device: ${device.name} (${device.id}) RSSI: ${device.rssi}`);
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

    // Support all known Shearwater service UUIDs
    const SHEARWATER_UUIDS = [
      'fe25c237-0ece-443c-b0aa-e02033e7029d', // Modern: Perdix 2, Tern, newer firmware (v81+)
      '0000fee9-0000-1000-8000-00805f9b34fb', // Standard/Legacy: Original Perdix/Petrel 2
      '00001101-0000-1000-8000-00805f9b34fb', // Classic Serial: Very old firmware or "Legacy" BT mode
    ];
    
    // UDS Protocol codes for reference (Shearwater v93+ firmware)
    // Request Download: 0x35, Read Data: 0x22, Error/NAK: 0x7F
    // Legacy Petrel: Download 0xBB, Read 0x01/0x03, NAK 0x15
    
    const maxConnectionAttempts = 3; // Full connection cycles to try
    
    // FORCE DISCONNECT FIRST - Clear any stale GATT state
    // This is critical for bonded devices that refuse to expose services
    bleLog('CONNECT', 'Force-clearing any existing connection state...');
    try {
      await this.manager.cancelDeviceConnection(deviceId);
      await new Promise(resolve => setTimeout(resolve, 1500));
      bleLog('CONNECT', 'Previous connection cancelled');
    } catch (e: any) {
      bleLog('CONNECT', 'No existing connection to cancel:', e?.message);
    }
    
    for (let connectionCycle = 1; connectionCycle <= maxConnectionAttempts; connectionCycle++) {
      try {
        this.stopScanning();
        bleLog('CONNECT', `Connection cycle ${connectionCycle}/${maxConnectionAttempts} to device: ${deviceId}`);

        // On retry cycles, add extra delay to let Android BLE stack fully reset
        if (connectionCycle > 1) {
          const retryDelay = 5000 + (connectionCycle * 2000); // 7s, 9s for cycles 2, 3
          bleLog('CONNECT', `Waiting ${retryDelay}ms before reconnection attempt (GATT cache clear)...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          
          // Ensure any previous connection is fully cancelled
          try {
            bleLog('CONNECT', 'Ensuring previous connection is cancelled...');
            await this.manager.cancelDeviceConnection(deviceId);
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (cancelError: any) {
            // Device might already be disconnected, that's fine
            bleLog('CONNECT', 'Cancel result:', cancelError?.message || 'already disconnected');
          }
        }

        // For bonded devices, check if already connected first
        let device: any = null;
        let isAlreadyConnected = false;
        
        try {
          // Check if device is already connected (common for bonded devices)
          const connectedDevices = await this.manager.connectedDevices(SHEARWATER_UUIDS);
          const alreadyConnected = connectedDevices?.find((d: any) => d.id === deviceId);
          if (alreadyConnected) {
            bleLog('CONNECT', 'Device is already connected (bonded device), using existing connection');
            device = alreadyConnected;
            isAlreadyConnected = true;
          }
        } catch (checkError: any) {
          bleLog('CONNECT', 'Could not check connected devices:', checkError?.message);
        }
        
        // If not already connected, establish new connection
        if (!device) {
          bleLog('CONNECT', 'Establishing new connection...');
          device = await this.manager.connectToDevice(deviceId, {
            timeout: 25000, // Increased timeout for Android 15 on foldables
            refreshGatt: 'OnConnected', // Force GATT cache refresh on Android 15
          });
        }
        
        bleLog('CONNECT', 'Connected, waiting 3000ms before discovery (Android 15 GATT stability)...');
        
        // Extended pre-discovery delay for Android 15 GATT stability
        // Foldable devices (like Honor Magic V3) need extra time due to antenna handling
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // For bonded devices, request MTU to help trigger GATT operations
        // This can help "wake up" the GATT server on some Android versions
        try {
          bleLog('CONNECT', 'Requesting MTU 512 to trigger GATT operations...');
          const mtu = await device.requestMTU(512);
          bleLog('CONNECT', `MTU negotiated: ${mtu}`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (mtuError: any) {
          bleLog('CONNECT', 'MTU request failed (non-critical):', mtuError?.message);
        }
        
        // Service discovery with progressive retries
        let discoverySuccess = false;
        const maxDiscoveryAttempts = 5; // Increased for stubborn GATT servers
        
        for (let attempt = 1; attempt <= maxDiscoveryAttempts; attempt++) {
          bleLog('DISCOVER', `Service discovery attempt ${attempt}/${maxDiscoveryAttempts}...`);
          
          try {
            // For attempts 3+, try forcing a GATT refresh by disconnecting briefly
            if (attempt >= 3) {
              bleLog('DISCOVER', 'Attempt 3+ - Forcing GATT cache refresh via reconnect...');
              try {
                await this.manager.cancelDeviceConnection(deviceId);
                await new Promise(resolve => setTimeout(resolve, 2000));
                device = await this.manager.connectToDevice(deviceId, {
                  timeout: 20000,
                  refreshGatt: 'OnConnected',
                });
                await new Promise(resolve => setTimeout(resolve, 2000));
                // Re-request MTU after reconnect
                try {
                  await device.requestMTU(512);
                } catch (e) {}
                await new Promise(resolve => setTimeout(resolve, 1000));
              } catch (reconnectError: any) {
                bleLog('DISCOVER', 'Reconnect for GATT refresh failed:', reconnectError?.message);
              }
            }
            
            await device.discoverAllServicesAndCharacteristics();
            
            // Progressive stabilization delay - longer each attempt
            const stabilizationDelay = 2000 + (attempt * 1500); // 3.5s, 5s, 6.5s, 8s, 9.5s
            bleLog('DISCOVER', `Waiting ${stabilizationDelay}ms for GATT stabilization...`);
            await new Promise(resolve => setTimeout(resolve, stabilizationDelay));
            
            // Check what services we found
            const services = await device.services();
            bleLog('DISCOVER', `Found ${services.length} services on attempt ${attempt}`);
            
            // If zero services found, this is the critical failure case
            if (services.length === 0) {
              bleLog('DISCOVER', 'CRITICAL: Zero services returned - device refusing GATT enumeration');
              bleLog('DISCOVER', 'This is common for bonded Shearwater devices on Android 12+');
              
              if (attempt < maxDiscoveryAttempts) {
                // Wait longer and try more aggressive refresh
                const aggressiveDelay = 4000 + (attempt * 1000);
                bleLog('DISCOVER', `Waiting ${aggressiveDelay}ms before aggressive retry...`);
                await new Promise(resolve => setTimeout(resolve, aggressiveDelay));
                continue;
              }
            }
            
            // Log all services for debugging
            const serviceUUIDs: string[] = [];
            for (const service of services) {
              serviceUUIDs.push(service.uuid.toLowerCase());
              bleLog('DISCOVER', 'Service UUID:', service.uuid);
              const characteristics = await service.characteristics();
              for (const char of characteristics) {
                console.log('  - Characteristic:', char.uuid, 
                  'props: write=', char.isWritableWithResponse, 
                  'writeNoResp=', char.isWritableWithoutResponse,
                  'notify=', char.isNotifiable);
              }
            }
            
            // Check if any Shearwater service UUID is present
            const foundShearwater = SHEARWATER_UUIDS.some(uuid => 
              serviceUUIDs.includes(uuid.toLowerCase())
            );
            
            if (foundShearwater) {
              bleLog('DISCOVER', 'Shearwater service found!');
              discoverySuccess = true;
              break;
            } else {
              bleLog('DISCOVER', `Shearwater service not found yet. Available: ${serviceUUIDs.join(', ')}`);
              if (attempt < maxDiscoveryAttempts) {
                bleLog('DISCOVER', 'Waiting 3s before retry...');
                await new Promise(resolve => setTimeout(resolve, 3000));
              }
            }
          } catch (discoverError: any) {
            bleLog('DISCOVER', `Discovery attempt ${attempt} failed: ${discoverError?.message}`);
            if (attempt < maxDiscoveryAttempts) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }
        
        // Check if device is still connected
        const stillConnected = await device.isConnected();
        if (!stillConnected) {
          bleLog('DISCOVER', 'Device disconnected during discovery, waiting 2s before retry...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue; // Try another connection cycle
        }
        
        if (!discoverySuccess) {
          // Service not found - try to "ping" the device to force GATT refresh before disconnecting
          if (connectionCycle < maxConnectionAttempts) {
            bleLog('DISCOVER', `Shearwater service not found (cycle ${connectionCycle}), attempting GATT refresh...`);
            
            try {
              // Try reading RSSI to "ping" the device - this can force GATT table refresh
              bleLog('DISCOVER', 'Reading RSSI to ping device...');
              const rssiDevice = await device.readRSSI();
              bleLog('DISCOVER', 'RSSI read successful:', rssiDevice.rssi);
              
              // Wait and try one more discovery after the ping
              bleLog('DISCOVER', 'Waiting 2s after RSSI ping, then retrying discovery...');
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              await device.discoverAllServicesAndCharacteristics();
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              const retryServices = await device.services();
              const retryUUIDs = retryServices.map((s: any) => s.uuid.toLowerCase());
              bleLog('DISCOVER', 'Post-ping services:', retryUUIDs.join(', '));
              
              const foundAfterPing = SHEARWATER_UUIDS.some(uuid => 
                retryUUIDs.includes(uuid.toLowerCase())
              );
              if (foundAfterPing) {
                bleLog('DISCOVER', 'Shearwater service found after RSSI ping!');
                discoverySuccess = true;
              }
            } catch (pingError: any) {
              bleLog('DISCOVER', 'RSSI ping failed:', pingError?.message);
            }
            
            if (!discoverySuccess) {
              // Still not found - disconnect and retry full connection
              bleLog('DISCOVER', 'Service still not found, disconnecting to clear GATT cache...');
              try {
                // Use manager-level disconnect which is more reliable
                await this.manager.cancelDeviceConnection(deviceId);
                // CRITICAL: Wait for Android BLE stack to fully process the disconnect
                bleLog('CONNECT', 'Waiting 5s for disconnect to complete before retry...');
                await new Promise(resolve => setTimeout(resolve, 5000));
              } catch (e) {
                // Ignore disconnect errors, but still wait
                bleLog('CONNECT', 'Disconnect error (expected):', (e as any)?.message);
                await new Promise(resolve => setTimeout(resolve, 4000));
              }
              // Clear device reference to ensure clean state
              this.connectedDevice = null;
              continue; // Try another connection cycle
            }
          } else {
            // Final attempt failed - throw error instead of proceeding
            throw new Error('Shearwater service not found after multiple connection attempts. Please ensure your dive computer is in transfer mode and try again.');
          }
        }
        
        // Final verification
        const verifyServices = await device.services();
        bleLog('DISCOVER', 'Final service count:', verifyServices.length);
        
        // Request MTU AFTER discovery to avoid Android race condition
        bleLog('MTU', 'Discovery successful, requesting MTU 512...');
        try {
          await device.requestMTU(512);
          bleLog('MTU', 'MTU request successful');
        } catch (mtuError: any) {
          bleLog('MTU', 'MTU request failed, continuing with default:', mtuError?.message);
        }
        
        this.connectedDevice = device;
        this.connectedDeviceId = deviceId;

        this.notifyConnectionState({
          connected: true,
          deviceId: device.id,
          deviceName: device.name,
        });

        device.onDisconnected(() => {
          bleLog('CONNECT', 'Device disconnected (ID preserved for reconnection)', this.connectedDeviceId);
          this.connectedDevice = null;
          this.notifyConnectionState({
            connected: false,
            deviceId: this.connectedDeviceId,
            deviceName: null,
          });
        });

        bleLog('CONNECT', 'Connection complete, Shearwater service verified, ready for communication');
        return true;
        
      } catch (error: any) {
        console.error(`Connection cycle ${connectionCycle} error:`, error);
        
        // If this is the last attempt, throw the error
        if (connectionCycle >= maxConnectionAttempts) {
          const friendlyMessage = this.parseBleError(error);
          throw new Error(friendlyMessage);
        }
        
        // Otherwise, continue to next connection cycle
        bleLog('CONNECT', 'Will retry connection cycle...');
      }
    }
    
    // Should not reach here, but just in case
    throw new Error('Failed to connect after all attempts');
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
    const hexData = formatHex(base64ToHex(data));
    const dataLen = Buffer.from(data, 'base64').length;

    bleLog('WRITE', `Starting write: ${dataLen} bytes, withResponse=${withResponse}`);
    bleLog('WRITE', `TX Data: ${hexData}`);
    bleLog('WRITE', `Service: ${serviceUUID.substring(0, 8)}..., Char: ${characteristicUUID.substring(0, 8)}...`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check if device is still connected before each attempt
        if (!this.connectedDevice) {
          bleLog('WRITE', 'ERROR: Device disconnected during write');
          throw new Error('Device disconnected during write operation');
        }
        
        // Log device state for debugging
        bleLog('WRITE', `Attempt ${attempt}/${maxRetries}: device.id=${this.connectedDevice?.id?.substring(0, 8)}...`);
        
        // Check connection state
        const isConnected = await this.connectedDevice.isConnected();
        if (!isConnected) {
          throw new Error('Device is no longer connected');
        }
        
        // Validate service exists before writing (prevents "device ?" errors)
        const serviceExists = await this.validateServiceExists(serviceUUID);
        if (!serviceExists) {
          bleLog('DISCOVER', `Service ${serviceUUID} not found, attempting progressive re-discovery...`);
          
          // Progressive re-discovery with increasing delays (Shearwater devices need extra time)
          let found = false;
          const discoveryDelays = [2000, 3000, 4000]; // Increasing delays
          
          for (let i = 0; i < discoveryDelays.length && !found; i++) {
            bleLog('DISCOVER', `Re-discovery attempt ${i + 1}/${discoveryDelays.length}, waiting ${discoveryDelays[i]}ms...`);
            await this.connectedDevice.discoverAllServicesAndCharacteristics();
            await new Promise(resolve => setTimeout(resolve, discoveryDelays[i]));
            
            found = await this.validateServiceExists(serviceUUID);
            if (found) {
              bleLog('DISCOVER', `Service found after re-discovery attempt ${i + 1}`);
            }
          }
          
          if (!found) {
            // Last resort: full reconnect before giving up
            bleLog('RECOVER', 'Service still not found, attempting full reconnect...');
            if (this.connectedDeviceId) {
              await this.reconnect();
              await new Promise(resolve => setTimeout(resolve, 3000));
              found = await this.validateServiceExists(serviceUUID);
            }
            
            if (!found) {
              throw new Error(`Service ${serviceUUID} not found after re-discovery`);
            }
          }
        }
        
        const writeStart = Date.now();
        if (withResponse) {
          bleLog('WRITE', 'Calling writeCharacteristicWithResponseForService...');
          await this.connectedDevice.writeCharacteristicWithResponseForService(
            serviceUUID,
            characteristicUUID,
            data
          );
        } else {
          bleLog('WRITE', 'Calling writeCharacteristicWithoutResponseForService...');
          await this.connectedDevice.writeCharacteristicWithoutResponseForService(
            serviceUUID,
            characteristicUUID,
            data
          );
        }
        const writeTime = Date.now() - writeStart;
        bleLog('WRITE', `SUCCESS in ${writeTime}ms`);
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
              bleLog('RECOVER', 'Attempting GATT refresh (re-discovery)...');
              const stillConnected = await this.connectedDevice.isConnected();
              if (stillConnected) {
                await this.connectedDevice.discoverAllServicesAndCharacteristics();
                await new Promise(resolve => setTimeout(resolve, 500));
                bleLog('RECOVER', 'GATT refresh successful');
                recovered = true;
              } else {
                bleLog('RECOVER', 'Device reports disconnected, will do full reconnect');
              }
            } catch (refreshError: any) {
              bleLog('RECOVER', 'GATT refresh failed:', refreshError?.message);
            }
          }
          
          // Second: Full reconnection if GATT refresh didn't work
          if (!recovered) {
            try {
              bleLog('RECOVER', 'Attempting full reconnection...');
              await this.reconnect();
              bleLog('RECOVER', 'Full reconnection successful');
              recovered = true;
            } catch (reconnectError: any) {
              bleLog('RECOVER', 'Reconnection failed:', reconnectError?.message);
            }
          }
          
          if (recovered) {
            bleLog('RECOVER', 'Recovery successful, retrying write...');
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

    bleLog('MONITOR', `Setting up monitor on ${characteristicUUID.substring(0, 8)}...`);
    let packetCount = 0;
    const monitorStart = Date.now();

    const subscription = this.connectedDevice.monitorCharacteristicForService(
      serviceUUID,
      characteristicUUID,
      (error: any, characteristic: any) => {
        if (error) {
          const friendlyMessage = this.parseBleError(error);
          bleLog('MONITOR', `ERROR after ${packetCount} packets: ${friendlyMessage}`);
          bleLog('MONITOR', `Raw error: code=${error?.errorCode}, android=${error?.androidErrorCode}, reason=${error?.reason}`);
          if (onError) {
            onError(new Error(`Monitor failed: ${friendlyMessage}`));
          }
          return;
        }
        if (characteristic && characteristic.value) {
          packetCount++;
          const hexData = formatHex(base64ToHex(characteristic.value));
          const dataLen = Buffer.from(characteristic.value, 'base64').length;
          const elapsed = Date.now() - monitorStart;
          bleLog('MONITOR', `RX #${packetCount} (${elapsed}ms): ${dataLen} bytes: ${hexData}`);
          onData(characteristic.value);
        }
      }
    );

    bleLog('MONITOR', 'Monitor subscription created');
    return () => {
      bleLog('MONITOR', `Stopping monitor after ${packetCount} packets`);
      subscription.remove();
    };
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
    bleLog('RECONNECT', 'Full reconnection to device:', deviceId);
    
    // Clear the old device reference first (don't cancel - it may already be disconnected)
    const oldDevice = this.connectedDevice;
    this.connectedDevice = null;
    
    // Only try to cancel if we have an old device, and ignore ALL errors
    if (oldDevice) {
      try {
        // Check if still connected before cancelling
        const isConnected = await oldDevice.isConnected();
        if (isConnected) {
          bleLog('RECONNECT', 'Old device still connected, cancelling...');
          await oldDevice.cancelConnection();
        } else {
          bleLog('RECONNECT', 'Old device already disconnected');
        }
      } catch (e: any) {
        // Completely ignore - device may already be disconnected
        bleLog('RECONNECT', 'Cancel cleanup (ignored):', e?.message || 'unknown');
      }
    }
    
    // Wait for BLE stack to settle (Shearwater needs time to be discoverable again)
    bleLog('RECONNECT', 'Waiting for BLE stack to settle...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Reconnect using stored device ID - use 12 sec timeout like Subsurface
    bleLog('RECONNECT', 'Attempting connectToDevice:', deviceId);
    const device = await this.manager.connectToDevice(deviceId, {
      timeout: 12000, // Match Subsurface's BLE_TIMEOUT
      requestMTU: 512,
    });
    
    bleLog('RECONNECT', 'Reconnected, discovering services...');
    await device.discoverAllServicesAndCharacteristics();
    
    // Wait for GATT to stabilize - Shearwater needs extra time for service enumeration
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const services = await device.services();
    bleLog('RECONNECT', 'Found services after reconnection:', services.length);
    
    this.connectedDevice = device;
    
    // Re-register disconnect listener
    device.onDisconnected(() => {
      bleLog('CONNECT', 'Device disconnected (ID preserved for reconnection)', this.connectedDeviceId);
      this.connectedDevice = null;
      this.notifyConnectionState({
        connected: false,
        deviceId: this.connectedDeviceId,
        deviceName: null,
      });
    });
    
    // Invoke all reconnection callbacks to let protocols re-establish their subscriptions
    bleLog('RECONNECT', 'Invoking reconnection callbacks:', this.reconnectionCallbacks.length);
    for (const callback of this.reconnectionCallbacks) {
      try {
        await callback();
      } catch (e: any) {
        bleLog('RECONNECT', 'Reconnection callback error:', e?.message);
      }
    }
    bleLog('RECONNECT', 'Reconnection callbacks completed');
    
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

  async validateServiceExists(serviceUUID: string): Promise<boolean> {
    if (!this.connectedDevice) {
      bleLog('VALIDATE', 'validateServiceExists - no connected device');
      return false;
    }
    
    try {
      const services = await this.connectedDevice.services();
      const normalizedTarget = serviceUUID.toLowerCase();
      const found = services.some((s: any) => s.uuid.toLowerCase() === normalizedTarget);
      bleLog('VALIDATE', `validateServiceExists(${serviceUUID}) = ${found} (${services.length} services total)`);
      return found;
    } catch (error: any) {
      bleLog('VALIDATE', `validateServiceExists error: ${error?.message}`);
      return false;
    }
  }

  async rediscoverServices(): Promise<void> {
    if (!this.connectedDevice) {
      throw new Error('No device connected');
    }
    
    bleLog('VALIDATE', 'Re-discovering services...');
    await this.connectedDevice.discoverAllServicesAndCharacteristics();
    
    // Stabilization delay after re-discovery
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Log discovered services again
    const services = await this.connectedDevice.services();
    bleLog('VALIDATE', 'Found services after re-discovery:', services.length);
    for (const service of services) {
      bleLog('DISCOVER', 'Service UUID:', service.uuid);
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
