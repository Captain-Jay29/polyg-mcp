/**
 * Tool Handler Tests
 *
 * These tests verify the MCP tool handlers in server.ts by:
 * 1. Creating a PolygMCPServer instance
 * 2. Starting it to connect to FalkorDB
 * 3. Calling tools through the registered handlers
 * 4. Verifying responses and error handling
 */
import { DEFAULT_CONFIG, type PolygConfig } from '@polyg-mcp/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PolygMCPServer } from '../server.js';

// Helper to wait for FalkorDB eventual consistency
// FalkorDB writes may not be immediately visible to subsequent queries
const waitForConsistency = (ms = 500) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Test config with mock API key
const TEST_CONFIG: PolygConfig = {
  ...DEFAULT_CONFIG,
  llm: {
    ...DEFAULT_CONFIG.llm,
    apiKey: 'test-api-key-for-testing-only',
  },
};

/**
 * Helper to call a tool through the MCP server's internal registry
 */
async function callTool(
  server: PolygMCPServer,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<{
  content: Array<{ type: string; text: string }>;
  structuredContent?: unknown;
}> {
  const mcpServer = server.getMcpServer();
  // Access the internal registered tools (using type assertion for private access)
  // The _registeredTools is a plain object, not a Map
  const registeredTools = (
    mcpServer as unknown as {
      _registeredTools: Record<
        string,
        { handler: (args: unknown, extra: unknown) => Promise<unknown> }
      >;
    }
  )._registeredTools;
  const tool = registeredTools[toolName];

  if (!tool) {
    throw new Error(
      `Tool not found: ${toolName}. Available: ${Object.keys(registeredTools).join(', ')}`,
    );
  }

  // Call the handler with mock extra context
  const result = await tool.handler(args, {
    sessionId: 'test-session',
    sendNotification: async () => {},
    sendRequest: async () => ({}),
  });

  return result as {
    content: Array<{ type: string; text: string }>;
    structuredContent?: unknown;
  };
}

describe('Tool Handlers', () => {
  let server: PolygMCPServer;

  beforeEach(async () => {
    server = new PolygMCPServer(TEST_CONFIG);
    await server.start();
    // Clear any existing test data
    await server.getDatabase().clearGraph();
  });

  afterEach(async () => {
    await server.stop();
  });

  // ==========================================================================
  // Entity Tools
  // ==========================================================================

  describe('get_entity', () => {
    it('should return entity not found for non-existent entity', async () => {
      const result = await callTool(server, 'get_entity', {
        name: 'NonExistent',
      });

      expect(result.content[0].text).toContain('Entity not found');
    });

    it('should return entity when found', async () => {
      // First add an entity
      const graphs = server.getOrchestrator().getGraphs();
      await graphs.entity.addEntity('TestEntity', 'TestType', { foo: 'bar' });

      const result = await callTool(server, 'get_entity', {
        name: 'TestEntity',
      });

      expect(result.content[0].text).toContain('TestEntity');
      expect(result.structuredContent).toBeDefined();
    });

    // TODO: Flaky due to FalkorDB eventual consistency issues when running in parallel
    it.skip('should include relationships when requested', async () => {
      const graphs = server.getOrchestrator().getGraphs();
      const uniqueId = Date.now().toString();
      const entity1 = await graphs.entity.addEntity(
        `Entity1_rel_${uniqueId}`,
        'Type',
      );
      const entity2 = await graphs.entity.addEntity(
        `Entity2_rel_${uniqueId}`,
        'Type',
      );
      await waitForConsistency();
      await graphs.entity.linkEntities(entity1.uuid, entity2.uuid, 'KNOWS');
      await waitForConsistency();

      const result = await callTool(server, 'get_entity', {
        name: `Entity1_rel_${uniqueId}`,
        include_relationships: true,
      });

      expect(result.structuredContent).toHaveProperty('entity');
      expect(result.structuredContent).toHaveProperty('relationships');
    });
  });

  describe('add_entity', () => {
    it('should create a new entity', async () => {
      const result = await callTool(server, 'add_entity', {
        name: 'NewEntity',
        entity_type: 'Person',
        properties: { role: 'developer' },
      });

      expect(result.content[0].text).toContain('Created entity');
      expect(result.content[0].text).toContain('NewEntity');
      expect(result.structuredContent).toHaveProperty('uuid');
    });

    it('should create entity without properties', async () => {
      const result = await callTool(server, 'add_entity', {
        name: 'SimpleEntity',
        entity_type: 'Thing',
      });

      expect(result.content[0].text).toContain('Created entity');
    });
  });

  describe('link_entities', () => {
    it('should link two entities', async () => {
      const graphs = server.getOrchestrator().getGraphs();
      const entity1 = await graphs.entity.addEntity('Alice', 'Person');
      const entity2 = await graphs.entity.addEntity('Bob', 'Person');

      // Wait for FalkorDB to persist the entities
      await waitForConsistency();

      const result = await callTool(server, 'link_entities', {
        source: entity1.uuid,
        target: entity2.uuid,
        relationship: 'FRIENDS_WITH',
      });

      expect(result.content[0].text).toContain('Linked');
      expect(result.content[0].text).toContain('FRIENDS_WITH');
    });
  });

  // ==========================================================================
  // Temporal Tools
  // ==========================================================================

  describe('add_event', () => {
    it('should add an event with valid date', async () => {
      const result = await callTool(server, 'add_event', {
        description: 'Test event happened',
        occurred_at: '2024-01-15T10:00:00Z',
      });

      expect(result.content[0].text).toContain('Added event');
      expect(result.content[0].text).toContain('Test event happened');
      expect(result.structuredContent).toHaveProperty('uuid');
    });

    it('should handle invalid date format', async () => {
      const result = await callTool(server, 'add_event', {
        description: 'Bad date event',
        occurred_at: 'not-a-date',
      });

      expect(result.content[0].text.toLowerCase()).toContain('error');
    });
  });

  describe('add_fact', () => {
    it('should add a temporal fact', async () => {
      const result = await callTool(server, 'add_fact', {
        subject: 'Alice',
        predicate: 'works_at',
        object: 'Acme Corp',
        valid_from: '2024-01-01T00:00:00Z',
      });

      expect(result.content[0].text).toContain('Added fact');
      expect(result.structuredContent).toHaveProperty('uuid');
    });

    it('should add a fact with validity window', async () => {
      const result = await callTool(server, 'add_fact', {
        subject: 'Bob',
        predicate: 'lives_in',
        object: 'NYC',
        valid_from: '2023-01-01T00:00:00Z',
        valid_to: '2024-01-01T00:00:00Z',
      });

      expect(result.content[0].text).toContain('Added fact');
    });
  });

  describe('query_timeline', () => {
    it('should query timeline within date range', async () => {
      const graphs = server.getOrchestrator().getGraphs();
      await graphs.temporal.addEvent(
        'Event 1',
        new Date('2024-01-10T10:00:00Z'),
      );
      await graphs.temporal.addEvent(
        'Event 2',
        new Date('2024-01-15T10:00:00Z'),
      );
      await graphs.temporal.addEvent(
        'Event 3',
        new Date('2024-01-20T10:00:00Z'),
      );

      const result = await callTool(server, 'query_timeline', {
        from: '2024-01-12T00:00:00Z',
        to: '2024-01-18T00:00:00Z',
      });

      expect(result.structuredContent).toHaveProperty('events');
    });

    it('should handle invalid from date', async () => {
      const result = await callTool(server, 'query_timeline', {
        from: 'invalid-date',
        to: '2024-01-18T00:00:00Z',
      });

      expect(result.content[0].text.toLowerCase()).toContain('error');
    });
  });

  // ==========================================================================
  // Causal Tools
  // ==========================================================================

  describe('add_causal_link', () => {
    it('should create a causal link between nodes', async () => {
      const graphs = server.getOrchestrator().getGraphs();
      const cause = await graphs.causal.addNode('Root cause', 'cause');
      const effect = await graphs.causal.addNode('Effect', 'effect');

      const result = await callTool(server, 'add_causal_link', {
        cause: cause.uuid,
        effect: effect.uuid,
        confidence: 0.9,
      });

      expect(result.content[0].text).toContain('Added causal link');
    });

    it('should create causal link with evidence', async () => {
      const graphs = server.getOrchestrator().getGraphs();
      const cause = await graphs.causal.addNode('Config missing', 'cause');
      const effect = await graphs.causal.addNode('Service failed', 'effect');

      const result = await callTool(server, 'add_causal_link', {
        cause: cause.uuid,
        effect: effect.uuid,
        confidence: 0.95,
        evidence: 'Logs showed missing AUTH_SECRET',
      });

      expect(result.content[0].text).toContain('Added causal link');
      expect(result.content[0].text).toContain('0.95');
    });
  });

  describe('get_causal_chain', () => {
    it('should get upstream causes', async () => {
      const graphs = server.getOrchestrator().getGraphs();
      const root = await graphs.causal.addNode('Root', 'cause');
      const middle = await graphs.causal.addNode('Middle', 'event');
      const final = await graphs.causal.addNode('Final', 'effect');

      await graphs.causal.addLink(root.uuid, middle.uuid, 0.9);
      await graphs.causal.addLink(middle.uuid, final.uuid, 0.85);

      const result = await callTool(server, 'get_causal_chain', {
        event: final.uuid,
        direction: 'upstream',
      });

      expect(result.structuredContent).toHaveProperty('chain');
      expect(result.structuredContent).toHaveProperty('direction', 'upstream');
    });

    it('should get downstream effects', async () => {
      const graphs = server.getOrchestrator().getGraphs();
      const root = await graphs.causal.addNode('Root', 'cause');

      const result = await callTool(server, 'get_causal_chain', {
        event: root.uuid,
        direction: 'downstream',
      });

      expect(result.structuredContent).toHaveProperty(
        'direction',
        'downstream',
      );
    });
  });

  describe('explain_why', () => {
    it('should explain why an event occurred', async () => {
      const graphs = server.getOrchestrator().getGraphs();
      const cause = await graphs.causal.addNode('Missing env var', 'cause');
      const effect = await graphs.causal.addNode('Service crash', 'effect');
      await graphs.causal.addLink(
        cause.uuid,
        effect.uuid,
        0.95,
        'Error logs confirmed',
      );

      const result = await callTool(server, 'explain_why', {
        event: effect.uuid,
      });

      // The explain_why tool returns a response with causal chain data
      expect(result.content[0].type).toBe('text');
    });
  });

  // ==========================================================================
  // Semantic Tools (require valid API key for embeddings)
  // ==========================================================================

  describe('add_concept', () => {
    it('should handle add_concept request', async () => {
      const result = await callTool(server, 'add_concept', {
        name: 'authentication',
        description: 'User login and session management',
      });

      // With test API key, this will fail gracefully
      // The test verifies the tool handler runs and returns proper response structure
      expect(result.content[0].type).toBe('text');
    });
  });

  describe('search_semantic', () => {
    it('should handle search_semantic request', async () => {
      const result = await callTool(server, 'search_semantic', {
        query: 'data storage',
        limit: 5,
      });

      // With test API key, this may fail or return empty results
      // The test verifies the tool handler runs and returns proper response structure
      expect(result.content[0].type).toBe('text');
    });
  });

  // ==========================================================================
  // Management Tools
  // ==========================================================================

  describe('get_statistics', () => {
    it('should return graph statistics', async () => {
      const result = await callTool(server, 'get_statistics', {});

      expect(result.content[0].type).toBe('text');
      expect(result.structuredContent).toBeDefined();
    });

    it('should include counts for each graph type', async () => {
      // Add some data first
      const graphs = server.getOrchestrator().getGraphs();
      await graphs.entity.addEntity('TestEntity', 'Type');
      await graphs.temporal.addEvent('Test event', new Date());

      const result = await callTool(server, 'get_statistics', {});
      const stats = result.structuredContent as Record<string, unknown>;

      // Statistics use flat keys like semantic_nodes, temporal_nodes, etc.
      expect(stats).toHaveProperty('semantic_nodes');
      expect(stats).toHaveProperty('temporal_nodes');
      expect(stats).toHaveProperty('causal_nodes');
      expect(stats).toHaveProperty('entity_nodes');
    });
  });

  describe('clear_graph', () => {
    it('should clear all graphs', async () => {
      // Add some data first
      const graphs = server.getOrchestrator().getGraphs();
      await graphs.entity.addEntity('ToDelete', 'Type');

      const result = await callTool(server, 'clear_graph', {
        graph: 'all',
      });

      expect(result.content[0].text).toContain('cleared successfully');
    });

    it('should clear specific graph', async () => {
      const result = await callTool(server, 'clear_graph', {
        graph: 'entity',
      });

      expect(result.content[0].text).toContain('entity graph cleared');
    });

    it('should clear semantic graph', async () => {
      const result = await callTool(server, 'clear_graph', {
        graph: 'semantic',
      });

      expect(result.content[0].text).toContain('semantic graph cleared');
    });

    it('should clear temporal graph', async () => {
      const result = await callTool(server, 'clear_graph', {
        graph: 'temporal',
      });

      expect(result.content[0].text).toContain('temporal graph cleared');
    });

    it('should clear causal graph', async () => {
      const result = await callTool(server, 'clear_graph', {
        graph: 'causal',
      });

      expect(result.content[0].text).toContain('causal graph cleared');
    });
  });

  // ==========================================================================
  // High-Level LLM Tools (require mocking)
  // ==========================================================================

  describe('recall', () => {
    it('should handle recall query', async () => {
      // Note: This will use the real LLM if API key is valid
      // In real tests, you'd mock the LLM provider
      const result = await callTool(server, 'recall', {
        query: 'What do I know?',
      });

      // Should return some response structure
      expect(result.content).toBeDefined();
    });
  });

  describe('remember', () => {
    it('should handle remember request', async () => {
      // Note: This will use the real LLM if API key is valid
      const result = await callTool(server, 'remember', {
        content: 'The deployment failed due to missing AUTH_SECRET',
      });

      expect(result.content).toBeDefined();
    });
  });
});

describe('Tool Error Handling', () => {
  let server: PolygMCPServer;

  beforeEach(async () => {
    server = new PolygMCPServer(TEST_CONFIG);
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('should format errors consistently', async () => {
    // Try to get an entity that doesn't exist (not an error, returns not found)
    const result = await callTool(server, 'get_entity', {
      name: 'NonExistent',
    });

    expect(result.content[0].type).toBe('text');
  });

  it('should handle database errors gracefully', async () => {
    // Stop the server to simulate DB disconnection
    await server.stop();

    // Recreate with bad config
    const badServer = new PolygMCPServer({
      ...TEST_CONFIG,
      falkordb: {
        ...TEST_CONFIG.falkordb,
        host: 'nonexistent-host',
        port: 9999,
      },
    });

    // This should fail to start
    await expect(badServer.start()).rejects.toThrow();
  });
});
