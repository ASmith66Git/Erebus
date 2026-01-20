export interface GasMixInput {
  o2Percent: number;
  hePercent: number;
}

export interface DensityResult {
  surfaceDensity: number;
  depthDensity: number;
  isHighDensity: boolean;
  warningMessage: string | null;
}

export interface FillCapacityResult {
  totalGasLiters: number;
  usableGasLiters: number;
  totalGasCuft: number;
  usableGasCuft: number;
  bottomTimeMinutes: number;
}

export interface TopUpResult {
  finalO2Percent: number;
  finalHePercent: number;
  finalN2Percent: number;
  addedPressureBar: number;
  totalPressureBar: number;
  isValidMix: boolean;
  warningMessage: string | null;
}

export interface TrimixBlendResult {
  o2PressureToAdd: number;
  hePressureToAdd: number;
  airOrNitroxPressureToAdd: number;
  finalPressureBar: number;
  actualO2Percent: number;
  actualHePercent: number;
  isValid: boolean;
  warningMessage: string | null;
}

export interface BestMixResult {
  o2Percent: number;
  hePercent: number;
  n2Percent: number;
  mod: number;
  end: number;
  isValidMix: boolean;
  mixName: string;
}

const RHO_O2 = 1.429;
const RHO_N2 = 1.251;
const RHO_HE = 0.179;

const HIGH_DENSITY_THRESHOLD = 6.2;
const PPO2_MAX_DECO = 1.6;
const PPO2_MAX_BOTTOM = 1.4;

// Van der Waals constants (a in L²·bar/mol², b in L/mol)
// Source: CRC Handbook of Chemistry and Physics
const VDW_CONSTANTS = {
  O2: { a: 1.382, b: 0.03186 },
  N2: { a: 1.370, b: 0.03870 },
  He: { a: 0.0346, b: 0.02380 },
};

// Universal gas constant R = 0.08314 L·bar/(mol·K)
const R_GAS = 0.08314;

// Standard molar volume at STP (L/mol)
const MOLAR_VOLUME_STP = 22.414;

/**
 * Calculate Van der Waals constants for a gas mixture using mixing rules
 * a_mix = sum(xi * xj * sqrt(ai * aj)) - geometric mean
 * b_mix = sum(xi * bi) - linear combination
 */
export function getVdwMixConstants(o2Frac: number, heFrac: number): { a: number; b: number } {
  const n2Frac = 1 - o2Frac - heFrac;
  
  // Linear mixing rule for b
  const b_mix = o2Frac * VDW_CONSTANTS.O2.b + 
                n2Frac * VDW_CONSTANTS.N2.b + 
                heFrac * VDW_CONSTANTS.He.b;
  
  // Quadratic mixing rule for a (geometric mean)
  const gases = [
    { frac: o2Frac, a: VDW_CONSTANTS.O2.a },
    { frac: n2Frac, a: VDW_CONSTANTS.N2.a },
    { frac: heFrac, a: VDW_CONSTANTS.He.a },
  ];
  
  let a_mix = 0;
  for (let i = 0; i < gases.length; i++) {
    for (let j = 0; j < gases.length; j++) {
      a_mix += gases[i].frac * gases[j].frac * Math.sqrt(gases[i].a * gases[j].a);
    }
  }
  
  return { a: a_mix, b: b_mix };
}

/**
 * Z-factor reference data from NIST REFPROP v10
 * Source: Dive Gear Express Z-Factors table
 * 
 * 2D grid structure for bilinear interpolation over (O2%, He%) at each pressure
 * Format: { o2Pct: { hePct: zFactor } } at 15°C (288K)
 */
interface ZGridPoint {
  o2: number;
  he: number;
  z207: number;
  z232: number;
  z300: number;
}

