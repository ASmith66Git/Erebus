const SLIP_END = 0xc0;
const SLIP_ESC = 0xdb;
const SLIP_ESC_END = 0xdc;
const SLIP_ESC_ESC = 0xdd;

// Match libdivecomputer's 32-byte frame size for Shearwater BLE
const BLE_MTU = 32;

export function slipEncode(data: Uint8Array, isBle: boolean = true): Uint8Array[] {
  const frames: Uint8Array[] = [];
  
  if (isBle) {
    const encoded: number[] = [];
    for (let i = 0; i < data.length; i++) {
      const c = data[i];
      if (c === SLIP_END) {
        encoded.push(SLIP_ESC, SLIP_ESC_END);
      } else if (c === SLIP_ESC) {
        encoded.push(SLIP_ESC, SLIP_ESC_ESC);
      } else {
        encoded.push(c);
      }
    }
    encoded.push(SLIP_END);
    
    const payloadPerFrame = BLE_MTU - 2;
    const numFrames = Math.ceil(encoded.length / payloadPerFrame);
    
    let offset = 0;
    for (let frameIdx = 0; frameIdx < numFrames; frameIdx++) {
      const remaining = encoded.length - offset;
      const payloadSize = Math.min(payloadPerFrame, remaining);
      
      const frame = new Uint8Array(payloadSize + 2);
      frame[0] = numFrames;
      frame[1] = frameIdx;
      
      for (let i = 0; i < payloadSize; i++) {
        frame[i + 2] = encoded[offset + i];
      }
      
      frames.push(frame);
      offset += payloadSize;
    }
  } else {
    const encoded: number[] = [];
    for (let i = 0; i < data.length; i++) {
      const c = data[i];
      if (c === SLIP_END) {
        encoded.push(SLIP_ESC, SLIP_ESC_END);
      } else if (c === SLIP_ESC) {
        encoded.push(SLIP_ESC, SLIP_ESC_ESC);
      } else {
        encoded.push(c);
      }
    }
    encoded.push(SLIP_END);
    frames.push(new Uint8Array(encoded));
  }
  
  return frames;
}

export function slipDecode(data: Uint8Array, isBle: boolean = true): Uint8Array | null {
  let startOffset = 0;
  
  if (isBle) {
    if (data.length < 2) {
      return null;
    }
    startOffset = 2;
  }
  
  const decoded: number[] = [];
  let escaped = false;
  
  for (let i = startOffset; i < data.length; i++) {
    const c = data[i];
    
    if (escaped) {
      switch (c) {
        case SLIP_ESC_END:
          decoded.push(SLIP_END);
          break;
        case SLIP_ESC_ESC:
          decoded.push(SLIP_ESC);
          break;
        default:
          decoded.push(c);
          break;
      }
      escaped = false;
    } else if (c === SLIP_END) {
      break;
    } else if (c === SLIP_ESC) {
      escaped = true;
    } else {
      decoded.push(c);
    }
  }
  
  return new Uint8Array(decoded);
}

export class SlipDecoder {
  private buffer: number[] = [];
  private escaped: boolean = false;
  private isBle: boolean;
  private expectedFrames: number = 0;
  private receivedFrames: Map<number, number[]> = new Map();
  private currentPacketData: number[] = [];
  
  constructor(isBle: boolean = true) {
    this.isBle = isBle;
  }
  
  addData(data: Uint8Array): Uint8Array[] {
    const packets: Uint8Array[] = [];
    
    if (this.isBle) {
      if (data.length < 2) {
        return packets;
      }
      
      const numFrames = data[0];
      const frameIdx = data[1];
      
      if (this.expectedFrames === 0 || frameIdx === 0) {
        this.expectedFrames = numFrames;
        this.receivedFrames.clear();
        this.currentPacketData = [];
        this.escaped = false;
      }
      
      const framePayload: number[] = [];
      for (let i = 2; i < data.length; i++) {
        framePayload.push(data[i]);
      }
      this.receivedFrames.set(frameIdx, framePayload);
      
      if (this.receivedFrames.size === this.expectedFrames) {
        const reassembled: number[] = [];
        for (let i = 0; i < this.expectedFrames; i++) {
          const frame = this.receivedFrames.get(i);
          if (frame) {
            reassembled.push(...frame);
          }
        }
        
        const decoded: number[] = [];
        let esc = false;
        for (const c of reassembled) {
          if (esc) {
            switch (c) {
              case SLIP_ESC_END:
                decoded.push(SLIP_END);
                break;
              case SLIP_ESC_ESC:
                decoded.push(SLIP_ESC);
                break;
              default:
                decoded.push(c);
                break;
            }
            esc = false;
          } else if (c === SLIP_END) {
            if (decoded.length > 0) {
              packets.push(new Uint8Array(decoded));
            }
            break;
          } else if (c === SLIP_ESC) {
            esc = true;
          } else {
            decoded.push(c);
          }
        }
        
        this.expectedFrames = 0;
        this.receivedFrames.clear();
        this.escaped = false;
      }
    } else {
      for (let i = 0; i < data.length; i++) {
        const c = data[i];
        
        if (this.escaped) {
          switch (c) {
            case SLIP_ESC_END:
              this.buffer.push(SLIP_END);
              break;
            case SLIP_ESC_ESC:
              this.buffer.push(SLIP_ESC);
              break;
            default:
              this.buffer.push(c);
              break;
          }
          this.escaped = false;
        } else if (c === SLIP_END) {
          if (this.buffer.length > 0) {
            packets.push(new Uint8Array(this.buffer));
            this.buffer = [];
          }
        } else if (c === SLIP_ESC) {
          this.escaped = true;
        } else {
          this.buffer.push(c);
        }
      }
    }
    
    return packets;
  }
  
  reset(): void {
    this.buffer = [];
    this.escaped = false;
    this.expectedFrames = 0;
    this.receivedFrames.clear();
    this.currentPacketData = [];
  }
}
