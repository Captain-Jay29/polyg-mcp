import type { LLMProvider } from '@polyg-mcp/shared';
import type { RecallFn } from '../evaluate.js';
import type { LoCoMoConversation, LoCoMoSession } from '../types.js';

export function formatConversation(sessions: LoCoMoSession[]): string {
  const lines: string[] = [];
  for (const session of sessions) {
    for (const turn of session.turns) {
      lines.push(`[${session.date_time}] ${turn.speaker}: ${turn.text}`);
    }
  }
  return lines.join('\n');
}

export function buildFullContextPrompt(
  conversationText: string,
  question: string,
): string {
  return [
    'You are given a complete conversation history. Answer the question based on the conversation.',
    '',
    '## Conversation',
    conversationText,
    '',
    '## Question',
    question,
    '',
    'Provide a concise answer based only on the conversation above.',
  ].join('\n');
}

export function createFullContextRecall(
  conversation: LoCoMoConversation,
  llm: LLMProvider,
): RecallFn {
  const conversationText = formatConversation(conversation.sessions);

  return async (query: string) => {
    const prompt = buildFullContextPrompt(conversationText, query);
    const answer = await llm.complete({
      prompt,
      responseFormat: 'text',
      maxTokens: 256,
    });
    return { answer, confidence: 1.0 };
  };
}
