import type { LLMProvider } from '@polyg-mcp/shared';

export interface JudgeInput {
  question: string;
  expectedAnswer: string;
  predictedAnswer: string;
}

export interface JudgeResult {
  correct: boolean;
  rawResponse: string;
}

export function buildJudgePrompt(input: JudgeInput): string {
  return `You are an evaluation judge. Determine whether the predicted answer captures the same key information as the expected answer.

Question: ${input.question}

Expected answer: ${input.expectedAnswer}

Predicted answer: ${input.predictedAnswer}

Respond with exactly one word: CORRECT if the predicted answer captures the same key information as the expected answer, or WRONG if it does not.`;
}

export async function judgeAnswer(
  input: JudgeInput,
  llm: LLMProvider,
): Promise<JudgeResult> {
  const prompt = buildJudgePrompt(input);
  const rawResponse = await llm.complete({
    prompt,
    responseFormat: 'text',
    maxTokens: 64,
  });

  const normalized = rawResponse.toUpperCase();
  const correct =
    normalized.includes('CORRECT') && !normalized.includes('WRONG');

  return { correct, rawResponse };
}
