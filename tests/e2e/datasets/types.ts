// Shared types for test datasets

export interface EntityData {
  name: string;
  type: string;
  properties?: Record<string, string>;
  relationships?: { target: string; type: string }[];
}

export interface EventData {
  description: string;
  timestamp: string; // ISO format: '2026-01-15T14:00:00Z'
  entities: string[];
}

export interface CausalLinkData {
  cause: string;
  effect: string;
  confidence: number;
  mechanism?: string;
  entities?: string[]; // Entity names affected by this causal relationship (for X_AFFECTS links)
  events?: string[]; // Event descriptions this causal link refers to (for X_REFERS_TO links)
}

export interface FactData {
  subject: string;
  predicate: string;
  object: string;
  validFrom: string;
  validTo?: string;
  subjectEntity?: string; // Entity name that the fact subject refers to (for X_INVOLVES links)
}

export interface ConceptData {
  name: string;
  description: string;
  entities?: string[]; // Entity names this concept represents (for X_REPRESENTS links)
}

export interface Dataset {
  entities: EntityData[];
  events: EventData[];
  causalLinks: CausalLinkData[];
  facts: FactData[];
  concepts: ConceptData[];
}

export interface TestQuery {
  query: string;
  expectedTools: (
    | 'semantic_search'
    | 'entity_lookup'
    | 'temporal_expand'
    | 'causal_expand'
  )[];
  expectedInAnswer: string[];
}

export interface DatasetModule {
  name: string;
  description: string;
  data: Dataset;
  queries: TestQuery[];
  seed: (client: MCPClientLike) => Promise<void>;
}

// Minimal interface for MCP client used by seed functions
export interface MCPClientLike {
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
}
