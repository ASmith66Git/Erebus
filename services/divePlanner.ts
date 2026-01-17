export interface GasMix {
  id: string;
  name: string;
  o2Percent: number;
  hePercent: number;
  n2Percent: number;
  switchDepth: number | null;
  modPpo2_14: number;
  modPpo2_16: number;
  // Cylinder properties
  cylinderVolume: number; // liters (water capacity)
  fillPressure: number; // bar
  reservePressure: number; // bar - minimum reserve
  cylinderId?: string; // unique identifier for this specific cylinder (for tracking consumption)
}

export interface GasConsumption {
  gasId: string; // mix-based id (for legacy compatibility)
  cylinderId: string; // unique cylinder identifier
  gasName: string;
  gasAvailable: number; // liters at surface
  gasRequired: number; // liters at surface
  gasRemaining: number; // liters at surface
  reserveRequired: number; // liters at surface
  percentUsed: number;
  isSufficient: boolean;
}

export interface DiveSegment {
  type: 'descent' | 'bottom' | 'ascent' | 'deco_stop' | 'gas_switch' | 'surface_interval';
  startDepth: number;
  endDepth: number;
  duration: number;
  gasMix: GasMix;
  runTime: number;
}

export interface DecoStop {
  depth: number;
  duration: number;
  gasMix: GasMix;
  ceiling: number;
}

export interface TissueState {
  compartment: number;
  halfTimeN2: number;
  halfTimeHe: number;
  ppN2: number;
  ppHe: number;
  ppInert: number;
  mValue: number;
  mValueGF: number;
  percentMValue: number;
  ceiling: number;
}

export type CircuitType = 'open' | 'ccr';
export type DecoModel = 'zhl16a' | 'zhl16b' | 'zhl16c' | 'vpmb';
export type WaterType = 'salt' | 'fresh';
export type UnitSystem = 'metric' | 'imperial';

export interface DivePlanSettings {
  gfLow: number;
  gfHigh: number;
  descentRate: number;
  ascentRate: number;
  lastStopDepth: number;
  decoStopInterval: number;
  sacRateBottom: number;
  sacRateDeco: number;
  // Circuit & Model
  circuit: CircuitType;
  decoModel: DecoModel;
  o2Narcotic: boolean;
  units: UnitSystem;
  gasSwitchTime: number;
  waterType: WaterType;
  ccrSetpoint: number;
  scrubberDuration: number;
  // Deco stop settings
  stopSize: number; // 3m or 10ft interval
  lastOcStopDepth: number; // Last stop depth for OC
  lastCcrStopDepth: number; // Last stop depth for CCR
  minStopTime: number; // Minimum stop time in minutes
  ppo2High: number; // PPO2 for 45-99% O2 (1.6)
  ppo2Medium: number; // PPO2 for 28-45% O2 (1.5)
  ppo2Low: number; // PPO2 for <28% O2 (1.4)
  maxO2Depth: number; // Max depth for 100% O2
  use30SecStops: boolean;
  use6mSteps: boolean;
  // Extended stops
  extendedStops: boolean;
  extendedStopShallow: number; // 7-30m extra time (min)
  extendedStopDeep: number; // 30+m extra time (min)
  addTimeToStop: boolean;
  allMixChanges: boolean;
  o2WindowEffect: boolean;
  // Separate ascent rates
  surfaceRate: number;
  decoRate: number;
  // Altitude diving
  elevation: number;
  acclimatizedElevation: number;
  // Display settings
  gaugeType: 'simple' | 'digital';
  ccrSetpointUnits: 'bar' | 'ata';
  gasVolumeUnits: 'cuft' | 'ltr';
  // Dive monitor thresholds
  ppo2AboveEnabled: boolean;
  ppo2AboveThreshold: number;
  ppo2BelowEnabled: boolean;
  ppo2BelowThreshold: number;
  otuAboveEnabled: boolean;
  otuAboveThreshold: number;
  cnsAboveEnabled: boolean;
  cnsAboveThreshold: number;
  ibcdN2Enabled: boolean;
  ibcdN2Threshold: number;
  ibcdHeEnabled: boolean;
  ibcdHeThreshold: number;
  ccrDiluentCheck: boolean;
}

export interface DivePlanResult {
  segments: DiveSegment[];
  decoStops: DecoStop[];
  tissueHistory: TissueState[][];
  totalRunTime: number;
  totalDecoTime: number;
  maxDepth: number;
  cns: number;
  otu: number;
  ndl: number | null;
  warnings: string[];
  gasConsumption: GasConsumption[];
}

export interface DivePlanInput {
  depth: number;
  bottomTime: number;
  gases: GasMix[];
  settings: DivePlanSettings;
  initialTissues?: TissueState[];
  surfaceIntervalMinutes?: number;
}

const ZHL16C_N2 = [
  { halfTime: 4.0, a: 1.2599, b: 0.5050 },
  { halfTime: 8.0, a: 1.0000, b: 0.6514 },
  { halfTime: 12.5, a: 0.8618, b: 0.7222 },
  { halfTime: 18.5, a: 0.7562, b: 0.7725 },
  { halfTime: 27.0, a: 0.6667, b: 0.8125 },
  { halfTime: 38.3, a: 0.5933, b: 0.8434 },
  { halfTime: 54.3, a: 0.5282, b: 0.8693 },
  { halfTime: 77.0, a: 0.4701, b: 0.8910 },
  { halfTime: 109.0, a: 0.4187, b: 0.9092 },
  { halfTime: 146.0, a: 0.3798, b: 0.9222 },
  { halfTime: 187.0, a: 0.3497, b: 0.9319 },
  { halfTime: 239.0, a: 0.3223, b: 0.9403 },
  { halfTime: 305.0, a: 0.2971, b: 0.9477 },
  { halfTime: 390.0, a: 0.2737, b: 0.9544 },
  { halfTime: 498.0, a: 0.2523, b: 0.9602 },
  { halfTime: 635.0, a: 0.2327, b: 0.9653 },
];

