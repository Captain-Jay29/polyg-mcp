// HTTP transport handler for MCP over Streamable HTTP

export interface HTTPServerOptions {
  port: number;
  host?: string;
}

export class HTTPTransport {
  constructor(private options: HTTPServerOptions) {}

  async start(): Promise<void> {
    // TODO: Start HTTP server with MCP Streamable HTTP transport
    throw new Error('Not implemented');
  }

  async stop(): Promise<void> {
    // TODO: Stop HTTP server
    throw new Error('Not implemented');
  }
}