const Z_GRID_POINTS: ZGridPoint[] = [
  // Pure/near-pure gases
  { o2: 100, he: 0, z207: 0.9328, z232: 0.9400, z300: 0.9738 },  // Pure O2
  { o2: 0, he: 100, z207: 1.1008, z232: 1.1126, z300: 1.1445 },  // Pure He
  { o2: 0, he: 0, z207: 1.0263, z232: 1.0438, z300: 1.1020 },    // Pure N2 (from air)
  
  // Nitrox mixes
  { o2: 21, he: 0, z207: 1.0263, z232: 1.0438, z300: 1.1020 },   // Air
  { o2: 32, he: 0, z207: 1.0153, z232: 1.0316, z300: 1.0868 },   // EAN32
  { o2: 50, he: 0, z207: 0.9938, z232: 1.0077, z300: 1.0575 },   // EAN50
  
  // Trimix blends (from REFPROP data)
  { o2: 21, he: 35, z207: 1.1065, z232: 1.1243, z300: 1.1764 },  // Tx21/35
  { o2: 18, he: 45, z207: 1.1185, z232: 1.1362, z300: 1.1869 },  // Tx18/45
  { o2: 10, he: 50, z207: 1.1246, z232: 1.1423, z300: 1.1927 },  // Heliair
  { o2: 15, he: 55, z207: 1.1256, z232: 1.1429, z300: 1.1918 },  // Tx15/55
  { o2: 10, he: 70, z207: 1.1284, z232: 1.1448, z300: 1.1902 },  // Tx10/70
];

/**
 * Get Z-factor at a specific pressure using inverse distance weighting
 * interpolation over the (O2%, He%) composition space
 */
function interpolateZFromGrid(o2Pct: number, hePct: number, pressureBar: number): number {
  // First, interpolate for pressure at each grid point
  const getZAtPressure = (point: ZGridPoint): number => {
    if (pressureBar <= 207) {
      const slope = (point.z207 - 1) / 207;
      return 1 + slope * pressureBar;
    } else if (pressureBar <= 232) {
      const frac = (pressureBar - 207) / (232 - 207);
      return point.z207 + frac * (point.z232 - point.z207);
    } else if (pressureBar <= 300) {
      const frac = (pressureBar - 232) / (300 - 232);
      return point.z232 + frac * (point.z300 - point.z232);
    } else {
      const slope = (point.z300 - point.z232) / (300 - 232);
      return point.z300 + slope * (pressureBar - 300);
    }
  };
  
  // Inverse distance weighting in composition space
  let weightedSum = 0;
  let weightSum = 0;
  
  for (const point of Z_GRID_POINTS) {
    const dist = Math.sqrt(
      Math.pow(o2Pct - point.o2, 2) + 
      Math.pow(hePct - point.he, 2)
    );
    
    // If we're exactly at a grid point, return its value
    if (dist < 0.5) {
      return getZAtPressure(point);
    }
    
    // Use power of 2 for inverse distance weighting (Shepard's method)
    const weight = 1 / (dist * dist);
    weightedSum += weight * getZAtPressure(point);
    weightSum += weight;
  }
  
  return weightedSum / weightSum;
}

/**
 * Calculate compressibility factor Z using NIST REFPROP reference data
 * 
 * Source: NIST REFPROP v10 via Dive Gear Express
 * Uses inverse distance weighting (Shepard's method) for 2D interpolation
 * over the (O2%, He%) composition space
 * 
 * Reference data is at 15°C (288K). Temperature correction scales
 * the deviation from ideal (Z-1) by 288/T.
 * 
 * Valid range:
 * - Pressure: 1-350 bar (extrapolated outside 207-300 bar reference range)
 * - Temperature: 0-40°C (273-313K)
 * - Composition: O2 0-100%, He 0-100% (with N2 as balance)
 */
