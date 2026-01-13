import { describe, expect, it } from 'vitest';
import { IntentClassifier, Synthesizer, VERSION } from './index.js';

describe('core', () => {
  it('exports VERSION', () => {
    expect(VERSION).toBe('0.1.0');
  });

  it('exports IntentClassifier', () => {
    expect(IntentClassifier).toBeDefined();
  });

  it('exports Synthesizer', () => {
    expect(Synthesizer).toBeDefined();
  });
});
