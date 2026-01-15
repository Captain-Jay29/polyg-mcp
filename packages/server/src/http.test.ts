import { DEFAULT_CONFIG, type PolygConfig } from '@polyg-mcp/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ServerStartError, TransportConfigError } from './errors.js';
import { HTTPTransport } from './http.js';
import { PolygMCPServer } from './server.js';

// Test config with mock API key
const TEST_CONFIG: PolygConfig = {
  ...DEFAULT_CONFIG,
  llm: {
    ...DEFAULT_CONFIG.llm,
    apiKey: 'test-api-key-for-testing-only',
  },
};

describe('HTTPTransport', () => {
  describe('constructor', () => {
    it('should create transport with valid port', () => {
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

    it('should throw TransportConfigError for port 0', () => {
      expect(() => new HTTPTransport({ port: 0 })).toThrow(
        TransportConfigError,
      );
    });

    it('should throw TransportConfigError for negative port', () => {
      expect(() => new HTTPTransport({ port: -1 })).toThrow(
        TransportConfigError,
      );
    });

    it('should throw TransportConfigError for port > 65535', () => {
      expect(() => new HTTPTransport({ port: 99999 })).toThrow(
        TransportConfigError,
      );
    });

    it('should throw TransportConfigError for empty host', () => {
      expect(() => new HTTPTransport({ port: 3000, host: '' })).toThrow(
        TransportConfigError,
      );
    });

    it('should accept port 1 (minimum valid)', () => {
      const transport = new HTTPTransport({ port: 1 });
      expect(transport).toBeDefined();
    });

    it('should accept port 65535 (maximum valid)', () => {
      const transport = new HTTPTransport({ port: 65535 });
      expect(transport).toBeDefined();
    });
  });

  describe('server attachment', () => {
    it('should return false for hasServer() before attachment', () => {
      const transport = new HTTPTransport({ port: 3000 });
      expect(transport.hasServer()).toBe(false);
    });

    it('should return true for hasServer() after attachment', () => {
      const transport = new HTTPTransport({ port: 3000 });
      const server = new PolygMCPServer(TEST_CONFIG);

      transport.attachServer(server);

      expect(transport.hasServer()).toBe(true);
    });

    it('should throw ServerStartError if started without server attached', async () => {
      const transport = new HTTPTransport({ port: 3000 });

      await expect(transport.start()).rejects.toThrow(ServerStartError);
      await expect(transport.start()).rejects.toThrow(
        'No server attached. Call attachServer() first.',
      );
    });
  });

  describe('state queries', () => {
    it('should return false for isRunning() before start', () => {
      const transport = new HTTPTransport({ port: 3000 });
      expect(transport.isRunning()).toBe(false);
    });

    it('should return null for getAddress() before start', () => {
      const transport = new HTTPTransport({ port: 3000 });
      expect(transport.getAddress()).toBeNull();
    });
  });

  describe('lifecycle', () => {
    let server: PolygMCPServer;

    beforeEach(async () => {
      server = new PolygMCPServer(TEST_CONFIG);
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it('should start and stop successfully', async () => {
      const transport = new HTTPTransport({ port: 13579 });
      transport.attachServer(server);

      expect(transport.isRunning()).toBe(false);

      await transport.start();
      expect(transport.isRunning()).toBe(true);

      const address = transport.getAddress();
      expect(address).not.toBeNull();
      expect(address?.port).toBe(13579);

      await transport.stop();
      expect(transport.isRunning()).toBe(false);
    });

    it('should be idempotent - multiple start() calls should not error', async () => {
      const transport = new HTTPTransport({ port: 13580 });
      transport.attachServer(server);

      await transport.start();
      await transport.start(); // Should not throw

      expect(transport.isRunning()).toBe(true);

      await transport.stop();
    });

    it('should handle stop() when not running', async () => {
      const transport = new HTTPTransport({ port: 13581 });
      transport.attachServer(server);

      expect(transport.isRunning()).toBe(false);
      await transport.stop(); // Should not throw
      expect(transport.isRunning()).toBe(false);
    });

    it('should return correct address after start', async () => {
      const transport = new HTTPTransport({ port: 13582, host: '127.0.0.1' });
      transport.attachServer(server);

      await transport.start();

      const address = transport.getAddress();
      expect(address).not.toBeNull();
      expect(address?.port).toBe(13582);
      // Address might be '127.0.0.1' or '::1' depending on system
      expect(address).toBeDefined();

      await transport.stop();
    });
  });

  describe('health endpoint', () => {
    let server: PolygMCPServer;
    let transport: HTTPTransport;
    const TEST_PORT = 13590;

    beforeEach(async () => {
      server = new PolygMCPServer(TEST_CONFIG);
      await server.start();
      transport = new HTTPTransport({ port: TEST_PORT });
      transport.attachServer(server);
      await transport.start();
    });

    afterEach(async () => {
      await transport.stop();
      await server.stop();
    });

    it('should respond to GET /health', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/health`);

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        status: string;
        falkordb: string;
      };
      expect(data.status).toBe('ok');
      expect(data.falkordb).toBe('connected');
    });

    it('should return 404 for unknown paths', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/unknown`);

      expect(response.status).toBe(404);

      const data = (await response.json()) as { error: string };
      expect(data.error).toBe('Not found');
    });
  });
});
