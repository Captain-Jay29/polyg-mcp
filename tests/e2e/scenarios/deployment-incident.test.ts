// E2E tests for the deployment incident scenario
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MCPClient } from '../agent/mcp-client.js';
import { ReActAgent } from '../agent/react-agent.js';
import type { AgentConfig } from '../agent/types.js';
import {
  seedDeploymentIncident,
  TEST_QUERIES,
} from '../datasets/deployment-incident.js';

// Skip if no API key or server not running
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SERVER_URL = process.env.POLYG_SERVER_URL ?? 'http://localhost:3000';

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

      // Initialize agent
      const config: AgentConfig = {
        model: process.env.POLYG_AGENT_MODEL ?? 'gpt-4o-mini',
        apiKey: OPENAI_API_KEY!,
        maxSteps: 10,
        verbose: process.env.VERBOSE === 'true',
      };

      agent = new ReActAgent(mcpClient, config);
    });

    afterAll(async () => {
      // Clear test data
      try {
        await mcpClient.callTool('clear_graph', { graphs: ['all'] });
      } catch {
        // Ignore cleanup errors
      }
      await mcpClient.disconnect();
    });

    it('should connect to MCP server and discover tools', () => {
      const tools = mcpClient.getTools();
      expect(tools.length).toBeGreaterThan(0);

      // Check for expected tools
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('recall');
      expect(toolNames).toContain('remember');
      expect(toolNames).toContain('get_entity');
      expect(toolNames).toContain('query_timeline');
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

        // Should use causal graph tools
        const usedCausalTools = result.toolsUsed.some(
          (t) =>
            t.includes('causal') ||
            t.includes('explain') ||
            t === 'recall',
        );
        expect(usedCausalTools).toBe(true);
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

        // Should use timeline tools
        expect(
          result.toolsUsed.some(
            (t) => t.includes('timeline') || t === 'recall',
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
        const result = await agent.run(
          'What services depend on auth-service?',
        );

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
