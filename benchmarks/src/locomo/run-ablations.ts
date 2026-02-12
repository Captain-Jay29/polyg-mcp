#!/usr/bin/env tsx
/**
 * LoCoMo ablation benchmark runner.
 *
 * Ingests each conversation into polyg-mcp's graph, then runs 6 MAGMA
 * pipeline variants (full + 5 ablations) and scores with a GPT-4o-mini judge.
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx benchmarks/src/locomo/run-ablations.ts [options]
 *
 * Options:
 *   --conversations N   Limit to first N conversations (default: all)
 *   --stratified N      Sample N questions per category, spread across conversations
 *   --variant NAME      Run only this variant (default: all 6)
 *   --skip-judge        Skip LLM judging
 *   --model MODEL       LLM model name (default: gpt-4o-mini)
 *   --concurrency N     Parallel LLM calls (default: 10)
 *   --seed N            RNG seed for stratified sampling (default: 42)
 *   --output PATH       JSON output file (default: benchmarks/results/ablations.json)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  FalkorDBAdapter,
  OpenAIEmbeddings,
  OpenAIProvider,
  Orchestrator,
  type OrchestratorConfig,
} from '@polyg-mcp/core';
import {
  aggregateScores,
  type EvaluationSummary,
  type RawResult,
  type RecallFn,
  type ScoredResult,
} from './evaluate.js';
import { ingestConversation } from './ingest.js';
import type { LoCoMoConversation } from './types.js';
import {
  type ConfidenceMetrics,
  type ConversationMetrics,
  computeConfidenceMetrics,
  computeConversationMetrics,
  evaluateConcurrent,
  judgeConcurrent,
  loadDataset,
  stratifiedSample,
  type TimingMetrics,
} from './runner-utils.js';

// ---------------------------------------------------------------------------
// Variant configs
// ---------------------------------------------------------------------------

export interface VariantConfig {
  key: string;
  name: string;
  disabledGraphs: ('entity' | 'temporal' | 'causal')[];
  forceUniformDepth?: number;
}

export const VARIANT_CONFIGS: VariantConfig[] = [
  {
    key: 'full',
    name: 'Full MAGMA',
    disabledGraphs: [],
  },
  {
    key: 'minus-adaptive',
    name: 'Minus Adaptive Policy',
    disabledGraphs: [],
    forceUniformDepth: 2,
  },
  {
    key: 'minus-causal',
    name: 'Minus Causal',
    disabledGraphs: ['causal'],
  },
  {
    key: 'minus-temporal',
    name: 'Minus Temporal',
    disabledGraphs: ['temporal'],
  },
  {
    key: 'minus-entity',
    name: 'Minus Entity',
    disabledGraphs: ['entity'],
  },
  {
    key: 'semantic-only',
    name: 'Semantic Only',
    disabledGraphs: ['entity', 'temporal', 'causal'],
  },
];

export function getVariantConfig(key: string): VariantConfig | undefined {
  return VARIANT_CONFIGS.find((v) => v.key === key);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    conversations: Infinity,
    stratified: 0,
    variant: '' as string,
    skipJudge: false,
    model: 'gpt-4o-mini',
    concurrency: 10,
    seed: 42,
    output: '',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--conversations':
        opts.conversations = Number.parseInt(args[++i], 10);
        break;
      case '--stratified':
        opts.stratified = Number.parseInt(args[++i], 10);
        break;
      case '--variant':
        opts.variant = args[++i];
        break;
      case '--skip-judge':
        opts.skipJudge = true;
        break;
      case '--model':
        opts.model = args[++i];
        break;
      case '--concurrency':
        opts.concurrency = Number.parseInt(args[++i], 10);
        break;
      case '--seed':
        opts.seed = Number.parseInt(args[++i], 10);
        break;
      case '--output':
        opts.output = args[++i];
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  return opts;
}

// ---------------------------------------------------------------------------
// RecallFn factory
// ---------------------------------------------------------------------------

export function createMagmaRecall(
  orchestrator: Orchestrator,
): RecallFn {
  return async (query: string) => {
    const result = await orchestrator.recall(query);
    return {
      answer: result.answer,
      confidence: result.confidence,
    };
  };
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

interface VariantOutput {
  status: 'running' | 'complete';
  config: VariantConfig;
  timing: TimingMetrics;
  ingestionTiming?: { totalSeconds: number };
  metrics: {
    overall: EvaluationSummary['overall'] | null;
    byCategory: EvaluationSummary['byCategory'];
    byConversation: ConversationMetrics[];
    confidence: ConfidenceMetrics | null;
  };
  results: ScoredResult[];
  rawResults: RawResult[];
  conversationsCompleted: number;
  totalConversations: number;
}

interface RunOutput {
  config: {
    model: string;
    concurrency: number;
    totalConversations: number;
    totalQuestions: number;
    stratified: number;
    seed: number;
    skipJudge: boolean;
    startedAt: string;
  };
  variants: Record<string, VariantOutput>;
}

function saveOutput(path: string, data: RunOutput) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

function printSummary(name: string, vo: VariantOutput) {
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  ${name}`);
  console.log('='.repeat(64));

  if (vo.metrics.overall) {
    const o = vo.metrics.overall;
    console.log(
      `  Overall: ${(o.accuracy * 100).toFixed(1)}%  (n=${o.count})` +
        `  CI: [${(o.ci.lower * 100).toFixed(1)}%, ${(o.ci.upper * 100).toFixed(1)}%]`,
    );
  }

  console.log('\n  By category:');
  for (const cat of vo.metrics.byCategory) {
    console.log(
      `    ${cat.category.padEnd(14)} ${(cat.accuracy * 100).toFixed(1).padStart(5)}%` +
        `  (n=${String(cat.count).padStart(3)})` +
        `  CI: [${(cat.ci.lower * 100).toFixed(1)}%, ${(cat.ci.upper * 100).toFixed(1)}%]`,
    );
  }

  if (vo.metrics.confidence) {
    const cf = vo.metrics.confidence;
    console.log('\n  Confidence calibration:');
    console.log(`    Mean confidence:          ${cf.mean.toFixed(3)}`);
    console.log(`    Mean (correct answers):   ${cf.meanCorrect.toFixed(3)}`);
    console.log(
      `    Mean (incorrect answers):  ${cf.meanIncorrect.toFixed(3)}`,
    );
  }

  console.log(
    `\n  Timing: ${vo.timing.totalSeconds.toFixed(1)}s total` +
      ` (answer: ${vo.timing.answerSeconds.toFixed(1)}s, judge: ${vo.timing.judgeSeconds.toFixed(1)}s)` +
      `  ${vo.timing.avgPerQuestion.toFixed(2)}s/q`,
  );
  console.log('');
}

function printComparisonTable(output: RunOutput) {
  const variantKeys = Object.keys(output.variants);
  if (variantKeys.length < 2) return;

  const fullVariant = output.variants['full'];
  if (!fullVariant?.metrics.overall) return;

  console.log(`\n${'='.repeat(72)}`);
  console.log('  Ablation Comparison');
  console.log('='.repeat(72));

  // Header
  const categories = fullVariant.metrics.byCategory.map((c) => c.category);
  console.log(
    `  ${'Variant'.padEnd(22)} ${'Overall'.padStart(8)}` +
      categories.map((c) => c.padStart(12)).join(''),
  );
  console.log(`  ${'-'.repeat(22)} ${'-'.repeat(8)}${categories.map(() => ' ' + '-'.repeat(11)).join('')}`);

  for (const key of variantKeys) {
    const v = output.variants[key];
    if (!v.metrics.overall) continue;

    const overall = `${(v.metrics.overall.accuracy * 100).toFixed(1)}%`;
    const delta =
      key === 'full'
        ? '  —'
        : ` ${((v.metrics.overall.accuracy - fullVariant.metrics.overall.accuracy) * 100) >= 0 ? '+' : ''}${((v.metrics.overall.accuracy - fullVariant.metrics.overall.accuracy) * 100).toFixed(1)}`;

    const catScores = categories.map((cat) => {
      const score = v.metrics.byCategory.find((c) => c.category === cat);
      return score ? `${(score.accuracy * 100).toFixed(1)}%` : '  —';
    });

    console.log(
      `  ${v.config.name.padEnd(22)} ${overall.padStart(6)}${delta.padStart(6)}` +
        catScores.map((s) => s.padStart(12)).join(''),
    );
  }

  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(
      'OPENAI_API_KEY not set. Run with: npx dotenv-cli -e .env -- npx tsx ...',
    );
    process.exit(1);
  }

  const outputPath =
    opts.output ||
    resolve(import.meta.dirname ?? '.', '../../results/ablations.json');

  const datasetPath = resolve(
    import.meta.dirname ?? '.',
    'dataset/locomo10.json',
  );
  console.log(`Loading dataset from ${datasetPath}`);
  let conversations = loadDataset(datasetPath, opts.conversations);

  const fullCount = conversations.reduce((s, c) => s + c.questions.length, 0);
  console.log(
    `Loaded ${conversations.length} conversations, ${fullCount} questions total`,
  );

  // Stratified sampling
  if (opts.stratified > 0) {
    console.log(
      `\nStratified sampling: ${opts.stratified} per category (seed=${opts.seed})`,
    );
    conversations = stratifiedSample(conversations, opts.stratified, opts.seed);
  }

  const totalQuestions = conversations.reduce(
    (s, c) => s + c.questions.length,
    0,
  );
  console.log(
    `Running ${conversations.length} conversations, ${totalQuestions} questions`,
  );
  console.log(`LLM: ${opts.model}  Concurrency: ${opts.concurrency}`);
  console.log(`Output: ${outputPath}\n`);

  // Select variants
  let variants: VariantConfig[];
  if (opts.variant) {
    const found = getVariantConfig(opts.variant);
    if (!found) {
      console.error(
        `Unknown variant: ${opts.variant}. Available: ${VARIANT_CONFIGS.map((v) => v.key).join(', ')}`,
      );
      process.exit(1);
    }
    variants = [found];
  } else {
    variants = VARIANT_CONFIGS;
  }

  console.log(`Variants: ${variants.map((v) => v.key).join(', ')}\n`);

  const llm = new OpenAIProvider(apiKey, opts.model);
  const embeddings = new OpenAIEmbeddings(apiKey, 'text-embedding-3-small');
  const judgeLlm = new OpenAIProvider(apiKey, opts.model);

  // FalkorDB connection — shared across all variants within a conversation
  const db = new FalkorDBAdapter({
    host: process.env.FALKORDB_HOST ?? 'localhost',
    port: Number(process.env.FALKORDB_PORT ?? 6379),
    graphName: process.env.FALKORDB_GRAPH ?? 'polyg_benchmark',
  });
  await db.connect();
  console.log('Connected to FalkorDB\n');

  const output: RunOutput = {
    config: {
      model: opts.model,
      concurrency: opts.concurrency,
      totalConversations: conversations.length,
      totalQuestions,
      stratified: opts.stratified,
      seed: opts.seed,
      skipJudge: opts.skipJudge,
      startedAt: new Date().toISOString(),
    },
    variants: {},
  };

  // Initialize variant outputs
  for (const v of variants) {
    output.variants[v.key] = {
      status: 'running',
      config: v,
      timing: {
        totalSeconds: 0,
        answerSeconds: 0,
        judgeSeconds: 0,
        avgPerQuestion: 0,
      },
      metrics: {
        overall: null,
        byCategory: [],
        byConversation: [],
        confidence: null,
      },
      results: [],
      rawResults: [],
      conversationsCompleted: 0,
      totalConversations: conversations.length,
    };
  }

  for (let ci = 0; ci < conversations.length; ci++) {
    const conv = conversations[ci];
    console.log(
      `\n[${'='.repeat(60)}]`,
    );
    console.log(
      `Conversation ${ci + 1}/${conversations.length}: ${conv.conversation_id} (${conv.questions.length}q)`,
    );

    // 1. Clear graph and ingest conversation (once per conversation)
    console.log('  Clearing graph...');
    await db.clearGraph();

    console.log('  Ingesting conversation...');
    const ingestStart = Date.now();

    // Create a default orchestrator for ingestion (no ablation)
    const ingestOrchestrator = new Orchestrator(db, llm, embeddings);
    const graphs = ingestOrchestrator.getGraphs();
    const ingestionResult = await ingestConversation(
      conv,
      graphs,
      llm,
      () => db.getStatistics(),
    );
    const ingestMs = Date.now() - ingestStart;

    console.log(
      `  Ingested: ${ingestionResult.entities}E ${ingestionResult.events}Ev` +
        ` ${ingestionResult.facts}F ${ingestionResult.causalLinks}C ${ingestionResult.concepts}S` +
        ` (${(ingestMs / 1000).toFixed(1)}s)`,
    );

    if (!ingestionResult.validation.valid) {
      console.warn(
        `  ⚠ Quality gate warnings: ${ingestionResult.validation.issues.join(', ')}`,
      );
    }

    // 2. Run each variant against the same ingested graph
    for (const v of variants) {
      console.log(`\n  --- ${v.name} ---`);
      const vo = output.variants[v.key];
      const startTime = Date.now();

      // Create orchestrator with variant config
      const orchestratorConfig: OrchestratorConfig = {
        disabledGraphs: v.disabledGraphs,
        forceUniformDepth: v.forceUniformDepth,
      };
      const orchestrator = new Orchestrator(
        db,
        llm,
        embeddings,
        orchestratorConfig,
      );
      const recall = createMagmaRecall(orchestrator);

      // Answer
      const aStart = Date.now();
      const raw = await evaluateConcurrent(conv, recall, opts.concurrency);
      vo.rawResults.push(...raw);
      const answerMs = Date.now() - aStart;

      // Judge
      if (!opts.skipJudge) {
        const jStart = Date.now();
        const scored = await judgeConcurrent(raw, judgeLlm, opts.concurrency);
        vo.results.push(...scored);
        const judgeMs = Date.now() - jStart;

        const correct = scored.filter((s) => s.correct).length;
        console.log(
          `    → ${correct}/${scored.length} correct (${((answerMs + judgeMs) / 1000).toFixed(1)}s)`,
        );

        vo.timing.answerSeconds += answerMs / 1000;
        vo.timing.judgeSeconds += judgeMs / 1000;
      } else {
        console.log(`    → ${raw.length} answers (${(answerMs / 1000).toFixed(1)}s)`);
        vo.timing.answerSeconds += answerMs / 1000;
      }

      // Update metrics
      vo.conversationsCompleted = ci + 1;
      vo.timing.totalSeconds += (Date.now() - startTime) / 1000;
      vo.timing.avgPerQuestion =
        vo.rawResults.length > 0
          ? vo.timing.totalSeconds / vo.rawResults.length
          : 0;
      if (!vo.ingestionTiming) {
        vo.ingestionTiming = { totalSeconds: 0 };
      }
      vo.ingestionTiming.totalSeconds += ingestMs / 1000;

      if (!opts.skipJudge && vo.results.length > 0) {
        const summary = aggregateScores(vo.results);
        vo.metrics.overall = summary.overall;
        vo.metrics.byCategory = summary.byCategory;
        vo.metrics.byConversation = computeConversationMetrics(vo.results);
        vo.metrics.confidence = computeConfidenceMetrics(vo.results);
      }
    }

    // Intermediate save after each conversation
    saveOutput(outputPath, output);
  }

  // Finalize
  for (const v of variants) {
    const vo = output.variants[v.key];
    vo.status = 'complete';

    if (!opts.skipJudge && vo.results.length > 0) {
      printSummary(v.name, vo);
    } else {
      console.log(`  ${v.name}: ${vo.rawResults.length} total answers (judging skipped)\n`);
    }
  }

  saveOutput(outputPath, output);

  // Print comparison table
  if (!opts.skipJudge) {
    printComparisonTable(output);
  }

  console.log(`Results saved to ${outputPath}`);
  console.log('Done.');
}

// Guard: only run when executed directly (not when imported by tests)
const isDirectExecution =
  typeof process.argv[1] === 'string' &&
  process.argv[1].includes('run-ablations');

if (isDirectExecution) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
