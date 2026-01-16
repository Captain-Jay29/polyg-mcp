#!/usr/bin/env node
// polyg-mcp server entry point
import { loadConfig } from '@polyg-mcp/shared';
import { HTTPTransport } from './http.js';
import { SharedResources } from './shared-resources.js';

const DEFAULT_PORT = 3000;

async function main(): Promise<void> {
  // Load configuration
  const config = loadConfig();

  // Parse command line args for port
  const portArg = process.argv.find((arg) => arg.startsWith('--port='));
  const port = portArg
    ? Number.parseInt(portArg.split('=')[1], 10)
    : Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);

  // Create shared resources and transport
  const resources = new SharedResources(config);
  const transport = new HTTPTransport({ port });

  // Attach resources to transport
  transport.attachResources(resources);

  // Handle shutdown signals
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\nReceived ${signal}, shutting down...`);
    try {
      await transport.stop();
      await resources.stop();
      console.log('Server stopped gracefully');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    // Start database connection
    console.log('Connecting to FalkorDB...');
    await resources.start();
    console.log('Connected to FalkorDB');

    // Start HTTP server
    console.log(`Starting HTTP server on port ${port}...`);
    await transport.start();

    const address = transport.getAddress();
    console.log(
      `polyg-mcp server running at http://${address?.host}:${address?.port}`,
    );
    console.log('Endpoints:');
    console.log(`  - MCP: http://${address?.host}:${address?.port}/mcp`);
    console.log(`  - Health: http://${address?.host}:${address?.port}/health`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
