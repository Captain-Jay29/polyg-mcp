// High-level MCP tools - recall and remember (LLM-powered)
import type {
  RecallInput,
  RememberInput,
  SynthesizerOutput,
} from '@polyg-mcp/shared';

export async function recall(input: RecallInput): Promise<SynthesizerOutput> {
  // TODO: Full LLM pipeline - classify → query → synthesize
  throw new Error('Not implemented');
}

export async function remember(input: RememberInput): Promise<{
  entities_created: number;
  facts_added: number;
  events_logged: number;
}> {
  // TODO: LLM extraction → store in graphs
  throw new Error('Not implemented');
}
