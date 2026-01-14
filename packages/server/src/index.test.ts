import type { FalkorDBAdapter } from '@polyg-mcp/core';
import { DEFAULT_CONFIG, type PolygConfig } from '@polyg-mcp/shared';
import { describe, expect, it, vi } from 'vitest';

// Test config with a mock API key for LLM/embedding providers
const TEST_CONFIG: PolygConfig = {
  ...DEFAULT_CONFIG,
  llm: {
    ...DEFAULT_CONFIG.llm,
    apiKey: 'test-api-key-for-testing-only',
  },
};

import {
  formatToolError,
  HealthChecker,
  HTTPTransport,
  isServerError,
  PolygMCPServer,
  ServerConfigError,
  ServerError,
  ServerStartError,
  ServerStopError,
  ToolExecutionError,
  ToolInputValidationError,
  TransportConfigError,
  VERSION,
  wrapServerError,
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
    const server = new PolygMCPServer(TEST_CONFIG);
    expect(server).toBeDefined();
    expect(server.isConnected()).toBe(false);
  });

  it('should expose MCP server instance', () => {
    const server = new PolygMCPServer(TEST_CONFIG);
    expect(server.getMcpServer()).toBeDefined();
  });

  it('should expose database adapter', () => {
    const server = new PolygMCPServer(TEST_CONFIG);
    expect(server.getDatabase()).toBeDefined();
  });

  it('should expose health checker', () => {
    const server = new PolygMCPServer(TEST_CONFIG);
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

describe('Error Types', () => {
  describe('ServerError', () => {
    it('should create error with message', () => {
      const error = new ServerError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('ServerError');
      expect(error.cause).toBeUndefined();
    });

    it('should create error with cause', () => {
      const cause = new Error('Original error');
      const error = new ServerError('Wrapped error', cause);
      expect(error.message).toBe('Wrapped error');
      expect(error.cause).toBe(cause);
      expect(error.stack).toContain('Caused by:');
    });
  });

  describe('ServerConfigError', () => {
    it('should create error with field', () => {
      const error = new ServerConfigError('Invalid config', 'falkordb');
      expect(error.message).toBe('Invalid config');
      expect(error.name).toBe('ServerConfigError');
      expect(error.field).toBe('falkordb');
    });
  });

  describe('TransportConfigError', () => {
    it('should create error with field', () => {
      const error = new TransportConfigError('Invalid port', 'port');
      expect(error.message).toBe('Invalid port');
      expect(error.name).toBe('TransportConfigError');
      expect(error.field).toBe('port');
    });
  });

  describe('ServerStartError', () => {
    it('should create error with cause', () => {
      const cause = new Error('Connection refused');
      const error = new ServerStartError('Failed to start', cause);
      expect(error.message).toBe('Failed to start');
      expect(error.name).toBe('ServerStartError');
      expect(error.cause).toBe(cause);
    });
  });

  describe('ServerStopError', () => {
    it('should create error with cause', () => {
      const cause = new Error('Timeout');
      const error = new ServerStopError('Failed to stop', cause);
      expect(error.message).toBe('Failed to stop');
      expect(error.name).toBe('ServerStopError');
      expect(error.cause).toBe(cause);
    });
  });

  describe('ToolExecutionError', () => {
    it('should create error with tool name', () => {
      const error = new ToolExecutionError('Query failed', 'get_statistics');
      expect(error.message).toBe('Query failed');
      expect(error.name).toBe('ToolExecutionError');
      expect(error.toolName).toBe('get_statistics');
    });
  });

  describe('ToolInputValidationError', () => {
    it('should create error with validation errors', () => {
      const validationErrors = [
        { path: 'graph', message: 'Invalid enum value' },
      ];
      const error = new ToolInputValidationError(
        'Invalid input',
        'clear_graph',
        validationErrors,
      );
      expect(error.message).toBe('Invalid input');
      expect(error.name).toBe('ToolInputValidationError');
      expect(error.toolName).toBe('clear_graph');
      expect(error.validationErrors).toEqual(validationErrors);
    });
  });

  describe('isServerError', () => {
    it('should return true for ServerError', () => {
      expect(isServerError(new ServerError('test'))).toBe(true);
    });

    it('should return true for subclass errors', () => {
      expect(isServerError(new ServerConfigError('test'))).toBe(true);
      expect(isServerError(new TransportConfigError('test'))).toBe(true);
      expect(isServerError(new ServerStartError('test'))).toBe(true);
      expect(isServerError(new ServerStopError('test'))).toBe(true);
      expect(isServerError(new ToolExecutionError('test', 'tool'))).toBe(true);
    });

    it('should return false for regular Error', () => {
      expect(isServerError(new Error('test'))).toBe(false);
    });

    it('should return false for non-errors', () => {
      expect(isServerError('test')).toBe(false);
      expect(isServerError(null)).toBe(false);
      expect(isServerError(undefined)).toBe(false);
    });
  });

  describe('wrapServerError', () => {
    it('should return ServerError unchanged', () => {
      const original = new ServerError('original');
      const wrapped = wrapServerError(original, 'wrapped');
      expect(wrapped).toBe(original);
    });

    it('should wrap regular Error', () => {
      const original = new Error('original');
      const wrapped = wrapServerError(original, 'wrapped');
      expect(wrapped).toBeInstanceOf(ServerError);
      expect(wrapped.message).toBe('wrapped');
      expect(wrapped.cause).toBe(original);
    });

    it('should wrap non-Error values', () => {
      const wrapped = wrapServerError('string error', 'wrapped');
      expect(wrapped).toBeInstanceOf(ServerError);
      expect(wrapped.message).toBe('wrapped: string error');
    });
  });

  describe('formatToolError', () => {
    it('should format ToolExecutionError', () => {
      const error = new ToolExecutionError('Query failed', 'get_statistics');
      const result = formatToolError(error, 'get_statistics');
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Error executing get_statistics',
      );
      expect(result.content[0].text).toContain('Query failed');
    });

    it('should format ToolInputValidationError', () => {
      const error = new ToolInputValidationError(
        'Invalid input',
        'clear_graph',
        [{ path: 'graph', message: 'Invalid enum value' }],
      );
      const result = formatToolError(error, 'clear_graph');
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation error');
      expect(result.content[0].text).toContain('graph: Invalid enum value');
    });

    it('should format regular Error', () => {
      const error = new Error('Something went wrong');
      const result = formatToolError(error, 'my_tool');
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error in my_tool');
      expect(result.content[0].text).toContain('Something went wrong');
    });

    it('should format non-Error values', () => {
      const result = formatToolError('string error', 'my_tool');
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown error');
    });
  });
});

describe('Config Validation', () => {
  describe('PolygMCPServer', () => {
    it('should throw ServerConfigError for invalid config', () => {
      const invalidConfig = {
        falkordb: {
          host: '', // Empty string is invalid
          port: 6379,
          graphName: 'polyg',
        },
        llm: DEFAULT_CONFIG.llm,
        embeddings: DEFAULT_CONFIG.embeddings,
        execution: DEFAULT_CONFIG.execution,
      };

      expect(() => new PolygMCPServer(invalidConfig)).toThrow(
        ServerConfigError,
      );
    });

    it('should throw ServerConfigError for invalid port', () => {
      const invalidConfig = {
        falkordb: {
          host: 'localhost',
          port: 99999, // Invalid port
          graphName: 'polyg',
        },
        llm: DEFAULT_CONFIG.llm,
        embeddings: DEFAULT_CONFIG.embeddings,
        execution: DEFAULT_CONFIG.execution,
      };

      expect(() => new PolygMCPServer(invalidConfig)).toThrow(
        ServerConfigError,
      );
    });

    it('should throw ServerConfigError for missing required fields', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Testing runtime validation
      const invalidConfig = {
        falkordb: {
          host: 'localhost',
          port: 6379,
          // Missing graphName - cast to bypass TypeScript for runtime test
        },
        llm: DEFAULT_CONFIG.llm,
        embeddings: DEFAULT_CONFIG.embeddings,
        execution: DEFAULT_CONFIG.execution,
      } as unknown as ConstructorParameters<typeof PolygMCPServer>[0];

      expect(() => new PolygMCPServer(invalidConfig)).toThrow(
        ServerConfigError,
      );
    });
  });

  describe('HTTPTransport', () => {
    it('should throw TransportConfigError for invalid port', () => {
      expect(() => new HTTPTransport({ port: 0 })).toThrow(
        TransportConfigError,
      );
      expect(() => new HTTPTransport({ port: -1 })).toThrow(
        TransportConfigError,
      );
      expect(() => new HTTPTransport({ port: 99999 })).toThrow(
        TransportConfigError,
      );
    });

    it('should throw TransportConfigError for invalid host', () => {
      expect(() => new HTTPTransport({ port: 3000, host: '' })).toThrow(
        TransportConfigError,
      );
    });

    it('should accept valid configurations', () => {
      expect(() => new HTTPTransport({ port: 3000 })).not.toThrow();
      expect(
        () => new HTTPTransport({ port: 8080, host: '127.0.0.1' }),
      ).not.toThrow();
      expect(
        () => new HTTPTransport({ port: 443, stateful: true }),
      ).not.toThrow();
    });

    it('should validate port range', () => {
      expect(() => new HTTPTransport({ port: 1 })).not.toThrow();
      expect(() => new HTTPTransport({ port: 65535 })).not.toThrow();
    });
  });
});
