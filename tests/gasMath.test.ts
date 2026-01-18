import { describe, it, expect } from 'vitest';
import { calculateZFactor, calculateTrimixBlendRealGas } from '../services/gasMath';

describe('Z-Factor Calculations (NIST REFPROP v10)', () => {
  const TEMP_15C = 288;
  const TOLERANCE = 0.005;

  describe('Reference values at 232 bar, 15°C', () => {
    it('Air (21% O2, 0% He) should have Z ≈ 1.044', () => {
      const z = calculateZFactor(232, TEMP_15C, 0.21, 0);
      expect(z).toBeCloseTo(1.0438, 2);
    });

    it('EAN32 (32% O2, 0% He) should have Z ≈ 1.032', () => {
      const z = calculateZFactor(232, TEMP_15C, 0.32, 0);
      expect(z).toBeCloseTo(1.0316, 2);
    });

    it('EAN50 (50% O2, 0% He) should have Z ≈ 1.008', () => {
      const z = calculateZFactor(232, TEMP_15C, 0.50, 0);
      expect(z).toBeCloseTo(1.0077, 2);
    });

    it('Pure O2 should have Z ≈ 0.940', () => {
      const z = calculateZFactor(232, TEMP_15C, 1.0, 0);
      expect(z).toBeCloseTo(0.9400, 2);
    });

    it('Pure He should have Z ≈ 1.113', () => {
      const z = calculateZFactor(232, TEMP_15C, 0, 1.0);
      expect(z).toBeCloseTo(1.1126, 2);
    });

    it('Tx21/35 should have Z ≈ 1.124', () => {
      const z = calculateZFactor(232, TEMP_15C, 0.21, 0.35);
      expect(z).toBeCloseTo(1.1243, 2);
    });

    it('Tx18/45 should have Z ≈ 1.136', () => {
      const z = calculateZFactor(232, TEMP_15C, 0.18, 0.45);
      expect(z).toBeCloseTo(1.1362, 2);
    });

    it('Tx15/55 should have Z ≈ 1.143', () => {
      const z = calculateZFactor(232, TEMP_15C, 0.15, 0.55);
      expect(z).toBeCloseTo(1.1429, 2);
    });

    it('Tx10/70 should have Z ≈ 1.145', () => {
      const z = calculateZFactor(232, TEMP_15C, 0.10, 0.70);
      expect(z).toBeCloseTo(1.1448, 2);
    });
  });

  describe('Reference values at 207 bar, 15°C', () => {
    it('Air should have Z ≈ 1.026', () => {
      const z = calculateZFactor(207, TEMP_15C, 0.21, 0);
      expect(z).toBeCloseTo(1.0263, 2);
    });

    it('Tx21/35 should have Z ≈ 1.107', () => {
      const z = calculateZFactor(207, TEMP_15C, 0.21, 0.35);
      expect(z).toBeCloseTo(1.1065, 2);
    });
  });

  describe('Reference values at 300 bar, 15°C', () => {
    it('Air should have Z ≈ 1.102', () => {
      const z = calculateZFactor(300, TEMP_15C, 0.21, 0);
      expect(z).toBeCloseTo(1.1020, 2);
    });

    it('Tx21/35 should have Z ≈ 1.176', () => {
      const z = calculateZFactor(300, TEMP_15C, 0.21, 0.35);
      expect(z).toBeCloseTo(1.1764, 2);
    });
  });

  describe('Interpolated compositions', () => {
    it('Tx17/40 (between Tx21/35 and Tx18/45) should be in expected range', () => {
      const z = calculateZFactor(232, TEMP_15C, 0.17, 0.40);
      expect(z).toBeGreaterThan(1.12);
      expect(z).toBeLessThan(1.15);
    });

    it('EAN40 should be between EAN32 and EAN50', () => {
      const z = calculateZFactor(232, TEMP_15C, 0.40, 0);
      const z32 = calculateZFactor(232, TEMP_15C, 0.32, 0);
      const z50 = calculateZFactor(232, TEMP_15C, 0.50, 0);
      expect(z).toBeLessThan(z32);
      expect(z).toBeGreaterThan(z50);
    });
  });

  describe('Low pressure behavior', () => {
    it('Z should approach 1 as pressure approaches 0', () => {
      const z1 = calculateZFactor(1, TEMP_15C, 0.21, 0);
      const z10 = calculateZFactor(10, TEMP_15C, 0.21, 0);
      const z50 = calculateZFactor(50, TEMP_15C, 0.21, 0);

      expect(z1).toBeCloseTo(1, 2);
      expect(z10).toBeCloseTo(1, 1);
      expect(z50).toBeLessThan(1.02);
    });

    it('Z = 1 at pressure = 0', () => {
      expect(calculateZFactor(0, TEMP_15C, 0.21, 0)).toBe(1);
    });
  });

  describe('Temperature effects', () => {
    it('Z deviation should decrease at higher temperatures', () => {
      const z15C = calculateZFactor(232, 288, 0.21, 0.35);
      const z25C = calculateZFactor(232, 298, 0.21, 0.35);
      const z35C = calculateZFactor(232, 308, 0.21, 0.35);

      const dev15 = Math.abs(z15C - 1);
      const dev25 = Math.abs(z25C - 1);
      const dev35 = Math.abs(z35C - 1);

      expect(dev25).toBeLessThan(dev15);
      expect(dev35).toBeLessThan(dev25);
    });
  });
});

describe('Real Gas Blending Calculations', () => {
  it('should calculate blending sequence for He-rich mixes', () => {
    const result = calculateTrimixBlendRealGas(
      21,   // targetO2Percent
      35,   // targetHePercent
      200,  // finalPressureBar
      0,    // residualPressureBar
      21,   // residualO2Percent
      0,    // residualHePercent
      true, // topUpWithAir
      32,   // nitroxO2Percent
      20    // tempCelsius
    );

    expect(result.hePressureToAdd).toBeGreaterThan(0);
    expect(result.o2PressureToAdd).toBeGreaterThanOrEqual(0);
    expect(result.airOrNitroxPressureToAdd).toBeGreaterThan(0);
  });

  it('should provide Z-factor information', () => {
    const result = calculateTrimixBlendRealGas(
      21,   // targetO2Percent
      35,   // targetHePercent
      200,  // finalPressureBar
      0,    // residualPressureBar
      21,   // residualO2Percent
      0,    // residualHePercent
      true, // topUpWithAir
      32,   // nitroxO2Percent
      15    // tempCelsius
    );

    expect(result.zFactorFinal).toBeGreaterThan(1.1);
    expect(result.zFactorFinal).toBeLessThan(1.15);
  });
});
