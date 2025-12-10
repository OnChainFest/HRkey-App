import { calculateDynamicPrice } from '../../services/dynamicPricing.service.js';

describe('Dynamic Pricing Engine - calculateDynamicPrice', () => {
  test('returns minimum price and zero score when all inputs are zero', () => {
    const result = calculateDynamicPrice({
      skillScarcity: 0,
      recentDemand: 0,
      hrScorePercentile: 0,
      referenceDensity: 0
    });

    expect(result.normalizedScore).toBe(0);
    expect(result.priceUsd).toBe(10);
  });

  test('returns maximum price and full score when all inputs are one', () => {
    const result = calculateDynamicPrice({
      skillScarcity: 1,
      recentDemand: 1,
      hrScorePercentile: 1,
      referenceDensity: 1
    });

    expect(result.normalizedScore).toBeCloseTo(1, 10);
    expect(result.priceUsd).toBeCloseTo(150, 10);
  });

  test('calculates a blended price within bounds for a mixed candidate profile', () => {
    const result = calculateDynamicPrice({
      skillScarcity: 0.8,
      recentDemand: 0.6,
      hrScorePercentile: 0.9,
      referenceDensity: 0.7
    });

    expect(result.normalizedScore).toBeGreaterThan(0);
    expect(result.normalizedScore).toBeLessThanOrEqual(1);
    expect(result.priceUsd).toBeGreaterThan(10);
    expect(result.priceUsd).toBeLessThanOrEqual(150);
    expect(result.normalizedScore).toBeCloseTo(0.775, 3);
    expect(result.priceUsd).toBeCloseTo(118.5, 2);
  });

  test('clamps out-of-range inputs and output to configured bounds', () => {
    const result = calculateDynamicPrice({
      skillScarcity: -0.5,
      recentDemand: 2,
      hrScorePercentile: 1.5,
      referenceDensity: -1
    });

    expect(result.normalizedScore).toBeGreaterThanOrEqual(0);
    expect(result.normalizedScore).toBeLessThanOrEqual(1);
    expect(result.priceUsd).toBeGreaterThanOrEqual(10);
    expect(result.priceUsd).toBeLessThanOrEqual(150);
    expect(result.normalizedScore).toBeCloseTo(0.5, 2);
    expect(result.priceUsd).toBeCloseTo(80, 2);
  });
});
