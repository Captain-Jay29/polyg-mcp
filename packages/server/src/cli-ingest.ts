#!/usr/bin/env node
// CLI wrapper for the ingestion pipeline
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  createEmbeddingProvider,
  createLLMProvider,
  FalkorDBAdapter,
  ingest,
} from '@polyg-mcp/core';
import { loadConfig } from '@polyg-mcp/shared';

export interface CliArgs {
  file?: string;
  graph?: string;
  format: string;
  concurrency: number;
  verbose: boolean;
}

export function parseCliArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      file: { type: 'string', short: 'f' },
      graph: { type: 'string', short: 'g' },
      format: { type: 'string', default: 'auto' },
      concurrency: { type: 'string', default: '1' },
      verbose: { type: 'boolean', short: 'v', default: false },
    },
    strict: true,
  });

  return {
    file: values.file,
    graph: values.graph,
    format: values.format ?? 'auto',
    concurrency: Number.parseInt(values.concurrency ?? '1', 10),
    verbose: values.verbose ?? false,
  };
}

async function main(): Promise<void> {
  const args = parseCliArgs();

  if (!args.file) {
    console.error('Error: --file is required');
    process.exit(1);
  }

  const validFormats = ['conversation', 'text', 'structured', 'auto'];
  if (!validFormats.includes(args.format)) {
    console.error(
      `Error: invalid format "${args.format}". Must be one of: ${validFormats.join(', ')}`,
    );
    process.exit(1);
  }

  // Load config, optionally overriding graph name
  const overrides = args.graph
    ? { falkordb: { graphName: args.graph } }
    : undefined;
  const config = loadConfig(overrides as Parameters<typeof loadConfig>[0]);

  // Initialize providers
  const db = new FalkorDBAdapter(config.falkordb);
  const llm = createLLMProvider({
    provider: config.llm.provider,
    model: config.llm.model,
    apiKey: config.llm.apiKey,
    classifierMaxTokens: config.llm.classifierMaxTokens,
    synthesizerMaxTokens: config.llm.synthesizerMaxTokens,
  });
  const embeddingsApiKey = config.embeddings.apiKey || config.llm.apiKey;
  const embeddings = createEmbeddingProvider({
    provider: config.embeddings.provider,
    model: config.embeddings.model,
    apiKey: embeddingsApiKey,
    dimensions: config.embeddings.dimensions,
  });

  try {
    await db.connect();

    const content = readFileSync(args.file, 'utf-8');
    const report = await ingest(
      {
        content,
        format: args.format as 'conversation' | 'text' | 'structured' | 'auto',
        concurrency: args.concurrency,
      },
      { db, llm, embeddings },
    );

    if (args.verbose) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`Status: ${report.status}`);
      console.log(
        `Chunks: ${report.chunks.total} parsed, ${report.chunks.slow_path_extracted} extracted`,
      );
      console.log(
        `Graph: ${report.graph.entities_created} entities, ${report.graph.relationships_created} relationships, ${report.graph.facts_created} facts`,
      );
      if (report.quality_warnings.length > 0) {
        console.log(`Warnings: ${report.quality_warnings.length}`);
      }
      console.log(`Time: ${report.timing.total_ms}ms`);
    }
  } catch (err) {
    console.error(
      `Ingestion failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  } finally {
    await db.disconnect();
  }
}

// Only run when executed directly (not imported by tests)
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('cli-ingest.ts') ||
    process.argv[1].endsWith('cli-ingest.js'));
if (isDirectRun) {
  main();
}
