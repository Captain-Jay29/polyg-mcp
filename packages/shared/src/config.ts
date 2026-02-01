// Configuration types and validation for polyg-mcp
import type { ZodError } from 'zod';
import {
  type EmbeddingsConfig,
  EmbeddingsConfigSchema,
  type ExecutionConfig,
  ExecutionConfigSchema,
  type FalkorDBConfig,
  FalkorDBConfigSchema,
  type HTTPServerOptions,
  HTTPServerOptionsSchema,
  type LLMConfig,
  LLMConfigSchema,
  type MAGMAConfig,
  MAGMAConfigSchema,
  type PolygConfig,
  PolygConfigSchema,
} from './schemas.js';

// Re-export config types from schemas
export type {
  FalkorDBConfig,
  LLMConfig,
  EmbeddingsConfig,
  ExecutionConfig,
  PolygConfig,
  HTTPServerOptions,
  MAGMAConfig,
};

/**
 * Error thrown when configuration validation fails
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: ZodError['issues'],
  ) {
    super(message);
    this.name = 'ConfigValidationError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get a formatted string of all validation errors
   */
  getFormattedErrors(): string {
    return this.errors
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
  }
}

/**
 * Parse environment variable as a valid port number
 */
function parseEnvPort(
  envVar: string | undefined,
  defaultPort: number,
  envName?: string,
): number {
  if (!envVar) return defaultPort;
  const port = Number.parseInt(envVar, 10);
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    if (envName) {
      console.warn(
        `[config] Invalid value for ${envName}="${envVar}" (must be port 1-65535), using default: ${defaultPort}`,
      );
    }
    return defaultPort;
  }
  return port;
}

/**
 * Parse environment variable as a positive integer
 */
function parseEnvInt(
  envVar: string | undefined,
  defaultValue: number,
  envName?: string,
): number {
  if (!envVar) return defaultValue;
  const value = Number.parseInt(envVar, 10);
  if (Number.isNaN(value) || value < 0) {
    if (envName) {
      console.warn(
        `[config] Invalid value for ${envName}="${envVar}" (must be non-negative integer), using default: ${defaultValue}`,
      );
    }
    return defaultValue;
  }
  return value;
}

/**
 * Build raw configuration from environment variables
 * This creates an unvalidated config object
 */
function buildRawConfig(): unknown {
  return {
    falkordb: {
      host: process.env.FALKORDB_HOST || 'localhost',
      port: parseEnvPort(process.env.FALKORDB_PORT, 6379, 'FALKORDB_PORT'),
      password: process.env.FALKORDB_PASSWORD,
      graphName: process.env.FALKORDB_GRAPH || 'polyg',
      queryTimeoutMs: parseEnvInt(
        process.env.FALKORDB_QUERY_TIMEOUT,
        30000,
        'FALKORDB_QUERY_TIMEOUT',
      ),
    },
    llm: {
      provider: 'openai',
      model: process.env.LLM_MODEL || 'gpt-5-mini',
      apiKey: process.env.OPENAI_API_KEY,
      classifierMaxTokens: parseEnvInt(
        process.env.CLASSIFIER_MAX_TOKENS,
        2000,
        'CLASSIFIER_MAX_TOKENS',
      ),
      synthesizerMaxTokens: parseEnvInt(
        process.env.SYNTHESIZER_MAX_TOKENS,
        2000,
        'SYNTHESIZER_MAX_TOKENS',
      ),
    },
    embeddings: {
      provider: 'openai',
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
      apiKey: process.env.OPENAI_API_KEY,
      dimensions: 1536,
    },
    execution: {
      parallelTimeout: parseEnvInt(
        process.env.POLYG_PARALLEL_TIMEOUT,
        5000,
        'POLYG_PARALLEL_TIMEOUT',
      ),
      maxRetries: parseEnvInt(
        process.env.POLYG_MAX_RETRIES,
        2,
        'POLYG_MAX_RETRIES',
      ),
    },
  };
}

/**
 * Default configuration (validated)
 */
export const DEFAULT_CONFIG: PolygConfig = PolygConfigSchema.parse(
  buildRawConfig(),
);

/**
 * Deep merge configuration objects
 */
