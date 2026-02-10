// Orchestrator - central class connecting all pipeline components
import type {
  ClassifierInput,
  EmbeddingProvider,
  LLMProvider,
  MAGMAIntent,
  SynthesizerOutput,
} from '@polyg-mcp/shared';
import { z } from 'zod';
import { IntentClassifier } from './agents/intent-classifier.js';
import { Synthesizer } from './agents/synthesizer.js';
import {
  type MAGMAExecutionResult,
  MAGMAExecutor,
  type MAGMAGraphRegistry,
} from './executor/magma-executor.js';
import { CausalGraph } from './graphs/causal.js';
import { CrossLinker } from './graphs/cross-linker.js';
import { EntityGraph } from './graphs/entity.js';
import { SemanticGraph } from './graphs/semantic.js';
import { TemporalGraph } from './graphs/temporal.js';
import {
  ContextLinearizer,
  type LinearizedContext,
  OrchestratorError,
  RetrievalValidationError,
} from './retrieval/index.js';
import type { FalkorDBAdapter } from './storage/falkordb.js';

// Zod schema for config validation
const OrchestratorConfigSchema = z.object({
  semanticTopK: z.number().int().min(1).max(100).optional(),
  minSemanticScore: z.number().min(0).max(1).optional(),
  timeout: z.number().int().min(100).max(60000).optional(),
  maxContextTokens: z.number().int().min(100).max(100000).optional(),
  maxQueryLength: z.number().int().min(100).max(100000).optional(),
  maxContextLength: z.number().int().min(100).max(100000).optional(),
  classifierMaxTokens: z.number().int().min(100).max(10000).optional(),
  synthesizerMaxTokens: z.number().int().min(100).max(10000).optional(),
});

export interface OrchestratorConfig {
  /** MAGMA semantic search top-K (default: 10) */
  semanticTopK?: number;
  /** MAGMA minimum semantic score threshold (default: 0.5) */
  minSemanticScore?: number;
  /** Query timeout in ms (default: 5000) */
  timeout?: number;
  /** Context linearizer max tokens (default: 4000) */
  maxContextTokens?: number;
  /** Maximum query length in characters (default: 8000) */
  maxQueryLength?: number;
  /** Maximum context length in characters (default: 4000) */
  maxContextLength?: number;
  /** Maximum tokens for classifier LLM response (default: 500) */
  classifierMaxTokens?: number;
  /** Maximum tokens for synthesizer LLM response (default: 2000) */
  synthesizerMaxTokens?: number;
}

const DEFAULT_CONFIG: Required<OrchestratorConfig> = {
  semanticTopK: 10,
  minSemanticScore: 0.5,
  timeout: 5000,
  maxContextTokens: 4000,
  maxQueryLength: 8000,
  maxContextLength: 4000,
  classifierMaxTokens: 1000,
  synthesizerMaxTokens: 2000,
};

/**
 * Orchestrator connects all pipeline components using MAGMA-style retrieval:
 * - Graphs (Entity, Temporal, Causal, Semantic, CrossLinker)
 * - LLM Agents (IntentClassifier, Synthesizer)
 * - MAGMA Executor (semantic seeding → parallel expansion → merge)
 * - Context Linearizer (intent-based ordering)
 *
 * "Vectors locate. Graphs explain. Policies decide how to think."
 */
export class Orchestrator {
  // Graph instances
  readonly entityGraph: EntityGraph;
  readonly temporalGraph: TemporalGraph;
  readonly causalGraph: CausalGraph;
  readonly semanticGraph: SemanticGraph;
  readonly crossLinker: CrossLinker;

  // LLM agents
  private readonly classifier: IntentClassifier;
  private readonly synthesizer: Synthesizer;

  // MAGMA components
  private readonly executor: MAGMAExecutor;
  private readonly linearizer: ContextLinearizer;

