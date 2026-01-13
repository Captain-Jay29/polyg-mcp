import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, VERSION } from './index.js';

describe('shared', () => {
  it('exports VERSION', () => {
    expect(VERSION).toBe('0.1.0');
  });

  it('exports DEFAULT_CONFIG', () => {
    expect(DEFAULT_CONFIG).toBeDefined();
    expect(DEFAULT_CONFIG.falkordb).toBeDefined();
    expect(DEFAULT_CONFIG.llm).toBeDefined();
  });
});
