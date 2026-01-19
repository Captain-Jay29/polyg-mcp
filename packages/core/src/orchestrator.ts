// Orchestrator - central class connecting all pipeline components
import type {
  ClassifierInput,
  EmbeddingProvider,
  LLMProvider,
  MAGMAIntent,
  SynthesizerOutput,
} from '@polyg-mcp/shared';
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
import { ContextLinearizer } from './retrieval/context-linearizer.js';
import type { FalkorDBAdapter } from './storage/falkordb.js';

export interface OrchestratorConfig {
  /** MAGMA semantic search top-K (default: 10) */
  semanticTopK?: number;
  /** MAGMA minimum semantic score threshold (default: 0.5) */
  minSemanticScore?: number;
  /** Query timeout in ms (default: 5000) */
  timeout?: number;
  /** Context linearizer max tokens (default: 4000) */
  maxContextTokens?: number;
}

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
    // Initialize graphs
    this.entityGraph = new EntityGraph(db);
    this.temporalGraph = new TemporalGraph(db);
    this.causalGraph = new CausalGraph(db);
    this.semanticGraph = new SemanticGraph(db, embeddings);
    this.crossLinker = new CrossLinker(db);

    // Initialize LLM agents
    this.classifier = new IntentClassifier(llm);
    this.synthesizer = new Synthesizer(llm);

    // Initialize MAGMA executor with all graphs including crossLinker
    const graphRegistry: MAGMAGraphRegistry = {
      entity: this.entityGraph,
      temporal: this.temporalGraph,
      causal: this.causalGraph,
      semantic: this.semanticGraph,
      crossLinker: this.crossLinker,
    };
    this.executor = new MAGMAExecutor(graphRegistry, {
      semanticTopK: config.semanticTopK ?? 10,
      minSemanticScore: config.minSemanticScore ?? 0.5,
      timeout: config.timeout ?? 5000,
    });

    // Initialize context linearizer
    this.linearizer = new ContextLinearizer(config.maxContextTokens ?? 4000);
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
   * @throws {Error} With step-specific context if any stage fails
   */
  async recall(query: string, context?: string): Promise<SynthesizerOutput> {
    // Step 1: Classify intent using MAGMA classification (WHY/WHEN/WHO/WHAT)
    const classifierInput: ClassifierInput = { query, context };
    const intent = await this.classifier
      .classifyMAGMA(classifierInput)
      .catch((error) => {
        throw new Error(
          `Intent classification failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    // Step 2: Execute MAGMA retrieval pipeline
    // (semantic search → seed extraction → parallel expansion → merge)
    const executionResult = await this.executor
      .execute(query, intent)
      .catch((error) => {
        throw new Error(
          `MAGMA execution failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    // Step 3: Linearize merged subgraph for LLM context
    const linearizedContext = this.linearizer.linearize(
      executionResult.merged,
      intent.type,
    );

    // Step 4: Synthesize the results into a coherent response
    // Map MAGMA intent type to legacy intent for synthesizer compatibility
    const intentToLegacyMap: Record<
      string,
      'entity' | 'semantic' | 'temporal' | 'causal'
    > = {
      WHY: 'causal',
      WHEN: 'temporal',
      WHO: 'entity',
      WHAT: 'entity',
      EXPLORE: 'semantic',
    };
    const legacyIntent = intentToLegacyMap[intent.type] ?? 'semantic';

    // Build graph results in the expected format
    // Package MAGMA results as a single "semantic" graph result with rich context
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
      classification: {
        intents: [legacyIntent] as (
          | 'entity'
          | 'semantic'
          | 'temporal'
          | 'causal'
        )[],
        entities: intent.entities.map((e) => ({ mention: e })),
        confidence: intent.confidence,
        reasoning: `MAGMA retrieval with ${intent.type} intent`,
      },
      graph_results: graphResults,
    };

    return await this.synthesizer
      .synthesize(synthesizerInput)
      .catch((error) => {
        throw new Error(
          `Response synthesis failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
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
   */
  async recallRaw(
    query: string,
    context?: string,
  ): Promise<MAGMAExecutionResult & { intent: MAGMAIntent }> {
    const classifierInput: ClassifierInput = { query, context };
    const intent = await this.classifier.classifyMAGMA(classifierInput);
    const result = await this.executor.execute(query, intent);
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
    _context?: string,
  ): Promise<{
    entities_created: number;
    facts_added: number;
    events_logged: number;
  }> {
    // Validate input
    if (!content || content.trim().length === 0) {
      throw new Error('Content cannot be empty');
    }

    // For now, create a simple event to log what was remembered
    // Future: Use LLM to extract entities, facts, and causal relationships
    try {
      await this.temporalGraph.addEvent(content, new Date());
    } catch (error) {
      throw new Error(
        `Failed to store content in temporal graph: ${error instanceof Error ? error.message : String(error)}`,
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