export function calculateZFactor(
  pressureBar: number,
  tempKelvin: number,
  o2Frac: number,
  heFrac: number
): number {
  if (pressureBar <= 0) return 1;
  
  // Convert fractions to percentages for grid lookup
  const o2Pct = o2Frac * 100;
  const hePct = heFrac * 100;
  
  // Get Z at reference temperature (288K/15°C) using 2D grid interpolation
  const zRef = interpolateZFromGrid(o2Pct, hePct, pressureBar);
  
  // Temperature correction: deviation from ideal scales approximately as 1/T
  // Reference data is at 288K (15°C)
  // This is a first-order approximation; accuracy degrades at extreme temperatures
  const tempCorrection = 288 / tempKelvin;
  const zDeviation = (zRef - 1) * tempCorrection;
  
  return 1 + zDeviation;
}

/**
 * Convert ideal pressure to real pressure accounting for compressibility
 * Real moles = Ideal moles / Z
 * To get same amount of gas, need to fill to higher pressure
 */
export function idealToRealPressure(
  idealPressureBar: number,
  tempKelvin: number,
  o2Frac: number,
  heFrac: number
): number {
  // Iterative approach: find real pressure that gives same gas quantity
  let realP = idealPressureBar;
  for (let i = 0; i < 20; i++) {
    const Z = calculateZFactor(realP, tempKelvin, o2Frac, heFrac);
    const newRealP = idealPressureBar * Z;
    if (Math.abs(newRealP - realP) < 0.1) {
      realP = newRealP;
      break;
    }
    realP = newRealP;
  }
  return realP;
}

/**
 * Calculate trimix blend with real gas (Van der Waals) corrections
 */
