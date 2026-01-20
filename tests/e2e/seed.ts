#!/usr/bin/env node
// Seed script for populating test data
import { MCPClient } from './agent/mcp-client.js';
import { seedDeploymentIncident } from './datasets/deployment-incident.js';

async function main(): Promise<void> {
  const serverUrl = process.env.POLYG_SERVER_URL ?? 'http://localhost:4000';
  const dataset = process.argv[2] ?? 'deployment-incident';

  console.log(`Connecting to MCP server at ${serverUrl}...`);

  const client = new MCPClient({ baseUrl: serverUrl });

  try {
    await client.connect();
    console.log('Connected!\n');

    switch (dataset) {
      case 'deployment-incident':
        await seedDeploymentIncident(client);
        break;
      default:
        console.error(`Unknown dataset: ${dataset}`);
        console.log('Available datasets: deployment-incident');
        process.exit(1);
    }
  } catch (error) {
    console.error(
      'Error:',
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}

main();
