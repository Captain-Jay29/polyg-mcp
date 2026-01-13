// MCP Server setup
import type { PolygConfig } from '@polyg-mcp/shared';

export class PolygMCPServer {
  constructor(private config: PolygConfig) {}

  async start(): Promise<void> {
    // TODO: Initialize MCP server with tools
    throw new Error('Not implemented');
  }

  async stop(): Promise<void> {
    // TODO: Graceful shutdown
    throw new Error('Not implemented');
  }

  registerTools(): void {
    // TODO: Register all MCP tools
    throw new Error('Not implemented');
  }
}
