// Showcase Agent - Narrated wrapper around ReActAgent for stakeholder demos
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { MCPClient } from '../agent/mcp-client.js';
import type {
  AgentConfig,
  AgentResult,
  AgentStep,
  ToolCall,
  ToolResult,
} from '../agent/types.js';
import {
  detectQueryIntent,
  formatCompletionSummary,
  formatQueryAnalysis,
  formatStepExplanation,
  formatStepHeader,
} from './narration/index.js';
import {
  buildCausalTree,
  type GraphStats,
  parseCausalResults,
  parseEntityResults,
  parseTemporalResults,
  renderCausalTree,
  renderCompactDashboard,
  renderDashboard,
  renderEntityTree,
  renderTimeline,
} from './visualization/index.js';

export interface ShowcaseConfig extends AgentConfig {
  narration: 'full' | 'brief' | 'none';
  showDashboard: boolean;
  walkthrough: boolean;
}

export interface ShowcaseResult extends AgentResult {
  sessionStats: {
    questionsAnswered: number;
    totalToolCalls: number;
    insightsGenerated: number;
    sessionDuration: number;
  };
}

interface SessionState {
  questionsAnswered: number;
  totalToolCalls: number;
  uniqueToolsUsed: Set<string>;
  sessionStart: Date;
}

function getShowcaseSystemPrompt(): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const fullDate = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `You are a showcase agent demonstrating the polyg-mcp multi-graph memory system.

Current date: ${fullDate} (${dateStr})

Your goal is to answer questions by using the available tools to query the multi-graph memory system.
Provide clear, comprehensive answers that demonstrate the power of multi-graph retrieval.

## Available Graph Types
- **Semantic Graph**: Stores concepts with embeddings for similarity search (entry point for queries)
- **Entity Graph**: Stores entities (people, services, concepts) and their relationships
- **Temporal Graph**: Stores events and facts with timestamps (use ISO format: YYYY-MM-DDTHH:mm:ssZ)
- **Causal Graph**: Stores cause-effect relationships

## MAGMA Retrieval Flow
Follow this pattern for answering questions:

1. **semantic_search** - Always start here to find relevant concepts via vector similarity
2. **Expand from seeds** - Use the concept/entity names found to expand:
   - **entity_lookup** - For WHO/WHAT questions about entities and relationships
   - **temporal_expand** - For WHEN questions about events in time ranges
   - **causal_expand** - For WHY questions about cause-effect chains
3. **subgraph_merge** - Combine results from multiple graph views (optional)
4. **linearize_context** - Format merged results for synthesis (optional)

## Query Type Hints
- **WHY questions**: semantic_search → causal_expand (deep traversal)
- **WHO/WHAT questions**: semantic_search → entity_lookup (relationship expansion)
- **WHEN questions**: semantic_search → temporal_expand (time-based queries)
- **Complex questions**: Use multiple expand tools and optionally merge results

Always reason about which tools to use before calling them.
Provide detailed answers that showcase the knowledge retrieved from the graphs.`;
}

export class ShowcaseAgent {
  private openai: OpenAI;
  private mcpClient: MCPClient;
  private config: ShowcaseConfig;
  private sessionState: SessionState;

  constructor(mcpClient: MCPClient, config: ShowcaseConfig) {
    this.openai = new OpenAI({ apiKey: config.apiKey });
    this.mcpClient = mcpClient;
    this.config = config;
    this.sessionState = {
      questionsAnswered: 0,
      totalToolCalls: 0,
      uniqueToolsUsed: new Set(),
      sessionStart: new Date(),
    };
  }

  /**
   * Get current graph statistics
   */
  async getStats(): Promise<GraphStats> {
    try {
      const result = await this.mcpClient.callTool('get_statistics', {});
      return JSON.parse(result);
    } catch {
      return {
        semantic_nodes: 0,
        temporal_nodes: 0,
        causal_nodes: 0,
        entity_nodes: 0,
        total_relationships: 0,
      };
    }
  }

  /**
   * Show the current dashboard
   */
  async showDashboard(): Promise<void> {
    const stats = await this.getStats();
    if (this.config.narration === 'brief') {
      console.log(renderCompactDashboard(stats));
    } else {
      console.log(renderDashboard(stats));
    }
  }