const ZHL16C_HE = [
  { halfTime: 1.51, a: 1.7424, b: 0.4245 },
  { halfTime: 3.02, a: 1.3830, b: 0.5747 },
  { halfTime: 4.72, a: 1.1919, b: 0.6527 },
  { halfTime: 6.99, a: 1.0458, b: 0.7223 },
  { halfTime: 10.21, a: 0.9220, b: 0.7582 },
  { halfTime: 14.48, a: 0.8205, b: 0.7957 },
  { halfTime: 20.53, a: 0.7305, b: 0.8279 },
  { halfTime: 29.11, a: 0.6502, b: 0.8553 },
  { halfTime: 41.20, a: 0.5950, b: 0.8757 },
  { halfTime: 55.19, a: 0.5545, b: 0.8903 },
  { halfTime: 70.69, a: 0.5333, b: 0.8997 },
  { halfTime: 90.34, a: 0.5189, b: 0.9073 },
  { halfTime: 115.29, a: 0.5181, b: 0.9122 },
  { halfTime: 147.42, a: 0.5176, b: 0.9171 },
  { halfTime: 188.24, a: 0.5172, b: 0.9217 },
  { halfTime: 240.03, a: 0.5119, b: 0.9267 },
];

const SURFACE_PRESSURE = 1.0;
const WATER_VAPOR_PRESSURE = 0.0627;

// Calculate Equivalent Narcotic Depth (END)
export function calculateEND(depth: number, gas: GasMix, o2Narcotic: boolean, waterType: WaterType = 'salt'): number {
  const ambientPressure = depthToPressure(depth, waterType);
  let narcoticFraction: number;
  
  if (o2Narcotic) {
    narcoticFraction = (gas.n2Percent + gas.o2Percent) / 100;
  } else {
    narcoticFraction = gas.n2Percent / 100;
  }
  
  const narcoticPressure = ambientPressure * narcoticFraction;
  const equivalentAirPressure = o2Narcotic ? narcoticPressure : narcoticPressure / 0.79;
  
  return pressureToDepth(equivalentAirPressure, waterType);
}

export function createGasMix(
  o2Percent: number, 
  hePercent: number, 
  name?: string,
  cylinderVolume: number = 12, // default 12L aluminum
  fillPressure: number = 200, // default 200 bar
  reservePressure: number = 50, // default 50 bar reserve
  cylinderId?: string // unique identifier for this cylinder
): GasMix {
  const n2Percent = 100 - o2Percent - hePercent;
  const modPpo2_14 = Math.floor(((1.4 / (o2Percent / 100)) - 1) * 10);
  const modPpo2_16 = Math.floor(((1.6 / (o2Percent / 100)) - 1) * 10);
  
  let autoName = name;
  if (!autoName) {
    if (hePercent === 0) {
      if (o2Percent === 21) autoName = 'Air';
      else if (o2Percent === 100) autoName = 'O2';
      else autoName = `EAN${o2Percent}`;
    } else {
      autoName = `Tx${o2Percent}/${hePercent}`;
    }
  }
  
  return {
    id: `${o2Percent}-${hePercent}`,
    name: autoName,
    o2Percent,
    hePercent,
    n2Percent,
    switchDepth: null,
    modPpo2_14,
    modPpo2_16,
    cylinderVolume,
    fillPressure,
    reservePressure,
    cylinderId,
  };
}

export function depthToPressure(depth: number, waterType: WaterType = 'salt'): number {
  const factor = waterType === 'fresh' ? 10.3 : 10.0;
  return SURFACE_PRESSURE + (depth / factor);
}

export function pressureToDepth(pressure: number, waterType: WaterType = 'salt'): number {
  const factor = waterType === 'fresh' ? 10.3 : 10.0;
  return (pressure - SURFACE_PRESSURE) * factor;
}

export function getInspiredPressure(ambientPressure: number, gas: GasMix): { ppN2: number; ppHe: number; ppO2: number } {
  const alveolarPressure = ambientPressure - WATER_VAPOR_PRESSURE;
  
  return {
    ppN2: alveolarPressure * (gas.n2Percent / 100),
    ppHe: alveolarPressure * (gas.hePercent / 100),
    ppO2: alveolarPressure * (gas.o2Percent / 100),
  };
}

export function getInspiredPressureCCR(
  ambientPressure: number, 
  gas: GasMix, 
  setpoint: number
): { ppN2: number; ppHe: number; ppO2: number } {
  const alveolarPressure = ambientPressure - WATER_VAPOR_PRESSURE;
  
  const actualPpO2 = Math.min(setpoint, alveolarPressure);
  
  const remainingPressure = alveolarPressure - actualPpO2;
  
  const inertTotal = gas.n2Percent + gas.hePercent;
  if (inertTotal === 0) {
    return { ppN2: remainingPressure, ppHe: 0, ppO2: actualPpO2 };
  }
  
  const n2Ratio = gas.n2Percent / inertTotal;
  const heRatio = gas.hePercent / inertTotal;
  
  return {
    ppN2: remainingPressure * n2Ratio,
    ppHe: remainingPressure * heRatio,
    ppO2: actualPpO2,
  };
}

export function initializeTissues(): TissueState[] {
  const surfaceN2 = (SURFACE_PRESSURE - WATER_VAPOR_PRESSURE) * 0.79;
  
  return ZHL16C_N2.map((comp, i) => ({
    compartment: i + 1,
    halfTimeN2: comp.halfTime,
    halfTimeHe: ZHL16C_HE[i].halfTime,
    ppN2: surfaceN2,
    ppHe: 0,
    ppInert: surfaceN2,
    mValue: 0,
    mValueGF: 0,
    percentMValue: 0,
    ceiling: 0,
  }));
}

