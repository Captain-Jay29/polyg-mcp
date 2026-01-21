#!/usr/bin/env node
// Seed script for populating test data

import { MCPClient } from './agent/mcp-client.js';
import {
  getAvailableDatasets,
  getDataset,
  listDatasets,
} from './datasets/index.js';

function printUsage(): void {
  console.log(`
Usage: tsx seed.ts [dataset] [options]

Datasets:
${listDatasets()
  .map((d) => `  ${d.name.padEnd(28)} ${d.description}`)
  .join('\n')}

Options:
  --list, -l     List available datasets
  --all, -a      Seed all datasets
  --help, -h     Show this help message

Examples:
  tsx seed.ts deployment-incident
  tsx seed.ts cloud-data-breach
  tsx seed.ts --all
  tsx seed.ts --list
`);
}

async function main(): Promise<void> {
  const serverUrl = process.env.POLYG_SERVER_URL ?? 'http://localhost:4000';
  const args = process.argv.slice(2);

  // Handle flags
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  if (args.includes('--list') || args.includes('-l')) {
    console.log('\nAvailable datasets:\n');
    for (const dataset of listDatasets()) {
      console.log(`  ${dataset.name}`);
      console.log(`    ${dataset.description}\n`);
    }
    process.exit(0);
  }

  const seedAll = args.includes('--all') || args.includes('-a');
  const datasetName = args.find((a) => !a.startsWith('-'));

  // Validate input
  if (!seedAll && !datasetName) {
    console.error('Error: No dataset specified\n');
    printUsage();
    process.exit(1);
  }

  const datasetsToSeed: string[] = seedAll
    ? getAvailableDatasets()
    : [datasetName as string];

  // Validate dataset names
  for (const name of datasetsToSeed) {
    if (!getDataset(name)) {
      console.error(`Error: Unknown dataset '${name}'`);
      console.log(`Available: ${getAvailableDatasets().join(', ')}`);
      process.exit(1);
    }
  }

  console.log(`Connecting to MCP server at ${serverUrl}...`);

  const client = new MCPClient({ baseUrl: serverUrl });

  try {
    await client.connect();
    console.log('Connected!\n');

    for (const name of datasetsToSeed) {
      const dataset = getDataset(name);
      if (!dataset) continue; // Already validated above, but satisfies type checker
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Seeding: ${dataset.name}`);
      console.log(`${dataset.description}`);
      console.log(`${'='.repeat(60)}\n`);

      await dataset.seed(client);
    }

    console.log('\n✅ All datasets seeded successfully!');
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