  /**
   * Show knowledge accumulation summary
   */
  showAccumulationSummary(): void {
    const elapsed = Math.round(
      (Date.now() - this.sessionState.sessionStart.getTime()) / 1000 / 60,
    );

    console.log(`
  KNOWLEDGE ACCUMULATED                              Session: ${elapsed} min
  ${'═'.repeat(67)}

  QUESTIONS: ${this.sessionState.questionsAnswered}    TOOL CALLS: ${this.sessionState.totalToolCalls}    UNIQUE TOOLS: ${this.sessionState.uniqueToolsUsed.size}

  Tools used: ${[...this.sessionState.uniqueToolsUsed].join(', ') || 'none yet'}
`);
  }

  /**
   * Run a query with narration and visualization
   */
  async run(query: string): Promise<ShowcaseResult> {
    const startTime = new Date();
    const steps: AgentStep[] = [];
    const toolsUsed = new Set<string>();
    let stepNumber = 0;

    // Show query analysis in full narration mode
    if (this.config.narration === 'full') {
      const intent = detectQueryIntent(query);
      console.log(formatQueryAnalysis(query, intent));
    }

    // Show initial dashboard if enabled
    if (this.config.showDashboard && this.config.narration !== 'none') {
      await this.showDashboard();
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: getShowcaseSystemPrompt() },
      { role: 'user', content: query },
    ];

    const tools = this.mcpClient.getToolSchemas();

