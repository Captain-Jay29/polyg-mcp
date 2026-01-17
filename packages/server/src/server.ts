// MCP Server setup
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FalkorDBAdapter, Orchestrator } from '@polyg-mcp/core';
import type { HealthStatus, PolygConfig } from '@polyg-mcp/shared';
import { ServerStopError } from './errors.js';
import type { HealthChecker } from './health.js';
import { createMcpServer } from './mcp-server-factory.js';
import { SharedResources } from './shared-resources.js';

/**
 * polyg-mcp MCP Server
 * Provides multi-graph memory tools via MCP protocol
 *
 * @deprecated Use SharedResources + HTTPTransport with attachResources() for new implementations.
 * This class is preserved for backwards compatibility.
 *
 * @example
 * // Legacy usage (still works)
 * const server = new PolygMCPServer(config);
 * await server.start();
 *
 * // New recommended usage
 * const resources = new SharedResources(config);
 * const transport = new HTTPTransport({ port: 4000 });
 * transport.attachResources(resources);
 * await resources.start();
 * await transport.start();
 */
export class PolygMCPServer {
  private mcpServer: McpServer;
  private readonly sharedResources: SharedResources;

  /**
   * Create a new polyg MCP server
   * @throws {ServerConfigError} if configuration is invalid
   */
  constructor(config: PolygConfig) {
    // Delegate to SharedResources for resource management
    this.sharedResources = new SharedResources(config);

    // Create McpServer with all tools registered
    this.mcpServer = createMcpServer(this.sharedResources);
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
    return this.sharedResources.db;
  }

  /**
   * Get the Orchestrator instance
   */
  getOrchestrator(): Orchestrator {
    return this.sharedResources.orchestrator;
  }

  /**
   * Get the health checker instance
   */
  getHealthChecker(): HealthChecker {
    return this.sharedResources.healthChecker;
  }

  /**
   * Check if the server is connected
   */
  isConnected(): boolean {
    return this.sharedResources.isConnected();
  }

  /**
   * Get the validated configuration
   */
  getConfig(): PolygConfig {
    return this.sharedResources.getConfig();
  }

  /**
   * Initialize the server and connect to database
   * @throws {ServerStartError} if connection fails
   */
  async start(): Promise<void> {
    await this.sharedResources.start();
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

    // Stop shared resources
    try {
      await this.sharedResources.stop();
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

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
    return this.sharedResources.getHealth();
  }
}