function deepMerge<T extends Record<string, unknown>>(
  base: T,
  overrides: Partial<T> | undefined,
): T {
  if (!overrides) return base;

  const result = { ...base };
  for (const key of Object.keys(overrides) as Array<keyof T>) {
    const value = overrides[key];
    if (
      value !== undefined &&
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      result[key] = deepMerge(
        base[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      ) as T[keyof T];
    } else if (value !== undefined) {
      result[key] = value as T[keyof T];
    }
  }
  return result;
}

/**
 * Load and validate configuration
 * @throws {ConfigValidationError} When configuration is invalid
 */
export function loadConfig(overrides?: Partial<PolygConfig>): PolygConfig {
  const rawConfig = buildRawConfig();
  const merged = deepMerge(rawConfig as PolygConfig, overrides);

  const result = PolygConfigSchema.safeParse(merged);

  if (!result.success) {
    throw new ConfigValidationError(
      `Invalid configuration:\n${result.error.issues.map((e) => `  - ${e.path.join('.')}: ${e.message}`).join('\n')}`,
      result.error.issues,
    );
  }

  return result.data;
}

/**
 * Validate a partial FalkorDB config
 */
export function validateFalkorDBConfig(config: unknown): FalkorDBConfig {
  const result = FalkorDBConfigSchema.safeParse(config);
  if (!result.success) {
    throw new ConfigValidationError(
      `Invalid FalkorDB configuration: ${result.error.message}`,
      result.error.issues,
    );
  }
  return result.data;
}

/**
 * Validate a partial LLM config
 */
export function validateLLMConfig(config: unknown): LLMConfig {
  const result = LLMConfigSchema.safeParse(config);
  if (!result.success) {
    throw new ConfigValidationError(
      `Invalid LLM configuration: ${result.error.message}`,
      result.error.issues,
    );
  }
  return result.data;
}

/**
 * Validate a partial embeddings config
 */
export function validateEmbeddingsConfig(config: unknown): EmbeddingsConfig {
  const result = EmbeddingsConfigSchema.safeParse(config);
  if (!result.success) {
    throw new ConfigValidationError(
      `Invalid embeddings configuration: ${result.error.message}`,
      result.error.issues,
    );
  }
  return result.data;
}

/**
 * Validate execution config
 */
export function validateExecutionConfig(config: unknown): ExecutionConfig {
  const result = ExecutionConfigSchema.safeParse(config);
  if (!result.success) {
    throw new ConfigValidationError(
      `Invalid execution configuration: ${result.error.message}`,
      result.error.issues,
    );
  }
  return result.data;
}

/**
 * Validate HTTP server options
 */
export function validateHTTPServerOptions(config: unknown): HTTPServerOptions {
  const result = HTTPServerOptionsSchema.safeParse(config);
  if (!result.success) {
    throw new ConfigValidationError(
      `Invalid HTTP server options: ${result.error.message}`,
      result.error.issues,
    );
  }
  return result.data;
}

// ============================================================================
// MAGMA Configuration
// ============================================================================

/**
 * Parse environment variable as float with default
 */
function parseEnvFloat(
  envVar: string | undefined,
  defaultValue: number,
  envName?: string,
): number {
  if (!envVar) return defaultValue;
  const parsed = Number.parseFloat(envVar);
  if (Number.isNaN(parsed)) {
    if (envName) {
      console.warn(
        `[config] Invalid value for ${envName}="${envVar}" (must be a number), using default: ${defaultValue}`,
      );
    }
    return defaultValue;
  }
  return parsed;
}

/**
 * Build MAGMA configuration from environment variables
 */
function buildMAGMAConfigFromEnv(): unknown {
  return {
    semanticTopK: parseEnvInt(
      process.env.MAGMA_SEMANTIC_TOP_K,
      10,
      'MAGMA_SEMANTIC_TOP_K',
    ),
    minSemanticScore: parseEnvFloat(
      process.env.MAGMA_MIN_SEMANTIC_SCORE,
      0.5,
      'MAGMA_MIN_SEMANTIC_SCORE',
    ),
    defaultDepths: {
      entity: parseEnvInt(
        process.env.MAGMA_ENTITY_DEPTH,
        2,
        'MAGMA_ENTITY_DEPTH',
      ),
      temporal: parseEnvInt(
        process.env.MAGMA_TEMPORAL_DEPTH,
        2,
        'MAGMA_TEMPORAL_DEPTH',
      ),
      causal: parseEnvInt(
        process.env.MAGMA_CAUSAL_DEPTH,
        3,
        'MAGMA_CAUSAL_DEPTH',
      ),
    },
    minNodesPerView: parseEnvInt(
      process.env.MAGMA_MIN_NODES_PER_VIEW,
      3,
      'MAGMA_MIN_NODES_PER_VIEW',
    ),
    maxNodesPerView: parseEnvInt(
      process.env.MAGMA_MAX_NODES_PER_VIEW,
      50,
      'MAGMA_MAX_NODES_PER_VIEW',
    ),
    multiViewBoost: parseEnvFloat(
      process.env.MAGMA_MULTI_VIEW_BOOST,
      1.5,
      'MAGMA_MULTI_VIEW_BOOST',
    ),
    // Input length limits
    maxQueryLength: parseEnvInt(
      process.env.MAGMA_MAX_QUERY_LENGTH,
      8000,
      'MAGMA_MAX_QUERY_LENGTH',
    ),
    maxContextLength: parseEnvInt(
      process.env.MAGMA_MAX_CONTEXT_LENGTH,
      4000,
      'MAGMA_MAX_CONTEXT_LENGTH',
    ),
  };
}

/**
 * Default MAGMA configuration (validated)
 */
export const DEFAULT_MAGMA_CONFIG: MAGMAConfig = MAGMAConfigSchema.parse(
  buildMAGMAConfigFromEnv(),
);

/**
 * Load and validate MAGMA configuration
 * @throws {ConfigValidationError} When configuration is invalid
 */
export function loadMAGMAConfig(overrides?: Partial<MAGMAConfig>): MAGMAConfig {
  const rawConfig = buildMAGMAConfigFromEnv();
  const merged = deepMerge(rawConfig as MAGMAConfig, overrides);

  const result = MAGMAConfigSchema.safeParse(merged);

  if (!result.success) {
    throw new ConfigValidationError(
      `Invalid MAGMA configuration:\n${result.error.issues.map((e) => `  - ${e.path.join('.')}: ${e.message}`).join('\n')}`,
      result.error.issues,
    );
  }

  return result.data;
}

/**
 * Validate MAGMA config
 */
export function validateMAGMAConfig(config: unknown): MAGMAConfig {
  const result = MAGMAConfigSchema.safeParse(config);
  if (!result.success) {
    throw new ConfigValidationError(
      `Invalid MAGMA configuration: ${result.error.message}`,
      result.error.issues,
    );
  }
  return result.data;
}
