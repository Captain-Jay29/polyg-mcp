// MCP Client wrapper for the ReAct agent
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { MCPClientConfig, MCPTool } from './types.js';

export class MCPClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport | null = null;
  private tools: MCPTool[] = [];
  private connected = false;

  constructor(private config: MCPClientConfig) {
    this.client = new Client(
      { name: 'polyg-e2e-agent', version: '1.0.0' },
      { capabilities: {} },
    );
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    const url = new URL('/mcp', this.config.baseUrl);
    this.transport = new StreamableHTTPClientTransport(url);

    await this.client.connect(this.transport);
    this.connected = true;

    // Fetch available tools
    await this.refreshTools();
  }

  /**
   * Reconnect to the server with a fresh session.
   * Useful when the session expires during a long interactive session.
   */
  async reconnect(): Promise<void> {
    // Disconnect if currently connected
    if (this.connected) {
      await this.disconnect();
    }

    // Create a fresh client instance (MCP SDK client can't be reused after disconnect)
    this.client = new Client(
      { name: 'polyg-e2e-agent', version: '1.0.0' },
      { capabilities: {} },
    );

    // Connect with fresh session
    await this.connect();
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    await this.transport?.close();
    this.transport = null;
    this.connected = false;
    this.tools = [];
  }

  async refreshTools(): Promise<void> {
    const result = await this.client.listTools();
    this.tools = result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? '',
      inputSchema: tool.inputSchema as MCPTool['inputSchema'],
    }));
  }

  getTools(): MCPTool[] {
    return this.tools;
  }

  getToolSchemas(): OpenAITool[] {
    return this.tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    autoReconnect = true,
  ): Promise<string> {
    if (!this.connected) {
      throw new Error('MCP client not connected');
    }

    try {
      const result = await this.client.callTool({ name, arguments: args });

      // Extract text content from result
      if (Array.isArray(result.content)) {
        return result.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map((c) => c.text)
          .join('\n');
      }

      return JSON.stringify(result.content);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check for session-related errors
      if (
        autoReconnect &&
        (errorMsg.includes('SESSION_NOT_FOUND') ||
          errorMsg.includes('SESSION_REQUIRED'))
      ) {
        console.log('Session expired, reconnecting...');
        await this.reconnect();
        // Retry the call once after reconnection
        return this.callTool(name, args, false);
      }

      throw error;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// OpenAI tool format for function calling
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}