export function calculateTrimixBlendRealGas(
  targetO2Percent: number,
  targetHePercent: number,
  finalPressureBar: number,
  residualPressureBar: number = 0,
  residualO2Percent: number = 21,
  residualHePercent: number = 0,
  topUpWithAir: boolean = true,
  nitroxO2Percent: number = 32,
  tempCelsius: number = 20
): TrimixBlendResult & { zFactorFinal: number; tempCelsius: number } {
  const tempKelvin = tempCelsius + 273.15;
  
  const targetO2Frac = targetO2Percent / 100;
  const targetHeFrac = targetHePercent / 100;
  const targetN2Frac = 1 - targetO2Frac - targetHeFrac;
  
  if (targetN2Frac < 0) {
    return {
      o2PressureToAdd: 0,
      hePressureToAdd: 0,
      airOrNitroxPressureToAdd: 0,
      finalPressureBar,
      actualO2Percent: targetO2Percent,
      actualHePercent: targetHePercent,
      isValid: false,
      warningMessage: 'O2 + He exceeds 100%.',
      zFactorFinal: 1,
      tempCelsius,
    };
  }
  
  // Calculate Z factor for final mix at final pressure
  const zFinal = calculateZFactor(finalPressureBar, tempKelvin, targetO2Frac, targetHeFrac);
  
  // Calculate Z factor for residual gas if present
  const residualO2Frac = residualO2Percent / 100;
  const residualHeFrac = residualHePercent / 100;
  const zResidual = residualPressureBar > 0 
    ? calculateZFactor(residualPressureBar, tempKelvin, residualO2Frac, residualHeFrac)
    : 1;
  
  // Real gas partial pressures (corrected for compressibility)
  // n = PV/(ZRT), so effective partial pressure contribution = P/Z
  const residualO2Effective = (residualPressureBar * residualO2Frac) / zResidual;
  const residualHeEffective = (residualPressureBar * residualHeFrac) / zResidual;
  const residualN2Effective = (residualPressureBar * (1 - residualO2Frac - residualHeFrac)) / zResidual;
  
  // Target effective partial pressures (what we need in terms of gas quantity)
  const targetO2Effective = (finalPressureBar * targetO2Frac) / zFinal;
  const targetHeEffective = (finalPressureBar * targetHeFrac) / zFinal;
  const targetN2Effective = (finalPressureBar * targetN2Frac) / zFinal;
  
  // Needed effective gas (in terms of molar quantity)
  const neededO2Effective = targetO2Effective - residualO2Effective;
  const neededHeEffective = targetHeEffective - residualHeEffective;
  const neededN2Effective = targetN2Effective - residualN2Effective;
  
  if (neededHeEffective < -0.5 || neededN2Effective < -0.5) {
    return {
      o2PressureToAdd: 0,
      hePressureToAdd: 0,
      airOrNitroxPressureToAdd: 0,
      finalPressureBar,
      actualO2Percent: targetO2Percent,
      actualHePercent: targetHePercent,
      isValid: false,
      warningMessage: 'Residual gas has more He or N2 than target mix requires.',
      zFactorFinal: zFinal,
      tempCelsius,
    };
  }
  
  // Calculate fill pressures for pure gases
  // For helium: Z factor at the pressure we're adding to
  const heStartPressure = residualPressureBar;
  const zHe = calculateZFactor(heStartPressure + neededHeEffective, tempKelvin, 0, 1);
  const hePressureToAdd = neededHeEffective * zHe;
  
  // Top-up gas composition
  const topUpO2Frac = topUpWithAir ? 0.21 : (nitroxO2Percent / 100);
  const topUpN2Frac = 1 - topUpO2Frac;
  
  // Calculate air/nitrox needed (corrected for its Z factor)
  const airOrNitroxEffective = topUpN2Frac > 0 ? neededN2Effective / topUpN2Frac : 0;
  const zAir = calculateZFactor(finalPressureBar, tempKelvin, topUpO2Frac, 0);
  const airOrNitroxPressureToAdd = airOrNitroxEffective * zAir;
  
  // O2 from top-up and remaining pure O2 needed
  const o2FromTopUpEffective = airOrNitroxEffective * topUpO2Frac;
  const pureO2NeededEffective = neededO2Effective - o2FromTopUpEffective;
  
  // Pure O2 pressure (Z factor for pure O2)
  const zO2 = calculateZFactor(finalPressureBar * 0.5, tempKelvin, 1, 0);
  const pureO2PressureToAdd = pureO2NeededEffective * zO2;
  
  let warningMessage: string | null = null;
  let isValid = true;
  
  if (pureO2PressureToAdd < -1) {
    warningMessage = 'Target mix requires less O2 than the top-up gas provides. Try a different nitrox blend.';
    isValid = false;
  }
  
  // Verify total pressure
  const totalAdded = Math.max(0, pureO2PressureToAdd) + Math.max(0, hePressureToAdd) + airOrNitroxPressureToAdd;
  const expectedPressure = residualPressureBar + totalAdded;
  
  if (Math.abs(expectedPressure - finalPressureBar) > 5) {
    if (!warningMessage) {
      warningMessage = `Real gas correction applied. Z-factor: ${zFinal.toFixed(3)}`;
    }
  }
  
  return {
    o2PressureToAdd: Math.max(0, Math.round(pureO2PressureToAdd)),
    hePressureToAdd: Math.max(0, Math.round(hePressureToAdd)),
    airOrNitroxPressureToAdd: Math.round(airOrNitroxPressureToAdd),
    finalPressureBar,
    actualO2Percent: targetO2Percent,
    actualHePercent: targetHePercent,
    isValid,
    warningMessage,
    zFactorFinal: Math.round(zFinal * 1000) / 1000,
    tempCelsius,
  };
}

export function calculateGasDensity(
  mix: GasMixInput,
  depthM: number,
  waterType: 'salt' | 'fresh' = 'salt'
): DensityResult {
  const o2Frac = mix.o2Percent / 100;
  const heFrac = mix.hePercent / 100;
  const n2Frac = 1 - o2Frac - heFrac;
  
  const surfaceDensity = (o2Frac * RHO_O2) + (n2Frac * RHO_N2) + (heFrac * RHO_HE);
  
  const pressurePerMeter = waterType === 'salt' ? 0.1 : 0.097;
  const absolutePressure = 1 + (depthM * pressurePerMeter);
  
  const depthDensity = surfaceDensity * absolutePressure;
  
  const isHighDensity = depthDensity > HIGH_DENSITY_THRESHOLD;
  let warningMessage: string | null = null;
  
  if (depthDensity > 6.2) {
    warningMessage = `Gas density ${depthDensity.toFixed(2)} g/L exceeds 6.2 g/L threshold. Risk of CO2 retention and work of breathing issues.`;
  } else if (depthDensity > 5.7) {
    warningMessage = `Gas density ${depthDensity.toFixed(2)} g/L is approaching dangerous levels (>6.2 g/L).`;
  }
  
  return {
    surfaceDensity,
    depthDensity,
    isHighDensity,
    warningMessage,
  };
}

