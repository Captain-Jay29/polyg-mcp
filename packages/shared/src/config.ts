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
};

/**
 * Error thrown when configuration validation fails
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: ZodError['errors'],
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
      classifierMaxTokens: 500,
      synthesizerMaxTokens: 1000,
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
      `Invalid configuration:\n${result.error.errors.map((e) => `  - ${e.path.join('.')}: ${e.message}`).join('\n')}`,
      result.error.errors,
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
      result.error.errors,
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
      result.error.errors,
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
      result.error.errors,
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
      result.error.errors,
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
      result.error.errors,
    );
  }
  return result.data;
}
