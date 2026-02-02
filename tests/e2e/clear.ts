#!/usr/bin/env node
// Clear all graph data
import { MCPClient } from './agent/mcp-client.js';

async function main(): Promise<void> {
  const serverUrl = process.env.POLYG_SERVER_URL ?? 'http://localhost:4000';

  const mcpClient = new MCPClient({ baseUrl: serverUrl });

  console.log(`Connecting to ${serverUrl}...`);
  await mcpClient.connect();
  console.log('Connected!\n');

  console.log('Clearing all graph data...');
  await mcpClient.callTool('clear_graph', { graph: 'all' });
  console.log('✓ All graphs cleared\n');

  // Show stats to confirm
  const stats = await mcpClient.callTool('get_statistics', {});
  console.log('Current stats:', stats);

  await mcpClient.disconnect();
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