export function calculateFillCapacity(
  cylinderVolumeL: number,
  fillPressureBar: number,
  reservePressureBar: number,
  sacLpm: number = 20
): FillCapacityResult {
  const totalGasLiters = cylinderVolumeL * fillPressureBar;
  const reserveGasLiters = cylinderVolumeL * reservePressureBar;
  const usableGasLiters = totalGasLiters - reserveGasLiters;
  
  const totalGasCuft = totalGasLiters * 0.0353147;
  const usableGasCuft = usableGasLiters * 0.0353147;
  
  const bottomTimeMinutes = sacLpm > 0 ? usableGasLiters / sacLpm : 0;
  
  return {
    totalGasLiters,
    usableGasLiters,
    totalGasCuft,
    usableGasCuft,
    bottomTimeMinutes,
  };
}

export function calculateTopUp(
  currentPressureBar: number,
  currentO2Percent: number,
  currentHePercent: number,
  fillPressureBar: number,
  sourceO2Percent: number,
  sourceHePercent: number
): TopUpResult {
  if (fillPressureBar <= currentPressureBar) {
    return {
      finalO2Percent: currentO2Percent,
      finalHePercent: currentHePercent,
      finalN2Percent: 100 - currentO2Percent - currentHePercent,
      addedPressureBar: 0,
      totalPressureBar: currentPressureBar,
      isValidMix: false,
      warningMessage: 'Fill pressure must be greater than current pressure.',
    };
  }
  
  const addedPressure = fillPressureBar - currentPressureBar;
  
  const currentO2Partial = currentPressureBar * (currentO2Percent / 100);
  const currentHePartial = currentPressureBar * (currentHePercent / 100);
  
  const addedO2Partial = addedPressure * (sourceO2Percent / 100);
  const addedHePartial = addedPressure * (sourceHePercent / 100);
  
  const finalO2Partial = currentO2Partial + addedO2Partial;
  const finalHePartial = currentHePartial + addedHePartial;
  
  const finalO2Percent = (finalO2Partial / fillPressureBar) * 100;
  const finalHePercent = (finalHePartial / fillPressureBar) * 100;
  const finalN2Percent = 100 - finalO2Percent - finalHePercent;
  
  let isValidMix = true;
  let warningMessage: string | null = null;
  
  if (finalO2Percent < 18) {
    isValidMix = false;
    warningMessage = 'Resulting mix is hypoxic (O2 < 18%).';
  } else if (finalO2Percent > 100 || finalHePercent > 100 || finalN2Percent < 0) {
    isValidMix = false;
    warningMessage = 'Invalid gas fractions calculated.';
  }
  
  return {
    finalO2Percent: Math.round(finalO2Percent * 10) / 10,
    finalHePercent: Math.round(finalHePercent * 10) / 10,
    finalN2Percent: Math.round(finalN2Percent * 10) / 10,
    addedPressureBar: addedPressure,
    totalPressureBar: fillPressureBar,
    isValidMix,
    warningMessage,
  };
}

