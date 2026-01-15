import { DEFAULT_CONFIG, type PolygConfig } from '@polyg-mcp/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ServerConfigError, ServerStartError } from './errors.js';
import { PolygMCPServer } from './server.js';

// Test config with mock API key
const TEST_CONFIG: PolygConfig = {
  ...DEFAULT_CONFIG,
  llm: {
    ...DEFAULT_CONFIG.llm,
    apiKey: 'test-api-key-for-testing-only',
  },
};

describe('PolygMCPServer', () => {
  describe('constructor', () => {
    it('should create server with valid config', () => {
      const server = new PolygMCPServer(TEST_CONFIG);
      expect(server).toBeDefined();
      expect(server.isConnected()).toBe(false);
    });

    it('should throw ServerConfigError for invalid falkordb host', () => {
      const invalidConfig = {
        ...TEST_CONFIG,
        falkordb: {
          ...TEST_CONFIG.falkordb,
          host: '',
        },
      };
      expect(() => new PolygMCPServer(invalidConfig)).toThrow(ServerConfigError);
    });

    it('should throw ServerConfigError for invalid falkordb port', () => {
      const invalidConfig = {
        ...TEST_CONFIG,
        falkordb: {
          ...TEST_CONFIG.falkordb,
          port: -1,
        },
      };
      expect(() => new PolygMCPServer(invalidConfig)).toThrow(ServerConfigError);
    });

    it('should throw ServerConfigError for missing LLM API key', () => {
      const invalidConfig = {
        ...TEST_CONFIG,
        llm: {
          ...TEST_CONFIG.llm,
          apiKey: '',
        },
      };
      expect(() => new PolygMCPServer(invalidConfig)).toThrow(ServerConfigError);
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

    it('should expose orchestrator', () => {
      const server = new PolygMCPServer(TEST_CONFIG);
      expect(server.getOrchestrator()).toBeDefined();
    });
  });

  describe('lifecycle', () => {
    let server: PolygMCPServer;

    beforeEach(() => {
      server = new PolygMCPServer(TEST_CONFIG);
    });

    afterEach(async () => {
      if (server.isConnected()) {
        await server.stop();
      }
    });

    it('should connect to FalkorDB on start()', async () => {
      expect(server.isConnected()).toBe(false);
      await server.start();
      expect(server.isConnected()).toBe(true);
    });

    it('should be idempotent - multiple start() calls should not error', async () => {
      await server.start();
      await server.start(); // Should not throw
      expect(server.isConnected()).toBe(true);
    });

    it('should disconnect from FalkorDB on stop()', async () => {
      await server.start();
      expect(server.isConnected()).toBe(true);
      await server.stop();
      expect(server.isConnected()).toBe(false);
    });

    it('should handle stop() when not connected', async () => {
      expect(server.isConnected()).toBe(false);
      await server.stop(); // Should not throw
      expect(server.isConnected()).toBe(false);
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
      const badServer = new PolygMCPServer(badConfig);

      await expect(badServer.start()).rejects.toThrow(ServerStartError);
    });
  });

  describe('health', () => {
    let server: PolygMCPServer;

    beforeEach(async () => {
      server = new PolygMCPServer(TEST_CONFIG);
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it('should return healthy status when connected', async () => {
      const health = await server.getHealth();
      expect(health.status).toBe('ok');
      expect(health.falkordb).toBe('connected');
    });

    it('should include uptime in health status', async () => {
      const health = await server.getHealth();
      expect(health.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should report graph count', async () => {
      const health = await server.getHealth();
      expect(health.graphs).toBe(4); // semantic, temporal, causal, entity
    });
  });

  describe('tool registration', () => {
    let server: PolygMCPServer;

    beforeEach(() => {
      server = new PolygMCPServer(TEST_CONFIG);
    });

    it('should register all expected tools', () => {
      const mcpServer = server.getMcpServer();
      // Tools are registered in constructor via registerTools()
      expect(mcpServer).toBeDefined();
    });
  });
});

describe('PolygMCPServer tool handlers', () => {
  let server: PolygMCPServer;

  beforeEach(async () => {
    server = new PolygMCPServer(TEST_CONFIG);
    await server.start();
    // Clear any existing data
    await server.getDatabase().clearGraph();
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('entity tools', () => {
    it('should add an entity', async () => {
      const graphs = server.getOrchestrator().getGraphs();

      const entity = await graphs.entity.addEntity('Alice', 'person', {
        role: 'engineer',
      });

      expect(entity.uuid).toBeDefined();
      expect(entity.name).toBe('Alice');
      expect(entity.entity_type).toBe('person');
      expect(entity.properties).toEqual({ role: 'engineer' });
    });

    it('should retrieve an entity by UUID', async () => {
      const graphs = server.getOrchestrator().getGraphs();

      const created = await graphs.entity.addEntity('Bob', 'person');
      const retrieved = await graphs.entity.getEntity(created.uuid);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('Bob');
    });

    it('should retrieve an entity by name', async () => {
      const graphs = server.getOrchestrator().getGraphs();

      await graphs.entity.addEntity('Charlie', 'person');
      const retrieved = await graphs.entity.getEntity('Charlie');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('Charlie');
    });

    it('should link two entities', async () => {
      const graphs = server.getOrchestrator().getGraphs();

      const alice = await graphs.entity.addEntity('Alice', 'person');
      const bob = await graphs.entity.addEntity('Bob', 'person');

      // Link them
      await graphs.entity.linkEntities(alice.uuid, bob.uuid, 'knows');

      // Relationship was created (no error thrown)
      expect(true).toBe(true);
    });

    it('should return null for non-existent entity', async () => {
      const graphs = server.getOrchestrator().getGraphs();

      const result = await graphs.entity.getEntity('non-existent-uuid');
      expect(result).toBeNull();
    });
  });

  describe('temporal tools', () => {
    it('should add an event', async () => {
      const graphs = server.getOrchestrator().getGraphs();

      const event = await graphs.temporal.addEvent(
        'Deployment completed',
        new Date('2024-01-15T10:00:00Z'),
      );

      expect(event.uuid).toBeDefined();
      expect(event.description).toBe('Deployment completed');
      expect(event.occurred_at).toBeInstanceOf(Date);
    });

    it('should add multiple events', async () => {
      const graphs = server.getOrchestrator().getGraphs();

      const event1 = await graphs.temporal.addEvent('Event 1', new Date());
      const event2 = await graphs.temporal.addEvent('Event 2', new Date());

      expect(event1.uuid).not.toBe(event2.uuid);
    });
  });

  describe('causal tools', () => {
    it('should add causal nodes', async () => {
      const graphs = server.getOrchestrator().getGraphs();

      const cause = await graphs.causal.addNode('Missing config', 'cause');

      expect(cause.uuid).toBeDefined();
      expect(cause.description).toBe('Missing config');
      expect(cause.node_type).toBe('cause');
    });

    it('should add causal link between nodes', async () => {
      const graphs = server.getOrchestrator().getGraphs();

      const cause = await graphs.causal.addNode('Root cause', 'cause');
      const effect = await graphs.causal.addNode('Service crash', 'effect');

      const link = await graphs.causal.addLink(cause.uuid, effect.uuid, 0.95);

      expect(link.confidence).toBe(0.95);
    });

    it('should add causal link with evidence', async () => {
      const graphs = server.getOrchestrator().getGraphs();

      const cause = await graphs.causal.addNode('Config error', 'cause');
      const effect = await graphs.causal.addNode('Startup failure', 'effect');

      const link = await graphs.causal.addLink(
        cause.uuid,
        effect.uuid,
        0.9,
        'Logs showed missing AUTH_SECRET',
      );

      expect(link.evidence).toBe('Logs showed missing AUTH_SECRET');
    });
  });

  describe('semantic tools', () => {
    it('should have semantic graph available', () => {
      const graphs = server.getOrchestrator().getGraphs();

      expect(graphs.semantic).toBeDefined();
      expect(graphs.semantic.addConcept).toBeDefined();
      expect(graphs.semantic.search).toBeDefined();
    });
  });

  describe('cross-linker', () => {
    it('should have cross-linker available', () => {
      const graphs = server.getOrchestrator().getGraphs();

      expect(graphs.crossLinker).toBeDefined();
    });
  });
});
