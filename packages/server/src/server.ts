// MCP Server setup
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FalkorDBAdapter } from '@polyg-mcp/core';
import type { PolygConfig, StorageStatistics } from '@polyg-mcp/shared';
import { z } from 'zod';
import { HealthChecker, type HealthStatus } from './health.js';

/**
 * polyg-mcp MCP Server
 * Provides multi-graph memory tools via MCP protocol
 */
export class PolygMCPServer {
  private mcpServer: McpServer;
  private db: FalkorDBAdapter;
  private healthChecker: HealthChecker;
  private _isConnected = false;

  constructor(private config: PolygConfig) {
    // Initialize FalkorDB adapter
    this.db = new FalkorDBAdapter(config.falkordb);

    // Initialize health checker
    this.healthChecker = new HealthChecker(this.db);

    // Initialize MCP server
    this.mcpServer = new McpServer(
      {
        name: 'polyg-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
        instructions:
          'Multi-graph memory server for storing and retrieving information across semantic, temporal, causal, and entity graphs.',
      },
    );

    // Register all tools
    this.registerTools();
  }

  /**
   * Get the underlying MCP server instance
   */
  getMcpServer(): McpServer {
    return this.mcpServer;
  }

  /**
   * Get the FalkorDB adapter instance
   */
  getDatabase(): FalkorDBAdapter {
    return this.db;
  }

  /**
   * Get the health checker instance
   */
  getHealthChecker(): HealthChecker {
    return this.healthChecker;
  }

  /**
   * Check if the server is connected
   */
  isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Initialize the server and connect to database
   */
  async start(): Promise<void> {
    // Connect to FalkorDB
    await this.db.connect();
    this._isConnected = true;
  }

  /**
   * Graceful shutdown
   */
  async stop(): Promise<void> {
    // Close MCP server if connected
    if (this.mcpServer.isConnected()) {
      await this.mcpServer.close();
    }

    // Disconnect from database
    await this.db.disconnect();
    this._isConnected = false;
  }

  /**
   * Get health status
   */
  async getHealth(): Promise<HealthStatus> {
    return this.healthChecker.check();
  }

  /**
   * Register all MCP tools
   */
  registerTools(): void {
    this.registerStatisticsTool();
    this.registerClearGraphTool();
    // TODO: Register additional tools as they are implemented
    // - recall (high-level)
    // - remember (high-level)
    // - entity tools
    // - temporal tools
    // - causal tools
    // - semantic tools
  }

  /**
   * Register the get_statistics tool
   */
  private registerStatisticsTool(): void {
    this.mcpServer.registerTool(
      'get_statistics',
      {
        description: 'Get statistics about all graphs in the memory system',
      },
      async () => {
        const stats = await this.db.getStatistics();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(stats, null, 2),
            },
          ],
          structuredContent: stats,
        };
      },
    );
  }

  /**
   * Register the clear_graph tool
   */
  private registerClearGraphTool(): void {
    this.mcpServer.registerTool(
      'clear_graph',
      {
        description:
          'Clear all data from specified graph(s). Use with caution!',
        inputSchema: {
          graph: z
            .enum(['semantic', 'temporal', 'causal', 'entity', 'all'])
            .describe('Which graph to clear'),
        },
      },
      async (args) => {
        const { graph } = args;

        if (graph === 'all') {
          await this.db.clearGraph();
          return {
            content: [
              {
                type: 'text' as const,
                text: 'All graphs cleared successfully',
              },
            ],
          };
        }

        // For specific graphs, we need to delete nodes by label prefix
        const prefixMap: Record<string, string> = {
          semantic: 'S_',
          temporal: 'T_',
          causal: 'C_',
          entity: 'E_',
        };

        const prefix = prefixMap[graph];
        if (prefix) {
          await this.db.query(
            'MATCH (n) WHERE any(label IN labels(n) WHERE label STARTS WITH $prefix) DETACH DELETE n',
            { prefix },
          );
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: `${graph} graph cleared successfully`,
            },
          ],
        };
      },
    );
  }
}
