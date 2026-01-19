/**
 * MAGMAExecutor - MAGMA-style cascading graph retrieval
 *
 * Flow:
 * 1. Semantic search → get seed concepts
 * 2. Extract entity IDs from seeds via X_REPRESENTS
 * 3. Parallel expansion: entity, temporal, causal (depth by intent)
 * 4. Merge results with multi-view boosting
 *
 * "Vectors locate. Graphs explain. Policies decide how to think."
 */
import {
  type DepthHints,
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
  filterSeedsByScore,
  getEntityIds,
  RetrievalValidationError,
  type SeedExtractionResult,
  SubgraphMerger,
  seedFromSemantic,
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

    // Step 1: Semantic search for seed concepts
    const semanticStart = Date.now();
    const semanticMatches = await this.withTimeout(
      this.graphs.semantic.search(query, this.config.semanticTopK),
    );
    const semanticMs = Date.now() - semanticStart;

    // Step 2: Extract entity IDs from semantic matches via X_REPRESENTS
    const seedStart = Date.now();
    const seeds = await seedFromSemantic(
      semanticMatches,
      this.graphs.crossLinker,
    );
    const filteredSeeds = filterSeedsByScore(
      seeds.entitySeeds,
      this.config.minSemanticScore,
    );
    const entityIds = getEntityIds(filteredSeeds);
    const seedExtractionMs = Date.now() - seedStart;

    // Step 3: Parallel graph expansion from seeds
    const expansionStart = Date.now();
    const views = await this.expandFromSeeds(
      entityIds,
      intent.depthHints,
      semanticMatches,
    );
    const expansionMs = Date.now() - expansionStart;

    // Step 4: Merge results with multi-view boosting
    const mergeStart = Date.now();
    const merged = this.merger.merge(views);
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
    semanticMatches: Awaited<ReturnType<SemanticGraph['search']>>,
  ): Promise<GraphView[]> {
    const views: GraphView[] = [];

    // Always include semantic view from initial search
    views.push({
      source: 'semantic',
      nodes: semanticMatches.map((m) => ({
        uuid: m.concept.uuid,
        data: m.concept,
        score: m.score,
      })),
    });

    // If no entity seeds found, return semantic-only
    if (entityIds.length === 0) {
      return views;
    }

    // Parallel expansion from seeds
    const [entityView, temporalView, causalView] = await Promise.all([
      this.expandEntityGraph(entityIds, depthHints.entity),
      this.expandTemporalGraph(entityIds, depthHints.temporal),
      this.expandCausalGraph(entityIds, depthHints.causal),
    ]);

    if (entityView.nodes.length > 0) views.push(entityView);
    if (temporalView.nodes.length > 0) views.push(temporalView);
    if (causalView.nodes.length > 0) views.push(causalView);

    return views;
  }

  /**
   * Expand entity relationships from seed entities
   */
  private async expandEntityGraph(
    entityIds: string[],
    depth: number,
  ): Promise<GraphView> {
    const nodes: GraphView['nodes'] = [];
    const seenIds = new Set<string>();

    // BFS expansion up to depth
    let currentLevel = entityIds;

    for (let d = 0; d < depth && currentLevel.length > 0; d++) {
      const nextLevel: string[] = [];

      for (const entityId of currentLevel) {
        if (seenIds.has(entityId)) continue;
        seenIds.add(entityId);

        try {
          const relationships =
            await this.graphs.entity.getRelationships(entityId);

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
        } catch {
          // Entity not found or error - continue with others
        }
      }

      currentLevel = nextLevel;
    }

    return { source: 'entity', nodes };
  }

  /**
   * Expand temporal events involving seed entities
   */
  private async expandTemporalGraph(
    entityIds: string[],
    _depth: number,
  ): Promise<GraphView> {
    const nodes: GraphView['nodes'] = [];
    const seenIds = new Set<string>();

    // Query timeline for events involving each entity
    // Use a wide time range (last year to now + 1 year)
    const now = new Date();
    const from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const to = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    for (const entityId of entityIds) {
      try {
        const events = await this.graphs.temporal.queryTimeline(
          from,
          to,
          entityId,
        );

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
      } catch {
        // Entity has no temporal events - continue
      }
    }

    // TODO: For depth > 1, could follow T_BEFORE/T_AFTER relationships
    // Currently just returns direct events

    return { source: 'temporal', nodes };
  }

  /**
   * Expand causal chains from seed entities
   */
  private async expandCausalGraph(
    entityIds: string[],
    depth: number,
  ): Promise<GraphView> {
    const nodes: GraphView['nodes'] = [];
    const seenIds = new Set<string>();

    // Create entity mentions for causal traversal
    const entityMentions = entityIds.map((id) => ({
      mention: id,
      type: undefined,
    }));

    if (entityMentions.length === 0) {
      return { source: 'causal', nodes };
    }

    try {
      const causalLinks = await this.graphs.causal.traverse(
        entityMentions,
        'both', // Traverse both upstream and downstream
        depth,
      );

      // Extract nodes from causal links
      // Each CausalLink has cause and effect as strings
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
    } catch {
      // Causal traversal failed - return empty
    }

    return { source: 'causal', nodes };
  }

  /**
   * Wrap promise with timeout
   */
  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new ExecutorError(
                `Operation timed out after ${this.config.timeout}ms`,
                'timeout',
              ),
            ),
          this.config.timeout,
        ),
      ),
    ]);
  }

  /**
   * Get current config (for debugging/testing)
   */
  getConfig(): Readonly<MAGMAExecutorConfig> {
    return { ...this.config };
  }
}
