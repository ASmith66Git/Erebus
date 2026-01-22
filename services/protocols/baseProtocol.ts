import bleService, { BleDevice, DownloadProgress } from '../bleService';
import { SlipDecoder, slipEncode } from './slipCodec';
import { Buffer } from 'buffer';

// Detailed protocol logging helper - uses console.warn so it gets captured by error logging system
const protoLog = (category: string, message: string, data?: any) => {
  const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
  const prefix = `[PROTO ${timestamp}] [${category}]`;
  if (data !== undefined) {
    console.warn(prefix, message, typeof data === 'object' ? JSON.stringify(data) : data);
  } else {
    console.warn(prefix, message);
  }
};

// Convert Uint8Array to hex string for logging
const bytesToHex = (bytes: Uint8Array): string => {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
};

export interface DiveComputerInfo {
  manufacturer: string;
  model: string;
  serial: string;
  firmware: string;
  hardware: string;
}

export interface RawDiveData {
  diveNumber: number;
  datetime: Date;
  duration: number;
  maxDepth: number;
  avgDepth?: number;
  minTemp?: number;
  maxTemp?: number;
  samples: RawSample[];
  gases: RawGasMix[];
  events: RawEvent[];
  rawData?: Uint8Array;
}

export interface RawSample {
  time: number;
  depth: number;
  temperature?: number;
  pressure?: number;
  ndl?: number;
  tts?: number;
  ceiling?: number;
  gf99?: number;
  ppo2?: number;
  cns?: number;
  heartrate?: number;
}

export interface RawGasMix {
  index: number;
  o2: number;
  he: number;
  n2: number;
  name: string;
  tankSize?: number;
  startPressure?: number;
}

export interface RawEvent {
  time: number;
  type: string;
  value?: number;
  flags?: number;
  gasIndex?: number;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

export abstract class BaseDiveComputerProtocol {
  protected slipDecoder: SlipDecoder;
  protected progressCallback: ProgressCallback | null = null;
  protected isCancelled: boolean = false;
  protected monitorSubscription: (() => void) | null = null;
  protected pendingPackets: Uint8Array[] = [];
  protected packetResolver: ((packet: Uint8Array) => void) | null = null;
  protected reconnectionCallback: (() => Promise<void>) | null = null;
  
  abstract get name(): string;
  abstract get serviceUUID(): string;
  abstract get characteristicUUID(): string;
  abstract get supportedModels(): string[];
  
  constructor() {
    this.slipDecoder = new SlipDecoder(true);
  }
  
  protected async setupMonitor(): Promise<void> {
    // Clean up existing subscription if any
    if (this.monitorSubscription) {
      try {
        this.monitorSubscription();
      } catch (e) {
        // Ignore cleanup errors
      }
      this.monitorSubscription = null;
    }
    
    console.log('Protocol: Setting up BLE monitor for', this.name);
    this.monitorSubscription = await bleService.monitorCharacteristic(
      this.serviceUUID,
      this.characteristicUUID,
      (data: string) => this.handleIncomingData(data),
      (error: Error) => {
        console.error('BLE Monitor error in protocol:', error.message);
        this.lastMonitorError = error;
      }
    );
    console.log('Protocol: BLE monitor setup successful');
  }
  
  async scanForDevices(
    onDeviceFound: (device: BleDevice) => void,
    timeoutMs: number = 10000
  ): Promise<void> {
    await bleService.initialize();
    
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        bleService.stopScanning();
        resolve();
      }, timeoutMs);
      