// Get raw coefficients for N2 and He
function getN2Coefficients(compartmentIndex: number): { a: number; b: number } {
  const comp = ZHL16C_N2[compartmentIndex];
  return { a: comp.a, b: comp.b };
}

function getHeCoefficients(compartmentIndex: number): { a: number; b: number } {
  const comp = ZHL16C_HE[compartmentIndex];
  return { a: comp.a, b: comp.b };
}

// Calculate weighted a/b coefficients based on tissue inert gas loading
// This is the standard Bühlmann approach for mixed N2/He
function getWeightedCoefficients(ppN2: number, ppHe: number, compartmentIndex: number): { a: number; b: number } {
  const n2Comp = ZHL16C_N2[compartmentIndex];
  const heComp = ZHL16C_HE[compartmentIndex];
  
  const totalInert = ppN2 + ppHe;
  if (totalInert <= 0) {
    return { a: n2Comp.a, b: n2Comp.b };
  }
  
  // Weighted average based on partial pressures
  const n2Fraction = ppN2 / totalInert;
  const heFraction = ppHe / totalInert;
  
  return {
    a: (n2Fraction * n2Comp.a) + (heFraction * heComp.a),
    b: (n2Fraction * n2Comp.b) + (heFraction * heComp.b),
  };
}

export function calculateTissueLoadingConstantDepth(
  tissues: TissueState[],
  depth: number,
  duration: number,
  gas: GasMix,
  waterType: WaterType = 'salt',
  circuit: CircuitType = 'open',
  ccrSetpoint: number = 1.3
): TissueState[] {
  const ambientPressure = depthToPressure(depth, waterType);
  const inspired = circuit === 'ccr' 
    ? getInspiredPressureCCR(ambientPressure, gas, ccrSetpoint)
    : getInspiredPressure(ambientPressure, gas);
  const { ppN2: inspiredN2, ppHe: inspiredHe } = inspired;
  
  return tissues.map((tissue, i) => {
    const kN2 = Math.LN2 / tissue.halfTimeN2;
    const kHe = Math.LN2 / tissue.halfTimeHe;
    
    const newPpN2 = tissue.ppN2 + (inspiredN2 - tissue.ppN2) * (1 - Math.exp(-kN2 * duration));
    const newPpHe = tissue.ppHe + (inspiredHe - tissue.ppHe) * (1 - Math.exp(-kHe * duration));
    
    return {
      ...tissue,
      ppN2: newPpN2,
      ppHe: newPpHe,
      ppInert: newPpN2 + newPpHe,
    };
  });
}

export function calculateTissueLoadingSchreiner(
  tissues: TissueState[],
  startDepth: number,
  endDepth: number,
  duration: number,
  gas: GasMix,
  waterType: WaterType = 'salt',
  circuit: CircuitType = 'open',
  ccrSetpoint: number = 1.3
): TissueState[] {
  if (duration === 0) return tissues.map(t => ({ ...t }));
  
  const startPressure = depthToPressure(startDepth, waterType);
  const endPressure = depthToPressure(endDepth, waterType);
  const rate = (endPressure - startPressure) / duration;
  
  if (circuit === 'ccr') {
    const startInspired = getInspiredPressureCCR(startPressure, gas, ccrSetpoint);
    const endInspired = getInspiredPressureCCR(endPressure, gas, ccrSetpoint);
    const rateN2 = (endInspired.ppN2 - startInspired.ppN2) / duration;
    const rateHe = (endInspired.ppHe - startInspired.ppHe) / duration;
    
    return tissues.map((tissue, i) => {
      const kN2 = Math.LN2 / tissue.halfTimeN2;
      const kHe = Math.LN2 / tissue.halfTimeHe;
      
      const newPpN2 = startInspired.ppN2 + rateN2 * (duration - 1/kN2) - 
        (startInspired.ppN2 - tissue.ppN2 - rateN2/kN2) * Math.exp(-kN2 * duration);
      
      const newPpHe = startInspired.ppHe + rateHe * (duration - 1/kHe) - 
        (startInspired.ppHe - tissue.ppHe - rateHe/kHe) * Math.exp(-kHe * duration);
      
      return {
        ...tissue,
        ppN2: Math.max(0, newPpN2),
        ppHe: Math.max(0, newPpHe),
        ppInert: Math.max(0, newPpN2) + Math.max(0, newPpHe),
      };
    });
  }
  
  const { ppN2: startN2, ppHe: startHe } = getInspiredPressure(startPressure, gas);
  const rateN2 = rate * (gas.n2Percent / 100);
  const rateHe = rate * (gas.hePercent / 100);
  
  return tissues.map((tissue, i) => {
    const kN2 = Math.LN2 / tissue.halfTimeN2;
    const kHe = Math.LN2 / tissue.halfTimeHe;
    
    const newPpN2 = startN2 + rateN2 * (duration - 1/kN2) - 
      (startN2 - tissue.ppN2 - rateN2/kN2) * Math.exp(-kN2 * duration);
    
    const newPpHe = startHe + rateHe * (duration - 1/kHe) - 
      (startHe - tissue.ppHe - rateHe/kHe) * Math.exp(-kHe * duration);
    
    return {
      ...tissue,
      ppN2: Math.max(0, newPpN2),
      ppHe: Math.max(0, newPpHe),
      ppInert: Math.max(0, newPpN2) + Math.max(0, newPpHe),
    };
  });
}

export function calculateMValueAtPressure(tissue: TissueState, compartmentIndex: number, ambientPressure: number): number {
  // Use weighted coefficients based on tissue inert gas loading
  const { a, b } = getWeightedCoefficients(tissue.ppN2, tissue.ppHe, compartmentIndex);
  // ZHL-16C: M = a + Pamb / b (b is divisor, not multiplier)
  return a + ambientPressure / b;
}

