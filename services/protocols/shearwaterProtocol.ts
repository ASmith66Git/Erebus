import { 
  BaseDiveComputerProtocol, 
  DiveComputerInfo, 
  RawDiveData, 
  RawSample, 
  RawGasMix, 
  RawEvent,
  ProgressCallback 
} from './baseProtocol';
import bleService, { DownloadProgress } from '../bleService';

// Support all known Shearwater service UUIDs
const SHEARWATER_SERVICE_UUIDS = [
  'fe25c237-0ece-443c-b0aa-e02033e7029d', // Modern: Perdix 2, Tern, newer firmware (v81+)
  '0000fee9-0000-1000-8000-00805f9b34fb', // Standard/Legacy: Original Perdix/Petrel 2
  '00001101-0000-1000-8000-00805f9b34fb', // Classic Serial: Very old firmware or "Legacy" BT mode
];
const SHEARWATER_CHAR_UUIDS = [
  '27b7570b-359e-45a3-91bb-cf7e70049bd2', // Modern characteristic
  '0000fee8-0000-1000-8000-00805f9b34fb', // Standard/Legacy characteristic (TX)
  '00001101-0000-1000-8000-00805f9b34fb', // Classic Serial characteristic
];

const MANIFEST_ADDR = 0xe0000000;
const MANIFEST_SIZE = 0x600;
const RECORD_SIZE = 0x20;
const RECORD_COUNT = MANIFEST_SIZE / RECORD_SIZE;
const DIVE_SIZE = 0xffffff;

const ID_SERIAL = 0x8010;
const ID_FIRMWARE = 0x8011;
const ID_HARDWARE = 0x8012;
const ID_LOGUPLOAD = 0x8020;

const RDBI_REQUEST = 0x22;
const RDBI_RESPONSE = 0x62;
const NAK = 0x7f;

const HARDWARE_MAP: Record<number, string> = {
  0x0101: 'Petrel',
  0x0102: 'Petrel 2',
  0x0104: 'Nerd',
  0x0105: 'Perdix',
  0x0106: 'Perdix AI',
  0x0107: 'Nerd 2',
  0x0108: 'Teric',
  0x0109: 'Peregrine',
  0x010a: 'Petrel 3',
  0x010b: 'Perdix 2',
};

class RLEDecoder {
  private lastByte: number = 0;
  private pendingBits: number[] = [];
  private output: number[] = [];
  private isFinal: boolean = false;
  
  reset(): void {
    this.lastByte = 0;
    this.pendingBits = [];
    this.output = [];
    this.isFinal = false;
  }
  
  addData(data: Uint8Array): void {
    if (this.isFinal) return;
    
    for (let i = 0; i < data.length && !this.isFinal; i++) {
      const byte = data[i];
      for (let bit = 7; bit >= 0; bit--) {
        this.pendingBits.push((byte >> bit) & 1);
      }
    }
    
    while (this.pendingBits.length >= 9 && !this.isFinal) {
      let value = 0;
      for (let i = 0; i < 9; i++) {
        value = (value << 1) | this.pendingBits[i];
      }
      this.pendingBits.splice(0, 9);
      
      if (value & 0x100) {
        this.lastByte = value & 0xff;
        this.output.push(this.lastByte);
      } else if (value === 0) {
        this.isFinal = true;
      } else {
        for (let j = 0; j < value; j++) {
          this.output.push(this.lastByte);
        }
      }
    }
  }
  
  getResult(): Uint8Array {
    return new Uint8Array(this.output);
  }
  
  isDone(): boolean {
    return this.isFinal;
  }
}

function decompressXOR(data: Uint8Array): Uint8Array {
  const result = new Uint8Array(data);
  for (let i = 32; i < result.length; i++) {
    result[i] ^= result[i - 32];
  }
  return result;
}

function arrayUint16BE(data: Uint8Array, offset: number = 0): number {
  return (data[offset] << 8) | data[offset + 1];
}

