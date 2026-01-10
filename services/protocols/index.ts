export { SlipDecoder, slipEncode, slipDecode } from './slipCodec';
export { 
  BaseDiveComputerProtocol, 
  DiveComputerInfo, 
  RawDiveData, 
  RawSample, 
  RawGasMix, 
  RawEvent,
  ProgressCallback 
} from './baseProtocol';
export { ShearwaterProtocol, shearwaterProtocol } from './shearwaterProtocol';
export { 
  DiveImportDTO, 
  BleImportResult, 
  convertBleToImportDTO, 
  processBleDownload 
} from './bleImportAdapter';

import { ShearwaterProtocol } from './shearwaterProtocol';
import { BaseDiveComputerProtocol } from './baseProtocol';

export type SupportedProtocol = 'shearwater' | 'suunto' | 'mares';

const protocols: Record<SupportedProtocol, () => BaseDiveComputerProtocol> = {
  shearwater: () => new ShearwaterProtocol(),
  suunto: () => { throw new Error('Suunto protocol not yet implemented'); },
  mares: () => { throw new Error('Mares protocol not yet implemented'); },
};

export function getProtocol(name: SupportedProtocol): BaseDiveComputerProtocol {
  const factory = protocols[name];
  if (!factory) {
    throw new Error(`Unknown protocol: ${name}`);
  }
  return factory();
}

export function getSupportedProtocols(): SupportedProtocol[] {
  return ['shearwater'];
}

export function getProtocolForDevice(deviceName: string): SupportedProtocol | null {
  const lowerName = deviceName.toLowerCase();
  
  if (lowerName.includes('petrel') || 
      lowerName.includes('perdix') || 
      lowerName.includes('teric') || 
      lowerName.includes('nerd') ||
      lowerName.includes('peregrine')) {
    return 'shearwater';
  }
  
  if (lowerName.includes('eon') || 
      lowerName.includes('d5') || 
      lowerName.includes('suunto')) {
    return 'suunto';
  }
  
  if (lowerName.includes('mares') || 
      lowerName.includes('quad') || 
      lowerName.includes('genius')) {
    return 'mares';
  }
  
  return null;
}
