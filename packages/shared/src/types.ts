// Core type definitions for polyg-mcp

// Intent Classification
export type IntentType = 'semantic' | 'temporal' | 'causal' | 'entity';

export interface ClassifierInput {
  query: string;
  context?: string;
}

export interface ClassifierOutput {
  intents: IntentType[];
  entities: EntityMention[];
  timeframe?: Timeframe;
  causal_direction?: 'upstream' | 'downstream' | 'both';
  semantic_query?: string;
  confidence: number;
}

export interface EntityMention {
  mention: string;
  type?: string;
  resolved?: string;
}

export interface Timeframe {
  type: 'specific' | 'range' | 'relative';
  value: string;
  end?: string;
}

// Graph Results
export interface GraphResult {
  graph: IntentType;
  data: unknown;
}

export interface GraphResults {
  successful: GraphResult[];
  failed: { graph: string; error: Error }[];
}

// Synthesizer
export interface SynthesizerInput {
  original_query: string;
  classification: ClassifierOutput;
  graph_results: GraphResults;
}

export interface SynthesizerOutput {
  answer: string;
  confidence: number;
  reasoning: {
    causal_chain?: CausalLink[];
    temporal_context?: TemporalContext;
    entities_involved?: Entity[];
    semantic_matches?: SemanticMatch[];
  };
  sources: string[];
  follow_ups?: string[];
}

// Entity Graph Types
export interface Entity {
  uuid: string;
  name: string;
  entity_type: string;
  properties?: Record<string, unknown>;
  created_at: Date;
}

// Temporal Graph Types
export interface TemporalEvent {
  uuid: string;
  description: string;
  occurred_at: Date;
  duration?: number;
}

export interface TemporalFact {
  uuid: string;
  subject: string;
  predicate: string;
  object: string;
  valid_from: Date;
  valid_to?: Date;
}

export interface TemporalContext {
  events?: TemporalEvent[];
  facts?: TemporalFact[];
}

// Causal Graph Types
export interface CausalNode {
  uuid: string;
  description: string;
  node_type: string;
}

export interface CausalLink {
  cause: string;
  effect: string;
  confidence: number;
  evidence?: string;
}

// Semantic Graph Types
export interface Concept {
  uuid: string;
  name: string;
  description?: string;
  embedding?: number[];
}

export interface SemanticMatch {
  concept: Concept;
  score: number;
}

// LLM Provider Types
export interface LLMCompletionOptions {
  prompt: string;
  responseFormat?: 'text' | 'json';
  maxTokens?: number;
}

export interface LLMProvider {
  complete(options: LLMCompletionOptions): Promise<string>;
}

// Embedding Provider Types
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}
