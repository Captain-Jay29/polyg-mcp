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
import { ingestConversation, type IngestionResult } from './ingest.js';
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

// Shared constants — must match run-baselines.ts for comparability
const EMBEDDING_MODEL = 'text-embedding-3-small';
const BENCHMARK_GRAPH_NAME = 'polyg_benchmark';

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

interface IngestionStats {
  conversationId: string;
  entities: number;
  events: number;
  facts: number;
  causalLinks: number;
  concepts: number;
  seconds: number;
  valid: boolean;
  issues: string[];
}

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
    pipelineModel: string;
    judgeModel: string;
    embeddingModel: string;
    falkordbGraph: string;
    concurrency: number;
    totalConversations: number;
    totalQuestions: number;
    stratified: number;
    seed: number;
    skipJudge: boolean;
    startedAt: string;
  };
  ingestion: IngestionStats[];
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

  console.log('\n  By conversation:');
  for (const c of vo.metrics.byConversation) {
    console.log(
      `    ${c.conversationId.padEnd(12)} ${(c.accuracy * 100).toFixed(1).padStart(5)}%` +
        `  (${c.correct}/${c.total})`,
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

  // Wrong answer summary by category
  const wrong = vo.results.filter((r) => !r.correct);
  if (wrong.length > 0) {
    const wrongByCategory = new Map<string, number>();
    for (const r of wrong) {
      wrongByCategory.set(r.category, (wrongByCategory.get(r.category) ?? 0) + 1);
    }
    console.log(`\n  Wrong answers (${wrong.length} total):`);
    for (const [cat, count] of [...wrongByCategory.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${cat.padEnd(14)} ${count}`);
    }
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

  console.log(`\n${'='.repeat(90)}`);
  console.log('  Ablation Comparison (accuracy %)');
  console.log('='.repeat(90));

  // Header
  const categories = fullVariant.metrics.byCategory.map((c) => c.category);
  console.log(
    `  ${'Variant'.padEnd(24)} ${'Overall'.padStart(8)}  ${'Delta'.padStart(6)}` +
      categories.map((c) => c.padStart(14)).join(''),
  );
  console.log(
    `  ${'-'.repeat(24)} ${'-'.repeat(8)}  ${'-'.repeat(6)}` +
      categories.map(() => '  ' + '-'.repeat(12)).join(''),
  );

  for (const key of variantKeys) {
    const v = output.variants[key];
    if (!v.metrics.overall) continue;

    const overall = `${(v.metrics.overall.accuracy * 100).toFixed(1)}%`;
    const overallDelta =
      key === 'full'
        ? '    —'
        : `${formatDelta((v.metrics.overall.accuracy - fullVariant.metrics.overall.accuracy) * 100)}`;

    const catScores = categories.map((cat) => {
      const score = v.metrics.byCategory.find((c) => c.category === cat);
      const fullScore = fullVariant.metrics.byCategory.find((c) => c.category === cat);
      if (!score) return '         —';
      const pct = `${(score.accuracy * 100).toFixed(1)}%`;
      if (key === 'full' || !fullScore) return pct;
      const d = (score.accuracy - fullScore.accuracy) * 100;
      return `${pct}${formatDelta(d)}`;
    });

    console.log(
      `  ${v.config.name.padEnd(24)} ${overall.padStart(8)}  ${overallDelta.padStart(6)}` +
        catScores.map((s) => s.padStart(14)).join(''),
    );
  }

  // CI row for full variant
  const fullCI = `[${(fullVariant.metrics.overall.ci.lower * 100).toFixed(1)}, ${(fullVariant.metrics.overall.ci.upper * 100).toFixed(1)}]`;
  console.log(`\n  Full MAGMA 95% CI: ${fullCI}`);

  console.log('');
}

function formatDelta(d: number): string {
  if (Math.abs(d) < 0.05) return '  0.0';
  return d >= 0 ? ` +${d.toFixed(1)}` : ` ${d.toFixed(1)}`;
}

function printErrorOverlap(output: RunOutput) {
  const fullVariant = output.variants['full'];
  const semanticOnly = output.variants['semantic-only'];
  if (!fullVariant || !semanticOnly) return;

  // Questions wrong in both full and semantic-only
  const fullWrong = new Set(
    fullVariant.results.filter((r) => !r.correct).map((r) => `${r.conversationId}:${r.questionIndex}`),
  );
  const semanticWrong = new Set(
    semanticOnly.results.filter((r) => !r.correct).map((r) => `${r.conversationId}:${r.questionIndex}`),
  );

  const bothWrong = [...fullWrong].filter((q) => semanticWrong.has(q));
  const fullOnlyWrong = [...fullWrong].filter((q) => !semanticWrong.has(q));
  const semanticOnlyWrong = [...semanticWrong].filter((q) => !fullWrong.has(q));

  console.log('  Error overlap (Full MAGMA vs Semantic Only):');
  console.log(`    Both wrong:              ${bothWrong.length}`);
  console.log(`    Full wrong, Semantic OK: ${fullOnlyWrong.length}`);
  console.log(`    Full OK, Semantic wrong: ${semanticOnlyWrong.length}`);
  console.log(`    Both correct:            ${fullVariant.results.length - fullWrong.size - semanticOnlyWrong.length}`);
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

  const llm = new OpenAIProvider(apiKey, opts.model);
  const embeddings = new OpenAIEmbeddings(apiKey, EMBEDDING_MODEL);
  const judgeLlm = new OpenAIProvider(apiKey, opts.model);

  // FalkorDB — always use a dedicated benchmark graph to avoid clobbering production
  const falkordbGraph = BENCHMARK_GRAPH_NAME;
  const db = new FalkorDBAdapter({
    host: process.env.FALKORDB_HOST ?? 'localhost',
    port: Number(process.env.FALKORDB_PORT ?? 6379),
    graphName: falkordbGraph,
  });
  await db.connect();

  // Config banner — one-glance verification of standardization
  console.log(`${'─'.repeat(64)}`);
  console.log('  Configuration');
  console.log(`${'─'.repeat(64)}`);
  console.log(`  Pipeline LLM:    ${opts.model}`);
  console.log(`  Judge LLM:       ${opts.model}`);
  console.log(`  Embedding:       ${EMBEDDING_MODEL}`);
  console.log(`  FalkorDB graph:  ${falkordbGraph}`);
  console.log(`  Concurrency:     ${opts.concurrency}`);
  console.log(`  Seed:            ${opts.seed}`);
  console.log(`  Stratified:      ${opts.stratified > 0 ? `${opts.stratified}/category` : 'off (all questions)'}`);
  console.log(`  Variants:        ${variants.map((v) => v.key).join(', ')}`);
  console.log(`  Output:          ${outputPath}`);
  console.log(`${'─'.repeat(64)}\n`);

  const output: RunOutput = {
    config: {
      pipelineModel: opts.model,
      judgeModel: opts.model,
      embeddingModel: EMBEDDING_MODEL,
      falkordbGraph,
      concurrency: opts.concurrency,
      totalConversations: conversations.length,
      totalQuestions,
      stratified: opts.stratified,
      seed: opts.seed,
      skipJudge: opts.skipJudge,
      startedAt: new Date().toISOString(),
    },
    ingestion: [],
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
        `  Quality gate warnings: ${ingestionResult.validation.issues.join(', ')}`,
      );
    }

    // Save ingestion stats to JSON output
    output.ingestion.push({
      conversationId: conv.conversation_id,
      entities: ingestionResult.entities,
      events: ingestionResult.events,
      facts: ingestionResult.facts,
      causalLinks: ingestionResult.causalLinks,
      concepts: ingestionResult.concepts,
      seconds: ingestMs / 1000,
      valid: ingestionResult.validation.valid,
      issues: ingestionResult.validation.issues,
    });

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
        const runningCorrect = vo.results.filter((s) => s.correct).length;
        const runningTotal = vo.results.length;
        const runningAcc = ((runningCorrect / runningTotal) * 100).toFixed(1);
        console.log(
          `    → ${correct}/${scored.length} correct (${((answerMs + judgeMs) / 1000).toFixed(1)}s)` +
            `  [running: ${runningAcc}% = ${runningCorrect}/${runningTotal}]`,
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

  // Ingestion summary
  console.log(`\n${'='.repeat(64)}`);
  console.log('  Ingestion Summary');
  console.log('='.repeat(64));
  const totals = output.ingestion.reduce(
    (acc, s) => ({
      entities: acc.entities + s.entities,
      events: acc.events + s.events,
      facts: acc.facts + s.facts,
      causalLinks: acc.causalLinks + s.causalLinks,
      concepts: acc.concepts + s.concepts,
      seconds: acc.seconds + s.seconds,
    }),
    { entities: 0, events: 0, facts: 0, causalLinks: 0, concepts: 0, seconds: 0 },
  );
  for (const s of output.ingestion) {
    console.log(
      `  ${s.conversationId.padEnd(12)} ${String(s.entities).padStart(3)}E ${String(s.events).padStart(3)}Ev` +
        ` ${String(s.facts).padStart(3)}F ${String(s.causalLinks).padStart(3)}C ${String(s.concepts).padStart(3)}S` +
        `  ${s.seconds.toFixed(1)}s${s.valid ? '' : '  !!'}`,
    );
  }
  console.log(
    `  ${'TOTAL'.padEnd(12)} ${String(totals.entities).padStart(3)}E ${String(totals.events).padStart(3)}Ev` +
      ` ${String(totals.facts).padStart(3)}F ${String(totals.causalLinks).padStart(3)}C ${String(totals.concepts).padStart(3)}S` +
      `  ${totals.seconds.toFixed(1)}s`,
  );

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

  // Print comparison table + error overlap
  if (!opts.skipJudge) {
    printComparisonTable(output);
    printErrorOverlap(output);
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
