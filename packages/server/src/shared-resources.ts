// SharedResources - Singleton holding expensive, reusable resources
import {
  createEmbeddingProvider,
  createLLMProvider,
  FalkorDBAdapter,
  Orchestrator,
  StorageConfigError,
} from '@polyg-mcp/core';
import {
  type EmbeddingProvider,
  type HealthStatus,
  type LLMProvider,
  type PolygConfig,
  PolygConfigSchema,
} from '@polyg-mcp/shared';
import {
  ServerConfigError,
  ServerStartError,
  ServerStopError,
} from './errors.js';
import { HealthChecker } from './health.js';

/**
 * SharedResources holds expensive, reusable resources that are shared across all sessions.
 * This includes the database connection, LLM/embedding providers, and the orchestrator.
 */
export class SharedResources {
  readonly db: FalkorDBAdapter;
  readonly llmProvider: LLMProvider;
  readonly embeddingProvider: EmbeddingProvider;
  readonly orchestrator: Orchestrator;
  readonly healthChecker: HealthChecker;
  private readonly validatedConfig: PolygConfig;
  private _isConnected = false;

  /**
   * Create a new SharedResources instance
   * @throws {ServerConfigError} if configuration is invalid
   */
  constructor(config: PolygConfig) {
    // Validate configuration using Zod
    const configResult = PolygConfigSchema.safeParse(config);
    if (!configResult.success) {
      throw new ServerConfigError(
        `Invalid configuration:\n${configResult.error.issues.map((e: { path: PropertyKey[]; message: string }) => `  - ${e.path.join('.')}: ${e.message}`).join('\n')}`,
        undefined,
      );
    }
    this.validatedConfig = configResult.data;

    // Initialize FalkorDB adapter
    try {
      this.db = new FalkorDBAdapter(this.validatedConfig.falkordb);
    } catch (error) {
      if (error instanceof StorageConfigError) {
        throw new ServerConfigError(
          `FalkorDB configuration error: ${error.message}`,
          'falkordb',
          error,
        );
      }
      throw new ServerConfigError(
        `Failed to initialize FalkorDB adapter: ${error instanceof Error ? error.message : String(error)}`,
        'falkordb',
        error instanceof Error ? error : undefined,
      );
    }

    // Initialize LLM provider
    try {
      this.llmProvider = createLLMProvider({
        provider: this.validatedConfig.llm.provider,
        model: this.validatedConfig.llm.model,
        apiKey: this.validatedConfig.llm.apiKey,
        classifierMaxTokens: this.validatedConfig.llm.classifierMaxTokens,
        synthesizerMaxTokens: this.validatedConfig.llm.synthesizerMaxTokens,
      });
    } catch (error) {
      throw new ServerConfigError(
        `LLM provider initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        'llm',
        error instanceof Error ? error : undefined,
      );
    }

    // Initialize Embedding provider
    try {
      this.embeddingProvider = createEmbeddingProvider(
        {
          provider: this.validatedConfig.embeddings.provider,
          model: this.validatedConfig.embeddings.model,
          dimensions: this.validatedConfig.embeddings.dimensions,
        },
        this.validatedConfig.llm.apiKey,
      );
    } catch (error) {
      throw new ServerConfigError(
        `Embedding provider initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        'embeddings',
        error instanceof Error ? error : undefined,
      );
    }

    // Initialize Orchestrator
    this.orchestrator = new Orchestrator(
      this.db,
      this.llmProvider,
      this.embeddingProvider,
      {
        timeout: this.validatedConfig.execution.parallelTimeout,
      },
    );

    // Initialize health checker
    this.healthChecker = new HealthChecker(this.db);
  }

  /**
   * Connect to database and initialize resources
   * @throws {ServerStartError} if connection fails
   */
  async start(): Promise<void> {
    if (this._isConnected) {
      return;
    }

    try {
      await this.db.connect();
      this._isConnected = true;
    } catch (error) {
      throw new ServerStartError(
        `Failed to connect to FalkorDB: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Disconnect and cleanup resources
   * @throws {ServerStopError} if shutdown fails
   */
  async stop(): Promise<void> {
    const errors: Error[] = [];

    try {
      await this.db.disconnect();
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    this._isConnected = false;

    if (errors.length > 0) {
      throw new ServerStopError(
        `Errors during shutdown: ${errors.map((e) => e.message).join('; ')}`,
        errors[0],
      );
    }
  }

  /**
   * Check if database is connected
   */
  isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Get health status
   */
  async getHealth(): Promise<HealthStatus> {
    return this.healthChecker.check();
  }

  /**
   * Get validated configuration
   */
  getConfig(): PolygConfig {
    return this.validatedConfig;
  }
}
