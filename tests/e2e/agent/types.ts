// Type definitions for the ReAct agent

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export interface AgentStep {
  type: 'thought' | 'action' | 'observation' | 'answer';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  timestamp: Date;
}

export interface AgentResult {
  answer: string;
  steps: AgentStep[];
  toolsUsed: string[];
  totalSteps: number;
  success: boolean;
}

export interface AgentConfig {
  model: string;
  apiKey: string;
  maxSteps: number;
  verbose: boolean;
  temperature?: number;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPClientConfig {
  baseUrl: string;
  timeout?: number;
}
