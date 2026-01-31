// E2E tests for the deployment incident scenario
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MCPClient } from '../agent/mcp-client.js';
import { ReActAgent } from '../agent/react-agent.js';
import type { AgentConfig } from '../agent/types.js';
import {
  seedDeploymentIncident,
  TEST_QUERIES,
} from '../datasets/deployment-incident.js';

// Skip if no API key available
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SERVER_URL = process.env.POLYG_SERVER_URL ?? 'http://localhost:4000';

// E2E tests for MAGMA retrieval pipeline
// Requires: OPENAI_API_KEY env var and running polyg-mcp server
describe.skipIf(!OPENAI_API_KEY)(
  'Deployment Incident E2E Tests',
  { timeout: 120000 },
  () => {
    let mcpClient: MCPClient;
    let agent: ReActAgent;

    beforeAll(async () => {
      // Connect to MCP server
      mcpClient = new MCPClient({ baseUrl: SERVER_URL });
      await mcpClient.connect();

      // Seed test data
      await seedDeploymentIncident(mcpClient);

      // Initialize agent (OPENAI_API_KEY is guaranteed by describe.skipIf)
      if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required');
      }
      const config: AgentConfig = {
        model: process.env.POLYG_AGENT_MODEL ?? process.env.LLM_MODEL ?? 'gpt-4o-mini',
        apiKey: OPENAI_API_KEY,
        maxSteps: 10,
        verbose: process.env.VERBOSE === 'true',
      };

      agent = new ReActAgent(mcpClient, config);
    });

    afterAll(async () => {
      // Clear test data
      try {
        await mcpClient.callTool('clear_graph', { graph: 'all' });
      } catch {
        // Ignore cleanup errors
      }
      await mcpClient.disconnect();
    });

    it('should connect to MCP server and discover all 15 tools', () => {
      const tools = mcpClient.getTools();
      const toolNames = tools.map((t) => t.name);

      // Management tools (2)
      expect(toolNames).toContain('get_statistics');
      expect(toolNames).toContain('clear_graph');

      // Write tools (7)
      expect(toolNames).toContain('remember');
      expect(toolNames).toContain('add_entity');
      expect(toolNames).toContain('link_entities');
      expect(toolNames).toContain('add_event');
      expect(toolNames).toContain('add_fact');
      expect(toolNames).toContain('add_causal_link');
      expect(toolNames).toContain('add_concept');

      // MAGMA retrieval tools (6)
      expect(toolNames).toContain('semantic_search');
      expect(toolNames).toContain('entity_lookup');
      expect(toolNames).toContain('temporal_expand');
      expect(toolNames).toContain('causal_expand');
      expect(toolNames).toContain('subgraph_merge');
      expect(toolNames).toContain('linearize_context');

      // Total should be 15
      expect(tools.length).toBe(15);
    });

    describe('Causal Reasoning', () => {
      it('should identify root cause of auth service failure', async () => {
        const result = await agent.run(
          'What was the root cause of the auth service failure?',
        );

        expect(result.success).toBe(true);

        // Should mention the missing env var
        const answer = result.answer.toLowerCase();
        expect(
          answer.includes('jwt_secret') ||
            answer.includes('environment variable') ||
            answer.includes('missing'),
        ).toBe(true);

        // Should use MAGMA retrieval tools (semantic, causal, etc.)
        const usedMAGMATools = result.toolsUsed.some(
          (t) =>
            t.includes('causal') ||
            t.includes('semantic') ||
            t.includes('entity') ||
            t.includes('temporal'),
        );
        expect(usedMAGMATools).toBe(true);
      });

      it('should trace cascading failures', async () => {
        const result = await agent.run(
          'Why did the user dashboard become unresponsive?',
        );

        expect(result.success).toBe(true);

        // Should trace the cascade
        const answer = result.answer.toLowerCase();
        expect(
          answer.includes('auth') ||
            answer.includes('api-gateway') ||
            answer.includes('cascade'),
        ).toBe(true);
      });
    });

    describe('Temporal Reasoning', () => {
      it('should query timeline for events in time range', async () => {
        const result = await agent.run(
          'What events occurred between 14:00 and 14:30 on January 15th 2026?',
        );

        expect(result.success).toBe(true);

        // Should use temporal or semantic search tools
        expect(
          result.toolsUsed.some(
            (t) => t.includes('temporal') || t.includes('semantic'),
          ),
        ).toBe(true);

        // Should mention key events
        const answer = result.answer.toLowerCase();
        expect(
          answer.includes('deployment') ||
            answer.includes('crash') ||
            answer.includes('auth'),
        ).toBe(true);
      });
    });

    describe('Entity Relationships', () => {
      it('should find service dependencies', async () => {
        const result = await agent.run('What services depend on auth-service?');

        expect(result.success).toBe(true);

        // Should mention api-gateway
        const answer = result.answer.toLowerCase();
        expect(
          answer.includes('api-gateway') || answer.includes('gateway'),
        ).toBe(true);
      });

      it('should identify people involved in incident', async () => {
        const result = await agent.run(
          'Who was involved in resolving the incident?',
        );

        expect(result.success).toBe(true);

        // Should mention alice (who fixed it)
        const answer = result.answer.toLowerCase();
        expect(answer.includes('alice') || answer.includes('bob')).toBe(true);
      });
    });

    describe('Multi-Graph Queries', () => {
      it('should synthesize information from multiple graphs', async () => {
        const result = await agent.run(
          'Give me a complete timeline of the incident including who did what and why things failed',
        );

        expect(result.success).toBe(true);

        // Should use multiple tool types
        expect(result.toolsUsed.length).toBeGreaterThan(1);

        // Answer should be comprehensive
        const answer = result.answer.toLowerCase();
        expect(answer.length).toBeGreaterThan(100);
      });
    });

    // Run parameterized tests from TEST_QUERIES
    describe('Predefined Test Queries', () => {
      for (const testCase of TEST_QUERIES) {
        it(`should answer: "${testCase.query}"`, async () => {
          const result = await agent.run(testCase.query);

          expect(result.success).toBe(true);

          // Check expected content in answer
          const answer = result.answer.toLowerCase();
          const hasExpectedContent = testCase.expectedInAnswer.some((term) =>
            answer.includes(term.toLowerCase()),
          );

          if (!hasExpectedContent) {
            console.log('Answer:', result.answer);
            console.log('Expected terms:', testCase.expectedInAnswer);
          }

          expect(hasExpectedContent).toBe(true);
        });
      }
    });
  },
);
