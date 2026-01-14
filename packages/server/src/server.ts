// MCP Server setup
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FalkorDBAdapter, StorageConfigError } from '@polyg-mcp/core';
import {
  ConfigValidationError,
  type PolygConfig,
  PolygConfigSchema,
} from '@polyg-mcp/shared';
import { z } from 'zod';
import {
  ServerConfigError,
  ServerStartError,
  ServerStopError,
  ToolExecutionError,
  formatToolError,
} from './errors.js';
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
  private readonly validatedConfig: PolygConfig;

  /**
   * Create a new polyg MCP server
   * @throws {ServerConfigError} if configuration is invalid
   */
  constructor(config: PolygConfig) {
    // Validate configuration using Zod
    const configResult = PolygConfigSchema.safeParse(config);
    if (!configResult.success) {
      throw new ServerConfigError(
        `Invalid server configuration:\n${configResult.error.issues.map((e) => `  - ${e.path.join('.')}: ${e.message}`).join('\n')}`,
        undefined,
      );
    }
    this.validatedConfig = configResult.data;

    // Initialize FalkorDB adapter (it will validate its own config)
    try {
      this.db = new FalkorDBAdapter(this.validatedConfig.falkordb);
    } catch (error) {
      if (error instanceof StorageConfigError) {
        throw new ServerConfigError(
          `FalkorDB configuration error: ${error.message}`,
          'falkordb',
          error,
        );
      }
      throw new ServerConfigError(
        `Failed to initialize FalkorDB adapter: ${error instanceof Error ? error.message : String(error)}`,
        'falkordb',
        error instanceof Error ? error : undefined,
      );
    }

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
   * Get the validated configuration
   */
  getConfig(): PolygConfig {
    return this.validatedConfig;
  }

  /**
   * Initialize the server and connect to database
   * @throws {ServerStartError} if connection fails
   */
  async start(): Promise<void> {
    if (this._isConnected) {
      return; // Already connected
    }

    try {
      await this.db.connect();
      this._isConnected = true;
    } catch (error) {
      throw new ServerStartError(
        `Failed to connect to FalkorDB: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Graceful shutdown
   * @throws {ServerStopError} if shutdown fails
   */
  async stop(): Promise<void> {
    const errors: Error[] = [];

    // Close MCP server if connected
    if (this.mcpServer.isConnected()) {
      try {
        await this.mcpServer.close();
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Disconnect from database
    try {
      await this.db.disconnect();
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    this._isConnected = false;

    // Report any errors during shutdown
    if (errors.length > 0) {
      throw new ServerStopError(
        `Errors during shutdown: ${errors.map((e) => e.message).join('; ')}`,
        errors[0],
      );
    }
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
        try {
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
        } catch (error) {
          const toolError = new ToolExecutionError(
            error instanceof Error ? error.message : String(error),
            'get_statistics',
            error instanceof Error ? error : undefined,
          );
          return formatToolError(toolError, 'get_statistics');
        }
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
        try {
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
        } catch (error) {
          const toolError = new ToolExecutionError(
            error instanceof Error ? error.message : String(error),
            'clear_graph',
            error instanceof Error ? error : undefined,
          );
          return formatToolError(toolError, 'clear_graph');
        }
      },
    );
  }
}
