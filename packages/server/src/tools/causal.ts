// Causal graph MCP tools
import type {
  AddCausalLinkInput,
  ExplainWhyInput,
  GetCausalChainInput,
} from '@polyg-mcp/shared';

export async function getCausalChain(
  input: GetCausalChainInput,
): Promise<unknown> {
  // TODO: Traverse causal chain (bypass LLM)
  throw new Error('Not implemented');
}

export async function addCausalLink(
  input: AddCausalLinkInput,
): Promise<unknown> {
  // TODO: Add causal link
  throw new Error('Not implemented');
}

export async function explainWhy(input: ExplainWhyInput): Promise<unknown> {
  // TODO: Find causal explanation
  throw new Error('Not implemented');
}
