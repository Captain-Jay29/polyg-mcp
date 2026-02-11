import type { LLMProvider } from '@polyg-mcp/shared';
import type { BootstrapResult } from '../utils/bootstrap.js';
import { bootstrapCI } from '../utils/bootstrap.js';
import { judgeAnswer } from './judge.js';
import type { LoCoMoConversation, LoCoMoQuestion } from './types.js';

export type RecallFn = (
  query: string,
) => Promise<{ answer: string; confidence: number }>;

export interface RawResult {
  conversationId: string;
  questionIndex: number;
  question: string;
  expectedAnswer: string;
  predictedAnswer: string;
  category: LoCoMoQuestion['category'];
  confidence: number;
}

export interface ScoredResult extends RawResult {
  correct: boolean;
}

export interface CategoryScore {
  category: string;
  accuracy: number;
  ci: BootstrapResult;
  count: number;
}

export interface EvaluationSummary {
  overall: CategoryScore;
  byCategory: CategoryScore[];
  results: ScoredResult[];
}

export async function evaluateConversation(
  conversation: LoCoMoConversation,
  recall: RecallFn,
): Promise<RawResult[]> {
  const results: RawResult[] = [];

  for (let i = 0; i < conversation.questions.length; i++) {
    const q = conversation.questions[i];
    const response = await recall(q.question);
    results.push({
      conversationId: conversation.conversation_id,
      questionIndex: i,
      question: q.question,
      expectedAnswer: q.answer,
      predictedAnswer: response.answer,
      category: q.category,
      confidence: response.confidence,
    });
  }

  return results;
}

export async function judgeResults(
  results: RawResult[],
  llm: LLMProvider,
): Promise<ScoredResult[]> {
  const scored: ScoredResult[] = [];

  for (const result of results) {
    const verdict = await judgeAnswer(
      {
        question: result.question,
        expectedAnswer: result.expectedAnswer,
        predictedAnswer: result.predictedAnswer,
      },
      llm,
    );
    scored.push({ ...result, correct: verdict.correct });
  }

  return scored;
}

function computeCategoryScore(
  category: string,
  results: ScoredResult[],
  options?: { nBootstrap?: number; ci?: number; seed?: number },
): CategoryScore {
  const scores = results.map((r) => (r.correct ? 1 : 0));
  const ci = bootstrapCI(
    scores,
    options?.nBootstrap,
    options?.ci,
    options?.seed,
  );

  return {
    category,
    accuracy: ci.mean,
    ci,
    count: results.length,
  };
}

export function aggregateScores(
  results: ScoredResult[],
  bootstrapOptions?: { nBootstrap?: number; ci?: number; seed?: number },
): EvaluationSummary {
  // Group by category
  const grouped = new Map<string, ScoredResult[]>();
  for (const r of results) {
    const list = grouped.get(r.category) ?? [];
    list.push(r);
    grouped.set(r.category, list);
  }

  const byCategory: CategoryScore[] = [];
  for (const [category, categoryResults] of grouped) {
    byCategory.push(
      computeCategoryScore(category, categoryResults, bootstrapOptions),
    );
  }

  // Sort by category name for deterministic output
  byCategory.sort((a, b) => a.category.localeCompare(b.category));

  const overall = computeCategoryScore('overall', results, bootstrapOptions);

  return { overall, byCategory, results };
}
