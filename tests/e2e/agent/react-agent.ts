// ReAct Agent implementation for e2e testing
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { MCPClient } from './mcp-client.js';
import type {
  AgentConfig,
  AgentResult,
  AgentStep,
  ToolCall,
  ToolResult,
} from './types.js';

function getSystemPrompt(): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const fullDate = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `You are a ReAct agent testing the polyg-mcp memory system with MAGMA-style retrieval.

Current date: ${fullDate} (${dateStr})

Your goal is to answer questions by using the available tools to query the multi-graph memory system.

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

## Tips
- Use entity/concept names from semantic_search results as IDs for expand tools
- For temporal queries, specify date ranges in ISO format (e.g., "2026-01-15T14:00:00Z")
- Think step by step and explain your reasoning before taking actions

Always reason about which tools to use before calling them.`;
}

export class ReActAgent {
  private openai: OpenAI;
  private mcpClient: MCPClient;
  private config: AgentConfig;

  constructor(mcpClient: MCPClient, config: AgentConfig) {
    this.openai = new OpenAI({ apiKey: config.apiKey });
    this.mcpClient = mcpClient;
    this.config = config;
  }

  /**
   * Get the current verbose setting
   */
  getVerbose(): boolean {
    return this.config.verbose;
  }

  /**
   * Set the verbose setting
   */
  setVerbose(verbose: boolean): void {
    this.config.verbose = verbose;
  }

  async run(query: string): Promise<AgentResult> {
    const steps: AgentStep[] = [];
    const toolsUsed = new Set<string>();

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: getSystemPrompt() },
      { role: 'user', content: query },
    ];

    const tools = this.mcpClient.getToolSchemas();

    if (this.config.verbose) {
      console.log('\n🤖 Agent starting...');
      console.log(`📝 Query: ${query}`);
      console.log(
        `🔧 Available tools: ${tools.map((t) => t.function.name).join(', ')}\n`,
      );
    }

    for (let step = 0; step < this.config.maxSteps; step++) {
      if (this.config.verbose) {
        console.log(`\n--- Step ${step + 1} ---`);
      }

      // Get LLM response with potential tool calls
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        // Only pass temperature if explicitly configured (some models don't support it)
        ...(this.config.temperature !== undefined && {
          temperature: this.config.temperature,
        }),
      });

      const message = response.choices[0]?.message;
      if (!message) {
        throw new Error('No response from LLM');
      }

      // Record thought if present
      if (message.content) {
        steps.push({
          type: 'thought',
          content: message.content,
          timestamp: new Date(),
        });

        if (this.config.verbose) {
          console.log(`💭 Thought: ${message.content}`);
        }
      }

      // Check if we have tool calls
      if (!message.tool_calls || message.tool_calls.length === 0) {
        // No tool calls = final answer
        const answer = message.content ?? 'No answer generated';
        steps.push({
          type: 'answer',
          content: answer,
          timestamp: new Date(),
        });

        if (this.config.verbose) {
          // Only show "Final Answer" if we did some tool calls before
          // (otherwise the thought above IS the answer)
          if (toolsUsed.size > 0) {
            console.log(`\n✅ Final Answer: ${answer}`);
          } else {
            console.log('\n✅ (No tools needed)');
          }
        }

        return {
          answer,
          steps,
          toolsUsed: Array.from(toolsUsed),
          totalSteps: step + 1,
          success: true,
        };
      }

      // Process tool calls
      const toolCalls: ToolCall[] = message.tool_calls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      }));

      steps.push({
        type: 'action',
        content: `Calling tools: ${toolCalls.map((t) => t.name).join(', ')}`,
        toolCalls,
        timestamp: new Date(),
      });

      if (this.config.verbose) {
        for (const tc of toolCalls) {
          console.log(`🔧 Action: ${tc.name}(${JSON.stringify(tc.arguments)})`);
        }
      }

      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: message.content,
        tool_calls: message.tool_calls,
      });

      // Execute tool calls
      const toolResults: ToolResult[] = [];
      for (const tc of toolCalls) {
        toolsUsed.add(tc.name);

        try {
          const result = await this.mcpClient.callTool(tc.name, tc.arguments);
          toolResults.push({
            toolCallId: tc.id,
            content: result,
          });

          if (this.config.verbose) {
            const truncated =
              result.length > 200 ? `${result.slice(0, 200)}...` : result;
            console.log(`📊 Observation: ${truncated}`);
          }

          // Add tool result to messages
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

          if (this.config.verbose) {
            console.log(`❌ Error: ${errorMsg}`);
          }

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: `Error: ${errorMsg}`,
          });
        }
      }

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
      toolsUsed: Array.from(toolsUsed),
      totalSteps: this.config.maxSteps,
      success: false,
    };
  }
}
