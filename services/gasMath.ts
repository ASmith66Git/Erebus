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
  o2Frac = Math.min(1.0, Math.max(0.21, o2Frac));
  
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
  
  const isValidMix = o2Percent >= 18 && o2Percent <= 100 && hePercent >= 0 && n2Percent >= 0;
  
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
  if (hePercent === 0) {
    if (o2Percent === 21) return 'Air';
    if (o2Percent === 100) return 'Oxygen';
    return `EAN${o2Percent}`;
  }
  if (o2Percent === 21 && hePercent > 0) {
    return `Heliox ${o2Percent}/${hePercent}`;
  }
  return `Tx${o2Percent}/${hePercent}`;
}
