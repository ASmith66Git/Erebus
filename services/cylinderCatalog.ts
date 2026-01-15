export type CylinderMaterial = 'steel' | 'aluminum';
export type CylinderUse = 'single' | 'stage' | 'pony' | 'twinset';

export interface Cylinder {
  id: string;
  label: string;
  volumeL: number;
  workingPressureBar: number;
  material: CylinderMaterial;
  defaultUse: CylinderUse;
  volumeCuft: number;
  buoyancyFullKg?: number;
  buoyancyEmptyKg?: number;
}

const BAR_TO_CUFT_FACTOR = 0.0353147;

function calculateCuft(volumeL: number, pressureBar: number): number {
  return Math.round(volumeL * pressureBar * BAR_TO_CUFT_FACTOR);
}

export const CYLINDER_CATALOG: Cylinder[] = [
  { id: 'steel-1l', label: 'Steel 1L', volumeL: 1, workingPressureBar: 200, material: 'steel', defaultUse: 'pony', volumeCuft: calculateCuft(1, 200) },
  { id: 'steel-2l', label: 'Steel 2L', volumeL: 2, workingPressureBar: 200, material: 'steel', defaultUse: 'pony', volumeCuft: calculateCuft(2, 200) },
  { id: 'steel-3l', label: 'Steel 3L', volumeL: 3, workingPressureBar: 200, material: 'steel', defaultUse: 'stage', volumeCuft: calculateCuft(3, 200) },
  { id: 'steel-5l', label: 'Steel 5L', volumeL: 5, workingPressureBar: 200, material: 'steel', defaultUse: 'stage', volumeCuft: calculateCuft(5, 200) },
  { id: 'steel-7l', label: 'Steel 7L', volumeL: 7, workingPressureBar: 200, material: 'steel', defaultUse: 'stage', volumeCuft: calculateCuft(7, 200) },
  { id: 'steel-10l', label: 'Steel 10L', volumeL: 10, workingPressureBar: 200, material: 'steel', defaultUse: 'single', volumeCuft: calculateCuft(10, 200) },
  { id: 'steel-12l', label: 'Steel 12L', volumeL: 12, workingPressureBar: 200, material: 'steel', defaultUse: 'single', volumeCuft: calculateCuft(12, 200) },
  { id: 'steel-15l', label: 'Steel 15L', volumeL: 15, workingPressureBar: 200, material: 'steel', defaultUse: 'single', volumeCuft: calculateCuft(15, 200) },
  { id: 'steel-18l', label: 'Steel 18L', volumeL: 18, workingPressureBar: 200, material: 'steel', defaultUse: 'single', volumeCuft: calculateCuft(18, 200) },
  
  { id: 'al-1l', label: 'Aluminum 1L', volumeL: 1, workingPressureBar: 207, material: 'aluminum', defaultUse: 'pony', volumeCuft: calculateCuft(1, 207) },
  { id: 'al-2l', label: 'Aluminum 2L', volumeL: 2, workingPressureBar: 207, material: 'aluminum', defaultUse: 'pony', volumeCuft: calculateCuft(2, 207) },
  { id: 'al-3l', label: 'Aluminum 3L', volumeL: 3, workingPressureBar: 207, material: 'aluminum', defaultUse: 'stage', volumeCuft: calculateCuft(3, 207) },
  { id: 'al-5l', label: 'Aluminum 5L', volumeL: 5, workingPressureBar: 207, material: 'aluminum', defaultUse: 'stage', volumeCuft: calculateCuft(5, 207) },
  { id: 'al-7l', label: 'Aluminum 7L', volumeL: 7, workingPressureBar: 207, material: 'aluminum', defaultUse: 'stage', volumeCuft: calculateCuft(7, 207) },
  { id: 'al-10l', label: 'Aluminum 10L', volumeL: 10, workingPressureBar: 207, material: 'aluminum', defaultUse: 'single', volumeCuft: calculateCuft(10, 207) },
  { id: 'al-12l', label: 'Aluminum 12L', volumeL: 12, workingPressureBar: 207, material: 'aluminum', defaultUse: 'single', volumeCuft: calculateCuft(12, 207) },
  { id: 'al-15l', label: 'Aluminum 15L', volumeL: 15, workingPressureBar: 207, material: 'aluminum', defaultUse: 'single', volumeCuft: calculateCuft(15, 207) },
  { id: 'al-18l', label: 'Aluminum 18L', volumeL: 18, workingPressureBar: 207, material: 'aluminum', defaultUse: 'single', volumeCuft: calculateCuft(18, 207) },

  { id: 'al80', label: 'Aluminum 80 (AL80)', volumeL: 11.1, workingPressureBar: 207, material: 'aluminum', defaultUse: 'single', volumeCuft: 80 },
  { id: 'al63', label: 'Aluminum 63 (AL63)', volumeL: 8.9, workingPressureBar: 207, material: 'aluminum', defaultUse: 'single', volumeCuft: 63 },
  { id: 'al100', label: 'Aluminum 100 (AL100)', volumeL: 12.9, workingPressureBar: 207, material: 'aluminum', defaultUse: 'single', volumeCuft: 100 },
  { id: 'hp80', label: 'Steel 80 (HP80)', volumeL: 10.2, workingPressureBar: 234, material: 'steel', defaultUse: 'single', volumeCuft: 80 },
  { id: 'hp100', label: 'Steel 100 (HP100)', volumeL: 12.7, workingPressureBar: 234, material: 'steel', defaultUse: 'single', volumeCuft: 100 },
  { id: 'hp120', label: 'Steel 120 (HP120)', volumeL: 15.3, workingPressureBar: 234, material: 'steel', defaultUse: 'single', volumeCuft: 120 },
  
  { id: 'twinset-12l', label: 'Twinset 12L x2', volumeL: 24, workingPressureBar: 200, material: 'steel', defaultUse: 'twinset', volumeCuft: 170 },
  { id: 'twinset-15l', label: 'Twinset 15L x2', volumeL: 30, workingPressureBar: 200, material: 'steel', defaultUse: 'twinset', volumeCuft: 212 },
  { id: 'twinset-18l', label: 'Twinset 18L x2', volumeL: 36, workingPressureBar: 200, material: 'steel', defaultUse: 'twinset', volumeCuft: 254 },
  
  { id: 'stage-al40', label: 'Stage AL40', volumeL: 5.7, workingPressureBar: 207, material: 'aluminum', defaultUse: 'stage', volumeCuft: 40 },
  { id: 'stage-al30', label: 'Stage AL30', volumeL: 4.0, workingPressureBar: 207, material: 'aluminum', defaultUse: 'stage', volumeCuft: 30 },
  { id: 'stage-al19', label: 'Stage AL19', volumeL: 2.7, workingPressureBar: 207, material: 'aluminum', defaultUse: 'stage', volumeCuft: 19 },
  
  { id: 'pony-al13', label: 'Pony AL13', volumeL: 1.9, workingPressureBar: 207, material: 'aluminum', defaultUse: 'pony', volumeCuft: 13 },
  { id: 'pony-al6', label: 'Pony AL6', volumeL: 0.85, workingPressureBar: 207, material: 'aluminum', defaultUse: 'pony', volumeCuft: 6 },
  
  { id: 'custom', label: 'Custom', volumeL: 12, workingPressureBar: 200, material: 'steel', defaultUse: 'single', volumeCuft: 85 },
];