export function calculateTrimixBlend(
  targetO2Percent: number,
  targetHePercent: number,
  finalPressureBar: number,
  residualPressureBar: number = 0,
  residualO2Percent: number = 21,
  residualHePercent: number = 0,
  topUpWithAir: boolean = true,
  nitroxO2Percent: number = 32
): TrimixBlendResult {
  const targetO2Frac = targetO2Percent / 100;
  const targetHeFrac = targetHePercent / 100;
  const targetN2Frac = 1 - targetO2Frac - targetHeFrac;
  
  if (targetN2Frac < 0) {
    return {
      o2PressureToAdd: 0,
      hePressureToAdd: 0,
      airOrNitroxPressureToAdd: 0,
      finalPressureBar,
      actualO2Percent: targetO2Percent,
      actualHePercent: targetHePercent,
      isValid: false,
      warningMessage: 'O2 + He exceeds 100%.',
    };
  }
  
  const residualO2Partial = residualPressureBar * (residualO2Percent / 100);
  const residualHePartial = residualPressureBar * (residualHePercent / 100);
  const residualN2Partial = residualPressureBar - residualO2Partial - residualHePartial;
  
  const targetO2Partial = finalPressureBar * targetO2Frac;
  const targetHePartial = finalPressureBar * targetHeFrac;
  const targetN2Partial = finalPressureBar * targetN2Frac;
  
  const neededO2Partial = targetO2Partial - residualO2Partial;
  const neededHePartial = targetHePartial - residualHePartial;
  const neededN2Partial = targetN2Partial - residualN2Partial;
  
  if (neededHePartial < 0 || neededN2Partial < 0) {
    return {
      o2PressureToAdd: 0,
      hePressureToAdd: 0,
      airOrNitroxPressureToAdd: 0,
      finalPressureBar,
      actualO2Percent: targetO2Percent,
      actualHePercent: targetHePercent,
      isValid: false,
      warningMessage: 'Residual gas has more He or N2 than target mix requires.',
    };
  }
  
  const hePressureToAdd = neededHePartial;
  
  const topUpO2Frac = topUpWithAir ? 0.21 : (nitroxO2Percent / 100);
  const topUpN2Frac = 1 - topUpO2Frac;
  
  const airOrNitroxPressureToAdd = topUpN2Frac > 0 ? neededN2Partial / topUpN2Frac : 0;
  const o2FromTopUp = airOrNitroxPressureToAdd * topUpO2Frac;
  const pureO2PressureToAdd = neededO2Partial - o2FromTopUp;
  
  let warningMessage: string | null = null;
  let isValid = true;
  
  if (pureO2PressureToAdd < 0) {
    warningMessage = 'Target mix requires less O2 than the top-up gas provides. Try a different nitrox blend or partial pressure blend.';
    isValid = false;
  }
  
  const totalAdded = pureO2PressureToAdd + hePressureToAdd + airOrNitroxPressureToAdd;
  const expectedPressure = residualPressureBar + totalAdded;
  
  if (Math.abs(expectedPressure - finalPressureBar) > 1) {
    warningMessage = `Pressure calculation mismatch: expected ${expectedPressure.toFixed(0)} bar but target is ${finalPressureBar} bar.`;
  }
  
  return {
    o2PressureToAdd: Math.max(0, Math.round(pureO2PressureToAdd)),
    hePressureToAdd: Math.round(hePressureToAdd),
    airOrNitroxPressureToAdd: Math.round(airOrNitroxPressureToAdd),
    finalPressureBar,
    actualO2Percent: targetO2Percent,
    actualHePercent: targetHePercent,
    isValid,
    warningMessage,
  };
}