export function calculateToleratedAmbientPressure(tissue: TissueState, compartmentIndex: number): number {
  // Use weighted coefficients based on tissue inert gas loading
  const { a, b } = getWeightedCoefficients(tissue.ppN2, tissue.ppHe, compartmentIndex);
  // ZHL-16C: M = a + P/b  =>  P_ceiling = (Pt - a) * b
  return (tissue.ppInert - a) * b;
}

export function calculateCeilingWithGF(
  tissue: TissueState, 
  compartmentIndex: number, 
  gf: number
): number {
  // Use weighted coefficients based on tissue inert gas loading
  const { a, b } = getWeightedCoefficients(tissue.ppN2, tissue.ppHe, compartmentIndex);
  const g = gf / 100;
  
  // ZHL-16C ceiling formula with gradient factor
  // Standard form: M = a + Pamb/b  =>  Pamb_ceiling = (Pt - a) * b
  // With GF applied to limit supersaturation:
  // Pamb_ceiling = (Pt - a * g) / (g/b + 1 - g)
  const denominator = g / b + 1 - g;
  if (denominator <= 0) return 0;
  const pAmb = (tissue.ppInert - a * g) / denominator;
  return Math.max(0, pAmb);
}

export function calculateGFAtDepth(
  currentDepth: number,
  firstStopDepth: number,
  gfLow: number,
  gfHigh: number,
  waterType: WaterType = 'salt'
): number {
  if (firstStopDepth <= 0) return gfHigh;
  if (currentDepth >= firstStopDepth) return gfLow;
  if (currentDepth <= 0) return gfHigh;
  
  const surfacePressure = SURFACE_PRESSURE;
  const currentPressure = depthToPressure(currentDepth, waterType);
  const firstStopPressure = depthToPressure(firstStopDepth, waterType);
  
  const gf = gfLow + (gfHigh - gfLow) * (firstStopPressure - currentPressure) / (firstStopPressure - surfacePressure);
  return Math.max(gfLow, Math.min(gfHigh, gf));
}

export function findFirstStop(
  tissues: TissueState[],
  gfLow: number,
  stopInterval: number,
  waterType: WaterType = 'salt'
): number {
  let maxCeiling = 0;
  
  tissues.forEach((tissue, i) => {
    const ceilingPressure = calculateCeilingWithGF(tissue, i, gfLow);
    const ceilingDepth = pressureToDepth(ceilingPressure, waterType);
    if (ceilingDepth > maxCeiling) {
      maxCeiling = ceilingDepth;
    }
  });
  
  return Math.ceil(maxCeiling / stopInterval) * stopInterval;
}

export function calculateCeiling(
  tissues: TissueState[],
  gfLow: number,
  gfHigh: number,
  currentDepth: number,
  firstStopDepth: number,
  waterType: WaterType = 'salt'
): { ceiling: number; tissuesWithCeiling: TissueState[] } {
  const gf = calculateGFAtDepth(currentDepth, firstStopDepth, gfLow, gfHigh, waterType);
  let maxCeiling = 0;
  const currentPressure = depthToPressure(currentDepth, waterType);
  
  const tissuesWithCeiling = tissues.map((tissue, i) => {
    const ceilingPressure = calculateCeilingWithGF(tissue, i, gf);
    const ceilingDepth = Math.max(0, pressureToDepth(ceilingPressure, waterType));
    
    const mValue = calculateMValueAtPressure(tissue, i, currentPressure);
    const mValueGF = tissue.ppInert + (mValue - tissue.ppInert) * (gf / 100);
    const percentMValue = mValue > 0 ? (tissue.ppInert / mValue) * 100 : 0;
    
    if (ceilingDepth > maxCeiling) {
      maxCeiling = ceilingDepth;
    }
    
    return {
      ...tissue,
      mValue,
      mValueGF,
      percentMValue,
      ceiling: ceilingDepth,
    };
  });
  
  return {
    ceiling: maxCeiling,
    tissuesWithCeiling,
  };
}

export function calculateNDL(
  tissues: TissueState[], 
  depth: number, 
  gas: GasMix, 
  gfHigh: number,
  waterType: WaterType = 'salt',
  circuit: CircuitType = 'open',
  ccrSetpoint: number = 1.3
): number | null {
  const ambientPressure = depthToPressure(depth, waterType);
  const inspired = circuit === 'ccr'
    ? getInspiredPressureCCR(ambientPressure, gas, ccrSetpoint)
    : getInspiredPressure(ambientPressure, gas);
  const { ppN2: inspiredN2, ppHe: inspiredHe } = inspired;
  const inspiredInert = inspiredN2 + inspiredHe;
  
  let minNdl = Infinity;
  
  tissues.forEach((tissue, i) => {
    // Use weighted coefficients based on the INSPIRED gas mix
    const { a, b } = getWeightedCoefficients(inspiredN2, inspiredHe, i);
    
    // ZHL-16C: M = a + P/b (b is divisor)
    const mValueAtSurface = a + SURFACE_PRESSURE / b;
    const toleratedAtSurface = SURFACE_PRESSURE + (mValueAtSurface - SURFACE_PRESSURE) * (gfHigh / 100);
    
    if (inspiredInert <= toleratedAtSurface) {
      return; // This compartment won't limit NDL
    }
    
    // Calculate effective k (rate constant) based on gas mix
    const kN2 = Math.LN2 / tissue.halfTimeN2;
    const kHe = Math.LN2 / tissue.halfTimeHe;
    const n2Fraction = inspiredInert > 0 ? inspiredN2 / inspiredInert : 1;
    const heFraction = inspiredInert > 0 ? inspiredHe / inspiredInert : 0;
    const kEffective = kN2 * n2Fraction + kHe * heFraction;
    
    const currentInert = tissue.ppInert;
    
    if (inspiredInert <= currentInert) {
      return;
    }
    
    const fraction = (toleratedAtSurface - currentInert) / (inspiredInert - currentInert);
    if (fraction <= 0 || fraction >= 1) {
      return;
    }
    
    const time = -Math.log(1 - fraction) / kEffective;
    
    if (time > 0 && time < minNdl) {
      minNdl = time;
    }
  });
  
  return minNdl === Infinity ? null : Math.floor(minNdl);
}

