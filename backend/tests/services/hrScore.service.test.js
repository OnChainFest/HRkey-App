import { calculateHRScore } from '../../services/hrScore.service.js';

describe('HRScore Engine - calculateHRScore', () => {
  test('returns zero scores when all inputs are zero', () => {
    const result = calculateHRScore({
      teamImpact: 0,
      reliability: 0,
      leadership: 0,
      adaptability: 0,
      communication: 0
    });

    expect(result.normalizedScore).toBe(0);
    expect(result.hrScore).toBe(0);
  });

  test('returns full scores when all inputs are one', () => {
    const result = calculateHRScore({
      teamImpact: 1,
      reliability: 1,
      leadership: 1,
      adaptability: 1,
      communication: 1
    });

    expect(result.normalizedScore).toBeCloseTo(1, 10);
    expect(result.hrScore).toBeCloseTo(100, 10);
  });

  test('computes a blended score for a strong, mixed profile', () => {
    const result = calculateHRScore({
      teamImpact: 0.9,
      reliability: 0.8,
      leadership: 0.7,
      adaptability: 0.6,
      communication: 0.7
    });

    expect(result.normalizedScore).toBeGreaterThan(0);
    expect(result.normalizedScore).toBeLessThanOrEqual(1);
    expect(result.hrScore).toBeGreaterThan(0);
    expect(result.hrScore).toBeLessThanOrEqual(100);
    expect(result.hrScore).toBeGreaterThan(50);
    expect(result.normalizedScore).toBeCloseTo(0.77, 2);
    expect(result.hrScore).toBeCloseTo(77, 1);
  });

  test('clamps out-of-range inputs to valid bounds', () => {
    const result = calculateHRScore({
      teamImpact: -0.3,
      reliability: 1.5,
      leadership: 2,
      adaptability: -1,
      communication: 10
    });

    expect(result.normalizedScore).toBeGreaterThanOrEqual(0);
    expect(result.normalizedScore).toBeLessThanOrEqual(1);
    expect(result.hrScore).toBeGreaterThanOrEqual(0);
    expect(result.hrScore).toBeLessThanOrEqual(100);
    expect(result.normalizedScore).toBeCloseTo(0.55, 2);
    expect(result.hrScore).toBeCloseTo(55, 1);
  });
});
