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
  type GraphStats,
  renderCompactDashboard,
  renderDashboard,
  createSessionFindings,
  type SessionFindings,
  renderStepResult,
  renderSessionSummary,
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
  findings: SessionFindings;
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

  return `You are a showcase agent for the polyg-mcp multi-graph memory system.

Current date: ${fullDate} (${dateStr})

## The Four Graphs
The memory system stores knowledge across four specialized graphs:

1. **Semantic** - Concepts with descriptions. Use \`semantic_search\` to find relevant topics by meaning.
2. **Entity** - Things (people, services, systems) and relationships. Use \`entity_lookup\` to explore connections.
3. **Temporal** - Events with timestamps. Use \`temporal_expand\` to query time ranges (ISO format).
4. **Causal** - Cause→effect chains. Use \`causal_expand\` to trace why things happened.

## How to Answer Questions
Match the question type to the right graph:

- **WHY/CAUSE** → \`causal_expand\` (trace cause-effect chains)
- **WHEN/TIMELINE** → \`temporal_expand\` with time range (don't need semantic_search first)
- **WHO/WHAT** → \`entity_lookup\` (find people, services, relationships)
- **General/exploratory** → \`semantic_search\` first, then expand with the above tools

For complex questions, combine multiple tools. Use \`semantic_search\` when you need to discover relevant concepts, but skip it when the question already specifies what to look up (e.g., a time range or entity name).

## Important
- **Search first, ask later**: Always try to find answers in the graphs before asking for clarification.
- If a query mentions a time range, use \`temporal_expand\` directly (assume UTC if no timezone given).
- If a query is vague (like "the incident"), search for relevant concepts first - there's likely only one match.
- Provide detailed answers with evidence from the graphs.`;
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
      findings: createSessionFindings(),
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
            this.visualizeToolResult(tc.name, tc.arguments, result);
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
  private visualizeToolResult(
    toolName: string,
    args: Record<string, unknown>,
    result: string,
  ): void {
    try {
      const parsed = JSON.parse(result);

      // Use rich step output for main graph tools
      if (
        [
          'semantic_search',
          'entity_lookup',
          'temporal_expand',
          'causal_expand',
        ].includes(toolName)
      ) {
        console.log(
          renderStepResult(
            toolName,
            args,
            parsed,
            this.sessionState.findings,
          ),
        );
        return;
      }

      // Special handling for get_statistics
      if (toolName === 'get_statistics') {
        console.log(`\n    Graph stats retrieved.\n`);
        return;
      }

      // Default: show summary
      console.log(`\n    Result: ${this.summarizeResult(parsed)}\n`);
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
   * Render the session summary
   */
  renderSessionSummary(): void {
    const duration = Math.round(
      (Date.now() - this.sessionState.sessionStart.getTime()) / 1000,
    );
    this.sessionState.findings.queriesAnswered =
      this.sessionState.questionsAnswered;
    console.log(renderSessionSummary(this.sessionState.findings, duration));
  }

  /**
   * Wait for user to press enter (walkthrough mode)
   */
  private waitForContinue(): Promise<void> {
    return new Promise((resolve) => {
      console.log('\n  Press ENTER to continue...');
      // Ensure stdin is in the right mode
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.resume();
      process.stdin.once('data', () => {
        resolve();
      });
    });
  }
}
