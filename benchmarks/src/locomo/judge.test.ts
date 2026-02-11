import type { LLMProvider } from '@polyg-mcp/shared';
import { describe, expect, it, vi } from 'vitest';
import { buildJudgePrompt, judgeAnswer } from './judge.js';

function makeMockLLM(response: string): LLMProvider {
  return { complete: vi.fn().mockResolvedValue(response) };
}

describe('buildJudgePrompt', () => {
  const input = {
    question: 'Where does Alice work?',
    expectedAnswer: 'Acme Corp',
    predictedAnswer: 'She works at Acme Corp',
  };

  it('includes question, expected, and predicted answer', () => {
    const prompt = buildJudgePrompt(input);
    expect(prompt).toContain('Where does Alice work?');
    expect(prompt).toContain('Acme Corp');
    expect(prompt).toContain('She works at Acme Corp');
  });

  it('asks for CORRECT/WRONG response', () => {
    const prompt = buildJudgePrompt(input);
    expect(prompt).toContain('CORRECT');
    expect(prompt).toContain('WRONG');
  });
});

describe('judgeAnswer', () => {
  const input = {
    question: 'Where does Alice work?',
    expectedAnswer: 'Acme Corp',
    predictedAnswer: 'She works at Acme Corp',
  };

  it('returns correct: true when LLM responds "CORRECT"', async () => {
    const llm = makeMockLLM('CORRECT');
    const result = await judgeAnswer(input, llm);
    expect(result.correct).toBe(true);
    expect(result.rawResponse).toBe('CORRECT');
  });

  it('returns correct: false when LLM responds "WRONG"', async () => {
    const llm = makeMockLLM('WRONG');
    const result = await judgeAnswer(input, llm);
    expect(result.correct).toBe(false);
  });

  it('handles mixed-case response', async () => {
    const llm = makeMockLLM('Correct');
    const result = await judgeAnswer(input, llm);
    expect(result.correct).toBe(true);
  });

  it('defaults to WRONG on ambiguous LLM response', async () => {
    const llm = makeMockLLM('I am not sure about this one');
    const result = await judgeAnswer(input, llm);
    expect(result.correct).toBe(false);
  });

  it('handles response with extra text containing CORRECT', async () => {
    const llm = makeMockLLM('CORRECT - the answer matches');
    const result = await judgeAnswer(input, llm);
    expect(result.correct).toBe(true);
  });

  it('treats response containing both CORRECT and WRONG as wrong', async () => {
    const llm = makeMockLLM('CORRECT is not right, it is WRONG');
    const result = await judgeAnswer(input, llm);
    expect(result.correct).toBe(false);
  });

  it('passes text responseFormat to LLM', async () => {
    const llm = makeMockLLM('CORRECT');
    await judgeAnswer(input, llm);
    expect(llm.complete).toHaveBeenCalledWith(
      expect.objectContaining({ responseFormat: 'text' }),
    );
  });
});
