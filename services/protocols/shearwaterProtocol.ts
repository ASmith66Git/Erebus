import bleService, { DownloadProgress } from '../bleService';
import { Buffer } from 'buffer';

const SHEARWATER_SERVICE_UUID = 'fe25c237-0ece-443c-b0aa-e02033e7029d';
const SHEARWATER_CHAR_UUID = '27b7570b-359e-45a3-91bb-cf7e70049bd2';

const FRAME_START = 0xFD;
const FRAME_END = 0xFE;

interface DiveHeader {
  diveNumber: number;
  timestamp: Date;
  duration: number;
  maxDepth: number;
}

interface DiveData {
  header: DiveHeader;
  samples: {
    time_seconds: number;
    depth_meters: number;
    temperature_celsius: number | null;
  }[];
  gasMixes: {
    name: string;
    o2: number;
    he: number;
  }[];
}

type ProgressCallback = (progress: DownloadProgress) => void;

class ShearwaterProtocol {
  private dataBuffer: number[] = [];
  private monitorSubscription: (() => void) | null = null;
  private progressCallback: ProgressCallback | null = null;
  private receivedFrames: number[][] = [];
  private isDownloading: boolean = false;
  private isCancelled: boolean = false;
  private waitIntervalId: ReturnType<typeof setInterval> | null = null;
  private waitResolve: (() => void) | null = null;

  async downloadDives(onProgress: ProgressCallback): Promise<DiveData[]> {
    this.progressCallback = onProgress;
    this.receivedFrames = [];
    this.dataBuffer = [];
    this.isDownloading = true;
    this.isCancelled = false;

    try {
      this.updateProgress({
        current: 0,
        total: 100,
        percentage: 0,
        status: 'connecting',
        message: 'Connecting to dive computer...',
      });

      this.monitorSubscription = await bleService.monitorCharacteristic(
        SHEARWATER_SERVICE_UUID,
        SHEARWATER_CHAR_UUID,
        (data: string) => this.handleIncomingData(data)
      );

      this.updateProgress({
        current: 10,
        total: 100,
        percentage: 10,
        status: 'downloading',
        message: 'Requesting dive data...',
      });

      await this.sendCommand([0x35]);
      await this.waitForDownloadComplete();

      this.updateProgress({
        current: 80,
        total: 100,
        percentage: 80,
        status: 'parsing',
        message: 'Parsing dive data...',
      });

      const dives = this.parseDiveData();

      this.updateProgress({
        current: 100,
        total: 100,
        percentage: 100,
        status: 'complete',
        message: `Downloaded ${dives.length} dive(s)`,
      });

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
    } finally {
      this.cleanup();
    }
  }

  private async sendCommand(command: number[]): Promise<void> {
    const frame = this.buildFrame(command);
    const base64Data = Buffer.from(frame).toString('base64');
    
    await bleService.writeCharacteristic(
      SHEARWATER_SERVICE_UUID,
      SHEARWATER_CHAR_UUID,
      base64Data,
      false
    );
  }

  private buildFrame(data: number[]): number[] {
    const frame = [FRAME_START, ...data, FRAME_END];
    return frame;
  }

  private handleIncomingData(base64Data: string): void {
    try {
      const buffer = Buffer.from(base64Data, 'base64');
      const bytes = Array.from(buffer);
      
      this.dataBuffer.push(...bytes);

      let startIdx = this.dataBuffer.indexOf(FRAME_START);
      while (startIdx !== -1) {
        const endIdx = this.dataBuffer.indexOf(FRAME_END, startIdx + 1);
        if (endIdx === -1) break;

        const frame = this.dataBuffer.slice(startIdx + 1, endIdx);
        this.receivedFrames.push(frame);

        this.dataBuffer = this.dataBuffer.slice(endIdx + 1);
        startIdx = this.dataBuffer.indexOf(FRAME_START);
      }

      const progress = Math.min(10 + (this.receivedFrames.length * 2), 75);
      this.updateProgress({
        current: progress,
        total: 100,
        percentage: progress,
        status: 'downloading',
        message: `Receiving data... (${this.receivedFrames.length} packets)`,
      });
    } catch (error) {
      console.error('Error handling incoming data:', error);
    }
  }