  constructor(
    readonly db: FalkorDBAdapter,
    readonly llm: LLMProvider,
    readonly embeddings: EmbeddingProvider,
    config: OrchestratorConfig = {},
  ) {
    // Validate config
    const configResult = OrchestratorConfigSchema.safeParse(config);
    if (!configResult.success) {
      const errors = configResult.error.issues.map(
        (e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`,
      );
      throw new RetrievalValidationError(
        `Invalid Orchestrator config: ${errors.join(', ')}`,
        'Orchestrator',
        errors,
      );
    }

    // Merge with defaults
    const validatedConfig = {
      ...DEFAULT_CONFIG,
      ...configResult.data,
    };

    // Initialize graphs
    this.entityGraph = new EntityGraph(db);
    this.temporalGraph = new TemporalGraph(db);
    this.causalGraph = new CausalGraph(db);
    this.semanticGraph = new SemanticGraph(db, embeddings);
    this.crossLinker = new CrossLinker(db);

    // Initialize LLM agents
    this.classifier = new IntentClassifier(llm, {
      maxQueryLength: validatedConfig.maxQueryLength,
      maxContextLength: validatedConfig.maxContextLength,
      maxTokens: validatedConfig.classifierMaxTokens,
    });
    this.synthesizer = new Synthesizer(llm, {
      maxTokens: validatedConfig.synthesizerMaxTokens,
    });

    // Initialize MAGMA executor with all graphs including crossLinker
    const graphRegistry: MAGMAGraphRegistry = {
      entity: this.entityGraph,
      temporal: this.temporalGraph,
      causal: this.causalGraph,
      semantic: this.semanticGraph,
      crossLinker: this.crossLinker,
    };
    this.executor = new MAGMAExecutor(graphRegistry, {
      semanticTopK: validatedConfig.semanticTopK,
      minSemanticScore: validatedConfig.minSemanticScore,
      timeout: validatedConfig.timeout,
    });

    // Initialize context linearizer
    this.linearizer = new ContextLinearizer(validatedConfig.maxContextTokens);
  }

  /**
   * Recall - MAGMA-style query pipeline
   *
   * Flow: Query → IntentClassifier (WHY/WHEN/WHO/WHAT) → MAGMAExecutor
   *       → ContextLinearizer → Synthesizer → Response
   *
   * "Vectors locate. Graphs explain. Policies decide how to think."
   *
   * @param query - The user's natural language query
   * @param context - Optional context for the query
   * @returns Synthesized response with answer and reasoning
   * @throws {OrchestratorError} With step-specific context if any stage fails
   * @throws {RetrievalValidationError} If query validation fails
   */
  async recall(query: string, context?: string): Promise<SynthesizerOutput> {
    // Validate query
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new RetrievalValidationError(
        'Query must be a non-empty string',
        'Orchestrator',
        ['query: must be a non-empty string'],
      );
    }

    // Step 1: Classify intent using MAGMA classification (WHY/WHEN/WHO/WHAT)
    const classifierInput: ClassifierInput = { query, context };
    let intent: MAGMAIntent;
    try {
      intent = await this.classifier.classifyMAGMA(classifierInput);
    } catch (error) {
      throw new OrchestratorError(
        `Intent classification failed: ${error instanceof Error ? error.message : String(error)}`,
        'classification',
        error instanceof Error ? error : undefined,
      );
    }

    // Step 2: Execute MAGMA retrieval pipeline
    // (semantic search → seed extraction → parallel expansion → merge)
    let executionResult: MAGMAExecutionResult;
    try {
      executionResult = await this.executor.execute(query, intent);
    } catch (error) {
      throw new OrchestratorError(
        `MAGMA execution failed: ${error instanceof Error ? error.message : String(error)}`,
        'execution',
        error instanceof Error ? error : undefined,
      );
    }

    // Early return if no graph data found - skip LLM call to save cost and avoid hallucination
    if (executionResult.merged.nodes.length === 0) {
      return {
        answer:
          'No relevant information found in the knowledge graph for this query.',
        confidence: 0,
        reasoning: {},
        sources: [],
        follow_ups: [
          'Try adding related entities or concepts to the graph',
          'Rephrase the query with different keywords',
        ],
      };
    }

    // Step 3: Linearize merged subgraph for LLM context
    let linearizedContext: LinearizedContext;
    try {
      linearizedContext = this.linearizer.linearize(
        executionResult.merged,
        intent.type,
      );
    } catch (error) {
      throw new OrchestratorError(
        `Context linearization failed: ${error instanceof Error ? error.message : String(error)}`,
        'linearization',
        error instanceof Error ? error : undefined,
      );
    }

    // Step 4: Synthesize the results into a coherent response
    // Package MAGMA results as graph results for the synthesizer
    const graphResults = {
      successful: [
        {
          graph: 'semantic' as const,
          data: {
            context: linearizedContext.text,
            nodeCount: linearizedContext.nodeCount,
            strategy: linearizedContext.strategy,
            timing: executionResult.timing,
            viewContributions: executionResult.merged.viewContributions,
            seeds: {
              conceptCount: executionResult.seeds.conceptIds.length,
              entitySeedCount: executionResult.seeds.entitySeeds.length,
            },
          },
        },
      ],
      failed: [] as { graph: string; error: Error }[],
    };

    const synthesizerInput = {
      original_query: query,
      classification: intent,
      graph_results: graphResults,
    };

    try {
      const result = await this.synthesizer.synthesize(synthesizerInput);

      // Override LLM-generated sources with actual view contributions
      // This ensures sources accurately reflect which graphs provided data
      const actualSources = Object.entries(
        executionResult.merged.viewContributions,
      )
        .filter(([, count]) => count > 0)
        .map(([source]) => source);

      return {
        ...result,
        sources: actualSources,
      };
    } catch (error) {
      throw new OrchestratorError(
        `Response synthesis failed: ${error instanceof Error ? error.message : String(error)}`,
        'synthesis',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Execute MAGMA retrieval without synthesis (for advanced use cases)
   *
   * Useful when you want to:
   * - Get raw graph results for custom processing
   * - Access timing information
   * - Implement custom synthesis logic
   *
   * @param query - The user's natural language query
   * @param context - Optional context for the query
   * @returns MAGMA execution result with merged subgraph and timing
   * @throws {OrchestratorError} With step-specific context if any stage fails
   * @throws {RetrievalValidationError} If query validation fails
   */
  async recallRaw(
    query: string,
    context?: string,
  ): Promise<MAGMAExecutionResult & { intent: MAGMAIntent }> {
    // Validate query
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new RetrievalValidationError(
        'Query must be a non-empty string',
        'Orchestrator',
        ['query: must be a non-empty string'],
      );
    }

    const classifierInput: ClassifierInput = { query, context };

    let intent: MAGMAIntent;
    try {
      intent = await this.classifier.classifyMAGMA(classifierInput);
    } catch (error) {
      throw new OrchestratorError(
        `Intent classification failed: ${error instanceof Error ? error.message : String(error)}`,
        'classification',
        error instanceof Error ? error : undefined,
      );
    }

    let result: MAGMAExecutionResult;
    try {
      result = await this.executor.execute(query, intent);
    } catch (error) {
      throw new OrchestratorError(
        `MAGMA execution failed: ${error instanceof Error ? error.message : String(error)}`,
        'execution',
        error instanceof Error ? error : undefined,
      );
    }

    return { ...result, intent };
  }

  /**
   * Remember - store new information by extracting structure
   *
   * This is a simplified version that extracts entities and facts.
   * A more sophisticated version would use LLM for extraction.
   * @throws {Error} If storing the content fails
   */
  async remember(
    content: string,
    context?: string,
  ): Promise<{
    entities_created: number;
    facts_added: number;
    events_logged: number;
  }> {
    // Validate input
    if (!content || content.trim().length === 0) {
      throw new RetrievalValidationError(
        'Content cannot be empty',
        'Orchestrator',
        ['content: must not be empty'],
      );
    }

    // Include context in the event description when provided
    // Future: Use LLM to extract entities, facts, and causal relationships
    const description = context ? `${content} [Context: ${context}]` : content;

    try {
      await this.temporalGraph.addEvent(description, new Date());
    } catch (error) {
      throw new OrchestratorError(
        `Failed to store content in temporal graph: ${error instanceof Error ? error.message : String(error)}`,
        'remember',
        error instanceof Error ? error : undefined,
      );
    }

    return {
      entities_created: 0,
      facts_added: 0,
      events_logged: 1,
    };
  }

  /**
   * Get the graph registry for direct access
   */
  getGraphs(): MAGMAGraphRegistry {
    return {
      entity: this.entityGraph,
      temporal: this.temporalGraph,
      causal: this.causalGraph,
      semantic: this.semanticGraph,
      crossLinker: this.crossLinker,
    };
  }
}
