import bleService, { BleDevice, DownloadProgress } from '../bleService';
import { SlipDecoder, slipEncode } from './slipCodec';
import { Buffer } from 'buffer';

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
  
  abstract get name(): string;
  abstract get serviceUUID(): string;
  abstract get characteristicUUID(): string;
  abstract get supportedModels(): string[];
  
  constructor() {
    this.slipDecoder = new SlipDecoder(true);
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
    await bleService.initialize();
    const connected = await bleService.connect(deviceId);
    
    if (connected) {
      // Shearwater devices need time for all GATT services to enumerate
      // Retry monitoring setup with delays if service not found initially
      const maxRetries = 5;
      const retryDelay = 1000; // 1 second between retries
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`Setting up BLE monitor (attempt ${attempt}/${maxRetries})...`);
          this.monitorSubscription = await bleService.monitorCharacteristic(
            this.serviceUUID,
            this.characteristicUUID,
            (data: string) => this.handleIncomingData(data),
            (error: Error) => {
              console.error('BLE Monitor error in protocol:', error.message);
              this.lastMonitorError = error;
            }
          );
          console.log('BLE monitor setup successful');
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
    }
    
    return connected;
  }
  
  protected lastMonitorError: Error | null = null;
  
  async disconnect(): Promise<void> {
    if (this.monitorSubscription) {
      this.monitorSubscription();
      this.monitorSubscription = null;
    }
    await bleService.disconnect();
  }
  
  protected handleIncomingData(base64Data: string): void {
    const buffer = Buffer.from(base64Data, 'base64');
    const data = new Uint8Array(buffer);
    
    const packets = this.slipDecoder.addData(data);
    
    for (const packet of packets) {
      if (this.packetResolver) {
        this.packetResolver(packet);
        this.packetResolver = null;
      } else {
        this.pendingPackets.push(packet);
      }
    }
  }
  
  protected async sendPacket(data: Uint8Array): Promise<void> {
    const frames = slipEncode(data, true);
    
    for (const frame of frames) {
      const base64Data = Buffer.from(frame).toString('base64');
      await bleService.writeCharacteristic(
        this.serviceUUID,
        this.characteristicUUID,
        base64Data,
        false
      );
    }
  }
  
  protected async receivePacket(timeoutMs: number = 3000): Promise<Uint8Array> {
    if (this.pendingPackets.length > 0) {
      return this.pendingPackets.shift()!;
    }
    
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.packetResolver = null;
        reject(new Error('Packet receive timeout'));
      }, timeoutMs);
      
      this.packetResolver = (packet: Uint8Array) => {
        clearTimeout(timer);
        resolve(packet);
      };
    });
  }
  
  protected async transfer(
    request: Uint8Array,
    expectedResponseSize: number,
    timeoutMs: number = 3000
  ): Promise<Uint8Array> {
    const packet = new Uint8Array(request.length + 4);
    packet[0] = 0xff;
    packet[1] = 0x01;
    packet[2] = request.length + 1;
    packet[3] = 0x00;
    packet.set(request, 4);
    
    await this.sendPacket(packet);
    
    if (expectedResponseSize === 0) {
      return new Uint8Array(0);
    }
    
    const response = await this.receivePacket(timeoutMs);
    
    if (response.length < 4) {
      throw new Error('Invalid response packet: too short');
    }
    
    if (response[0] !== 0x01 || response[1] !== 0xff || response[3] !== 0x00) {
      throw new Error('Invalid response packet header');
    }
    
    const length = response[2];
    if (length < 1 || length - 1 + 4 !== response.length) {
      throw new Error('Invalid response packet length');
    }
    
    return response.slice(4);
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
  }
  
  abstract downloadDives(onProgress: ProgressCallback): Promise<RawDiveData[]>;
  abstract getDeviceInfo(): Promise<DiveComputerInfo>;
}