  private async waitForDownloadComplete(): Promise<void> {
    const timeout = 60000;
    const checkInterval = 500;
    let elapsed = 0;
    let lastFrameCount = 0;
    let noNewDataCount = 0;

    return new Promise((resolve, reject) => {
      this.waitResolve = resolve;
      
      this.waitIntervalId = setInterval(() => {
        if (this.isCancelled) {
          if (this.waitIntervalId) {
            clearInterval(this.waitIntervalId);
            this.waitIntervalId = null;
          }
          resolve();
          return;
        }

        elapsed += checkInterval;

        if (this.receivedFrames.length === lastFrameCount) {
          noNewDataCount++;
        } else {
          noNewDataCount = 0;
          lastFrameCount = this.receivedFrames.length;
        }

        if (noNewDataCount >= 6 && this.receivedFrames.length > 0) {
          if (this.waitIntervalId) {
            clearInterval(this.waitIntervalId);
            this.waitIntervalId = null;
          }
          resolve();
        }

        if (elapsed >= timeout) {
          if (this.waitIntervalId) {
            clearInterval(this.waitIntervalId);
            this.waitIntervalId = null;
          }
          if (this.receivedFrames.length > 0) {
            resolve();
          } else {
            reject(new Error('Download timeout - no data received'));
          }
        }
      }, checkInterval);
    });
  }

  private parseDiveData(): DiveData[] {
    const dives: DiveData[] = [];

    if (this.receivedFrames.length === 0) {
      return dives;
    }

    let currentDive: DiveData | null = null;

    for (const frame of this.receivedFrames) {
      if (frame.length < 2) continue;

      const recordType = frame[0];

      switch (recordType) {
        case 0x01:
          if (currentDive) {
            dives.push(currentDive);
          }
          currentDive = this.parseDiveHeader(frame);
          break;

        case 0x02:
          if (currentDive) {
            const sample = this.parseSample(frame);
            if (sample) {
              currentDive.samples.push(sample);
            }
          }
          break;

        case 0x03:
          if (currentDive) {
            const gasMix = this.parseGasMix(frame);
            if (gasMix) {
              currentDive.gasMixes.push(gasMix);
            }
          }
          break;

        case 0xFF:
          if (currentDive) {
            dives.push(currentDive);
            currentDive = null;
          }
          break;
      }
    }

    if (currentDive) {
      dives.push(currentDive);
    }

    return dives;
  }

  private parseDiveHeader(frame: number[]): DiveData {
    const diveNumber = frame.length > 2 ? (frame[1] << 8) | frame[2] : 0;
    const timestamp = frame.length > 6 
      ? new Date(((frame[3] << 24) | (frame[4] << 16) | (frame[5] << 8) | frame[6]) * 1000)
      : new Date();
    const duration = frame.length > 8 ? (frame[7] << 8) | frame[8] : 0;
    const maxDepth = frame.length > 10 ? ((frame[9] << 8) | frame[10]) / 100 : 0;

    return {
      header: {
        diveNumber,
        timestamp,
        duration,
        maxDepth,
      },
      samples: [],
      gasMixes: [],
    };
  }

  private parseSample(frame: number[]): { time_seconds: number; depth_meters: number; temperature_celsius: number | null } | null {
    if (frame.length < 5) return null;

    const time = (frame[1] << 8) | frame[2];
    const depth = ((frame[3] << 8) | frame[4]) / 100;
    const temperature = frame.length > 6 ? (((frame[5] << 8) | frame[6]) / 10) - 273.15 : null;

    return {
      time_seconds: time,
      depth_meters: depth,
      temperature_celsius: temperature,
    };
  }

  private parseGasMix(frame: number[]): { name: string; o2: number; he: number } | null {
    if (frame.length < 4) return null;

    const o2 = frame[2];
    const he = frame.length > 3 ? frame[3] : 0;

    return {
      name: he > 0 ? `TX${o2}/${he}` : o2 === 21 ? 'Air' : `EAN${o2}`,
      o2,
      he,
    };
  }

  private updateProgress(progress: DownloadProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }

  private cleanup(): void {
    this.isDownloading = false;
    if (this.waitIntervalId) {
      clearInterval(this.waitIntervalId);
      this.waitIntervalId = null;
    }
    if (this.monitorSubscription) {
      this.monitorSubscription();
      this.monitorSubscription = null;
    }
    this.dataBuffer = [];
    this.progressCallback = null;
    this.waitResolve = null;
  }

  cancel(): void {
    this.isCancelled = true;
    if (this.waitIntervalId) {
      clearInterval(this.waitIntervalId);
      this.waitIntervalId = null;
    }
    if (this.waitResolve) {
      this.waitResolve();
      this.waitResolve = null;
    }
    this.cleanup();
  }
}

export const shearwaterProtocol = new ShearwaterProtocol();
export default shearwaterProtocol;
