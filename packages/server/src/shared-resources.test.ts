import { DEFAULT_CONFIG, type PolygConfig } from '@polyg-mcp/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ServerConfigError, ServerStartError } from './errors.js';
import { SharedResources } from './shared-resources.js';

// Test config with mock API key
const TEST_CONFIG: PolygConfig = {
  ...DEFAULT_CONFIG,
  llm: {
    ...DEFAULT_CONFIG.llm,
    apiKey: 'test-api-key-for-testing-only',
  },
};

describe('SharedResources', () => {
  describe('constructor', () => {
    it('should create resources with valid config', () => {
      const resources = new SharedResources(TEST_CONFIG);
      expect(resources).toBeDefined();
      expect(resources.isConnected()).toBe(false);
    });

    it('should expose db adapter', () => {
      const resources = new SharedResources(TEST_CONFIG);
      expect(resources.db).toBeDefined();
    });

    it('should expose llm provider', () => {
      const resources = new SharedResources(TEST_CONFIG);
      expect(resources.llmProvider).toBeDefined();
    });

    it('should expose embedding provider', () => {
      const resources = new SharedResources(TEST_CONFIG);
      expect(resources.embeddingProvider).toBeDefined();
    });

    it('should expose orchestrator', () => {
      const resources = new SharedResources(TEST_CONFIG);
      expect(resources.orchestrator).toBeDefined();
    });

    it('should expose health checker', () => {
      const resources = new SharedResources(TEST_CONFIG);
      expect(resources.healthChecker).toBeDefined();
    });

    it('should throw ServerConfigError for invalid falkordb host', () => {
      const invalidConfig = {
        ...TEST_CONFIG,
        falkordb: {
          ...TEST_CONFIG.falkordb,
          host: '',
        },
      };
      expect(() => new SharedResources(invalidConfig)).toThrow(
        ServerConfigError,
      );
    });

    it('should throw ServerConfigError for invalid falkordb port', () => {
      const invalidConfig = {
        ...TEST_CONFIG,
        falkordb: {
          ...TEST_CONFIG.falkordb,
          port: -1,
        },
      };
      expect(() => new SharedResources(invalidConfig)).toThrow(
        ServerConfigError,
      );
    });

    it('should throw ServerConfigError for missing LLM API key', () => {
      const invalidConfig = {
        ...TEST_CONFIG,
        llm: {
          ...TEST_CONFIG.llm,
          apiKey: '',
        },
      };
      expect(() => new SharedResources(invalidConfig)).toThrow(
        ServerConfigError,
      );
    });
  });

  describe('lifecycle', () => {
    let resources: SharedResources;

    beforeEach(() => {
      resources = new SharedResources(TEST_CONFIG);
    });

    afterEach(async () => {
      if (resources.isConnected()) {
        await resources.stop();
      }
    });

    it('should connect to FalkorDB on start()', async () => {
      expect(resources.isConnected()).toBe(false);
      await resources.start();
      expect(resources.isConnected()).toBe(true);
    });

    it('should be idempotent - multiple start() calls should not error', async () => {
      await resources.start();
      await resources.start(); // Should not throw
      expect(resources.isConnected()).toBe(true);
    });

    it('should disconnect from FalkorDB on stop()', async () => {
      await resources.start();
      expect(resources.isConnected()).toBe(true);
      await resources.stop();
      expect(resources.isConnected()).toBe(false);
    });

    it('should handle stop() when not connected', async () => {
      expect(resources.isConnected()).toBe(false);
      await resources.stop(); // Should not throw
      expect(resources.isConnected()).toBe(false);
    });

    it('should throw ServerStartError when FalkorDB is unavailable', async () => {
      const badConfig = {
        ...TEST_CONFIG,
        falkordb: {
          ...TEST_CONFIG.falkordb,
          host: 'nonexistent-host',
          port: 9999,
        },
      };
      const badResources = new SharedResources(badConfig);

      await expect(badResources.start()).rejects.toThrow(ServerStartError);
    });
  });

  describe('health', () => {
    let resources: SharedResources;

    beforeEach(async () => {
      resources = new SharedResources(TEST_CONFIG);
      await resources.start();
    });

    afterEach(async () => {
      await resources.stop();
    });

    it('should return healthy status when connected', async () => {
      const health = await resources.getHealth();
      expect(health.status).toBe('ok');
      expect(health.falkordb).toBe('connected');
    });

    it('should include uptime in health status', async () => {
      const health = await resources.getHealth();
      expect(health.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should report graph count', async () => {
      const health = await resources.getHealth();
      expect(health.graphs).toBe(4); // semantic, temporal, causal, entity
    });
  });

  describe('getConfig', () => {
    it('should return validated config', () => {
      const resources = new SharedResources(TEST_CONFIG);
      const config = resources.getConfig();

      expect(config.falkordb.host).toBe(TEST_CONFIG.falkordb.host);
      expect(config.falkordb.port).toBe(TEST_CONFIG.falkordb.port);
      expect(config.llm.provider).toBe(TEST_CONFIG.llm.provider);
    });
  });
});