export function calculateBestMix(
  depthM: number,
  ppo2Max: number = PPO2_MAX_BOTTOM,
  targetEndM: number | null = null,
  o2IsNarcotic: boolean = false,
  waterType: 'salt' | 'fresh' = 'salt'
): BestMixResult {
  const pressurePerMeter = waterType === 'salt' ? 0.1 : 0.097;
  const absolutePressure = 1 + (depthM * pressurePerMeter);
  
  let o2Frac = ppo2Max / absolutePressure;
  // Minimum 10% O2 for hypoxic trimix, max 100%
  o2Frac = Math.min(1.0, Math.max(0.10, o2Frac));
  
  let heFrac = 0;
  let n2Frac = 1 - o2Frac;
  
  if (targetEndM !== null && targetEndM < depthM) {
    const endAbsPressure = 1 + (targetEndM * pressurePerMeter);
    
    if (o2IsNarcotic) {
      const narcoticFrac = (endAbsPressure - 1) / (absolutePressure - 1);
      heFrac = Math.max(0, 1 - narcoticFrac);
      n2Frac = 1 - o2Frac - heFrac;
    } else {
      const targetN2Partial = (endAbsPressure - 1);
      n2Frac = targetN2Partial / absolutePressure;
      n2Frac = Math.max(0, Math.min(1 - o2Frac, n2Frac));
      heFrac = 1 - o2Frac - n2Frac;
    }
    
    if (heFrac < 0) {
      heFrac = 0;
      n2Frac = 1 - o2Frac;
    }
  }
  
  const o2Percent = Math.round(o2Frac * 100);
  const hePercent = Math.round(heFrac * 100);
  const n2Percent = 100 - o2Percent - hePercent;
  
  const mod = Math.floor((ppo2Max / (o2Percent / 100) - 1) / pressurePerMeter);
  
  let end: number;
  if (o2IsNarcotic) {
    const narcoticFrac = (o2Percent + n2Percent) / 100;
    end = Math.round((absolutePressure * narcoticFrac - 1) / pressurePerMeter);
  } else {
    const n2Partial = absolutePressure * (n2Percent / 100);
    end = Math.round((n2Partial / 0.79 - 1) / pressurePerMeter);
  }
  
  let mixName: string;
  if (hePercent === 0) {
    if (o2Percent === 21) {
      mixName = 'Air';
    } else if (o2Percent === 100) {
      mixName = 'Oxygen';
    } else {
      mixName = `EAN${o2Percent}`;
    }
  } else {
    mixName = `Tx${o2Percent}/${hePercent}`;
  }
  
  // Valid mix: minimum 10% O2 for hypoxic trimix, all percentages non-negative
  const isValidMix = o2Percent >= 10 && o2Percent <= 100 && hePercent >= 0 && n2Percent >= 0;
  
  return {
    o2Percent,
    hePercent,
    n2Percent,
    mod,
    end: Math.max(0, end),
    isValidMix,
    mixName,
  };
}

export function calculateMOD(o2Percent: number, ppo2Max: number = PPO2_MAX_BOTTOM, waterType: 'salt' | 'fresh' = 'salt'): number {
  const pressurePerMeter = waterType === 'salt' ? 0.1 : 0.097;
  const o2Frac = o2Percent / 100;
  const maxAbsPressure = ppo2Max / o2Frac;
  return Math.floor((maxAbsPressure - 1) / pressurePerMeter);
}

export function calculateEND(
  depthM: number,
  hePercent: number,
  o2Percent: number = 21,
  o2IsNarcotic: boolean = false,
  waterType: 'salt' | 'fresh' = 'salt'
): number {
  const pressurePerMeter = waterType === 'salt' ? 0.1 : 0.097;
  const absolutePressure = 1 + (depthM * pressurePerMeter);
  
  const n2Percent = 100 - o2Percent - hePercent;
  
  if (o2IsNarcotic) {
    const narcoticFrac = (o2Percent + n2Percent) / 100;
    return Math.round((absolutePressure * narcoticFrac - 1) / pressurePerMeter);
  } else {
    const n2Partial = absolutePressure * (n2Percent / 100);
    return Math.round((n2Partial / 0.79 - 1) / pressurePerMeter);
  }
}

export function getMixName(o2Percent: number, hePercent: number): string {
  const n2Percent = 100 - o2Percent - hePercent;
  
  if (hePercent === 0) {
    if (o2Percent === 21) return 'Air';
    if (o2Percent === 100) return 'Oxygen';
    return `EAN${o2Percent}`;
  }
  
  // Heliox is ONLY O2 + He (no nitrogen, tolerance of 1% for rounding)
  if (n2Percent <= 1) {
    return `Heliox ${o2Percent}/${hePercent}`;
  }
  
  // Trimix contains O2 + He + N2
  return `Tx${o2Percent}/${hePercent}`;
}