export function getCylinderById(id: string): Cylinder | undefined {
  return CYLINDER_CATALOG.find(c => c.id === id);
}

export function getCylindersByMaterial(material: CylinderMaterial): Cylinder[] {
  return CYLINDER_CATALOG.filter(c => c.material === material);
}

export function getCylindersByUse(use: CylinderUse): Cylinder[] {
  return CYLINDER_CATALOG.filter(c => c.defaultUse === use);
}

export function getCylindersByVolume(minL: number, maxL: number): Cylinder[] {
  return CYLINDER_CATALOG.filter(c => c.volumeL >= minL && c.volumeL <= maxL);
}

export function getSingleCylinders(): Cylinder[] {
  return CYLINDER_CATALOG.filter(c => c.defaultUse === 'single' || c.defaultUse === 'stage');
}

export function getTwinsets(): Cylinder[] {
  return CYLINDER_CATALOG.filter(c => c.defaultUse === 'twinset');
}

export function getStageCylinders(): Cylinder[] {
  return CYLINDER_CATALOG.filter(c => c.defaultUse === 'stage' || c.defaultUse === 'pony');
}

export function convertLitersTobar(volumeL: number, gasVolumeLiters: number): number {
  return gasVolumeLiters / volumeL;
}

export function convertBarToLiters(volumeL: number, pressureBar: number): number {
  return volumeL * pressureBar;
}

export function convertLitersToCuft(liters: number): number {
  return liters * 0.0353147;
}

export function convertCuftToLiters(cuft: number): number {
  return cuft / 0.0353147;
}

export const CYLINDER_PRESETS_LEGACY = CYLINDER_CATALOG.map(c => ({
  label: c.label,
  volumeL: c.volumeL,
  fillBar: c.workingPressureBar,
  volumeCuft: c.volumeCuft,
}));
