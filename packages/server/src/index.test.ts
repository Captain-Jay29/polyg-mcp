import type { FalkorDBAdapter } from '@polyg-mcp/core';
import { DEFAULT_CONFIG } from '@polyg-mcp/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  HTTPTransport,
  HealthChecker,
  PolygMCPServer,
  VERSION,
} from './index.js';

describe('server exports', () => {
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

describe('PolygMCPServer', () => {
  it('should create server with valid config', () => {
    const server = new PolygMCPServer(DEFAULT_CONFIG);
    expect(server).toBeDefined();
    expect(server.isConnected()).toBe(false);
  });

  it('should expose MCP server instance', () => {
    const server = new PolygMCPServer(DEFAULT_CONFIG);
    expect(server.getMcpServer()).toBeDefined();
  });

  it('should expose database adapter', () => {
    const server = new PolygMCPServer(DEFAULT_CONFIG);
    expect(server.getDatabase()).toBeDefined();
  });

  it('should expose health checker', () => {
    const server = new PolygMCPServer(DEFAULT_CONFIG);
    expect(server.getHealthChecker()).toBeDefined();
  });
});

describe('HTTPTransport', () => {
  it('should create transport with port', () => {
    const transport = new HTTPTransport({ port: 3000 });
    expect(transport).toBeDefined();
  });

  it('should create transport with host and port', () => {
    const transport = new HTTPTransport({ port: 3000, host: 'localhost' });
    expect(transport).toBeDefined();
  });

  it('should create transport with stateful option', () => {
    const transport = new HTTPTransport({ port: 3000, stateful: false });
    expect(transport).toBeDefined();
  });

  it('should throw if started without server attached', async () => {
    const transport = new HTTPTransport({ port: 3000 });
    await expect(transport.start()).rejects.toThrow('No server attached');
  });

  it('should return null address before starting', () => {
    const transport = new HTTPTransport({ port: 3000 });
    expect(transport.getAddress()).toBeNull();
  });
});

describe('HealthChecker', () => {
  it('should create health checker with mock db', () => {
    const mockDb = {
      healthCheck: vi.fn().mockResolvedValue(true),
    };
    const checker = new HealthChecker(mockDb as unknown as FalkorDBAdapter);
    expect(checker).toBeDefined();
  });

  it('should return ok status when db is healthy', async () => {
    const mockDb = {
      healthCheck: vi.fn().mockResolvedValue(true),
    };
    const checker = new HealthChecker(mockDb as unknown as FalkorDBAdapter);
    const status = await checker.check();

    expect(status.status).toBe('ok');
    expect(status.falkordb).toBe('connected');
    expect(status.graphs).toBe(4);
    expect(typeof status.uptime).toBe('number');
  });

  it('should return error status when db is unhealthy', async () => {
    const mockDb = {
      healthCheck: vi.fn().mockResolvedValue(false),
    };
    const checker = new HealthChecker(mockDb as unknown as FalkorDBAdapter);
    const status = await checker.check();

    expect(status.status).toBe('error');
    expect(status.falkordb).toBe('disconnected');
  });

  it('should return error status when db throws', async () => {
    const mockDb = {
      healthCheck: vi.fn().mockRejectedValue(new Error('Connection failed')),
    };
    const checker = new HealthChecker(mockDb as unknown as FalkorDBAdapter);
    const status = await checker.check();

    expect(status.status).toBe('error');
    expect(status.falkordb).toBe('disconnected');
  });

  it('should track uptime', async () => {
    const mockDb = {
      healthCheck: vi.fn().mockResolvedValue(true),
    };
    const checker = new HealthChecker(mockDb as unknown as FalkorDBAdapter);

    // Wait a bit for uptime to increase
    await new Promise((resolve) => setTimeout(resolve, 100));

    const status = await checker.check();
    expect(status.uptime).toBeGreaterThanOrEqual(0);
  });
});