export function calculateDecoSchedule(
  tissues: TissueState[],
  currentDepth: number,
  gases: GasMix[],
  settings: DivePlanSettings
): { stops: DecoStop[]; finalTissues: TissueState[]; tissueHistory: TissueState[][] } {
  const stops: DecoStop[] = [];
  const tissueHistory: TissueState[][] = [tissues.map(t => ({ ...t }))];
  let currentTissues = tissues.map(t => ({ ...t }));
  let depth = currentDepth;
  
  const firstStopDepth = findFirstStop(currentTissues, settings.gfLow, settings.decoStopInterval, settings.waterType);
  
  const sortedGases = [...gases].sort((a, b) => (b.switchDepth || Infinity) - (a.switchDepth || Infinity));
  
  const getGasForDepth = (d: number): GasMix => {
    for (const gas of sortedGases) {
      if (gas.switchDepth !== null && d <= gas.switchDepth && d <= gas.modPpo2_16) {
        return gas;
      }
    }
    return gases[0];
  };
  
  let iterations = 0;
  const maxIterations = 500;
  
  while (depth > 0 && iterations < maxIterations) {
    iterations++;
    const gas = getGasForDepth(depth);
    
    const { ceiling, tissuesWithCeiling } = calculateCeiling(
      currentTissues, 
      settings.gfLow, 
      settings.gfHigh, 
      depth, 
      firstStopDepth,
      settings.waterType
    );
    currentTissues = tissuesWithCeiling;
    
    const nextStopDepth = Math.ceil(ceiling / settings.decoStopInterval) * settings.decoStopInterval;
    
    if (nextStopDepth >= depth && depth > 0) {
      currentTissues = calculateTissueLoadingConstantDepth(currentTissues, depth, 1, gas, settings.waterType, settings.circuit, settings.ccrSetpoint);
      tissueHistory.push(currentTissues.map(t => ({ ...t })));
      
      const existingStop = stops.find(s => s.depth === depth);
      if (existingStop) {
        existingStop.duration += 1;
      } else {
        stops.push({ depth, duration: 1, gasMix: gas, ceiling });
      }
    } else {
      const nextDepth = Math.max(0, depth - settings.decoStopInterval);
      const ascentTime = settings.decoStopInterval / settings.ascentRate;
      currentTissues = calculateTissueLoadingSchreiner(currentTissues, depth, nextDepth, ascentTime, gas, settings.waterType, settings.circuit, settings.ccrSetpoint);
      tissueHistory.push(currentTissues.map(t => ({ ...t })));
      depth = nextDepth;
    }
  }
  
  return { stops, finalTissues: currentTissues, tissueHistory };
}

// Helper to calculate CNS/OTU for a segment
function calculateSegmentOxygenToxicity(
  segment: DiveSegment,
  settings: DivePlanSettings
): { cns: number; otu: number } {
  const avgDepth = (segment.startDepth + segment.endDepth) / 2;
  const avgPressure = depthToPressure(avgDepth, settings.waterType);
  
  let ppo2: number;
  if (settings.circuit === 'ccr') {
    ppo2 = Math.min(settings.ccrSetpoint, (segment.gasMix.o2Percent / 100) * avgPressure);
  } else {
    ppo2 = (segment.gasMix.o2Percent / 100) * avgPressure;
  }
  
  return {
    cns: calculateCNS(ppo2, segment.duration),
    otu: calculateOTU(ppo2, segment.duration),
  };
}

// Calculate gas consumption for each gas used in the dive
// Formula: Gas consumed (liters at surface) = SAC rate * time * ambient pressure
// For varying depth: use average depth
export function calculateGasConsumption(
  segments: DiveSegment[],
  gases: GasMix[],
  settings: DivePlanSettings
): GasConsumption[] {
  // Track gas usage per unique cylinder - use cylinderId if available, otherwise fall back to composition
  const gasUsage: Map<string, number> = new Map();
  
  // Create a unique key for each gas - prefer cylinderId for uniqueness
  const getGasKey = (gas: GasMix): string => gas.cylinderId || `${gas.name}-${gas.o2Percent}-${gas.hePercent}`;
  
  // Initialize all gases with 0 consumption
  gases.forEach(gas => {
    gasUsage.set(getGasKey(gas), 0);
  });
  
  // Calculate consumption for each segment
  segments.forEach(segment => {
    const avgDepth = (segment.startDepth + segment.endDepth) / 2;
    const ambientMultiplier = depthToPressure(avgDepth, settings.waterType);
    
    // Use bottom SAC for descent and bottom, deco SAC for ascent and stops
    const sacRate = (segment.type === 'descent' || segment.type === 'bottom') 
      ? settings.sacRateBottom 
      : settings.sacRateDeco;
    
    // Gas consumption = SAC * time * ambient pressure
    // CCR uses much less gas (only for bailout/diluent)
    let gasConsumed: number;
    if (settings.circuit === 'ccr') {
      // CCR uses minimal gas - typically just for loop volume and leaks
      // Approximate 1-2 L/min diluent injection
      gasConsumed = 1.5 * segment.duration;
    } else {
      gasConsumed = sacRate * segment.duration * ambientMultiplier;
    }
    
    // Find matching gas by cylinderId first, then by composition
    let targetGas = gases.find(g => g.cylinderId && g.cylinderId === segment.gasMix.cylinderId);
    if (!targetGas) {
      // Fall back to matching by composition
      targetGas = gases.find(g => g.o2Percent === segment.gasMix.o2Percent && g.hePercent === segment.gasMix.hePercent);
    }
    
    if (targetGas) {
      const targetKey = getGasKey(targetGas);
      gasUsage.set(targetKey, (gasUsage.get(targetKey) || 0) + gasConsumed);
    }
  });
  
  // Build consumption report for each gas
  return gases.map(gas => {
    const gasKey = getGasKey(gas);
    const gasRequired = gasUsage.get(gasKey) || 0;
    
    // Total capacity = cylinder volume * fill pressure (surface liters)
    const totalCapacity = gas.cylinderVolume * gas.fillPressure;
    
    // Reserve = cylinder volume * reserve pressure (surface liters)
    const reserveRequired = gas.cylinderVolume * gas.reservePressure;
    
    // Available = total - reserve (usable gas before hitting reserve)
    const gasAvailable = totalCapacity - reserveRequired;
    
    // Remaining = available - required (what's left above reserve after dive)
    const gasRemaining = gasAvailable - gasRequired;
    
    // Percent used = required / total capacity (for progress bar)
    const percentUsed = totalCapacity > 0 ? (gasRequired / totalCapacity) * 100 : 0;
    
    // Sufficient if we have enough gas above reserve
    const isSufficient = gasRemaining >= 0;
    
    return {
      gasId: gas.id,
      cylinderId: gas.cylinderId || gas.id, // Use cylinderId if available, fallback to mix id
      gasName: gas.name,
      gasAvailable: Math.round(gasAvailable),
      gasRequired: Math.round(gasRequired),
      gasRemaining: Math.round(gasRemaining),
      reserveRequired: Math.round(reserveRequired),
      percentUsed: Math.round(percentUsed * 10) / 10,
      isSufficient,
    };
  });
}

