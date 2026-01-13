// Configuration types and defaults for polyg-mcp

export interface FalkorDBConfig {
  host: string;
  port: number;
  password?: string;
  graphName: string;
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'ollama';
  model: string;
  baseUrl?: string;
  apiKey?: string;
  classifierMaxTokens: number;
  synthesizerMaxTokens: number;
}

export interface EmbeddingsConfig {
  provider: 'openai' | 'ollama';
  model: string;
  dimensions: number;
}

export interface ExecutionConfig {
  parallelTimeout: number;
  maxRetries: number;
}

export interface PolygConfig {
  falkordb: FalkorDBConfig;
  llm: LLMConfig;
  embeddings: EmbeddingsConfig;
  execution: ExecutionConfig;
}

export const DEFAULT_CONFIG: PolygConfig = {
  falkordb: {
    host: process.env.FALKORDB_HOST || 'localhost',
    port: Number(process.env.FALKORDB_PORT) || 6379,
    password: process.env.FALKORDB_PASSWORD,
    graphName: process.env.FALKORDB_GRAPH || 'polyg',
  },
  llm: {
    provider:
      (process.env.LLM_PROVIDER as 'openai' | 'anthropic' | 'ollama') ||
      'openai',
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    baseUrl: process.env.OLLAMA_BASE_URL,
    apiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY,
    classifierMaxTokens: 500,
    synthesizerMaxTokens: 1000,
  },
  embeddings: {
    provider:
      (process.env.EMBEDDING_PROVIDER as 'openai' | 'ollama') || 'openai',
    model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    dimensions: 1536,
  },
  execution: {
    parallelTimeout: 5000,
    maxRetries: 2,
  },
};

export function loadConfig(overrides?: Partial<PolygConfig>): PolygConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    falkordb: { ...DEFAULT_CONFIG.falkordb, ...overrides?.falkordb },
    llm: { ...DEFAULT_CONFIG.llm, ...overrides?.llm },
    embeddings: { ...DEFAULT_CONFIG.embeddings, ...overrides?.embeddings },
    execution: { ...DEFAULT_CONFIG.execution, ...overrides?.execution },
  };
}
