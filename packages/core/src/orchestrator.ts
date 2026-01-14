// Orchestrator - central class connecting all pipeline components
import type {
  ClassifierInput,
  ClassifierOutput,
  EmbeddingProvider,
  GraphResults,
  LLMProvider,
  SynthesizerInput,
  SynthesizerOutput,
} from '@polyg-mcp/shared';
import { IntentClassifier } from './agents/intent-classifier.js';
import { Synthesizer } from './agents/synthesizer.js';
import {
  type GraphRegistry,
  ParallelGraphExecutor,
} from './executor/parallel-executor.js';
import { CausalGraph } from './graphs/causal.js';
import { CrossLinker } from './graphs/cross-linker.js';
import { EntityGraph } from './graphs/entity.js';
import { SemanticGraph } from './graphs/semantic.js';
import { TemporalGraph } from './graphs/temporal.js';
import type { FalkorDBAdapter } from './storage/falkordb.js';

export interface OrchestratorConfig {
  timeout?: number; // Parallel query timeout in ms
}

/**
 * Orchestrator connects all pipeline components:
 * - Graphs (Entity, Temporal, Causal, Semantic)
 * - LLM Agents (IntentClassifier, Synthesizer)
 * - Executor (ParallelGraphExecutor)
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

  // Executor
  private readonly executor: ParallelGraphExecutor;

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

    // Initialize executor with all graphs
    const graphRegistry: GraphRegistry = {
      entity: this.entityGraph,
      temporal: this.temporalGraph,
      causal: this.causalGraph,
      semantic: this.semanticGraph,
    };
    this.executor = new ParallelGraphExecutor(graphRegistry, config.timeout);
  }

  /**
   * Recall - the main LLM-powered query pipeline
   *
   * Flow: Query → IntentClassifier → ParallelGraphExecutor → Synthesizer → Response
   * @throws {Error} With step-specific context if any stage fails
   */
  async recall(query: string, context?: string): Promise<SynthesizerOutput> {
    // Step 1: Classify the query intent
    let classification: ClassifierOutput;
    try {
      const classifierInput: ClassifierInput = { query, context };
      classification = await this.classifier.classify(classifierInput);
    } catch (error) {
      throw new Error(
        `Intent classification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Step 2: Execute parallel graph queries based on intents
    let graphResults: GraphResults;
    try {
      graphResults = await this.executor.execute(classification);
    } catch (error) {
      throw new Error(
        `Graph query execution failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Step 3: Synthesize the results into a coherent response
    try {
      const synthesizerInput: SynthesizerInput = {
        original_query: query,
        classification,
        graph_results: graphResults,
      };
      return await this.synthesizer.synthesize(synthesizerInput);
    } catch (error) {
      throw new Error(
        `Response synthesis failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
  getGraphs(): GraphRegistry & { crossLinker: CrossLinker } {
    return {
      entity: this.entityGraph,
      temporal: this.temporalGraph,
      causal: this.causalGraph,
      semantic: this.semanticGraph,
      crossLinker: this.crossLinker,
    };
  }
}
