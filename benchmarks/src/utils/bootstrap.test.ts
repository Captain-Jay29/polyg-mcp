import { describe, expect, it } from 'vitest';
import { bootstrapCI, formatCI } from './bootstrap.js';

describe('bootstrapCI', () => {
  it('returns mean=1 and CI=[1,1] for all-ones scores', () => {
    const result = bootstrapCI([1, 1, 1, 1, 1]);
    expect(result.mean).toBe(1);
    expect(result.lower).toBe(1);
    expect(result.upper).toBe(1);
  });

  it('returns mean=0 and CI=[0,0] for all-zeros scores', () => {
    const result = bootstrapCI([0, 0, 0, 0, 0]);
    expect(result.mean).toBe(0);
    expect(result.lower).toBe(0);
    expect(result.upper).toBe(0);
  });

  it('returns lower <= mean <= upper for mixed scores', () => {
    const result = bootstrapCI([0.2, 0.5, 0.7, 0.8, 0.9, 0.3, 0.6]);
    expect(result.lower).toBeLessThanOrEqual(result.mean);
    expect(result.mean).toBeLessThanOrEqual(result.upper);
    expect(result.lower).toBeGreaterThanOrEqual(0);
    expect(result.upper).toBeLessThanOrEqual(1);
  });

  it('is deterministic with the same seed', () => {
    const a = bootstrapCI([0.1, 0.5, 0.9], 500, 0.95, 123);
    const b = bootstrapCI([0.1, 0.5, 0.9], 500, 0.95, 123);
    expect(a).toEqual(b);
  });

  it('produces narrower CI with larger nBootstrap', () => {
    const scores = [0.2, 0.4, 0.6, 0.8, 0.3, 0.5, 0.7, 0.9, 0.1, 0.35];
    const small = bootstrapCI(scores, 100, 0.95, 42);
    const large = bootstrapCI(scores, 10000, 0.95, 42);
    const widthSmall = small.upper - small.lower;
    const widthLarge = large.upper - large.lower;
    // With 10x more samples the CI should be at least as narrow (or very close)
    expect(widthLarge).toBeLessThanOrEqual(widthSmall + 0.05);
  });

  it('rejects empty array', () => {
    expect(() => bootstrapCI([])).toThrow('non-empty');
  });

  it('rejects scores outside [0,1]', () => {
    expect(() => bootstrapCI([0.5, 1.5])).toThrow('outside [0, 1]');
    expect(() => bootstrapCI([-0.1, 0.5])).toThrow('outside [0, 1]');
  });

  it('rejects ci outside (0,1)', () => {
    expect(() => bootstrapCI([0.5], 1000, 0)).toThrow('ci must be in (0, 1)');
    expect(() => bootstrapCI([0.5], 1000, 1)).toThrow('ci must be in (0, 1)');
    expect(() => bootstrapCI([0.5], 1000, -0.5)).toThrow(
      'ci must be in (0, 1)',
    );
  });
});

describe('formatCI', () => {
  it('produces the expected format string', () => {
    const result = { mean: 0.7, lower: 0.683, upper: 0.741, ci: 0.95 };
    const formatted = formatCI(result);
    expect(formatted).toBe('0.700 (95% CI: 0.683\u20130.741)');
  });

  it('respects custom decimals', () => {
    const result = { mean: 0.712, lower: 0.68, upper: 0.74, ci: 0.9 };
    const formatted = formatCI(result, 2);
    expect(formatted).toBe('0.71 (90% CI: 0.68\u20130.74)');
  });
});
