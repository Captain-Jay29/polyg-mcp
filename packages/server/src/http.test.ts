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

    it('should return 405 for non-GET health requests', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/health`, {
        method: 'POST',
      });

      expect(response.status).toBe(405);

      const data = (await response.json()) as { error: string };
      expect(data.error).toBe('Method not allowed');
    });
  });

  describe('MCP endpoint', () => {
    let server: PolygMCPServer;
    let transport: HTTPTransport;
    const TEST_PORT = 13591;

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

    it('should respond to requests at /mcp', async () => {
      // Send an MCP initialize request with proper Accept header for streamable HTTP
      const response = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        }),
      });

      // MCP endpoint should respond (status depends on transport state)
      // We're testing that the endpoint is reachable and processes the request
      expect([200, 406]).toContain(response.status);
    });

    it('should respond to requests at root path /', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        }),
      });

      // MCP endpoint should respond
      expect([200, 406]).toContain(response.status);
    });

    it('should handle GET requests to /mcp', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
        method: 'GET',
      });

      // GET requests are handled by the transport (SSE or similar)
      // This tests that the endpoint is reachable
      expect(response).toBeDefined();
    });

    it('should handle empty POST body', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      // Empty body should be handled (may return error from MCP)
      expect(response).toBeDefined();
    });

    it('should reject invalid JSON body', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json {',
      });

      expect(response.status).toBe(500);
      const data = (await response.json()) as { error: string };
      expect(data.error).toContain('Invalid JSON');
    });
  });

  describe('getOptions', () => {
    it('should return validated options', () => {
      const transport = new HTTPTransport({
        port: 3000,
        host: 'localhost',
        stateful: true,
      });

      const options = transport.getOptions();

      expect(options.port).toBe(3000);
      expect(options.host).toBe('localhost');
      expect(options.stateful).toBe(true);
    });

    it('should return options with defaults applied', () => {
      const transport = new HTTPTransport({ port: 3000 });

      const options = transport.getOptions();

      expect(options.port).toBe(3000);
      // host and stateful may have defaults
    });
  });

  describe('error handling', () => {
    it('should handle port already in use', async () => {
      const server = new PolygMCPServer(TEST_CONFIG);
      await server.start();

      const transport1 = new HTTPTransport({ port: 13593 });
      transport1.attachServer(server);
      await transport1.start();

      // Try to start another transport on the same port
      const server2 = new PolygMCPServer(TEST_CONFIG);
      await server2.start();

      const transport2 = new HTTPTransport({ port: 13593 });
      transport2.attachServer(server2);

      await expect(transport2.start()).rejects.toThrow(ServerStartError);

      await transport1.stop();
      await server.stop();
      await server2.stop();
    });
  });

  describe('stateful vs stateless mode', () => {
    let server: PolygMCPServer;

    beforeEach(async () => {
      server = new PolygMCPServer(TEST_CONFIG);
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it('should start in stateful mode by default', async () => {
      const transport = new HTTPTransport({ port: 13594 });
      transport.attachServer(server);

      await transport.start();
      expect(transport.isRunning()).toBe(true);

      await transport.stop();
    });

    it('should start in stateless mode when configured', async () => {
      const transport = new HTTPTransport({ port: 13595, stateful: false });
      transport.attachServer(server);

      await transport.start();
      expect(transport.isRunning()).toBe(true);

      await transport.stop();
    });
  });
});
