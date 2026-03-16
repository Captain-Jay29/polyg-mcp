#!/usr/bin/env tsx
/**
 * LoCoMo baseline benchmark runner.
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx benchmarks/src/locomo/run-baselines.ts [options]
 *
 * Options:
 *   --conversations N   Limit to first N conversations (default: all)
 *   --stratified N      Sample N questions per category, spread across conversations
 *   --baseline NAME     Run only "full-context" or "vector-rag" (default: both)
 *   --skip-judge        Skip LLM judging
 *   --model MODEL       LLM model name (default: gpt-4o-mini)
 *   --concurrency N     Parallel LLM calls (default: 10)
 *   --seed N            RNG seed for stratified sampling (default: 42)
 *   --output PATH       JSON output file (default: benchmarks/results/baselines.json)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { OpenAIEmbeddings, OpenAIProvider } from '@polyg-mcp/core';
import { createFullContextRecall } from './baselines/full-context.js';
import { createVectorRagRecall } from './baselines/vector-rag.js';
import {
  aggregateScores,
  type EvaluationSummary,
  type RawResult,
  type RecallFn,
  type ScoredResult,
} from './evaluate.js';
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
// CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    conversations: Infinity,
    stratified: 0,
    baseline: 'both' as 'both' | 'full-context' | 'vector-rag',
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
      case '--baseline':
        opts.baseline = args[++i] as typeof opts.baseline;
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
// Output types
// ---------------------------------------------------------------------------

interface BaselineOutput {
  status: 'running' | 'complete';
  timing: TimingMetrics;
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
  baselines: Record<string, BaselineOutput>;
}

function saveOutput(path: string, data: RunOutput) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

function printSummary(name: string, bl: BaselineOutput) {
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  ${name}`);
  console.log('='.repeat(64));

  if (bl.metrics.overall) {
    const o = bl.metrics.overall;
    console.log(
      `  Overall: ${(o.accuracy * 100).toFixed(1)}%  (n=${o.count})` +
        `  CI: [${(o.ci.lower * 100).toFixed(1)}%, ${(o.ci.upper * 100).toFixed(1)}%]`,
    );
  }

  console.log('\n  By category:');
  for (const cat of bl.metrics.byCategory) {
    console.log(
      `    ${cat.category.padEnd(14)} ${(cat.accuracy * 100).toFixed(1).padStart(5)}%` +
        `  (n=${String(cat.count).padStart(3)})` +
        `  CI: [${(cat.ci.lower * 100).toFixed(1)}%, ${(cat.ci.upper * 100).toFixed(1)}%]`,
    );
  }

  console.log('\n  By conversation:');
  for (const c of bl.metrics.byConversation) {
    console.log(
      `    ${c.conversationId.padEnd(12)} ${(c.accuracy * 100).toFixed(1).padStart(5)}%` +
        `  (${c.correct}/${c.total})`,
    );
  }

  if (bl.metrics.confidence) {
    const cf = bl.metrics.confidence;
    console.log('\n  Confidence calibration:');
    console.log(`    Mean confidence:          ${cf.mean.toFixed(3)}`);
    console.log(`    Mean (correct answers):   ${cf.meanCorrect.toFixed(3)}`);
    console.log(
      `    Mean (incorrect answers):  ${cf.meanIncorrect.toFixed(3)}`,
    );
  }

  console.log(
    `\n  Timing: ${bl.timing.totalSeconds.toFixed(1)}s total` +
      ` (answer: ${bl.timing.answerSeconds.toFixed(1)}s, judge: ${bl.timing.judgeSeconds.toFixed(1)}s)` +
      `  ${bl.timing.avgPerQuestion.toFixed(2)}s/q`,
  );
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
    resolve(import.meta.dirname ?? '.', '../../results/baselines.json');

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

  const llm = new OpenAIProvider(apiKey, opts.model);
  const embeddings = new OpenAIEmbeddings(apiKey, 'text-embedding-3-small');
  const judgeLlm = new OpenAIProvider(apiKey, opts.model);

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
    baselines: {},
  };

  // Define baselines
  const baselineConfigs: {
    key: string;
    name: string;
    makeRecall: (conv: LoCoMoConversation) => Promise<RecallFn>;
  }[] = [];

  if (opts.baseline === 'both' || opts.baseline === 'full-context') {
    baselineConfigs.push({
      key: 'full-context',
      name: 'Full Context',
      makeRecall: async (conv) => createFullContextRecall(conv, llm),
    });
  }

  if (opts.baseline === 'both' || opts.baseline === 'vector-rag') {
    baselineConfigs.push({
      key: 'vector-rag',
      name: 'Vector RAG',
      makeRecall: (conv) => createVectorRagRecall(conv, llm, embeddings),
    });
  }

  for (const bl of baselineConfigs) {
    console.log(`--- ${bl.name} ---`);
    const startTime = Date.now();
    let answerMs = 0;
    let judgeMs = 0;
    const allRaw: RawResult[] = [];
    const allScored: ScoredResult[] = [];

    const blOutput: BaselineOutput = {
      status: 'running',
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
      results: allScored,
      rawResults: allRaw,
      conversationsCompleted: 0,
      totalConversations: conversations.length,
    };
    output.baselines[bl.key] = blOutput;

    for (let i = 0; i < conversations.length; i++) {
      const conv = conversations[i];
      console.log(
        `  [${i + 1}/${conversations.length}] ${conv.conversation_id} (${conv.questions.length}q)`,
      );

      // Answer
      const aStart = Date.now();
      const recall = await bl.makeRecall(conv);
      const raw = await evaluateConcurrent(conv, recall, opts.concurrency);
      allRaw.push(...raw);
      answerMs += Date.now() - aStart;

      // Judge
      if (!opts.skipJudge) {
        const jStart = Date.now();
        const scored = await judgeConcurrent(raw, judgeLlm, opts.concurrency);
        allScored.push(...scored);
        judgeMs += Date.now() - jStart;

        const correct = scored.filter((s) => s.correct).length;
        console.log(`    → ${correct}/${scored.length} correct`);
      } else {
        console.log(`    → ${raw.length} answers`);
      }

      // Intermediate save
      const elapsed = (Date.now() - startTime) / 1000;
      blOutput.conversationsCompleted = i + 1;
      blOutput.timing = {
        totalSeconds: elapsed,
        answerSeconds: answerMs / 1000,
        judgeSeconds: judgeMs / 1000,
        avgPerQuestion: allRaw.length > 0 ? elapsed / allRaw.length : 0,
      };
      if (!opts.skipJudge && allScored.length > 0) {
        const summary = aggregateScores(allScored);
        blOutput.metrics.overall = summary.overall;
        blOutput.metrics.byCategory = summary.byCategory;
        blOutput.metrics.byConversation = computeConversationMetrics(allScored);
        blOutput.metrics.confidence = computeConfidenceMetrics(allScored);
      }
      saveOutput(outputPath, output);
    }

    // Final
    const totalSec = (Date.now() - startTime) / 1000;
    blOutput.status = 'complete';
    blOutput.timing = {
      totalSeconds: totalSec,
      answerSeconds: answerMs / 1000,
      judgeSeconds: judgeMs / 1000,
      avgPerQuestion: allRaw.length > 0 ? totalSec / allRaw.length : 0,
    };

    if (!opts.skipJudge && allScored.length > 0) {
      const summary = aggregateScores(allScored);
      blOutput.metrics.overall = summary.overall;
      blOutput.metrics.byCategory = summary.byCategory;
      blOutput.metrics.byConversation = computeConversationMetrics(allScored);
      blOutput.metrics.confidence = computeConfidenceMetrics(allScored);
      printSummary(bl.name, blOutput);
    } else {
      console.log(`  ${allRaw.length} total answers (judging skipped)\n`);
    }

    saveOutput(outputPath, output);
  }

  console.log(`Results saved to ${outputPath}`);
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
