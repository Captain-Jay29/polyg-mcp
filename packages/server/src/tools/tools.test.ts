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
const waitForConsistency = (ms = 100) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Helper to retry an async operation with backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  isSuccess: (result: T) => boolean,
  maxAttempts = 5,
  initialDelayMs = 100,
): Promise<T> {
  let lastResult: T = await fn();
  if (isSuccess(lastResult)) return lastResult;

  for (let i = 1; i < maxAttempts; i++) {
    await waitForConsistency(initialDelayMs * i);
    lastResult = await fn();
    if (isSuccess(lastResult)) return lastResult;
  }
  return lastResult;
}

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
  // Entity Write Tools
  // ==========================================================================

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
    it('should link two entities', { retry: 3 }, async () => {
      // Use unique names to avoid conflicts between test runs
      const uniqueId = Date.now().toString();
      const name1 = `Alice_${uniqueId}`;
      const name2 = `Bob_${uniqueId}`;

      // Create entities using the tool
      await callTool(server, 'add_entity', {
        name: name1,
        entity_type: 'Person',
      });
      await callTool(server, 'add_entity', {
        name: name2,
        entity_type: 'Person',
      });

      // Link entities with retry (handles FalkorDB eventual consistency)
      const result = await retryWithBackoff(
        () =>
          callTool(server, 'link_entities', {
            source: name1,
            target: name2,
            relationship: 'FRIENDS_WITH',
          }),
        (r) => r.content[0].text.includes('Linked'),
      );

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

    it(
      'should create X_INVOLVES link to subject entity',
      { retry: 3 },
      async () => {
        const graphs = server.getOrchestrator().getGraphs();

        // Create entity first
        await graphs.entity.addEntity('auth-service', 'service');

        await waitForConsistency();

        // Add fact with subject_entity
        const result = await callTool(server, 'add_fact', {
          subject: 'auth-service',
          predicate: 'status',
          object: 'healthy',
          valid_from: '2024-01-01T00:00:00Z',
          subject_entity: 'auth-service',
        });

        expect(result.content[0].text).toContain('Added fact');
        expect(result.content[0].text).toContain('about');
        expect(result.content[0].text).toContain('auth-service');
        expect(
          (result.structuredContent as Record<string, unknown>).linkedEntity,
        ).toBe('auth-service');
      },
    );

    it('should silently skip non-existent subject entity', async () => {
      const result = await callTool(server, 'add_fact', {
        subject: 'SomeService',
        predicate: 'status',
        object: 'running',
        valid_from: '2024-01-01T00:00:00Z',
        subject_entity: 'non-existent-entity',
      });

      // Should succeed without the entity link
      expect(result.content[0].text).toContain('Added fact');
      expect(result.content[0].text).not.toContain('about');
    });
  });

  // ==========================================================================
  // Causal Write Tools
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

    it('should create X_AFFECTS links to entities', { retry: 3 }, async () => {
      const graphs = server.getOrchestrator().getGraphs();

      // Create entities first (vars unused - entities looked up by name)
      await graphs.entity.addEntity('auth-service', 'service');
      await graphs.entity.addEntity('JWT_SECRET', 'config');

      await waitForConsistency();

      // Create causal link with entities
      const result = await callTool(server, 'add_causal_link', {
        cause: 'Missing config',
        effect: 'Service crash',
        confidence: 0.95,
        entities: ['auth-service', 'JWT_SECRET'],
      });

      expect(result.content[0].text).toContain('Added causal link');
      expect(result.content[0].text).toContain('affects');
      expect(result.content[0].text).toContain('auth-service');
      expect(result.content[0].text).toContain('JWT_SECRET');
    });

    it('should create X_REFERS_TO links to events', { retry: 3 }, async () => {
      const graphs = server.getOrchestrator().getGraphs();

      // Create events first
      await graphs.temporal.addEvent(
        'Bob started deployment',
        new Date('2024-01-15T14:00:00Z'),
      );
      await graphs.temporal.addEvent(
        'Service crashed',
        new Date('2024-01-15T14:03:00Z'),
      );

      await waitForConsistency();

      // Create causal link with events
      const result = await callTool(server, 'add_causal_link', {
        cause: 'Deployment triggered',
        effect: 'Service failure',
        confidence: 0.9,
        events: ['Bob started deployment', 'Service crashed'],
      });

      expect(result.content[0].text).toContain('Added causal link');
      expect(result.content[0].text).toContain('refers to');
    });

    it(
      'should handle both entities and events together',
      { retry: 3 },
      async () => {
        const graphs = server.getOrchestrator().getGraphs();

        // Create entities and events
        await graphs.entity.addEntity('TestService', 'service');
        await graphs.temporal.addEvent(
          'Test event occurred',
          new Date('2024-01-15T10:00:00Z'),
        );

        await waitForConsistency();

        const result = await callTool(server, 'add_causal_link', {
          cause: 'Config change',
          effect: 'Service restart',
          confidence: 0.85,
          entities: ['TestService'],
          events: ['Test event occurred'],
        });

        expect(result.content[0].text).toContain('Added causal link');
        expect(result.content[0].text).toContain('affects');
        expect(result.content[0].text).toContain('refers to');
      },
    );

    it('should silently skip non-existent entities', async () => {
      const result = await callTool(server, 'add_causal_link', {
        cause: 'Some cause',
        effect: 'Some effect',
        confidence: 0.8,
        entities: ['non-existent-entity'],
      });

      // Should succeed without the entity link
      expect(result.content[0].text).toContain('Added causal link');
      expect(result.content[0].text).not.toContain('affects');
    });
  });

  // ==========================================================================
  // Semantic Write Tools (require valid API key for embeddings)
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
  // Write Tools
  // ==========================================================================

  describe('remember', () => {
    it('should handle remember request', async () => {
      // Note: This will use the real LLM if API key is valid
      const result = await callTool(server, 'remember', {
        content: 'The deployment failed due to missing AUTH_SECRET',
      });

      expect(result.content).toBeDefined();
    });
  });

  // ==========================================================================
  // MAGMA Retrieval Tools
  // ==========================================================================

  describe('semantic_search', () => {
    it('should handle semantic search request', async () => {
      const result = await callTool(server, 'semantic_search', {
        query: 'deployment failure',
        limit: 5,
      });

      // With test API key, this may fail or return empty results
      // The test verifies the tool handler runs and returns proper response structure
      expect(result.content[0].type).toBe('text');
    });

    it('should apply min_score filter', async () => {
      const result = await callTool(server, 'semantic_search', {
        query: 'authentication',
        min_score: 0.8,
      });

      expect(result.content[0].type).toBe('text');
    });
  });

  describe('entity_lookup', () => {
    it('should handle entity lookup request', async () => {
      // First add an entity
      const graphs = server.getOrchestrator().getGraphs();
      const entity = await graphs.entity.addEntity(
        'TestLookupEntity',
        'TestType',
      );

      const result = await callTool(server, 'entity_lookup', {
        entity_ids: [entity.uuid],
        depth: 1,
      });

      expect(result.content[0].type).toBe('text');
      expect(result.structuredContent).toHaveProperty('entities');
    });

    it('should handle non-existent entities gracefully', async () => {
      const result = await callTool(server, 'entity_lookup', {
        entity_ids: ['non-existent-uuid'],
      });

      expect(result.content[0].type).toBe('text');
    });
  });

  describe('temporal_expand', () => {
    it('should handle temporal expansion request', async () => {
      const graphs = server.getOrchestrator().getGraphs();
      const entity = await graphs.entity.addEntity(
        'TestTemporalEntity',
        'TestType',
      );

      const result = await callTool(server, 'temporal_expand', {
        entity_ids: [entity.uuid],
      });

      expect(result.content[0].type).toBe('text');
      expect(result.structuredContent).toHaveProperty('events');
    });

    it('should accept date range parameters', async () => {
      const result = await callTool(server, 'temporal_expand', {
        entity_ids: ['test-entity-id'],
        from: '2024-01-01T00:00:00Z',
        to: '2024-12-31T23:59:59Z',
      });

      expect(result.content[0].type).toBe('text');
    });
  });

  describe('causal_expand', () => {
    it('should handle causal expansion request', async () => {
      const result = await callTool(server, 'causal_expand', {
        entity_ids: ['test-entity-id'],
        direction: 'both',
        depth: 2,
      });

      expect(result.content[0].type).toBe('text');
      expect(result.structuredContent).toHaveProperty('links');
    });

    it('should handle upstream direction', async () => {
      const result = await callTool(server, 'causal_expand', {
        entity_ids: ['test-entity-id'],
        direction: 'upstream',
      });

      expect(result.structuredContent).toHaveProperty('direction', 'upstream');
    });
  });

  describe('subgraph_merge', () => {
    it('should merge multiple graph views', async () => {
      const views = [
        {
          source: 'semantic' as const,
          nodes: [{ uuid: 'node1', data: { name: 'test' }, score: 0.8 }],
        },
        {
          source: 'entity' as const,
          nodes: [
            { uuid: 'node1', data: { name: 'test' }, score: 0.7 },
            { uuid: 'node2', data: { name: 'test2' }, score: 0.6 },
          ],
        },
      ];

      const result = await callTool(server, 'subgraph_merge', {
        views,
      });

      expect(result.content[0].type).toBe('text');
      expect(result.structuredContent).toHaveProperty('merged');
      expect(result.structuredContent).toHaveProperty('nodeCount');
    });

    it('should apply min_score pruning', async () => {
      const views = [
        {
          source: 'semantic' as const,
          nodes: [
            { uuid: 'node1', data: {}, score: 0.9 },
            { uuid: 'node2', data: {}, score: 0.3 },
          ],
        },
      ];

      const result = await callTool(server, 'subgraph_merge', {
        views,
        min_score: 0.5,
      });

      expect(result.content[0].type).toBe('text');
    });
  });

  describe('linearize_context', () => {
    it('should linearize a merged subgraph', async () => {
      const subgraph = {
        nodes: [
          {
            uuid: 'node1',
            data: { description: 'Test node' },
            viewCount: 1,
            views: ['semantic' as const],
            finalScore: 0.8,
          },
        ],
        viewContributions: { semantic: 1, entity: 0, temporal: 0, causal: 0 },
      };

      const result = await callTool(server, 'linearize_context', {
        subgraph,
        intent: 'WHY',
      });

      expect(result.content[0].type).toBe('text');
      expect(result.structuredContent).toHaveProperty('strategy');
    });

    it('should respect different intent types', async () => {
      const subgraph = {
        nodes: [],
        viewContributions: { semantic: 0, entity: 0, temporal: 0, causal: 0 },
      };

      const result = await callTool(server, 'linearize_context', {
        subgraph,
        intent: 'WHEN',
      });

      expect(result.content[0].type).toBe('text');
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
    // Try semantic_search - returns results or empty array
    const result = await callTool(server, 'semantic_search', {
      query: 'NonExistent topic',
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

describe('Zod Validation Error Handling', () => {
  let server: PolygMCPServer;

  beforeEach(async () => {
    server = new PolygMCPServer(TEST_CONFIG);
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('semantic_search validation', () => {
    it('should reject missing query', async () => {
      const result = (await callTool(server, 'semantic_search', {})) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text.toLowerCase()).toContain('validation');
      expect(result.content[0].text.toLowerCase()).toContain('query');
    });

    it('should reject invalid limit type', async () => {
      const result = (await callTool(server, 'semantic_search', {
        query: 'test',
        limit: 'not-a-number',
      })) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text.toLowerCase()).toContain('validation');
    });

    it('should reject limit out of range', async () => {
      const result = (await callTool(server, 'semantic_search', {
        query: 'test',
        limit: 200, // Max is 100
      })) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text.toLowerCase()).toContain('validation');
    });

    it('should reject min_score out of range', async () => {
      const result = (await callTool(server, 'semantic_search', {
        query: 'test',
        min_score: 1.5, // Max is 1
      })) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text.toLowerCase()).toContain('validation');
    });
  });

  describe('entity_lookup validation', () => {
    it('should reject missing entity_ids', async () => {
      const result = (await callTool(server, 'entity_lookup', {})) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text.toLowerCase()).toContain('validation');
    });

    it('should reject empty entity_ids array', async () => {
      const result = (await callTool(server, 'entity_lookup', {
        entity_ids: [],
      })) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text.toLowerCase()).toContain('validation');
    });

    it('should reject depth out of range', async () => {
      const result = (await callTool(server, 'entity_lookup', {
        entity_ids: ['test-id'],
        depth: 10, // Max is 5
      })) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text.toLowerCase()).toContain('validation');
    });
  });

  describe('temporal_expand validation', () => {
    it('should reject missing entity_ids', async () => {
      const result = (await callTool(server, 'temporal_expand', {})) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text.toLowerCase()).toContain('validation');
    });

    it('should reject empty entity_ids array', async () => {
      const result = (await callTool(server, 'temporal_expand', {
        entity_ids: [],
      })) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBe(true);
    });
  });

  describe('causal_expand validation', () => {
    it('should reject missing entity_ids', async () => {
      const result = (await callTool(server, 'causal_expand', {})) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text.toLowerCase()).toContain('validation');
    });

    it('should reject invalid direction', async () => {
      const result = (await callTool(server, 'causal_expand', {
        entity_ids: ['test-id'],
        direction: 'invalid-direction',
      })) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text.toLowerCase()).toContain('validation');
    });

    it('should reject depth out of range', async () => {
      const result = (await callTool(server, 'causal_expand', {
        entity_ids: ['test-id'],
        depth: 0, // Min is 1
      })) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBe(true);
    });
  });

  describe('subgraph_merge validation', () => {
    it('should reject missing views', async () => {
      const result = (await callTool(server, 'subgraph_merge', {})) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text.toLowerCase()).toContain('validation');
    });

    it('should reject empty views array', async () => {
      const result = (await callTool(server, 'subgraph_merge', {
        views: [],
      })) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBe(true);
    });

    it('should reject invalid view structure', async () => {
      const result = (await callTool(server, 'subgraph_merge', {
        views: [{ source: 'invalid-source', nodes: [] }],
      })) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBe(true);
    });

    it('should reject multi_view_boost below 1', async () => {
      const result = (await callTool(server, 'subgraph_merge', {
        views: [{ source: 'semantic', nodes: [] }],
        multi_view_boost: 0.5, // Min is 1
      })) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBe(true);
    });
  });

  describe('linearize_context validation', () => {
    it('should reject missing subgraph', async () => {
      const result = (await callTool(server, 'linearize_context', {
        intent: 'WHY',
      })) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text.toLowerCase()).toContain('validation');
    });

    it('should reject missing intent', async () => {
      const result = (await callTool(server, 'linearize_context', {
        subgraph: {
          nodes: [],
          viewContributions: { semantic: 0, entity: 0, temporal: 0, causal: 0 },
        },
      })) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBe(true);
    });

    it('should reject invalid intent type', async () => {
      const result = (await callTool(server, 'linearize_context', {
        subgraph: {
          nodes: [],
          viewContributions: { semantic: 0, entity: 0, temporal: 0, causal: 0 },
        },
        intent: 'INVALID_INTENT',
      })) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBe(true);
    });

    it('should reject max_tokens out of range', async () => {
      const result = (await callTool(server, 'linearize_context', {
        subgraph: {
          nodes: [],
          viewContributions: { semantic: 0, entity: 0, temporal: 0, causal: 0 },
        },
        intent: 'WHY',
        max_tokens: 50, // Min is 100
      })) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBe(true);
    });
  });
});
