import { randomUUID } from 'node:crypto';
// HTTP transport handler for MCP over Streamable HTTP
import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { PolygMCPServer } from './server.js';

export interface HTTPServerOptions {
  port: number;
  host?: string;
  /** Enable stateful sessions (default: true) */
  stateful?: boolean;
}

/**
 * HTTP Transport for MCP Server
 * Implements MCP Streamable HTTP transport specification
 */
export class HTTPTransport {
  private server: Server | null = null;
  private transport: StreamableHTTPServerTransport | null = null;
  private polygServer: PolygMCPServer | null = null;

  constructor(private options: HTTPServerOptions) {}

  /**
   * Attach the polyg MCP server to this transport
   */
  attachServer(polygServer: PolygMCPServer): void {
    this.polygServer = polygServer;
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    if (!this.polygServer) {
      throw new Error('No server attached. Call attachServer() first.');
    }

    // Create transport with session management
    const sessionIdGenerator =
      this.options.stateful !== false ? () => randomUUID() : undefined;

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
    const host = this.options.host ?? '0.0.0.0';
    const port = this.options.port;

    await new Promise<void>((resolve, reject) => {
      this.server?.listen(port, host, () => {
        resolve();
      });
      this.server?.on('error', reject);
    });
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    // Close transport
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }

    // Close HTTP server
    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server?.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.server = null;
    }
  }

  /**
   * Handle an incoming HTTP request
   */
  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    // Health check endpoint
    if (url.pathname === '/health') {
      await this.handleHealthCheck(req, res);
      return;
    }

    // MCP endpoint
    if (url.pathname === '/mcp' || url.pathname === '/') {
      if (!this.transport) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Transport not initialized' }));
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
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : 'Internal server error',
            }),
          );
        }
      }
      return;
    }

    // Not found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  /**
   * Handle health check requests
   */
  private async handleHealthCheck(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    try {
      const health = await this.polygServer?.getHealth();
      const statusCode =
        health?.status === 'ok'
          ? 200
          : health?.status === 'degraded'
            ? 503
            : 500;

      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      );
    }
  }

  /**
   * Parse request body as JSON
   */
  private parseBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : undefined);
        } catch (error) {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
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
}
