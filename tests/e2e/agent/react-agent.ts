// ReAct Agent implementation for e2e testing
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { MCPClient, type OpenAITool } from './mcp-client.js';
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

  return `You are a ReAct agent testing the polyg-mcp memory system.

Current date: ${fullDate} (${dateStr})

Your goal is to answer questions by using the available tools to query and store information in the multi-graph memory system.

Available graph types:
- Entity Graph: Stores entities (people, services, concepts) and their relationships
- Temporal Graph: Stores events and facts with timestamps (use ISO format: YYYY-MM-DDTHH:mm:ssZ)
- Causal Graph: Stores cause-effect relationships
- Semantic Graph: Stores concepts with embeddings for similarity search

When answering questions:
1. Think about which graph(s) would have the relevant information
2. Use appropriate tools to query the graphs
3. For temporal queries, use date ranges that make sense (e.g., if asked about "recent" events, query the last few days/weeks)
4. Synthesize the results into a clear answer

Always think step by step and explain your reasoning before taking actions.`;
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
      console.log(`🔧 Available tools: ${tools.map((t) => t.function.name).join(', ')}\n`);
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
        temperature: this.config.temperature ?? 0.1,
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
