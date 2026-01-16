import { randomUUID } from 'node:crypto';
// HTTP transport handler for MCP over Streamable HTTP
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
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
  SessionCreationError,
  SessionLimitError,
  SessionNotFoundError,
  SessionRequiredError,
  TransportConfigError,
  wrapServerError,
} from './errors.js';
import type { PolygMCPServer } from './server.js';
import { type SessionContext, SessionManager } from './session-manager.js';
import type { SharedResources } from './shared-resources.js';

// Re-export for backwards compatibility
export type { HTTPServerOptions };

// MCP session ID header
const MCP_SESSION_ID_HEADER = 'mcp-session-id';

/**
 * HTTP Transport for MCP Server
 * Implements MCP Streamable HTTP transport specification with session management
 */
export class HTTPTransport {
  private server: Server | null = null;
  private transport: StreamableHTTPServerTransport | null = null;
  private polygServer: PolygMCPServer | null = null;
  private sharedResources: SharedResources | null = null;
  private sessionManager: SessionManager | null = null;
  private readonly validatedOptions: HTTPServerOptions;

  /**
   * Create a new HTTP transport
   * @throws {TransportConfigError} if options are invalid
   */
  constructor(options: HTTPServerOptions) {
    // Validate options using Zod
    const result = HTTPServerOptionsSchema.safeParse(options);
    if (!result.success) {
      const errorMessages = result.error.issues
        .map(
          (e: { path: PropertyKey[]; message: string }) =>
            `  - ${e.path.join('.')}: ${e.message}`,
        )
        .join('\n');
      throw new TransportConfigError(
        `Invalid HTTP transport options:\n${errorMessages}`,
      );
    }
    this.validatedOptions = result.data;
  }

  /**
   * Attach SharedResources for the new session-based architecture.
   * This automatically creates a SessionManager.
   */
  attachResources(resources: SharedResources): void {
    this.sharedResources = resources;
    this.sessionManager = new SessionManager(resources, {
      sessionTimeoutMs: this.validatedOptions.sessionTimeoutMs,
      cleanupIntervalMs: this.validatedOptions.cleanupIntervalMs,
      maxSessions: this.validatedOptions.maxSessions,
    });
  }

  /**
   * Attach the polyg MCP server to this transport (legacy mode).
   * @deprecated Use attachResources() for new implementations
   */
  attachServer(polygServer: PolygMCPServer): void {
    this.polygServer = polygServer;
  }

  /**
   * Check if resources are attached (new architecture)
   */
  hasResources(): boolean {
    return this.sharedResources !== null && this.sessionManager !== null;
  }

  /**
   * Check if server is attached (legacy architecture)
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
   * Get the session manager (for monitoring/metrics)
   */
  getSessionManager(): SessionManager | null {
    return this.sessionManager;
  }

  /**
   * Start the HTTP server
   * @throws {ServerStartError} if server fails to start
   */
  async start(): Promise<void> {
    // Check for either new or legacy architecture
    if (!this.hasResources() && !this.hasServer()) {
      throw new ServerStartError(
        'No resources or server attached. Call attachResources() or attachServer() first.',
      );
    }

    if (this.isRunning()) {
      return; // Already running
    }

    try {
      // Legacy mode: single shared transport
      if (this.polygServer && !this.sharedResources) {
        await this.startLegacyMode();
      }
      // New mode: session-based transport (handled per request)

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
   * Start in legacy mode (single shared McpServer)
   */
  private async startLegacyMode(): Promise<void> {
    if (!this.polygServer) {
      throw new ServerStartError('No server attached for legacy mode');
    }

    // Create transport with session management
    const sessionIdGenerator =
      this.validatedOptions.stateful !== false ? () => randomUUID() : undefined;

    this.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator,
    });

    // Connect the MCP server to the transport
    await this.polygServer.getMcpServer().connect(this.transport);
  }

