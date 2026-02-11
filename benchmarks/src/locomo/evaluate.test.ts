import type { LLMProvider } from '@polyg-mcp/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  aggregateScores,
  evaluateConversation,
  judgeResults,
  type RawResult,
  type RecallFn,
  type ScoredResult,
} from './evaluate.js';
import type { LoCoMoConversation } from './types.js';

function makeConversation(
  questions: LoCoMoConversation['questions'] = [],
): LoCoMoConversation {
  return {
    conversation_id: 'conv_0',
    sessions: [
      {
        date_time: '2023-05-08T13:00:00Z',
        speaker_a: 'Alice',
        speaker_b: 'Bob',
        turns: [
          { speaker: 'Alice', dia_id: 'd1', text: 'Hello' },
          { speaker: 'Bob', dia_id: 'd2', text: 'Hi' },
        ],
      },
    ],
    questions,
  };
}

function makeRecall(answer = 'mock answer', confidence = 0.9): RecallFn {
  return vi.fn().mockResolvedValue({ answer, confidence });
}

function makeRawResult(overrides: Partial<RawResult> = {}): RawResult {
  return {
    conversationId: 'conv_0',
    questionIndex: 0,
    question: 'Where does Alice work?',
    expectedAnswer: 'Acme Corp',
    predictedAnswer: 'Acme Corp',
    category: 'single-hop',
    confidence: 0.9,
    ...overrides,
  };
}

function makeScoredResult(
  correct: boolean,
  overrides: Partial<ScoredResult> = {},
): ScoredResult {
  return { ...makeRawResult(), correct, ...overrides };
}

describe('evaluateConversation', () => {
  it('calls recall for each question and collects raw results', async () => {
    const questions: LoCoMoConversation['questions'] = [
      {
        question: 'Q1?',
        answer: 'A1',
        category: 'single-hop',
        evidence: [],
      },
      {
        question: 'Q2?',
        answer: 'A2',
        category: 'multi-hop',
        evidence: [],
      },
    ];
    const recall = makeRecall();
    const results = await evaluateConversation(
      makeConversation(questions),
      recall,
    );

    expect(recall).toHaveBeenCalledTimes(2);
    expect(recall).toHaveBeenCalledWith('Q1?');
    expect(recall).toHaveBeenCalledWith('Q2?');
    expect(results).toHaveLength(2);
  });

  it('preserves question category and expected answer', async () => {
    const questions: LoCoMoConversation['questions'] = [
      {
        question: 'When did it happen?',
        answer: 'May 2023',
        category: 'temporal',
        evidence: ['e1'],
      },
    ];
    const recall = makeRecall('Around May 2023', 0.85);
    const results = await evaluateConversation(
      makeConversation(questions),
      recall,
    );

    expect(results[0].category).toBe('temporal');
    expect(results[0].expectedAnswer).toBe('May 2023');
    expect(results[0].predictedAnswer).toBe('Around May 2023');
    expect(results[0].confidence).toBe(0.85);
    expect(results[0].conversationId).toBe('conv_0');
    expect(results[0].questionIndex).toBe(0);
  });

  it('handles empty questions array', async () => {
    const recall = makeRecall();
    const results = await evaluateConversation(makeConversation([]), recall);

    expect(results).toHaveLength(0);
    expect(recall).not.toHaveBeenCalled();
  });
});

describe('judgeResults', () => {
  it('calls judge for each raw result and returns scored results', async () => {
    const raw: RawResult[] = [
      makeRawResult({ question: 'Q1?', predictedAnswer: 'correct answer' }),
      makeRawResult({
        question: 'Q2?',
        predictedAnswer: 'wrong answer',
        questionIndex: 1,
      }),
    ];

    let callCount = 0;
    const llm: LLMProvider = {
      complete: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount === 1 ? 'CORRECT' : 'WRONG');
      }),
    };

    const scored = await judgeResults(raw, llm);

    expect(scored).toHaveLength(2);
    expect(scored[0].correct).toBe(true);
    expect(scored[1].correct).toBe(false);
    expect(llm.complete).toHaveBeenCalledTimes(2);
  });
});

describe('aggregateScores', () => {
  it('computes correct per-category accuracy', () => {
    const results: ScoredResult[] = [
      makeScoredResult(true, { category: 'single-hop' }),
      makeScoredResult(false, { category: 'single-hop', questionIndex: 1 }),
      makeScoredResult(true, { category: 'multi-hop', questionIndex: 2 }),
      makeScoredResult(true, { category: 'multi-hop', questionIndex: 3 }),
    ];

    const summary = aggregateScores(results);

    const singleHop = summary.byCategory.find(
      (c) => c.category === 'single-hop',
    );
    const multiHop = summary.byCategory.find((c) => c.category === 'multi-hop');

    expect(singleHop?.accuracy).toBe(0.5);
    expect(singleHop?.count).toBe(2);
    expect(multiHop?.accuracy).toBe(1);
    expect(multiHop?.count).toBe(2);
  });

  it('computes overall accuracy across all categories', () => {
    const results: ScoredResult[] = [
      makeScoredResult(true, { category: 'single-hop' }),
      makeScoredResult(false, { category: 'single-hop', questionIndex: 1 }),
      makeScoredResult(true, { category: 'multi-hop', questionIndex: 2 }),
      makeScoredResult(true, { category: 'multi-hop', questionIndex: 3 }),
    ];

    const summary = aggregateScores(results);

    expect(summary.overall.accuracy).toBe(0.75);
    expect(summary.overall.count).toBe(4);
    expect(summary.overall.category).toBe('overall');
  });

  it('includes bootstrap CIs with reasonable values', () => {
    const results: ScoredResult[] = [
      makeScoredResult(true, { category: 'single-hop' }),
      makeScoredResult(false, { category: 'single-hop', questionIndex: 1 }),
      makeScoredResult(true, { category: 'single-hop', questionIndex: 2 }),
      makeScoredResult(false, { category: 'single-hop', questionIndex: 3 }),
      makeScoredResult(true, { category: 'single-hop', questionIndex: 4 }),
    ];

    const summary = aggregateScores(results, { seed: 42 });

    expect(summary.overall.ci).toBeDefined();
    expect(summary.overall.ci.mean).toBeCloseTo(0.6, 5);
    expect(summary.overall.ci.lower).toBeGreaterThanOrEqual(0);
    expect(summary.overall.ci.upper).toBeLessThanOrEqual(1);
    expect(summary.overall.ci.lower).toBeLessThanOrEqual(
      summary.overall.ci.mean,
    );
    expect(summary.overall.ci.upper).toBeGreaterThanOrEqual(
      summary.overall.ci.mean,
    );
    expect(summary.overall.ci.ci).toBe(0.95);
  });

  it('handles single-category results', () => {
    const results: ScoredResult[] = [
      makeScoredResult(true, { category: 'temporal' }),
      makeScoredResult(true, { category: 'temporal', questionIndex: 1 }),
    ];

    const summary = aggregateScores(results);

    expect(summary.byCategory).toHaveLength(1);
    expect(summary.byCategory[0].category).toBe('temporal');
    expect(summary.byCategory[0].accuracy).toBe(1);
    expect(summary.overall.accuracy).toBe(1);
  });
});
