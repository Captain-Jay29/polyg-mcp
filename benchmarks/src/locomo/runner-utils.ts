/**
 * Shared utilities for LoCoMo benchmark runners (baselines + ablations).
 *
 * Extracted from run-baselines.ts to avoid duplication.
 */
import { readFileSync } from 'node:fs';
import type { LLMProvider } from '@polyg-mcp/shared';
import {
  aggregateScores,
  type RawResult,
  type RecallFn,
  type ScoredResult,
} from './evaluate.js';
import { judgeAnswer } from './judge.js';
import type {
  LoCoMoConversation,
  LoCoMoQuestion,
  LoCoMoSession,
} from './types.js';

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) for reproducible sampling
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Concurrency with retry
// ---------------------------------------------------------------------------

const MAX_RETRIES = 6;
const BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  if (String(e.name).includes('RateLimit')) return true;
  if (typeof e.cause === 'object' && e.cause !== null) {
    const cause = e.cause as Record<string, unknown>;
    if (cause.status === 429 || cause.code === 'rate_limit_exceeded')
      return true;
  }
  return false;
}

async function withRetry<R>(fn: () => Promise<R>, label: string): Promise<R> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= MAX_RETRIES || !isRateLimitError(err)) throw err;
      const delay = BASE_DELAY_MS * 2 ** attempt;
      process.stderr.write(
        `    [${label} retry ${attempt + 1} in ${delay}ms]\n`,
      );
      await sleep(delay);
    }
  }
}

export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  label = '',
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await withRetry(() => fn(items[idx], idx), label);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

// ---------------------------------------------------------------------------
// Concurrent evaluation + judging
// ---------------------------------------------------------------------------

export async function evaluateConcurrent(
  conversation: LoCoMoConversation,
  recall: RecallFn,
  concurrency: number,
): Promise<RawResult[]> {
  return mapConcurrent(
    conversation.questions,
    concurrency,
    async (q, i) => {
      const response = await recall(q.question);
      return {
        conversationId: conversation.conversation_id,
        questionIndex: i,
        question: q.question,
        expectedAnswer: q.answer,
        predictedAnswer: response.answer,
        category: q.category,
        confidence: response.confidence,
      };
    },
    'answer',
  );
}

export async function judgeConcurrent(
  results: RawResult[],
  llm: LLMProvider,
  concurrency: number,
): Promise<ScoredResult[]> {
  return mapConcurrent(
    results,
    concurrency,
    async (result) => {
      const verdict = await judgeAnswer(
        {
          question: result.question,
          expectedAnswer: result.expectedAnswer,
          predictedAnswer: result.predictedAnswer,
        },
        llm,
      );
      return { ...result, correct: verdict.correct };
    },
    'judge',
  );
}

// ---------------------------------------------------------------------------
// Dataset loader
// ---------------------------------------------------------------------------

const CATEGORY_MAP: Record<number, LoCoMoQuestion['category']> = {
  1: 'single-hop',
  2: 'temporal',
  3: 'open-domain',
  4: 'multi-hop',
  5: 'adversarial',
};

interface RawTurn {
  speaker?: string;
  dia_id?: string;
  text?: string;
}

export function loadDataset(
  path: string,
  maxConversations: number,
): LoCoMoConversation[] {
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown[];
  const entries = raw.slice(0, maxConversations);

  return entries.map((entry, idx) => {
    const obj = entry as Record<string, unknown>;
    const conv = obj.conversation as Record<string, unknown>;
    const qa = obj.qa as Record<string, unknown>[];

    const sessions: LoCoMoSession[] = [];
    for (let s = 1; s <= 100; s++) {
      const turns = conv[`session_${s}`];
      if (!Array.isArray(turns)) continue;

      const dateTime = conv[`session_${s}_date_time`];
      const parsed = (turns as RawTurn[])
        .filter((t) => t.text)
        .map((t) => ({
          speaker: t.speaker ?? 'unknown',
          dia_id: t.dia_id ?? `s${s}_unknown`,
          text: t.text ?? '',
        }));
      if (parsed.length === 0) continue;

      sessions.push({
        date_time: typeof dateTime === 'string' ? dateTime : '',
        speaker_a: String(conv.speaker_a ?? ''),
        speaker_b: String(conv.speaker_b ?? ''),
        turns: parsed,
      });
    }

    const questions: LoCoMoQuestion[] = qa.map((q) => ({
      question: String(q.question ?? ''),
      answer: String(q.answer ?? ''),
      category: CATEGORY_MAP[q.category as number] ?? 'single-hop',
      evidence: Array.isArray(q.evidence)
        ? (q.evidence as unknown[]).filter(
            (e): e is string => typeof e === 'string',
          )
        : [],
    }));

    return {
      conversation_id: String(
        (obj as Record<string, unknown>).sample_id ?? `conv_${idx}`,
      ),
      sessions,
      questions,
    };
  });
}