export function calculateDivePlan(input: DivePlanInput): DivePlanResult {
  const { depth, bottomTime, gases, settings, initialTissues, surfaceIntervalMinutes } = input;
  const segments: DiveSegment[] = [];
  const warnings: string[] = [];
  let runTime = 0;
  let totalCNS = 0;
  let totalOTU = 0;
  
  let tissues = initialTissues ? initialTissues.map(t => ({ ...t })) : initializeTissues();
  
  if (surfaceIntervalMinutes && surfaceIntervalMinutes > 0) {
    const surfaceGas = createGasMix(21, 0, 'Air');
    tissues = calculateTissueLoadingConstantDepth(tissues, 0, surfaceIntervalMinutes, surfaceGas, settings.waterType, 'open', 1.3);
  }
  
  const tissueHistory: TissueState[][] = [tissues.map(t => ({ ...t }))];
  const bottomGas = gases.find(g => g.switchDepth === null) || gases[0];
  
  const ambientPressureAtDepth = depthToPressure(depth, settings.waterType);
  const ppo2AtDepth = (bottomGas.o2Percent / 100) * ambientPressureAtDepth;
  if (ppo2AtDepth > 1.4) {
    warnings.push(`PPO2 is ${ppo2AtDepth.toFixed(2)} at ${depth}m with ${bottomGas.name} (exceeds 1.4)`);
  }
  if (ppo2AtDepth > 1.6) {
    warnings.push(`DANGER: PPO2 is ${ppo2AtDepth.toFixed(2)} at ${depth}m - CNS oxygen toxicity risk!`);
  }
  
  const descentTime = depth / settings.descentRate;
  tissues = calculateTissueLoadingSchreiner(tissues, 0, depth, descentTime, bottomGas, settings.waterType, settings.circuit, settings.ccrSetpoint);
  tissueHistory.push(tissues.map(t => ({ ...t })));
  runTime += descentTime;
  
  const descentSegment: DiveSegment = {
    type: 'descent',
    startDepth: 0,
    endDepth: depth,
    duration: descentTime,
    gasMix: bottomGas,
    runTime,
  };
  segments.push(descentSegment);
  const descentTox = calculateSegmentOxygenToxicity(descentSegment, settings);
  totalCNS += descentTox.cns;
  totalOTU += descentTox.otu;
  
  tissues = calculateTissueLoadingConstantDepth(tissues, depth, bottomTime, bottomGas, settings.waterType, settings.circuit, settings.ccrSetpoint);
  tissueHistory.push(tissues.map(t => ({ ...t })));
  runTime += bottomTime;
  
  const bottomSegment: DiveSegment = {
    type: 'bottom',
    startDepth: depth,
    endDepth: depth,
    duration: bottomTime,
    gasMix: bottomGas,
    runTime,
  };
  segments.push(bottomSegment);
  const bottomTox = calculateSegmentOxygenToxicity(bottomSegment, settings);
  totalCNS += bottomTox.cns;
  totalOTU += bottomTox.otu;
  
  const ndl = calculateNDL(tissues, depth, bottomGas, settings.gfHigh, settings.waterType, settings.circuit, settings.ccrSetpoint);
  
  const firstStopDepth = findFirstStop(tissues, settings.gfLow, settings.decoStopInterval, settings.waterType);
  
  if (firstStopDepth > 0) {
    const ascentToFirstStop = (depth - firstStopDepth) / settings.ascentRate;
    tissues = calculateTissueLoadingSchreiner(tissues, depth, firstStopDepth, ascentToFirstStop, bottomGas, settings.waterType, settings.circuit, settings.ccrSetpoint);
    tissueHistory.push(tissues.map(t => ({ ...t })));
    runTime += ascentToFirstStop;
    
    const ascentToFirstSegment: DiveSegment = {
      type: 'ascent',
      startDepth: depth,
      endDepth: firstStopDepth,
      duration: ascentToFirstStop,
      gasMix: bottomGas,
      runTime,
    };
    segments.push(ascentToFirstSegment);
    const ascentToFirstTox = calculateSegmentOxygenToxicity(ascentToFirstSegment, settings);
    totalCNS += ascentToFirstTox.cns;
    totalOTU += ascentToFirstTox.otu;
    
    const { stops, finalTissues, tissueHistory: decoHistory } = calculateDecoSchedule(
      tissues,
      firstStopDepth,
      gases,
      settings
    );
    
    tissueHistory.push(...decoHistory);
    
    let currentDepth = firstStopDepth;
    for (const stop of stops) {
      if (stop.depth < currentDepth) {
        const ascentTime = (currentDepth - stop.depth) / settings.ascentRate;
        runTime += ascentTime;
        const ascentSeg: DiveSegment = {
          type: 'ascent',
          startDepth: currentDepth,
          endDepth: stop.depth,
          duration: ascentTime,
          gasMix: stop.gasMix,
          runTime,
        };
        segments.push(ascentSeg);
        const ascentTox = calculateSegmentOxygenToxicity(ascentSeg, settings);
        totalCNS += ascentTox.cns;
        totalOTU += ascentTox.otu;
        currentDepth = stop.depth;
      }
      
      runTime += stop.duration;
      const decoSeg: DiveSegment = {
        type: 'deco_stop',
        startDepth: stop.depth,
        endDepth: stop.depth,
        duration: stop.duration,
        gasMix: stop.gasMix,
        runTime,
      };
      segments.push(decoSeg);
      const decoTox = calculateSegmentOxygenToxicity(decoSeg, settings);
      totalCNS += decoTox.cns;
      totalOTU += decoTox.otu;
    }
    
    if (currentDepth > 0) {
      const finalAscentTime = currentDepth / settings.ascentRate;
      runTime += finalAscentTime;
      const lastGas = stops[stops.length - 1]?.gasMix || bottomGas;
      tissues = calculateTissueLoadingSchreiner(finalTissues, currentDepth, 0, finalAscentTime, lastGas, settings.waterType, settings.circuit, settings.ccrSetpoint);
      tissueHistory.push(tissues.map(t => ({ ...t })));
      
      const finalAscentSeg: DiveSegment = {
        type: 'ascent',
        startDepth: currentDepth,
        endDepth: 0,
        duration: finalAscentTime,
        gasMix: lastGas,
        runTime,
      };
      segments.push(finalAscentSeg);
      const finalAscentTox = calculateSegmentOxygenToxicity(finalAscentSeg, settings);
      totalCNS += finalAscentTox.cns;
      totalOTU += finalAscentTox.otu;
    } else {
      tissues = finalTissues;
    }
    
    // Add CNS/OTU warnings
    if (totalCNS > 80) {
      warnings.push(`CNS is ${totalCNS.toFixed(0)}% - approaching limit (>80%)`);
    }
    if (totalCNS > 100) {
      warnings.push(`DANGER: CNS exceeds 100% - oxygen toxicity risk!`);
    }
    if (totalOTU > 300) {
      warnings.push(`OTU is ${totalOTU.toFixed(0)} - daily limit warning (>300)`);
    }
    
    // Calculate gas consumption
    const gasConsumption = calculateGasConsumption(segments, gases, settings);
    
    // Add gas warnings
    gasConsumption.forEach(gc => {
      if (!gc.isSufficient) {
        warnings.push(`DANGER: Insufficient ${gc.gasName} - need ${gc.gasRequired}L but only have ${gc.gasAvailable}L available`);
      } else if (gc.percentUsed > 80) {
        warnings.push(`Warning: ${gc.gasName} usage is ${gc.percentUsed}% - low reserve margin`);
      }
    });
    
    return {
      segments,
      decoStops: stops,
      tissueHistory,
      totalRunTime: Math.ceil(runTime),
      totalDecoTime: stops.reduce((sum, s) => sum + s.duration, 0),
      maxDepth: depth,
      cns: Math.round(totalCNS * 10) / 10,
      otu: Math.round(totalOTU * 10) / 10,
      ndl: null,
      warnings,
      gasConsumption,
    };
  } else {
    const directAscentTime = depth / settings.ascentRate;
    runTime += directAscentTime;
    tissues = calculateTissueLoadingSchreiner(tissues, depth, 0, directAscentTime, bottomGas, settings.waterType, settings.circuit, settings.ccrSetpoint);
    tissueHistory.push(tissues.map(t => ({ ...t })));
    
    const directAscentSeg: DiveSegment = {
      type: 'ascent',
      startDepth: depth,
      endDepth: 0,
      duration: directAscentTime,
      gasMix: bottomGas,
      runTime,
    };
    segments.push(directAscentSeg);
    const directAscentTox = calculateSegmentOxygenToxicity(directAscentSeg, settings);
    totalCNS += directAscentTox.cns;
    totalOTU += directAscentTox.otu;
    
    // Add CNS/OTU warnings for non-deco dives
    if (totalCNS > 80) {
      warnings.push(`CNS is ${totalCNS.toFixed(0)}% - approaching limit (>80%)`);
    }
    if (totalOTU > 300) {
      warnings.push(`OTU is ${totalOTU.toFixed(0)} - daily limit warning (>300)`);
    }
    
    // Calculate gas consumption
    const gasConsumption = calculateGasConsumption(segments, gases, settings);
    
    // Add gas warnings
    gasConsumption.forEach(gc => {
      if (!gc.isSufficient) {
        warnings.push(`DANGER: Insufficient ${gc.gasName} - need ${gc.gasRequired}L but only have ${gc.gasAvailable}L available`);
      } else if (gc.percentUsed > 80) {
        warnings.push(`Warning: ${gc.gasName} usage is ${gc.percentUsed}% - low reserve margin`);
      }
    });
    
    return {
      segments,
      decoStops: [],
      tissueHistory,
      totalRunTime: Math.ceil(runTime),
      totalDecoTime: 0,
      maxDepth: depth,
      cns: Math.round(totalCNS * 10) / 10,
      otu: Math.round(totalOTU * 10) / 10,
      ndl,
      warnings,
      gasConsumption,
    };
  }
}