  /**
   * Stop the HTTP server
   * @throws {ServerStopError} if shutdown fails
   */
  async stop(): Promise<void> {
    const errors: Error[] = [];

    // Shutdown session manager (new architecture)
    if (this.sessionManager) {
      try {
        await this.sessionManager.shutdown();
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
      this.sessionManager = null;
    }

    // Close legacy transport
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
    // New architecture: session-based handling
    if (this.sessionManager && this.sharedResources) {
      await this.handleSessionMCPRequest(req, res);
      return;
    }

    // Legacy architecture: single transport
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
   * Handle MCP request with session management
   */
  private async handleSessionMCPRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (!this.sessionManager) {
      this.sendJsonResponse(res, 503, {
        error: 'Session manager not initialized',
      });
      return;
    }

    try {
      // Parse body for POST requests
      let body: unknown;
      if (req.method === 'POST') {
        body = await this.parseBody(req);
      }

      // Get session ID from header
      const sessionId = req.headers[MCP_SESSION_ID_HEADER] as
        | string
        | undefined;

      // Check if this is an initialize request
      const isInitializeRequest = this.isInitializeRequest(body);

      let session: SessionContext;

      if (sessionId) {
        // Existing session
        const existingSession = this.sessionManager.getSession(sessionId);
        if (!existingSession) {
          this.sendSessionError(res, new SessionNotFoundError(sessionId));
          return;
        }
        session = existingSession;
        this.sessionManager.touchSession(sessionId);
      } else if (isInitializeRequest) {
        // New session for initialize request
        try {
          session = await this.sessionManager.createSession();
        } catch (error) {
          if (error instanceof SessionLimitError) {
            this.sendSessionError(res, error);
            return;
          }
          if (error instanceof SessionCreationError) {
            this.sendSessionCreationError(res, error);
            return;
          }
          throw error;
        }
      } else {
        // No session ID and not an initialize request
        this.sendSessionError(res, new SessionRequiredError());
        return;
      }

      // Handle the request with the session's transport
      await session.transport.handleRequest(req, res, body);
    } catch (error) {
      console.error('Error handling session MCP request:', error);
      if (!res.headersSent) {
        this.sendJsonResponse(res, 500, {
          error:
            error instanceof Error ? error.message : 'Internal server error',
        });
      }
    }
  }

  /**
   * Check if a request body is an MCP initialize request
   */
  private isInitializeRequest(body: unknown): boolean {
    if (!body || typeof body !== 'object') {
      return false;
    }
    const jsonrpc = body as { method?: string };
    return jsonrpc.method === 'initialize';
  }

  /**
   * Send a session-related error response
   */
  private sendSessionError(
    res: ServerResponse,
    error: SessionNotFoundError | SessionLimitError | SessionRequiredError,
  ): void {
    let statusCode: number;
    let errorCode: string;

    if (error instanceof SessionNotFoundError) {
      statusCode = 404;
      errorCode = 'SESSION_NOT_FOUND';
    } else if (error instanceof SessionLimitError) {
      statusCode = 503;
      errorCode = 'SESSION_LIMIT';
    } else {
      statusCode = 400;
      errorCode = 'SESSION_REQUIRED';
    }

    const response = {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: error.message,
        data: {
          code: errorCode,
          ...(error instanceof SessionNotFoundError && {
            sessionId: error.sessionId,
          }),
          ...(error instanceof SessionLimitError && {
            maxSessions: error.maxSessions,
          }),
        },
      },
      id: null,
    };

    this.sendJsonResponse(res, statusCode, response);
  }

  /**
   * Send a session creation error response
   */
  private sendSessionCreationError(
    res: ServerResponse,
    error: SessionCreationError,
  ): void {
    const response = {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: error.message,
        data: {
          code: 'SESSION_CREATION_FAILED',
        },
      },
      id: null,
    };

    this.sendJsonResponse(res, 500, response);
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
      // New architecture
      if (this.sharedResources) {
        const health = await this.sharedResources.getHealth();

        // Add session metrics
        const healthWithSessions = {
          ...health,
          sessions: this.sessionManager
            ? {
                active: this.sessionManager.getActiveCount(),
                max: this.sessionManager.getMaxSessions(),
              }
            : undefined,
        };

        const statusCode =
          health.status === 'ok'
            ? 200
            : health.status === 'degraded'
              ? 503
              : 500;

        this.sendJsonResponse(res, statusCode, healthWithSessions);
        return;
      }

      // Legacy architecture
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