    for (let step = 0; step < this.config.maxSteps; step++) {
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        ...(this.config.temperature !== undefined && {
          temperature: this.config.temperature,
        }),
      });

      const message = response.choices[0]?.message;
      if (!message) {
        throw new Error('No response from LLM');
      }

      // Record thought
      if (message.content) {
        steps.push({
          type: 'thought',
          content: message.content,
          timestamp: new Date(),
        });

        if (this.config.verbose) {
          console.log(`\n  💭 ${message.content}\n`);
        }
      }

      // Check for tool calls
      if (!message.tool_calls || message.tool_calls.length === 0) {
        const answer = message.content ?? 'No answer generated';
        steps.push({
          type: 'answer',
          content: answer,
          timestamp: new Date(),
        });

        // Show completion summary
        if (this.config.narration !== 'none') {
          console.log(
            formatCompletionSummary([...toolsUsed], step + 1, startTime),
          );
          console.log(`  ${answer}\n`);
        }

        // Update session state
        this.sessionState.questionsAnswered++;
        this.sessionState.totalToolCalls += toolsUsed.size;
        for (const tool of toolsUsed) {
          this.sessionState.uniqueToolsUsed.add(tool);
        }

        return {
          answer,
          steps,
          toolsUsed: [...toolsUsed],
          totalSteps: step + 1,
          success: true,
          sessionStats: {
            questionsAnswered: this.sessionState.questionsAnswered,
            totalToolCalls: this.sessionState.totalToolCalls,
            insightsGenerated: this.sessionState.questionsAnswered,
            sessionDuration: Math.round(
              (Date.now() - this.sessionState.sessionStart.getTime()) / 1000,
            ),
          },
        };
      }

      // Process tool calls with narration
      // Filter to function-type tool calls (OpenAI SDK union type includes custom tool calls)
      const functionToolCalls = message.tool_calls.filter(
        (tc): tc is Extract<typeof tc, { type: 'function' }> =>
          tc.type === 'function',
      );
      const toolCalls: ToolCall[] = functionToolCalls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      }));

      messages.push({
        role: 'assistant',
        content: message.content,
        tool_calls: message.tool_calls,
      });

      const toolResults: ToolResult[] = [];

      for (const tc of toolCalls) {
        stepNumber++;
        toolsUsed.add(tc.name);

        // Show step narration
        if (this.config.narration !== 'none') {
          console.log(formatStepHeader(stepNumber, tc.name));
          console.log(
            formatStepExplanation(tc.name, tc.arguments, this.config.verbose),
          );
        }

        try {
          const result = await this.mcpClient.callTool(tc.name, tc.arguments);
          toolResults.push({ toolCallId: tc.id, content: result });

          // Show visualization based on tool type
          if (this.config.narration !== 'none') {
            this.visualizeToolResult(tc.name, result);
          }

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result,
          });
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          toolResults.push({
            toolCallId: tc.id,
            content: `Error: ${errorMsg}`,
            isError: true,
          });

          if (this.config.narration !== 'none') {
            console.log(`\n  ❌ Error: ${errorMsg}\n`);
          }

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: `Error: ${errorMsg}`,
          });
        }

        // Pause in walkthrough mode
        if (this.config.walkthrough && this.config.narration !== 'none') {
          await this.waitForContinue();
        }
      }

      steps.push({
        type: 'action',
        content: `Calling tools: ${toolCalls.map((t) => t.name).join(', ')}`,
        toolCalls,
        timestamp: new Date(),
      });

      steps.push({
        type: 'observation',
        content: toolResults.map((r) => r.content).join('\n'),
        toolResults,
        timestamp: new Date(),
      });
    }

    // Max steps reached
    const answer = 'Maximum steps reached without finding an answer';
    steps.push({
      type: 'answer',
      content: answer,
      timestamp: new Date(),
    });

    return {
      answer,
      steps,
      toolsUsed: [...toolsUsed],
      totalSteps: this.config.maxSteps,
      success: false,
      sessionStats: {
        questionsAnswered: this.sessionState.questionsAnswered,
        totalToolCalls: this.sessionState.totalToolCalls,
        insightsGenerated: this.sessionState.questionsAnswered,
        sessionDuration: Math.round(
          (Date.now() - this.sessionState.sessionStart.getTime()) / 1000,
        ),
      },
    };
  }

  /**
   * Visualize tool result based on tool type
   */
  private visualizeToolResult(toolName: string, result: string): void {
    try {
      const parsed = JSON.parse(result);

      switch (toolName) {
        case 'temporal_expand': {
          const events = parseTemporalResults(parsed.events || parsed);
          if (events.length > 0) {
            console.log(renderTimeline(events));
          } else {
            console.log(`\n    Found: ${this.summarizeResult(parsed)}\n`);
          }
          break;
        }

        case 'causal_expand': {
          const links = parseCausalResults(parsed.links || parsed);
          if (links.length > 0) {
            const tree = buildCausalTree(links);
            console.log(renderCausalTree(tree));
          } else {
            console.log(`\n    Found: ${this.summarizeResult(parsed)}\n`);
          }
          break;
        }

        case 'entity_lookup': {
          const entities = parseEntityResults(parsed.entities || parsed);
          if (entities.length > 0) {
            console.log(renderEntityTree(entities));
          } else {
            console.log(`\n    Found: ${this.summarizeResult(parsed)}\n`);
          }
          break;
        }

        case 'semantic_search': {
          const concepts = parsed.results || parsed.concepts || parsed;
          const count = Array.isArray(concepts) ? concepts.length : 1;
          console.log(`\n    Found: ${count} concept(s)\n`);
          break;
        }

        case 'get_statistics': {
          console.log(renderDashboard(parsed));
          break;
        }

        default: {
          console.log(`\n    Result: ${this.summarizeResult(parsed)}\n`);
        }
      }
    } catch {
      // Non-JSON result
      const truncated =
        result.length > 100 ? result.slice(0, 100) + '...' : result;
      console.log(`\n    Result: ${truncated}\n`);
    }
  }

  /**
   * Summarize a parsed result for display
   */
  private summarizeResult(parsed: unknown): string {
    if (Array.isArray(parsed)) {
      return `${parsed.length} item(s)`;
    }
    if (typeof parsed === 'object' && parsed !== null) {
      const keys = Object.keys(parsed);
      return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}}`;
    }
    return String(parsed).slice(0, 50);
  }

  /**
   * Wait for user to press enter (walkthrough mode)
   */
  private waitForContinue(): Promise<void> {
    return new Promise((resolve) => {
      console.log('\n  Press ENTER to continue...');
      process.stdin.once('data', () => resolve());
    });
  }
}
