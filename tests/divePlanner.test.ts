import {
  calculateMValueAtPressure,
  calculateToleratedAmbientPressure,
  calculateCeilingWithGF,
  calculateTissueLoadingConstantDepth,
  calculateTissueLoadingSchreiner,
  calculateNDL,
  calculateCNS,
  calculateOTU,
  calculateEND,
  calculateGasConsumption,
  calculateDivePlan,
  depthToPressure,
  pressureToDepth,
  getInspiredPressure,
  initializeTissues,
  createGasMix,
  findFirstStop,
  DEFAULT_SETTINGS,
  type TissueState,
  type DiveSegment,
  type GasMix,
} from '../services/divePlanner';

const TOLERANCE = 0.01;

function assertApprox(actual: number, expected: number, tolerance: number = TOLERANCE, message: string = '') {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(`${message} Expected ${expected}, got ${actual} (diff: ${diff.toFixed(4)})`);
  }
  return true;
}

console.log('=== Bühlmann ZHL-16C Algorithm Test Suite ===\n');

let passCount = 0;
let failCount = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passCount++;
  } catch (error: any) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${error.message}`);
    failCount++;
  }
}

console.log('--- Test 1: ZHL-16C Coefficient Verification ---\n');

test('Compartment 1 M-value at surface (1 bar) equals 3.24 bar', () => {
  const tissues = initializeTissues();
  tissues[0].ppN2 = 0.74;
  tissues[0].ppHe = 0;
  tissues[0].ppInert = 0.74;
  const mValue = calculateMValueAtPressure(tissues[0], 0, 1.0);
  assertApprox(mValue, 3.24, 0.01, 'Compartment 1 M-value:');
});

test('Compartment 16 M-value at surface (1 bar) equals 1.27 bar', () => {
  const tissues = initializeTissues();
  tissues[15].ppN2 = 0.74;
  tissues[15].ppHe = 0;
  tissues[15].ppInert = 0.74;
  const mValue = calculateMValueAtPressure(tissues[15], 15, 1.0);
  assertApprox(mValue, 1.27, 0.01, 'Compartment 16 M-value:');
});

test('Depth to pressure conversion (salt water)', () => {
  assertApprox(depthToPressure(0, 'salt'), 1.0, 0.001, '0m:');
  assertApprox(depthToPressure(10, 'salt'), 2.0, 0.001, '10m:');
  assertApprox(depthToPressure(30, 'salt'), 4.0, 0.001, '30m:');
  assertApprox(depthToPressure(40, 'salt'), 5.0, 0.001, '40m:');
});

test('Depth to pressure conversion (fresh water)', () => {
  assertApprox(depthToPressure(10.3, 'fresh'), 2.0, 0.001, '10.3m:');
  assertApprox(depthToPressure(30.9, 'fresh'), 4.0, 0.001, '30.9m:');
});

test('Pressure to depth conversion', () => {
  assertApprox(pressureToDepth(2.0, 'salt'), 10, 0.001, '2 bar:');
  assertApprox(pressureToDepth(4.0, 'salt'), 30, 0.001, '4 bar:');
});

console.log('\n--- Test 2: Inspired Gas Pressure Calculations ---\n');

test('Inspired N2 with Air at surface', () => {
  const air = createGasMix(21, 0, 'Air');
  const inspired = getInspiredPressure(1.0, air);
  assertApprox(inspired.ppN2, 0.74, 0.01, 'ppN2:');
  assertApprox(inspired.ppO2, 0.20, 0.01, 'ppO2:');
});

test('Inspired N2 with Air at 30m', () => {
  const air = createGasMix(21, 0, 'Air');
  const inspired = getInspiredPressure(4.0, air);
  assertApprox(inspired.ppN2, 3.11, 0.02, 'ppN2 at 30m:');
});

test('Inspired gases with Trimix 18/45 at 60m', () => {
  const trimix = createGasMix(18, 45, 'Tx18/45');
  const inspired = getInspiredPressure(7.0, trimix);
  assertApprox(inspired.ppN2, 2.57, 0.05, 'ppN2:');
  assertApprox(inspired.ppHe, 3.12, 0.05, 'ppHe:');
  assertApprox(inspired.ppO2, 1.25, 0.05, 'ppO2:');
});

console.log('\n--- Test 3: Tissue Loading (Haldanian) ---\n');

test('Compartment 1 (4 min half-time) loads 50% in 4 minutes', () => {
  const tissues = initializeTissues();
  const air = createGasMix(21, 0, 'Air');
  const loaded = calculateTissueLoadingConstantDepth(tissues, 30, 4, air, 'salt', 'open', 1.3);
  const initialN2 = tissues[0].ppN2;
  const inspiredN2 = 3.11;
  const expectedChange = (inspiredN2 - initialN2) * 0.5;
  const expectedFinal = initialN2 + expectedChange;
  assertApprox(loaded[0].ppN2, expectedFinal, 0.1, 'Compartment 1 after 4 min:');
});

test('Compartment 1 loads ~75% in 2 half-times (8 min)', () => {
  const tissues = initializeTissues();
  const air = createGasMix(21, 0, 'Air');
  const loaded = calculateTissueLoadingConstantDepth(tissues, 30, 8, air, 'salt', 'open', 1.3);
  const initialN2 = tissues[0].ppN2;
  const inspiredN2 = 3.11;
  const expectedChange = (inspiredN2 - initialN2) * 0.75;
  const expectedFinal = initialN2 + expectedChange;
  assertApprox(loaded[0].ppN2, expectedFinal, 0.15, 'Compartment 1 after 8 min:');
});

test('Slow compartment (635 min half-time) loads minimally in 10 min', () => {
  const tissues = initializeTissues();
  const air = createGasMix(21, 0, 'Air');
  const loaded = calculateTissueLoadingConstantDepth(tissues, 30, 10, air, 'salt', 'open', 1.3);
  const percentLoaded = (loaded[15].ppN2 - tissues[15].ppN2) / (3.11 - tissues[15].ppN2);
  if (percentLoaded > 0.02) {
    throw new Error(`Slow compartment loaded too fast: ${(percentLoaded * 100).toFixed(1)}%`);
  }
});

console.log('\n--- Test 4: Tissue Loading (Schreiner) ---\n');

test('Schreiner equation handles descent correctly', () => {
  const tissues = initializeTissues();
  const air = createGasMix(21, 0, 'Air');
  const descentTime = 30 / 18;
  const loaded = calculateTissueLoadingSchreiner(tissues, 0, 30, descentTime, air, 'salt', 'open', 1.3);
  if (loaded[0].ppN2 <= tissues[0].ppN2) {
    throw new Error('Tissue should have loaded during descent');
  }
  if (loaded[0].ppN2 > 3.11) {
    throw new Error('Tissue cannot exceed inspired pressure');
  }
});

test('Schreiner vs Haldanian produces similar results for slow descent', () => {
  const tissues1 = initializeTissues();
  const tissues2 = initializeTissues();
  const air = createGasMix(21, 0, 'Air');
  const avgDepth = 15;
  const avgPressure = depthToPressure(avgDepth, 'salt');
  const time = 10;
  const schreiner = calculateTissueLoadingSchreiner(tissues1, 0, 30, time, air, 'salt', 'open', 1.3);
  const haldane = calculateTissueLoadingConstantDepth(tissues2, avgDepth, time, air, 'salt', 'open', 1.3);
  const diff = Math.abs(schreiner[0].ppN2 - haldane[0].ppN2);
  if (diff > 0.3) {
    throw new Error(`Methods differ too much: ${diff.toFixed(3)} bar`);
  }
});

console.log('\n--- Test 5: Ceiling Calculations with Gradient Factors ---\n');

test('GF 100 ceiling equals raw Bühlmann ceiling', () => {
  const tissues = initializeTissues();
  const air = createGasMix(21, 0, 'Air');
  const loaded = calculateTissueLoadingConstantDepth(tissues, 40, 20, air, 'salt', 'open', 1.3);
  const rawCeiling = calculateToleratedAmbientPressure(loaded[0], 0);
  const gf100Ceiling = calculateCeilingWithGF(loaded[0], 0, 100);
  assertApprox(gf100Ceiling, rawCeiling, 0.01, 'GF100 ceiling:');
});

test('Lower GF produces deeper ceiling', () => {
  const tissues = initializeTissues();
  const air = createGasMix(21, 0, 'Air');
  const loaded = calculateTissueLoadingConstantDepth(tissues, 40, 25, air, 'salt', 'open', 1.3);
  const gf30Ceiling = calculateCeilingWithGF(loaded[0], 0, 30);
  const gf85Ceiling = calculateCeilingWithGF(loaded[0], 0, 85);
  if (gf30Ceiling <= gf85Ceiling) {
    throw new Error(`GF30 (${gf30Ceiling.toFixed(2)}) should be deeper than GF85 (${gf85Ceiling.toFixed(2)})`);
  }
});

test('First stop depth calculation', () => {
  const tissues = initializeTissues();
  const air = createGasMix(21, 0, 'Air');
  const loaded = calculateTissueLoadingConstantDepth(tissues, 50, 15, air, 'salt', 'open', 1.3);
  const firstStop = findFirstStop(loaded, 30, 3, 'salt');
  if (firstStop < 3 || firstStop > 30) {
    throw new Error(`First stop ${firstStop}m seems unreasonable for 50m/15min on air`);
  }
});

console.log('\n--- Test 6: NDL Calculations (Reference: PADI/NAUI Tables) ---\n');

test('NDL at 10m should be long (>100 min)', () => {
  const tissues = initializeTissues();
  const air = createGasMix(21, 0, 'Air');
  const ndl = calculateNDL(tissues, 10, air, 85, 'salt', 'open', 1.3);
  if (ndl === null || ndl < 100) {
    throw new Error(`NDL at 10m should be >100 min, got ${ndl}`);
  }
});

test('NDL at 18m should be ~50-60 min', () => {
  const tissues = initializeTissues();
  const air = createGasMix(21, 0, 'Air');
  const ndl = calculateNDL(tissues, 18, air, 85, 'salt', 'open', 1.3);
  if (ndl === null || ndl < 40 || ndl > 80) {
    throw new Error(`NDL at 18m should be ~50-60 min, got ${ndl}`);
  }
});

test('NDL at 30m should be ~15-25 min', () => {
  const tissues = initializeTissues();
  const air = createGasMix(21, 0, 'Air');
  const ndl = calculateNDL(tissues, 30, air, 85, 'salt', 'open', 1.3);
  if (ndl === null || ndl < 12 || ndl > 30) {
    throw new Error(`NDL at 30m should be ~15-25 min, got ${ndl}`);
  }
});

test('NDL at 40m should be ~5-12 min', () => {
  const tissues = initializeTissues();
  const air = createGasMix(21, 0, 'Air');
  const ndl = calculateNDL(tissues, 40, air, 85, 'salt', 'open', 1.3);
  if (ndl === null || ndl < 4 || ndl > 15) {
    throw new Error(`NDL at 40m should be ~5-12 min, got ${ndl}`);
  }
});

test('EAN32 extends NDL at 30m', () => {
  const tissues = initializeTissues();
  const air = createGasMix(21, 0, 'Air');
  const ean32 = createGasMix(32, 0, 'EAN32');
  const ndlAir = calculateNDL(tissues, 30, air, 85, 'salt', 'open', 1.3);
  const ndlEan32 = calculateNDL(tissues, 30, ean32, 85, 'salt', 'open', 1.3);
  if (ndlEan32 === null || ndlAir === null || ndlEan32 <= ndlAir) {
    throw new Error(`EAN32 NDL (${ndlEan32}) should exceed Air NDL (${ndlAir})`);
  }
});

console.log('\n--- Test 7: CNS Oxygen Toxicity ---\n');

test('CNS at PPO2 1.6 for 45 min equals 100%', () => {
  const cns = calculateCNS(1.6, 45);
  assertApprox(cns, 100, 1, 'CNS at 1.6 bar for 45 min:');
});

test('CNS at PPO2 1.4 for 120 min equals 100%', () => {
  const cns = calculateCNS(1.4, 120);
  assertApprox(cns, 100, 2, 'CNS at 1.4 bar for 120 min:');
});

test('CNS at PPO2 1.2 for 180 min equals 100%', () => {
  const cns = calculateCNS(1.2, 180);
  assertApprox(cns, 100, 5, 'CNS at 1.2 bar for 180 min:');
});

test('CNS below 0.5 bar is zero', () => {
  const cns = calculateCNS(0.4, 60);
  assertApprox(cns, 0, 0.001, 'CNS below threshold:');
});

console.log('\n--- Test 8: OTU Oxygen Toxicity (REPEX) ---\n');

test('OTU at PPO2 1.0 for 60 min', () => {
  const otu = calculateOTU(1.0, 60);
  const expected = 60 * Math.pow((1.0 - 0.5) / 0.5, 0.83);
  assertApprox(otu, expected, 0.1, 'OTU at 1.0 bar:');
});

test('OTU at PPO2 1.4 for 30 min', () => {
  const otu = calculateOTU(1.4, 30);
  const expected = 30 * Math.pow((1.4 - 0.5) / 0.5, 0.83);
  assertApprox(otu, expected, 0.1, 'OTU at 1.4 bar:');
});

test('OTU at PPO2 0.5 or below is zero', () => {
  assertApprox(calculateOTU(0.5, 60), 0, 0.001, 'OTU at 0.5 bar:');
  assertApprox(calculateOTU(0.3, 60), 0, 0.001, 'OTU below 0.5 bar:');
});

console.log('\n--- Test 9: END (Equivalent Narcotic Depth) ---\n');

test('END with Air at 30m equals 30m (O2 not narcotic)', () => {
  const air = createGasMix(21, 0, 'Air');
  const end = calculateEND(30, air, false, 'salt');
  assertApprox(end, 30, 1, 'END with Air at 30m:');
});

test('END with Trimix 18/45 at 60m is reduced', () => {
  const trimix = createGasMix(18, 45, 'Tx18/45');
  const end = calculateEND(60, trimix, false, 'salt');
  if (end >= 40) {
    throw new Error(`END with Tx18/45 at 60m should be <40m, got ${end.toFixed(1)}m`);
  }
});

test('END with O2 narcotic increases END', () => {
  const trimix = createGasMix(18, 45, 'Tx18/45');
  const endNotNarcotic = calculateEND(60, trimix, false, 'salt');
  const endNarcotic = calculateEND(60, trimix, true, 'salt');
  if (endNarcotic <= endNotNarcotic) {
    throw new Error(`O2 narcotic END (${endNarcotic.toFixed(1)}) should exceed non-narcotic (${endNotNarcotic.toFixed(1)})`);
  }
});

console.log('\n--- Test 10: MOD Calculations ---\n');

test('MOD for Air at PPO2 1.4 is 56m', () => {
  const air = createGasMix(21, 0, 'Air');
  assertApprox(air.modPpo2_14, 56, 1, 'Air MOD 1.4:');
});

test('MOD for EAN32 at PPO2 1.4 is 33m', () => {
  const ean32 = createGasMix(32, 0, 'EAN32');
  assertApprox(ean32.modPpo2_14, 33, 1, 'EAN32 MOD 1.4:');
});

test('MOD for EAN32 at PPO2 1.6 is 40m', () => {
  const ean32 = createGasMix(32, 0, 'EAN32');
  assertApprox(ean32.modPpo2_16, 40, 1, 'EAN32 MOD 1.6:');
});

test('MOD for O2 at PPO2 1.6 is 6m', () => {
  const o2 = createGasMix(100, 0, 'O2');
  assertApprox(o2.modPpo2_16, 6, 0.5, 'O2 MOD 1.6:');
});

console.log('\n--- Test 11: Gas Consumption ---\n');

test('Gas consumption at surface equals SAC rate', () => {
  const segments: DiveSegment[] = [{
    type: 'bottom',
    startDepth: 0,
    endDepth: 0,
    duration: 10,
    gasMix: createGasMix(21, 0, 'Air', 12, 200, 50),
    runTime: 10,
  }];
  const gases = [createGasMix(21, 0, 'Air', 12, 200, 50)];
  const consumption = calculateGasConsumption(segments, gases, DEFAULT_SETTINGS);
  const expected = DEFAULT_SETTINGS.sacRateBottom * 10 * 1.0;
  assertApprox(consumption[0].gasRequired, expected, 5, 'Surface consumption:');
});

test('Gas consumption doubles at 10m depth', () => {
  const segments: DiveSegment[] = [{
    type: 'bottom',
    startDepth: 10,
    endDepth: 10,
    duration: 10,
    gasMix: createGasMix(21, 0, 'Air', 12, 200, 50),
    runTime: 10,
  }];
  const gases = [createGasMix(21, 0, 'Air', 12, 200, 50)];
  const consumption = calculateGasConsumption(segments, gases, DEFAULT_SETTINGS);
  const expected = DEFAULT_SETTINGS.sacRateBottom * 10 * 2.0;
  assertApprox(consumption[0].gasRequired, expected, 5, '10m consumption:');
});

test('Gas consumption at 30m is 4x surface', () => {
  const segments: DiveSegment[] = [{
    type: 'bottom',
    startDepth: 30,
    endDepth: 30,
    duration: 10,
    gasMix: createGasMix(21, 0, 'Air', 12, 200, 50),
    runTime: 10,
  }];
  const gases = [createGasMix(21, 0, 'Air', 12, 200, 50)];
  const consumption = calculateGasConsumption(segments, gases, DEFAULT_SETTINGS);
  const expected = DEFAULT_SETTINGS.sacRateBottom * 10 * 4.0;
  assertApprox(consumption[0].gasRequired, expected, 5, '30m consumption:');
});

console.log('\n--- Test 12: Complete Dive Plan Validation ---\n');

test('30m/20min on Air produces reasonable deco schedule', () => {
  const air = createGasMix(21, 0, 'Air', 12, 200, 50);
  const result = calculateDivePlan({
    depth: 30,
    bottomTime: 20,
    gases: [air],
    settings: { ...DEFAULT_SETTINGS, gfLow: 30, gfHigh: 70 },
  });
  if (result.totalDecoTime === 0) {
    throw new Error('30m/20min should require some deco with GF 30/70');
  }
  if (result.totalRunTime < 20 || result.totalRunTime > 60) {
    throw new Error(`Total runtime ${result.totalRunTime} seems unreasonable`);
  }
});

test('40m/25min on Air with GF 30/70 requires deco', () => {
  const air = createGasMix(21, 0, 'Air', 12, 200, 50);
  const result = calculateDivePlan({
    depth: 40,
    bottomTime: 25,
    gases: [air],
    settings: { ...DEFAULT_SETTINGS, gfLow: 30, gfHigh: 70 },
  });
  if (result.decoStops.length === 0) {
    throw new Error('40m/25min should require deco stops');
  }
  if (result.totalDecoTime < 5) {
    throw new Error(`Deco time ${result.totalDecoTime} seems too short for 40m/25min`);
  }
});

test('Dive plan generates valid segments', () => {
  const air = createGasMix(21, 0, 'Air', 12, 200, 50);
  const result = calculateDivePlan({
    depth: 30,
    bottomTime: 15,
    gases: [air],
    settings: DEFAULT_SETTINGS,
  });
  if (result.segments.length < 3) {
    throw new Error('Should have at least descent, bottom, and ascent segments');
  }
  const hasDescent = result.segments.some(s => s.type === 'descent');
  const hasBottom = result.segments.some(s => s.type === 'bottom');
  const hasAscent = result.segments.some(s => s.type === 'ascent');
  if (!hasDescent || !hasBottom || !hasAscent) {
    throw new Error('Missing required segment types');
  }
});

test('CNS and OTU accumulate correctly', () => {
  const ean50 = createGasMix(50, 0, 'EAN50', 12, 200, 50);
  ean50.switchDepth = 21;
  const air = createGasMix(21, 0, 'Air', 12, 200, 50);
  const result = calculateDivePlan({
    depth: 40,
    bottomTime: 25,
    gases: [air, ean50],
    settings: { ...DEFAULT_SETTINGS, gfLow: 30, gfHigh: 70 },
  });
  if (result.cns <= 0) {
    throw new Error('CNS should accumulate during dive');
  }
  if (result.otu <= 0) {
    throw new Error('OTU should accumulate during dive');
  }
});

console.log('\n--- Test 13: Reference Dive Comparisons ---\n');

test('Reference: 30m/25min Air GF 30/70 produces conservative deco', () => {
  const air = createGasMix(21, 0, 'Air', 12, 200, 50);
  const result = calculateDivePlan({
    depth: 30,
    bottomTime: 25,
    gases: [air],
    settings: { ...DEFAULT_SETTINGS, gfLow: 30, gfHigh: 70 },
  });
  if (result.totalDecoTime < 15 || result.totalDecoTime > 40) {
    throw new Error(`30m/25min deco time ${result.totalDecoTime}min outside expected 15-40min range for conservative GF 30/70`);
  }
});

test('Reference: 50m/15min Trimix 21/35 GF 30/70', () => {
  const trimix = createGasMix(21, 35, 'Tx21/35', 24, 200, 50);
  const ean50 = createGasMix(50, 0, 'EAN50', 11, 200, 50);
  ean50.switchDepth = 21;
  const o2 = createGasMix(100, 0, 'O2', 7, 200, 50);
  o2.switchDepth = 6;
  const result = calculateDivePlan({
    depth: 50,
    bottomTime: 15,
    gases: [trimix, ean50, o2],
    settings: { ...DEFAULT_SETTINGS, gfLow: 30, gfHigh: 70 },
  });
  if (result.decoStops.length < 2) {
    throw new Error('50m/15min Trimix should have multiple deco stops');
  }
  if (result.totalDecoTime < 10 || result.totalDecoTime > 40) {
    throw new Error(`Deco time ${result.totalDecoTime}min seems unreasonable for 50m/15min`);
  }
});

console.log('\n========================================');
console.log(`Results: ${passCount} passed, ${failCount} failed`);
console.log('========================================\n');

if (failCount > 0) {
  process.exit(1);
}
