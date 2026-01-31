/**
 * MAGMAExecutor - MAGMA-style cascading graph retrieval
 *
 * Flow:
 * 1. Semantic search with entities → get seed concepts WITH linked entity IDs
 * 2. Parallel expansion: entity, temporal, causal (depth by intent)
 * 3. Merge results with multi-view boosting
 *
 * "Vectors locate. Graphs explain. Policies decide how to think."
 */
import {
  type DepthHints,
  type EnrichedSemanticMatch,
  type GraphView,
  type MAGMAConfig,
  type MAGMAIntent,
  MAGMAIntentSchema,
  type MergedSubgraph,
} from '@polyg-mcp/shared';
import { z } from 'zod';
import type { CausalGraph } from '../graphs/causal.js';
import type { CrossLinker } from '../graphs/cross-linker.js';
import type { EntityGraph } from '../graphs/entity.js';
import type { SemanticGraph } from '../graphs/semantic.js';
import type { TemporalGraph } from '../graphs/temporal.js';
import {
  ExecutorError,
  extractSeedsFromEnrichedMatches,
  RetrievalValidationError,
  type SeedExtractionResult,
  SubgraphMerger,
} from '../retrieval/index.js';

export interface MAGMAGraphRegistry {
  semantic: SemanticGraph;
  entity: EntityGraph;
  temporal: TemporalGraph;
  causal: CausalGraph;
  crossLinker: CrossLinker;
}

// Zod schema for executor config validation
const MAGMAExecutorConfigSchema = z.object({
  semanticTopK: z.number().int().min(1).max(100).default(10),
  minSemanticScore: z.number().min(0).max(1).default(0.5),
  timeout: z.number().int().min(100).max(60000).default(5000),
});

export type MAGMAExecutorConfig = z.infer<typeof MAGMAExecutorConfigSchema>;

const DEFAULT_CONFIG: MAGMAExecutorConfig = {
  semanticTopK: 10,
  minSemanticScore: 0.5,
  timeout: 5000,
};

/**
 * Result from MAGMA execution
 */
export interface MAGMAExecutionResult {
  merged: MergedSubgraph;
  seeds: SeedExtractionResult;
  timing: {
    semanticMs: number;
    seedExtractionMs: number;
    expansionMs: number;
    mergeMs: number;
    totalMs: number;
  };
}

/**
 * MAGMAExecutor implements the MAGMA retrieval pattern:
 * semantic seeding → parallel graph expansion → multi-view merge
 */
export class MAGMAExecutor {
  private config: MAGMAExecutorConfig;
  private merger: SubgraphMerger;