      bleService.startScanning([this.serviceUUID], (device) => {
        onDeviceFound(device);
      }).catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }
  
  async connect(deviceId: string): Promise<boolean> {
    protoLog('CONNECT', `=== Protocol connect starting for device ${deviceId.substring(0, 8)}... ===`);
    const connectStart = Date.now();
    
    await bleService.initialize();
    protoLog('CONNECT', 'BLE service initialized');
    
    const connected = await bleService.connect(deviceId);
    const bleConnectTime = Date.now() - connectStart;
    protoLog('CONNECT', `BLE connect result: ${connected} (took ${bleConnectTime}ms)`);
    
    if (connected) {
      // Shearwater devices need time for all GATT services to enumerate
      // Retry monitoring setup with delays if service not found initially
      const maxRetries = 5;
      const retryDelay = 1000; // 1 second between retries
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          protoLog('CONNECT', `Setting up BLE monitor (attempt ${attempt}/${maxRetries})...`);
          await this.setupMonitor();
          break; // Success, exit retry loop
        } catch (error: any) {
          const errorMsg = error?.message || '';
          console.error(`Monitor setup attempt ${attempt} failed:`, errorMsg);
          
          // If service not found, wait and retry
          if (errorMsg.includes('not found') || errorMsg.includes('302')) {
            if (attempt < maxRetries) {
              console.log(`Service not yet available, waiting ${retryDelay}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              // Re-discover services
              await bleService.rediscoverServices();
            } else {
              throw new Error(`Shearwater service not found after ${maxRetries} attempts. Make sure your dive computer is in Bluetooth transfer mode.`);
            }
          } else {
            throw error; // Other errors, don't retry
          }
        }
      }
      
      // Register reconnection callback to re-establish monitor after any reconnection
      this.reconnectionCallback = async () => {
        console.log('Protocol: Reconnection detected, re-establishing monitor...');
        await this.setupMonitor();
      };
      bleService.registerReconnectionCallback(this.reconnectionCallback);
      console.log('Protocol: Reconnection callback registered');
      
      // libdivecomputer-style initialization: 300ms delay + clear buffers
      // This allows the device to stabilize before sending commands
      protoLog('CONNECT', 'Starting 300ms stabilization delay (libdivecomputer style)...');
      await new Promise(resolve => setTimeout(resolve, 300));
      this.pendingPackets = []; // Clear any stale data
      this.slipDecoder.reset();
      const totalTime = Date.now() - connectStart;
      protoLog('CONNECT', `=== Protocol connect complete in ${totalTime}ms, ready for communication ===`);
    }
    
    return connected;
  }
  
  protected lastMonitorError: Error | null = null;
  
  async disconnect(): Promise<void> {
    // Unregister reconnection callback
    if (this.reconnectionCallback) {
      bleService.unregisterReconnectionCallback(this.reconnectionCallback);
      this.reconnectionCallback = null;
    }
    
    if (this.monitorSubscription) {
      try {
        this.monitorSubscription();
      } catch (e) {
        // Ignore cleanup errors
      }
      this.monitorSubscription = null;
    }
    await bleService.disconnect();
  }
  
  protected handleIncomingData(base64Data: string): void {
    const buffer = Buffer.from(base64Data, 'base64');
    const data = new Uint8Array(buffer);
    
    protoLog('SLIP', `Raw RX: ${bytesToHex(data)}`);
    
    const packets = this.slipDecoder.addData(data);
    
    protoLog('SLIP', `Decoded ${packets.length} complete packet(s), pending=${this.pendingPackets.length}`);
    
    for (const packet of packets) {
      protoLog('SLIP', `Decoded packet: ${bytesToHex(packet)}`);
      if (this.packetResolver) {
        protoLog('SLIP', 'Resolving waiting promise');
        this.packetResolver(packet);
        this.packetResolver = null;
      } else {
        protoLog('SLIP', 'No resolver, queuing packet');
        this.pendingPackets.push(packet);
      }
    }
  }
  
  protected async sendPacket(data: Uint8Array): Promise<void> {
    protoLog('TX', `Sending packet: ${bytesToHex(data)}`);
    const frames = slipEncode(data, true);
    protoLog('TX', `SLIP encoded into ${frames.length} frame(s)`);
    
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      protoLog('TX', `Frame ${i + 1}/${frames.length}: ${bytesToHex(frame)}`);
      const base64Data = Buffer.from(frame).toString('base64');
      await bleService.writeCharacteristic(
        this.serviceUUID,
        this.characteristicUUID,
        base64Data,
        false
      );
    }
    protoLog('TX', 'All frames sent');
  }
  
  protected async receivePacket(timeoutMs: number = 3000): Promise<Uint8Array> {
    protoLog('RX', `Waiting for packet (timeout=${timeoutMs}ms, pending=${this.pendingPackets.length})`);
    
    if (this.pendingPackets.length > 0) {
      const packet = this.pendingPackets.shift()!;
      protoLog('RX', `Using queued packet: ${bytesToHex(packet)}`);
      return packet;
    }
    
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const timer = setTimeout(() => {
        this.packetResolver = null;
        const elapsed = Date.now() - startTime;
        protoLog('RX', `TIMEOUT after ${elapsed}ms waiting for packet`);
        reject(new Error('Packet receive timeout'));
      }, timeoutMs);
      
      this.packetResolver = (packet: Uint8Array) => {
        clearTimeout(timer);
        const elapsed = Date.now() - startTime;
        protoLog('RX', `Received packet after ${elapsed}ms: ${bytesToHex(packet)}`);
        resolve(packet);
      };
    });
  }
  
  protected async transfer(
    request: Uint8Array,
    expectedResponseSize: number,
    timeoutMs: number = 3000
  ): Promise<Uint8Array> {
    const cmdByte = request[0];
    protoLog('TRANSFER', `=== Starting transfer: cmd=0x${cmdByte.toString(16).toUpperCase()}, expectedResp=${expectedResponseSize}, timeout=${timeoutMs}ms ===`);
    protoLog('TRANSFER', `Request payload: ${bytesToHex(request)}`);
    
    const packet = new Uint8Array(request.length + 4);
    packet[0] = 0xff;
    packet[1] = 0x01;
    packet[2] = request.length + 1;
    packet[3] = 0x00;
    packet.set(request, 4);
    
    protoLog('TRANSFER', `Full packet with header: ${bytesToHex(packet)}`);
    
    const transferStart = Date.now();
    await this.sendPacket(packet);
    
    if (expectedResponseSize === 0) {
      protoLog('TRANSFER', 'No response expected, done');
      return new Uint8Array(0);
    }
    
    const response = await this.receivePacket(timeoutMs);
    const transferTime = Date.now() - transferStart;
    
    protoLog('TRANSFER', `Response received in ${transferTime}ms: ${bytesToHex(response)}`);
    
    if (response.length < 4) {
      protoLog('TRANSFER', `ERROR: Response too short (${response.length} bytes)`);
      throw new Error('Invalid response packet: too short');
    }
    
    if (response[0] !== 0x01 || response[1] !== 0xff || response[3] !== 0x00) {
      protoLog('TRANSFER', `ERROR: Invalid header: got [${response[0].toString(16)}, ${response[1].toString(16)}, ${response[2].toString(16)}, ${response[3].toString(16)}]`);
      throw new Error('Invalid response packet header');
    }
    
    const length = response[2];
    if (length < 1 || length - 1 + 4 !== response.length) {
      protoLog('TRANSFER', `ERROR: Length mismatch: header says ${length}, actual payload would be ${response.length - 4}`);
      throw new Error('Invalid response packet length');
    }
    
    const payload = response.slice(4);
    protoLog('TRANSFER', `=== Transfer complete: payload=${bytesToHex(payload)} ===`);
    return payload;
  }
  
  protected updateProgress(progress: DownloadProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }
  
  cancel(): void {
    this.isCancelled = true;
  }
  
  protected reset(): void {
    this.slipDecoder.reset();
    this.pendingPackets = [];
    this.packetResolver = null;
    this.isCancelled = false;
    this.lastMonitorError = null;
  }
  
  abstract downloadDives(onProgress: ProgressCallback): Promise<RawDiveData[]>;
  abstract getDeviceInfo(): Promise<DiveComputerInfo>;
}