export function calculateMultiDivePlan(dives: DivePlanInput[]): DivePlanResult[] {
  const results: DivePlanResult[] = [];
  let carryOverTissues: TissueState[] | undefined;
  
  for (let i = 0; i < dives.length; i++) {
    const dive = dives[i];
    const diveWithTissues: DivePlanInput = {
      ...dive,
      initialTissues: carryOverTissues,
      surfaceIntervalMinutes: i > 0 ? dive.surfaceIntervalMinutes : undefined,
    };
    
    const result = calculateDivePlan(diveWithTissues);
    results.push(result);
    
    if (result.tissueHistory.length > 0) {
      carryOverTissues = result.tissueHistory[result.tissueHistory.length - 1];
    }
  }
  
  return results;
}

// CNS oxygen toxicity calculation table (NOAA single-exposure limits)
// Corrected values based on NOAA Diving Manual exposure limits
// CNS% per minute = 100 / (max exposure time in minutes)
const CNS_TABLE: { minPpo2: number; maxPpo2: number; cnsPerMin: number }[] = [
  { minPpo2: 0.5, maxPpo2: 0.6, cnsPerMin: 0.14 },   // 720 min max = 0.139%/min
  { minPpo2: 0.6, maxPpo2: 0.7, cnsPerMin: 0.17 },   // 570 min max = 0.175%/min
  { minPpo2: 0.7, maxPpo2: 0.8, cnsPerMin: 0.22 },   // 450 min max = 0.222%/min
  { minPpo2: 0.8, maxPpo2: 0.9, cnsPerMin: 0.28 },   // 360 min max = 0.278%/min
  { minPpo2: 0.9, maxPpo2: 1.0, cnsPerMin: 0.33 },   // 300 min max = 0.333%/min
  { minPpo2: 1.0, maxPpo2: 1.1, cnsPerMin: 0.42 },   // 240 min max = 0.417%/min
  { minPpo2: 1.1, maxPpo2: 1.2, cnsPerMin: 0.48 },   // 210 min max = 0.476%/min
  { minPpo2: 1.2, maxPpo2: 1.3, cnsPerMin: 0.56 },   // 180 min max = 0.556%/min
  { minPpo2: 1.3, maxPpo2: 1.4, cnsPerMin: 0.67 },   // 150 min max = 0.667%/min
  { minPpo2: 1.4, maxPpo2: 1.5, cnsPerMin: 0.83 },   // 120 min max = 0.833%/min
  { minPpo2: 1.5, maxPpo2: 1.6, cnsPerMin: 1.11 },   // 90 min max = 1.111%/min
  { minPpo2: 1.6, maxPpo2: 2.0, cnsPerMin: 2.22 },   // 45 min max = 2.222%/min (NOAA max)
];

