import { randomUUID } from 'node:crypto';
// HTTP transport handler for MCP over Streamable HTTP
import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  type HTTPServerOptions,
  HTTPServerOptionsSchema,
} from '@polyg-mcp/shared';
import {
  HealthCheckError,
  ServerStartError,
  ServerStopError,
  TransportConfigError,
  wrapServerError,
} from './errors.js';
import type { PolygMCPServer } from './server.js';

// Re-export for backwards compatibility
export type { HTTPServerOptions };

/**
 * HTTP Transport for MCP Server
 * Implements MCP Streamable HTTP transport specification
 */
export class HTTPTransport {
  private server: Server | null = null;
  private transport: StreamableHTTPServerTransport | null = null;
  private polygServer: PolygMCPServer | null = null;
  private readonly validatedOptions: HTTPServerOptions;

  /**
   * Create a new HTTP transport
   * @throws {TransportConfigError} if options are invalid
   */
  constructor(options: HTTPServerOptions) {
    // Validate options using Zod
    const result = HTTPServerOptionsSchema.safeParse(options);
    if (!result.success) {
      const errorMessages = result.error.errors
        .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
        .join('\n');
      throw new TransportConfigError(
        `Invalid HTTP transport options:\n${errorMessages}`,
      );
    }
    this.validatedOptions = result.data;
  }

  /**
   * Attach the polyg MCP server to this transport
   */
  attachServer(polygServer: PolygMCPServer): void {
    this.polygServer = polygServer;
  }

  /**
   * Check if server is attached
   */
  hasServer(): boolean {
    return this.polygServer !== null;
  }

  /**
   * Check if transport is running
   */
  isRunning(): boolean {
    return this.server?.listening ?? false;
  }

  /**
   * Start the HTTP server
   * @throws {ServerStartError} if server fails to start
   */
  async start(): Promise<void> {
    if (!this.polygServer) {
      throw new ServerStartError(
        'No server attached. Call attachServer() first.',
      );
    }

    if (this.isRunning()) {
      return; // Already running
    }

    try {
      // Create transport with session management
      const sessionIdGenerator =
        this.validatedOptions.stateful !== false
          ? () => randomUUID()
          : undefined;

      this.transport = new StreamableHTTPServerTransport({
        sessionIdGenerator,
      });

      // Connect the MCP server to the transport
      await this.polygServer.getMcpServer().connect(this.transport);

      // Create HTTP server
      this.server = createServer(async (req, res) => {
        await this.handleRequest(req, res);
      });

      // Start listening
      const host = this.validatedOptions.host ?? '0.0.0.0';
      const port = this.validatedOptions.port;

      await new Promise<void>((resolve, reject) => {
        this.server?.listen(port, host, () => {
          resolve();
        });
        this.server?.on('error', (err) => {
          reject(
            new ServerStartError(
              `Failed to start HTTP server on ${host}:${port}: ${err.message}`,
              err,
            ),
          );
        });
      });
    } catch (error) {
      // Clean up on failure
      this.transport = null;
      this.server = null;

      if (error instanceof ServerStartError) {
        throw error;
      }
      throw new ServerStartError(
        `Failed to start HTTP transport: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Stop the HTTP server
   * @throws {ServerStopError} if shutdown fails
   */
  async stop(): Promise<void> {
    const errors: Error[] = [];

    // Close transport
    if (this.transport) {
      try {
        await this.transport.close();
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
      this.transport = null;
    }

    // Close HTTP server
    if (this.server) {
      try {
        await new Promise<void>((resolve, reject) => {
          this.server?.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
      this.server = null;
    }

    // Report any errors during shutdown
    if (errors.length > 0) {
      throw new ServerStopError(
        `Errors during HTTP transport shutdown: ${errors.map((e) => e.message).join('; ')}`,
        errors[0],
      );
    }
  }

  /**
   * Handle an incoming HTTP request
   */
  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

      // Health check endpoint
      if (url.pathname === '/health') {
        await this.handleHealthCheck(req, res);
        return;
      }

      // MCP endpoint
      if (url.pathname === '/mcp' || url.pathname === '/') {
        await this.handleMCPRequest(req, res);
        return;
      }

      // Not found
      this.sendJsonResponse(res, 404, { error: 'Not found' });
    } catch (error) {
      // Catch-all error handler
      console.error('Unhandled error in request handler:', error);
      if (!res.headersSent) {
        this.sendJsonResponse(res, 500, {
          error: 'Internal server error',
        });
      }
    }
  }

  /**
   * Handle MCP protocol requests
   */
  private async handleMCPRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (!this.transport) {
      this.sendJsonResponse(res, 503, { error: 'Transport not initialized' });
      return;
    }

    try {
      // Parse body for POST requests
      let body: unknown;
      if (req.method === 'POST') {
        body = await this.parseBody(req);
      }

      await this.transport.handleRequest(req, res, body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        this.sendJsonResponse(res, 500, {
          error:
            error instanceof Error ? error.message : 'Internal server error',
        });
      }
    }
  }

  /**
   * Handle health check requests
   */
  private async handleHealthCheck(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (req.method !== 'GET') {
      this.sendJsonResponse(res, 405, { error: 'Method not allowed' });
      return;
    }

    try {
      if (!this.polygServer) {
        throw new HealthCheckError('Server not attached');
      }

      const health = await this.polygServer.getHealth();
      const statusCode =
        health.status === 'ok' ? 200 : health.status === 'degraded' ? 503 : 500;

      this.sendJsonResponse(res, statusCode, health);
    } catch (error) {
      const wrappedError = wrapServerError(error, 'Health check failed');
      console.error('Health check error:', wrappedError);

      this.sendJsonResponse(res, 500, {
        status: 'error',
        falkordb: 'disconnected',
        graphs: 0,
        uptime: 0,
        error: wrappedError.message,
      });
    }
  }

  /**
   * Parse request body as JSON
   * @throws {Error} if body is not valid JSON
   */
  private parseBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;
      const maxBodySize = 10 * 1024 * 1024; // 10MB limit

      req.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > maxBodySize) {
          reject(new Error('Request body too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        if (!body) {
          resolve(undefined);
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Invalid JSON body'));
        }
      });

      req.on('error', (error) => {
        reject(new Error(`Request error: ${error.message}`));
      });
    });
  }

  /**
   * Send a JSON response
   */
  private sendJsonResponse(
    res: ServerResponse,
    statusCode: number,
    data: unknown,
  ): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  /**
   * Get the server address
   */
  getAddress(): { host: string; port: number } | null {
    if (!this.server) return null;
    const address = this.server.address();
    if (typeof address === 'string' || address === null) return null;
    return { host: address.address, port: address.port };
  }

  /**
   * Get validated options
   */
  getOptions(): HTTPServerOptions {
    return this.validatedOptions;
  }
}
