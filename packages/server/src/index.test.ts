import { describe, expect, it } from 'vitest';
import {
  HTTPTransport,
  HealthChecker,
  PolygMCPServer,
  VERSION,
} from './index.js';

describe('server', () => {
  it('exports VERSION', () => {
    expect(VERSION).toBe('0.1.0');
  });

  it('exports PolygMCPServer', () => {
    expect(PolygMCPServer).toBeDefined();
  });

  it('exports HTTPTransport', () => {
    expect(HTTPTransport).toBeDefined();
  });

  it('exports HealthChecker', () => {
    expect(HealthChecker).toBeDefined();
  });
});