// ---------------------------------------------------------------------------
// Stratified sampling
// ---------------------------------------------------------------------------

interface TaggedQuestion {
  convIdx: number;
  qIdx: number;
  category: LoCoMoQuestion['category'];
}

export function stratifiedSample(
  conversations: LoCoMoConversation[],
  perCategory: number,
  seed: number,
): LoCoMoConversation[] {
  const rng = mulberry32(seed);

  // Collect all questions tagged with their location
  const pool: TaggedQuestion[] = [];
  for (let ci = 0; ci < conversations.length; ci++) {
    for (let qi = 0; qi < conversations[ci].questions.length; qi++) {
      pool.push({
        convIdx: ci,
        qIdx: qi,
        category: conversations[ci].questions[qi].category,
      });
    }
  }

  // Group by category
  const byCategory = new Map<string, TaggedQuestion[]>();
  for (const tq of pool) {
    const list = byCategory.get(tq.category) ?? [];
    list.push(tq);
    byCategory.set(tq.category, list);
  }

  // Sample N per category, shuffled for cross-conversation spread
  const selected = new Set<string>(); // "convIdx:qIdx"
  for (const [cat, questions] of byCategory) {
    const shuffled = shuffle(questions, rng);
    const n = Math.min(perCategory, shuffled.length);
    for (let i = 0; i < n; i++) {
      selected.add(`${shuffled[i].convIdx}:${shuffled[i].qIdx}`);
    }
    console.log(`  ${cat}: ${n}/${questions.length} sampled`);
  }

  // Rebuild conversations with only selected questions
  const result: LoCoMoConversation[] = [];
  for (let ci = 0; ci < conversations.length; ci++) {
    const orig = conversations[ci];
    const filteredQs = orig.questions.filter((_, qi) =>
      selected.has(`${ci}:${qi}`),
    );
    if (filteredQs.length === 0) continue;
    result.push({ ...orig, questions: filteredQs });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Metric helpers
// ---------------------------------------------------------------------------

export interface ConversationMetrics {
  conversationId: string;
  total: number;
  correct: number;
  accuracy: number;
}

export interface ConfidenceMetrics {
  mean: number;
  meanCorrect: number;
  meanIncorrect: number;
}

export interface TimingMetrics {
  totalSeconds: number;
  answerSeconds: number;
  judgeSeconds: number;
  avgPerQuestion: number;
}

export function computeConfidenceMetrics(
  results: ScoredResult[],
): ConfidenceMetrics {
  const correct = results.filter((r) => r.correct);
  const incorrect = results.filter((r) => !r.correct);
  const avg = (arr: ScoredResult[]) =>
    arr.length > 0 ? arr.reduce((s, r) => s + r.confidence, 0) / arr.length : 0;
  return {
    mean: avg(results),
    meanCorrect: avg(correct),
    meanIncorrect: avg(incorrect),
  };
}

export function computeConversationMetrics(
  results: ScoredResult[],
): ConversationMetrics[] {
  const grouped = new Map<string, ScoredResult[]>();
  for (const r of results) {
    const list = grouped.get(r.conversationId) ?? [];
    list.push(r);
    grouped.set(r.conversationId, list);
  }

  return [...grouped.entries()]
    .map(([conversationId, rs]) => {
      const correct = rs.filter((r) => r.correct).length;
      return {
        conversationId,
        total: rs.length,
        correct,
        accuracy: correct / rs.length,
      };
    })
    .sort((a, b) => a.conversationId.localeCompare(b.conversationId));
}