// Calculate CNS% for given PPO2 and duration
export function calculateCNS(ppo2: number, durationMinutes: number): number {
  if (ppo2 < 0.5) return 0;
  
  // Clamp to NOAA maximum rate for PPO2 > 1.6
  if (ppo2 >= 1.6) {
    return durationMinutes * 2.22;
  }
  
  const entry = CNS_TABLE.find(e => ppo2 >= e.minPpo2 && ppo2 < e.maxPpo2);
  if (!entry) return 0;
  
  return durationMinutes * entry.cnsPerMin;
}

// Calculate OTU (Oxygen Toxicity Units) using REPEX formula
// OTU = t * ((PO2 - 0.5) / 0.5)^0.83
export function calculateOTU(ppo2: number, durationMinutes: number): number {
  if (ppo2 <= 0.5) return 0;
  return durationMinutes * Math.pow((ppo2 - 0.5) / 0.5, 0.83);
}

// Water density factors for depth calculation
const WATER_DENSITY = {
  salt: 10.0, // meters per bar (saltwater ~1.025 kg/L)
  fresh: 10.3, // meters per bar (freshwater ~1.0 kg/L)
};

// Get depth conversion factor based on water type
export function getWaterFactor(waterType: WaterType): number {
  return WATER_DENSITY[waterType];
}

export const DEFAULT_SETTINGS: DivePlanSettings = {
  gfLow: 30,
  gfHigh: 70,
  descentRate: 24,
  ascentRate: 10,
  lastStopDepth: 3,
  decoStopInterval: 3,
  sacRateBottom: 15,
  sacRateDeco: 10,
  // Circuit & Model
  circuit: 'open',
  decoModel: 'zhl16c',
  o2Narcotic: false,
  units: 'metric',
  gasSwitchTime: 1,
  waterType: 'salt',
  ccrSetpoint: 1.3,
  scrubberDuration: 180,
  // Deco stop settings
  stopSize: 3,
  lastOcStopDepth: 3,
  lastCcrStopDepth: 6,
  minStopTime: 1,
  ppo2High: 1.6,
  ppo2Medium: 1.5,
  ppo2Low: 1.4,
  maxO2Depth: 6,
  use30SecStops: false,
  use6mSteps: true,
  // Extended stops
  extendedStops: false,
  extendedStopShallow: 5,
  extendedStopDeep: 2,
  addTimeToStop: false,
  allMixChanges: false,
  o2WindowEffect: false,
  // Separate ascent rates
  surfaceRate: 8,
  decoRate: 8,
  // Altitude diving
  elevation: 0,
  acclimatizedElevation: 0,
  // Display settings
  gaugeType: 'digital',
  ccrSetpointUnits: 'bar',
  gasVolumeUnits: 'ltr',
  // Dive monitor thresholds
  ppo2AboveEnabled: true,
  ppo2AboveThreshold: 1.6,
  ppo2BelowEnabled: true,
  ppo2BelowThreshold: 0.16,
  otuAboveEnabled: true,
  otuAboveThreshold: 300,
  cnsAboveEnabled: true,
  cnsAboveThreshold: 80,
  ibcdN2Enabled: true,
  ibcdN2Threshold: 0.5,
  ibcdHeEnabled: true,
  ibcdHeThreshold: 0.5,
  ccrDiluentCheck: true,
};