  constructor(
    private graphs: MAGMAGraphRegistry,
    config?: Partial<MAGMAExecutorConfig>,
  ) {
    // Validate and apply config with defaults
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const configResult = MAGMAExecutorConfigSchema.safeParse(mergedConfig);

    if (!configResult.success) {
      const errors = configResult.error.issues.map(
        (e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`,
      );
      throw new RetrievalValidationError(
        `Invalid MAGMAExecutor config: ${errors.join(', ')}`,
        'MAGMAExecutor',
        errors,
      );
    }

    this.config = configResult.data;
    this.merger = new SubgraphMerger();
  }

  /**
   * Create executor from MAGMA config
   */
  static fromConfig(
    graphs: MAGMAGraphRegistry,
    config: MAGMAConfig,
  ): MAGMAExecutor {
    return new MAGMAExecutor(graphs, {
      semanticTopK: config.semanticTopK,
      minSemanticScore: config.minSemanticScore,
      timeout: 5000,
    });
  }

  /**
   * Execute MAGMA retrieval pipeline
   *
   * @param query - The user's natural language query
   * @param intent - Classified intent with depth hints
   * @returns Merged subgraph with timing info
   */
  async execute(
    query: string,
    intent: MAGMAIntent,
  ): Promise<MAGMAExecutionResult> {
    // Validate query
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new RetrievalValidationError(
        'Query must be a non-empty string',
        'MAGMAExecutor',
        ['query: must be a non-empty string'],
      );
    }

    // Validate intent
    const intentResult = MAGMAIntentSchema.safeParse(intent);
    if (!intentResult.success) {
      const errors = intentResult.error.issues.map(
        (e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`,
      );
      throw new RetrievalValidationError(
        `Invalid MAGMAIntent: ${errors.join(', ')}`,
        'MAGMAExecutor',
        errors,
      );
    }

    const totalStart = Date.now();

    // Step 1: Semantic search with entities (single query for concepts + entity IDs)
    let enrichedMatches: EnrichedSemanticMatch[];
    const semanticStart = Date.now();
    try {
      enrichedMatches = await this.withTimeout(
        this.graphs.semantic.searchWithEntities(
          query,
          this.config.semanticTopK,
        ),
      );
    } catch (error) {
      // Preserve ExecutorError (e.g., from timeout)
      if (error instanceof ExecutorError) {
        throw error;
      }
      throw new ExecutorError(
        `Semantic search failed: ${error instanceof Error ? error.message : String(error)}`,
        'semantic_search',
        error instanceof Error ? error : undefined,
      );
    }
    const semanticMs = Date.now() - semanticStart;

    // Step 2: Extract entity IDs directly from enriched matches (no CrossLinker needed)
    let seeds: SeedExtractionResult;
    const seedStart = Date.now();
    try {
      seeds = extractSeedsFromEnrichedMatches(
        enrichedMatches,
        this.config.minSemanticScore,
      );
    } catch (error) {
      throw new ExecutorError(
        `Seed extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        'seed_extraction',
        error instanceof Error ? error : undefined,
      );
    }
    const entityIds = seeds.entitySeeds.map((s) => s.entityId);
    const seedExtractionMs = Date.now() - seedStart;

    // Step 3: Parallel graph expansion from seeds using batch methods
    // Note: expandFromSeeds has internal graceful error handling (returns partial results)
    const expansionStart = Date.now();
    const views = await this.expandFromSeeds(
      entityIds,
      intent.depthHints,
      enrichedMatches,
    );
    const expansionMs = Date.now() - expansionStart;

    // Step 4: Merge results with multi-view boosting
    let merged: MergedSubgraph;
    const mergeStart = Date.now();
    try {
      merged = this.merger.merge(views);
    } catch (error) {
      throw new ExecutorError(
        `Subgraph merge failed: ${error instanceof Error ? error.message : String(error)}`,
        'merge',
        error instanceof Error ? error : undefined,
      );
    }
    const mergeMs = Date.now() - mergeStart;

    return {
      merged,
      seeds,
      timing: {
        semanticMs,
        seedExtractionMs,
        expansionMs,
        mergeMs,
        totalMs: Date.now() - totalStart,
      },
    };
  }

  /**
   * Expand from seed entities in parallel across all graph types
   */
  private async expandFromSeeds(
    entityIds: string[],
    depthHints: DepthHints,
    enrichedMatches: EnrichedSemanticMatch[],
  ): Promise<GraphView[]> {
    const views: GraphView[] = [];

    // Always include semantic view from initial search
    views.push({
      source: 'semantic',
      nodes: enrichedMatches.map((m) => ({
        uuid: m.concept.uuid,
        data: m.concept,
        score: m.score,
      })),
    });

    // If no entity seeds found, return semantic-only
    if (entityIds.length === 0) {
      return views;
    }

    // Parallel expansion from seeds with graceful degradation
    // Use Promise.allSettled to allow partial success - if one expansion fails,
    // others can still contribute results
    // Each expansion is wrapped with timeout for protection against hanging queries
    const expansionResults = await Promise.allSettled([
      this.withTimeout(this.expandEntityGraph(entityIds, depthHints.entity)),
      this.withTimeout(this.expandTemporalGraph(entityIds, depthHints.temporal)),
      this.withTimeout(this.expandCausalGraph(entityIds, depthHints.causal)),
    ]);

    const expansionNames = ['entity', 'temporal', 'causal'] as const;

    for (let i = 0; i < expansionResults.length; i++) {
      const result = expansionResults[i];
      if (result.status === 'fulfilled') {
        if (result.value.nodes.length > 0) {
          views.push(result.value);
        }
      } else {
        // Log failed expansion for observability but continue with others
        console.warn(
          `[MAGMAExecutor] ${expansionNames[i]} expansion failed:`,
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
        );
      }
    }

    return views;
  }

  /**
   * Expand entity relationships from seed entities using batch method
   *
   * Errors propagate to caller (expandFromSeeds) for graceful degradation via Promise.allSettled.
   */
  private async expandEntityGraph(
    entityIds: string[],
    depth: number,
  ): Promise<GraphView> {
    const nodes: GraphView['nodes'] = [];
    const seenIds = new Set<string>();

    // BFS expansion up to depth using batch queries
    let currentLevel = entityIds;

    for (let d = 0; d < depth && currentLevel.length > 0; d++) {
      const nextLevel: string[] = [];

      // Batch fetch relationships for all entities at current level
      // Errors propagate up for graceful degradation at Promise.allSettled level
      const relationshipMap =
        await this.graphs.entity.getRelationshipsBatch(currentLevel);

      for (const entityId of currentLevel) {
        if (seenIds.has(entityId)) continue;
        seenIds.add(entityId);

        const relationships = relationshipMap.get(entityId) || [];

        for (const rel of relationships) {
          // Add source entity
          if (!seenIds.has(rel.source.uuid)) {
            nodes.push({
              uuid: rel.source.uuid,
              data: rel.source,
              score: 1.0 / (d + 1), // Score decreases with depth
            });
            nextLevel.push(rel.source.uuid);
          }

          // Add target entity
          if (!seenIds.has(rel.target.uuid)) {
            nodes.push({
              uuid: rel.target.uuid,
              data: rel.target,
              score: 1.0 / (d + 1),
            });
            nextLevel.push(rel.target.uuid);
          }
        }
      }

      currentLevel = nextLevel;
    }

    return { source: 'entity', nodes };
  }

  /**
   * Expand temporal events involving seed entities using batch method
   *
   * Errors propagate to caller (expandFromSeeds) for graceful degradation via Promise.allSettled.
   */
  private async expandTemporalGraph(
    entityIds: string[],
    _depth: number,
  ): Promise<GraphView> {
    const nodes: GraphView['nodes'] = [];
    const seenIds = new Set<string>();

    // Use a wide time range (last year to now + 1 year)
    const now = new Date();
    const from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const to = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    // Single batch query for all entities
    // Errors propagate up for graceful degradation at Promise.allSettled level
    const eventMap = await this.graphs.temporal.queryTimelineForEntities(
      entityIds,
      from,
      to,
    );

    for (const events of eventMap.values()) {
      for (const event of events) {
        if (!seenIds.has(event.uuid)) {
          seenIds.add(event.uuid);
          nodes.push({
            uuid: event.uuid,
            data: event,
            score: 1.0, // Temporal events get full score
          });
        }
      }
    }

    // TODO: For depth > 1, could follow T_BEFORE/T_AFTER relationships
    // Currently just returns direct events

    return { source: 'temporal', nodes };
  }

  /**
   * Expand causal chains from seed entities using batch methods
   *
   * Errors propagate to caller (expandFromSeeds) for graceful degradation via Promise.allSettled.
   */
  private async expandCausalGraph(
    entityIds: string[],
    depth: number,
  ): Promise<GraphView> {
    const nodes: GraphView['nodes'] = [];
    const seenIds = new Set<string>();

    if (entityIds.length === 0) {
      return { source: 'causal', nodes };
    }

    // Step 1: Get causal nodes linked to entities via X_AFFECTS (batch)
    // Errors propagate up for graceful degradation at Promise.allSettled level
    const nodeMap = await this.graphs.causal.getNodesForEntities(entityIds);

    // Collect all unique causal node IDs
    const causalNodeIds: string[] = [];
    const seenNodeIds = new Set<string>();

    for (const causalNodes of nodeMap.values()) {
      for (const node of causalNodes) {
        if (!seenNodeIds.has(node.uuid)) {
          seenNodeIds.add(node.uuid);
          causalNodeIds.push(node.uuid);
        }
      }
    }

    if (causalNodeIds.length === 0) {
      return { source: 'causal', nodes };
    }

    // Step 2: Traverse from causal node UUIDs directly
    const causalLinks = await this.graphs.causal.traverseFromNodeIds(
      causalNodeIds,
      'both', // Traverse both upstream and downstream
      depth,
    );

    // Extract nodes from causal links
    for (const link of causalLinks) {
      // Add cause as a node
      if (!seenIds.has(link.cause)) {
        seenIds.add(link.cause);
        nodes.push({
          uuid: link.cause,
          data: {
            description: link.cause,
            type: 'cause',
            confidence: link.confidence,
          },
          score: link.confidence,
        });
      }

      // Add effect as a node
      if (!seenIds.has(link.effect)) {
        seenIds.add(link.effect);
        nodes.push({
          uuid: link.effect,
          data: {
            description: link.effect,
            type: 'effect',
            confidence: link.confidence,
          },
          score: link.confidence,
        });
      }
    }

    return { source: 'causal', nodes };
  }

  /**
   * Wrap promise with timeout
   *
   * Properly cleans up the timer when the promise resolves/rejects before timeout.
   */
  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () =>
          reject(
            new ExecutorError(
              `Operation timed out after ${this.config.timeout}ms`,
              'timeout',
            ),
          ),
        this.config.timeout,
      );
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      clearTimeout(timeoutId);
    });
  }

  /**
   * Get current config (for debugging/testing)
   */
  getConfig(): Readonly<MAGMAExecutorConfig> {
    return { ...this.config };
  }
}
