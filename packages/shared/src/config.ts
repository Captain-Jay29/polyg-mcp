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
function parseEnvPort(envVar: string | undefined, defaultPort: number): number {
  if (!envVar) return defaultPort;
  const port = Number.parseInt(envVar, 10);
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    return defaultPort;
  }
  return port;
}

/**
 * Parse environment variable as a positive integer
 */
function parseEnvInt(envVar: string | undefined, defaultValue: number): number {
  if (!envVar) return defaultValue;
  const value = Number.parseInt(envVar, 10);
  if (Number.isNaN(value) || value < 0) {
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
      port: parseEnvPort(process.env.FALKORDB_PORT, 6379),
      password: process.env.FALKORDB_PASSWORD,
      graphName: process.env.FALKORDB_GRAPH || 'polyg',
    },
    llm: {
      provider: 'openai',
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
      apiKey: process.env.OPENAI_API_KEY,
      classifierMaxTokens: parseEnvInt(process.env.CLASSIFIER_MAX_TOKENS, 2000),
      synthesizerMaxTokens: parseEnvInt(
        process.env.SYNTHESIZER_MAX_TOKENS,
        2000,
      ),
    },
    embeddings: {
      provider: 'openai',
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
      dimensions: 1536,
    },
    execution: {
      parallelTimeout: 5000,
      maxRetries: 2,
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
 * Parse environment variable as integer with default
 */
function parseEnvInt(
  envVar: string | undefined,
  defaultValue: number,
): number {
  if (!envVar) return defaultValue;
  const parsed = Number.parseInt(envVar, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse environment variable as float with default
 */
function parseEnvFloat(
  envVar: string | undefined,
  defaultValue: number,
): number {
  if (!envVar) return defaultValue;
  const parsed = Number.parseFloat(envVar);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Build MAGMA configuration from environment variables
 */
function buildMAGMAConfigFromEnv(): unknown {
  return {
    semanticTopK: parseEnvInt(process.env.MAGMA_SEMANTIC_TOP_K, 10),
    minSemanticScore: parseEnvFloat(process.env.MAGMA_MIN_SEMANTIC_SCORE, 0.5),
    defaultDepths: {
      entity: parseEnvInt(process.env.MAGMA_ENTITY_DEPTH, 2),
      temporal: parseEnvInt(process.env.MAGMA_TEMPORAL_DEPTH, 2),
      causal: parseEnvInt(process.env.MAGMA_CAUSAL_DEPTH, 3),
    },
    minNodesPerView: parseEnvInt(process.env.MAGMA_MIN_NODES_PER_VIEW, 3),
    maxNodesPerView: parseEnvInt(process.env.MAGMA_MAX_NODES_PER_VIEW, 50),
    multiViewBoost: parseEnvFloat(process.env.MAGMA_MULTI_VIEW_BOOST, 1.5),
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
export function loadMAGMAConfig(
  overrides?: Partial<MAGMAConfig>,
): MAGMAConfig {
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
