// Core type definitions for polyg-mcp
// Types are inferred from Zod schemas in schemas.ts for runtime validation

// Re-export types from schemas (these are now Zod-inferred)
export type {
  // Core types
  CausalLink,
  ClassifierOutput,
  Concept,
  // MAGMA types
  DepthHints,
  Entity,
  EntityMention,
  GraphView,
  GraphViewNode,
  GraphViewSource,
  IntentType,
  LLMCompletionOptions,
  MAGMAConfig,
  MAGMAIntent,
  MAGMAIntentType,
  MergedSubgraph,
  ScoredNode,
  SemanticMatch,
  SynthesizerOutput,
  TemporalContext,
  TemporalEvent,
  TemporalFact,
  Timeframe,
} from './schemas.js';

// Additional types not needing runtime validation

export interface ClassifierInput {
  query: string;
  context?: string;
}

export interface GraphResult {
  graph: 'semantic' | 'temporal' | 'causal' | 'entity';
  data: unknown;
}

export interface GraphResults {
  successful: GraphResult[];
  failed: { graph: string; error: Error }[];
}

export interface SynthesizerInput {
  original_query: string;
  classification: import('./schemas.js').ClassifierOutput;
  graph_results: GraphResults;
}

// LLM Provider interface
export interface LLMProvider {
  complete(
    options: import('./schemas.js').LLMCompletionOptions,
  ): Promise<string>;
}

// Embedding Provider interface
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

// Causal node type (not in schema as it's internal)
export interface CausalNode {
  uuid: string;
  description: string;
  node_type: string;
}