function arrayUint32BE(data: Uint8Array, offset: number = 0): number {
  return (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export class ShearwaterProtocol extends BaseDiveComputerProtocol {
  private fingerprint: Uint8Array = new Uint8Array(4);
  private activeServiceUUID: string = SHEARWATER_SERVICE_UUIDS[0];
  private activeCharUUID: string = SHEARWATER_CHAR_UUIDS[0];
  
  private wrapUDSCommand(command: number, payload: number[] = []): string {
    const header = [0xFF, 0x01];
    const length = payload.length + 2;
    const frame = [...header, length, 0x00, command, ...payload, 0xC0];
    console.warn(`[SHEARWATER] wrapUDSCommand: cmd=0x${command.toString(16)}, frame=${bytesToHex(new Uint8Array(frame))}`);
    return Buffer.from(frame).toString('base64');
  }
  
  get name(): string {
    return 'Shearwater';
  }
  
  get serviceUUID(): string {
    return this.activeServiceUUID;
  }
  
  get characteristicUUID(): string {
    return this.activeCharUUID;
  }
  
  get supportedModels(): string[] {
    return Object.values(HARDWARE_MAP);
  }
  
  get allServiceUUIDs(): string[] {
    return SHEARWATER_SERVICE_UUIDS;
  }
  
  get allCharacteristicUUIDs(): string[] {
    return SHEARWATER_CHAR_UUIDS;
  }
  
  setActiveUUIDs(serviceUUID: string, charUUID: string): void {
    this.activeServiceUUID = serviceUUID;
    this.activeCharUUID = charUUID;
    console.warn(`Shearwater: Using service ${serviceUUID}, char ${charUUID}`);
  }
  
  setFingerprint(data: Uint8Array): void {
    if (data.length === 4) {
      this.fingerprint = new Uint8Array(data);
    }
  }
  
  async getDeviceInfo(): Promise<DiveComputerInfo> {
    console.warn('[SHEARWATER] === Getting device info ===');
    
    await this.initSession();
    
    console.warn('[SHEARWATER] Reading serial number (ID_SERIAL=0x8010)...');
    const serialResp = await this.rdbi(ID_SERIAL, 8);
    const serialHex = bytesToHex(serialResp);
    const serial = parseInt(serialHex, 16).toString();
    console.warn(`[SHEARWATER] Serial: ${serial} (hex: ${serialHex})`);
    
    console.warn('[SHEARWATER] Reading firmware version (ID_FIRMWARE=0x8011)...');
    const firmwareResp = await this.rdbi(ID_FIRMWARE, 12);
    const firmwareStr = String.fromCharCode(...firmwareResp).replace(/\0/g, '').trim();
    const firmware = firmwareStr.replace(/^V/, '');
    console.warn(`[SHEARWATER] Firmware: ${firmware}`);
    
    console.warn('[SHEARWATER] Reading hardware type (ID_HARDWARE=0x8012)...');
    const hardwareResp = await this.rdbi(ID_HARDWARE, 2);
    const hardwareCode = arrayUint16BE(hardwareResp);
    const model = HARDWARE_MAP[hardwareCode] || `Unknown (0x${hardwareCode.toString(16)})`;
    console.warn(`[SHEARWATER] Model: ${model} (code: 0x${hardwareCode.toString(16)})`);
    
    console.warn('[SHEARWATER] === Device info complete ===');
    return {
      manufacturer: 'Shearwater',
      model,
      serial,
      firmware,
      hardware: hardwareCode.toString(16),
    };
  }
  
  private sessionInitialized: boolean = false;
  
  private async initSession(): Promise<void> {
    if (this.sessionInitialized) {
      console.warn('[SHEARWATER] Session already initialized, skipping');
      return;
    }
    
    console.warn('[SHEARWATER] === Initializing UDS session (iOS requires 0x35 handshake before RDBI) ===');
    
    console.warn('[SHEARWATER] Waiting 2000ms for GATT warm-up before session init...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      console.warn('[SHEARWATER] Sending UDS handshake (0x35) using libdivecomputer frame format...');
      const udsHandshake = this.wrapUDSCommand(0x35, [0x00, 0x34, 0x00, 0x00]);
      
      await bleService.writeCharacteristic(
        this.serviceUUID,
        this.characteristicUUID,
        udsHandshake,
        true
      );
      console.warn('[SHEARWATER] UDS handshake sent, waiting for response...');
      
      const initResponse = await this.receivePacketWithTimeout(5000);
      console.warn(`[SHEARWATER] Session init response: ${bytesToHex(initResponse)}`);
      
      if (initResponse.length >= 1 && initResponse[0] === 0x75) {
        console.warn('[SHEARWATER] Session init acknowledged (0x75), sending exit (0x37)...');
        const exitCmd = this.wrapUDSCommand(0x37, []);
        await bleService.writeCharacteristic(
          this.serviceUUID,
          this.characteristicUUID,
          exitCmd,
          true
        );
        const exitResponse = await this.receivePacketWithTimeout(3000);
        console.warn(`[SHEARWATER] Session exit response: ${bytesToHex(exitResponse)}`);
      }
      
      this.sessionInitialized = true;
      console.warn('[SHEARWATER] === UDS session initialized successfully ===');
    } catch (error: any) {
      console.warn('[SHEARWATER] Session init failed (may not be required):', error?.message);
      this.sessionInitialized = true;
    }
    
    console.warn('[SHEARWATER] Post-session stabilization delay (1000ms)...');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  private async receivePacketWithTimeout(timeoutMs: number): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Packet receive timeout'));
      }, timeoutMs);
      
      if (this.pendingPackets.length > 0) {
        clearTimeout(timer);
        resolve(this.pendingPackets.shift()!);
        return;
      }
      
      const originalResolver = this.packetResolver;
      this.packetResolver = (packet: Uint8Array) => {
        clearTimeout(timer);
        if (packet.length >= 4) {
          resolve(packet.slice(4));
        } else {
          resolve(packet);
        }
      };
    });
  }
  
  private async rdbi(id: number, expectedLength: number, timeoutMs: number = 5000): Promise<Uint8Array> {
    console.warn(`[SHEARWATER] RDBI request: id=0x${id.toString(16)}, expectedLen=${expectedLength}, timeout=${timeoutMs}ms`);
    
    const didHigh = (id >> 8) & 0xFF;
    const didLow = id & 0xFF;
    
    const frame = Buffer.from([
      0xFF, 0x01,
      0x04, 0x00,
      RDBI_REQUEST,
      didHigh, didLow,
      0xC0
    ]);
    
    const base64Data = frame.toString('base64');
    console.warn(`[SHEARWATER] RDBI frame: ${bytesToHex(new Uint8Array(frame))}`);
    
    await bleService.writeCharacteristic(
      this.serviceUUID,
      this.characteristicUUID,
      base64Data,
      true
    );
    
    const response = await this.receivePacketWithTimeout(timeoutMs);
    console.warn(`[SHEARWATER] RDBI response: ${bytesToHex(response)}`);
    
    if (response.length < 3) {
      console.warn('[SHEARWATER] ERROR: RDBI response too short');
      throw new Error('RDBI response too short');
    }
    
    if (response[0] === NAK) {
      console.warn(`[SHEARWATER] ERROR: RDBI NAK received for ID 0x${id.toString(16)}`);
      throw new Error(`RDBI NAK received for ID 0x${id.toString(16)}`);
    }
    
    if (response[0] !== RDBI_RESPONSE) {
      console.warn(`[SHEARWATER] ERROR: Unexpected response type: 0x${response[0].toString(16)}`);
      throw new Error(`Unexpected RDBI response type: 0x${response[0].toString(16)}`);
    }
    
    const respId = arrayUint16BE(response, 1);
    if (respId !== id) {
      console.warn(`[SHEARWATER] ERROR: ID mismatch: expected 0x${id.toString(16)}, got 0x${respId.toString(16)}`);
      throw new Error(`RDBI response ID mismatch: expected 0x${id.toString(16)}, got 0x${respId.toString(16)}`);
    }
    
    console.warn(`[SHEARWATER] RDBI success, payload: ${bytesToHex(response.slice(3))}`);
    return response.slice(3);
  }
  
  private async downloadBlock(
    address: number,
    size: number,
    compressed: boolean,
    onProgress?: (current: number, total: number) => void
  ): Promise<Uint8Array> {
    console.warn(`[SHEARWATER] === Download block: addr=0x${address.toString(16)}, size=${size}, compressed=${compressed} ===`);
    const downloadStart = Date.now();
    
    const compressionFlag = compressed ? 0x10 : 0x00;
    const initRequest = new Uint8Array([
      0x35,
      compressionFlag,
      0x34,
      (address >> 24) & 0xff,
      (address >> 16) & 0xff,
      (address >> 8) & 0xff,
      address & 0xff,
      (size >> 16) & 0xff,
      (size >> 8) & 0xff,
      size & 0xff,
    ]);
    
    console.warn(`[SHEARWATER] Sending download init (0x35)...`);
    const initResponse = await this.transfer(initRequest, 3);
    console.warn(`[SHEARWATER] Download init response: ${bytesToHex(initResponse)}`);
    
    if (initResponse.length !== 3 || initResponse[0] !== 0x75 || initResponse[1] !== 0x10) {
      console.warn('[SHEARWATER] ERROR: Invalid download init response');
      throw new Error('Invalid download init response');
    }
    
    const blockSize = initResponse[2];
    console.warn(`[SHEARWATER] Block size from device: ${blockSize} bytes`);
    
    const rawBuffer: number[] = [];
    const rleDecoder = compressed ? new RLEDecoder() : null;
    let blockNum = 1;
    let done = false;
    const maxBlocks = 10000;
    
    while (!done && blockNum < maxBlocks) {
      if (this.isCancelled) {
        throw new Error('Download cancelled');
      }
      
      const blockRequest = new Uint8Array([0x36, blockNum & 0xff]);
      const blockResponse = await this.transfer(blockRequest, blockSize + 2);
      
      if (blockResponse.length < 2 || blockResponse[0] !== 0x76 || blockResponse[1] !== (blockNum & 0xff)) {
        throw new Error(`Invalid block response for block ${blockNum}`);
      }
      
      const blockData = blockResponse.slice(2);
      
      if (compressed && rleDecoder) {
        rleDecoder.addData(blockData);
        done = rleDecoder.isDone();
      } else {
        rawBuffer.push(...blockData);
        if (rawBuffer.length >= size) {
          done = true;
        }
      }
      
      blockNum++;
      
      if (onProgress) {
        const currentSize = compressed && rleDecoder 
          ? rleDecoder.getResult().length 
          : rawBuffer.length;
        const estimatedProgress = compressed 
          ? Math.min(currentSize / 50000, 1) 
          : currentSize / size;
        onProgress(estimatedProgress * 100, 100);
      }
    }
    
    const quitRequest = new Uint8Array([0x37]);
    const quitResponse = await this.transfer(quitRequest, 2);
    
    if (quitResponse.length !== 2 || quitResponse[0] !== 0x77 || quitResponse[1] !== 0x00) {
      console.warn('Unexpected quit response');
    }
    
    let result: Uint8Array;
    
    if (compressed && rleDecoder) {
      result = new Uint8Array(decompressXOR(rleDecoder.getResult()));
    } else {
      result = new Uint8Array(rawBuffer);
    }
    
    return result;
  }
  
  async downloadDives(onProgress: ProgressCallback): Promise<RawDiveData[]> {
    this.progressCallback = onProgress;
    this.reset();
    this.sessionInitialized = false;
    
    const dives: RawDiveData[] = [];
    
    try {
      this.updateProgress({
        current: 0,
        total: 100,
        percentage: 0,
        status: 'connecting',
        message: 'Initializing session...',
      });
      
      await this.initSession();
      
      this.updateProgress({
        current: 2,
        total: 100,
        percentage: 2,
        status: 'connecting',
        message: 'Reading device info...',
      });
      
      const logUploadResp = await this.rdbi(ID_LOGUPLOAD, 9);
      let baseAddr = arrayUint32BE(logUploadResp, 1);
      
      switch (baseAddr) {
        case 0xdd000000:
        case 0xc0000000:
        case 0x90000000:
          baseAddr = 0xc0000000;
          break;
        case 0x80000000:
          break;
        default:
          throw new Error(`Unknown logbook format: 0x${baseAddr.toString(16)}`);
      }
      
      this.updateProgress({
        current: 5,
        total: 100,
        percentage: 5,
        status: 'downloading',
        message: 'Reading dive manifest...',
      });
      
      const manifestRecords: Uint8Array[] = [];
      let manifestPage = 0;
      
      while (true) {
        if (this.isCancelled) {
          throw new Error('Download cancelled');
        }
        
        const manifest = await this.downloadBlock(MANIFEST_ADDR, MANIFEST_SIZE, false);
        
        let count = 0;
        let deleted = 0;
        let offset = 0;
        
        while (offset < manifest.length) {
          const header = arrayUint16BE(manifest, offset);
          
          if (header === 0x5a23) {
            offset += RECORD_SIZE;
            deleted++;
            continue;
          }
          
          if (header !== 0xa5c4) {
            break;
          }
          
          const recordFingerprint = manifest.slice(offset + 4, offset + 8);
          if (this.fingerprint.every((v, i) => v === recordFingerprint[i]) && this.fingerprint.some(v => v !== 0)) {
            break;
          }
          
          manifestRecords.push(manifest.slice(offset, offset + RECORD_SIZE));
          offset += RECORD_SIZE;
          count++;
        }
        
        manifestPage++;
        
        if (count + deleted !== RECORD_COUNT) {
          break;
        }
      }
      
      const totalDives = manifestRecords.length;
      
      if (totalDives === 0) {
        this.updateProgress({
          current: 100,
          total: 100,
          percentage: 100,
          status: 'complete',
          message: 'No new dives found',
        });
        return dives;
      }
      
      for (let i = 0; i < manifestRecords.length; i++) {
        if (this.isCancelled) {
          throw new Error('Download cancelled');
        }
        
        const record = manifestRecords[i];
        const diveAddress = arrayUint32BE(record, 20);
        
        const progress = 10 + Math.floor((i / totalDives) * 85);
        this.updateProgress({
          current: progress,
          total: 100,
          percentage: progress,
          status: 'downloading',
          message: `Downloading dive ${i + 1} of ${totalDives}...`,
        });
        
        const diveData = await this.downloadBlock(
          baseAddr + diveAddress,
          DIVE_SIZE,
          true,
          (current, total) => {
            const diveProgress = (current / total) * (85 / totalDives);
            const overallProgress = 10 + (i / totalDives) * 85 + diveProgress;
            this.updateProgress({
              current: Math.floor(overallProgress),
              total: 100,
              percentage: Math.floor(overallProgress),
              status: 'downloading',
              message: `Downloading dive ${i + 1} of ${totalDives}...`,
            });
          }
        );
        
        const dive = this.parseDive(diveData, record);
        dives.push(dive);
      }
      
      this.updateProgress({
        current: 100,
        total: 100,
        percentage: 100,
        status: 'complete',
        message: `Downloaded ${dives.length} dive(s)`,
      });
      
      await this.shutdown();
      
      return dives;
      
    } catch (error) {
      this.updateProgress({
        current: 0,
        total: 100,
        percentage: 0,
        status: 'error',
        message: error instanceof Error ? error.message : 'Download failed',
      });
      throw error;
    }
  }
  
  private async shutdown(): Promise<void> {
    try {
      const request = new Uint8Array([0x2e, 0x90, 0x20, 0x00]);
      await this.transfer(request, 0);
    } catch {
    }
  }
  
  private parseDive(data: Uint8Array, manifestRecord: Uint8Array): RawDiveData {
    const samples: RawSample[] = [];
    const gases: RawGasMix[] = [];
    const events: RawEvent[] = [];
    
    const diveNumber = arrayUint16BE(manifestRecord, 2);
    const timestamp = arrayUint32BE(manifestRecord, 8);
    const datetime = new Date(timestamp * 1000);
    
    let offset = 0;
    let currentTime = 0;
    let maxDepth = 0;
    let duration = 0;
    let sampleInterval = 10;
    
    while (offset < data.length) {
      const recordType = data[offset];
      
      if (recordType === 0xff) {
        break;
      }
      
      switch (recordType) {
        case 0x00: {
          if (offset + 32 <= data.length) {
            sampleInterval = data[offset + 3] || 10;
            
            for (let g = 0; g < 10; g++) {
              const gasOffset = offset + 6 + g * 2;
              if (gasOffset + 1 < data.length) {
                const o2 = data[gasOffset];
                const he = data[gasOffset + 1];
                if (o2 > 0 && o2 <= 100) {
                  gases.push({
                    index: g,
                    o2,
                    he,
                    n2: 100 - o2 - he,
                    name: he > 0 ? `TX${o2}/${he}` : o2 === 21 ? 'Air' : `EAN${o2}`,
                  });
                }
              }
            }
          }
          offset += 32;
          break;
        }
        
        case 0x01: {
          if (offset + 32 <= data.length) {
            const depth = arrayUint16BE(data, offset + 2) / 100;
            const temp = arrayUint16BE(data, offset + 8);
            const tempC = temp > 0 ? (temp / 10) - 273.15 : undefined;
            const ndl = data[offset + 14];
            const ceiling = arrayUint16BE(data, offset + 16) / 100;
            const ppo2 = data[offset + 10] / 100;
            const cns = data[offset + 22];
            
            samples.push({
              time: currentTime,
              depth,
              temperature: tempC,
              ndl: ndl < 255 ? ndl : undefined,
              ceiling: ceiling > 0 ? ceiling : undefined,
              ppo2: ppo2 > 0 ? ppo2 : undefined,
              cns: cns > 0 ? cns : undefined,
            });
            
            if (depth > maxDepth) {
              maxDepth = depth;
            }
            
            currentTime += sampleInterval;
            duration = currentTime;
          }
          offset += 32;
          break;
        }
        
        case 0x02:
        case 0x03:
        case 0x04:
        case 0x05:
        case 0x06:
        case 0x07: {
          if (offset + 32 <= data.length) {
            const eventType = this.getEventType(recordType);
            const eventValue = arrayUint16BE(data, offset + 2);
            
            events.push({
              time: currentTime,
              type: eventType,
              value: eventValue,
            });
          }
          offset += 32;
          break;
        }
        
        default:
          offset += 32;
          break;
      }
    }
    
    return {
      diveNumber,
      datetime,
      duration,
      maxDepth,
      samples,
      gases,
      events,
      rawData: data,
    };
  }
  
  private getEventType(recordType: number): string {
    switch (recordType) {
      case 0x02: return 'gas_switch';
      case 0x03: return 'setpoint_change';
      case 0x04: return 'deco_violation';
      case 0x05: return 'ppo2_warning';
      case 0x06: return 'ceiling_violation';
      case 0x07: return 'surface';
      default: return `unknown_${recordType}`;
    }
  }
}

export const shearwaterProtocol = new ShearwaterProtocol();
export default shearwaterProtocol;
