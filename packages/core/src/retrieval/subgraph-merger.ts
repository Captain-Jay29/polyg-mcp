/**
 * SubgraphMerger - Combines graph views and boosts multi-view nodes
 *
 * Part of MAGMA retrieval: merges results from semantic, entity, temporal,
 * and causal graph expansions into a unified scored subgraph.
 */
import {
  type GraphView,
  GraphViewSchema,
  type GraphViewSource,
  type MergedSubgraph,
  MergedSubgraphSchema,
  type ScoredNode,
} from '@polyg-mcp/shared';
import { z } from 'zod';
import { MergeError, RetrievalValidationError } from './errors.js';

// Schema for merger options
const MergerOptionsSchema = z.object({
  multiViewBoost: z.number().min(1).max(10).default(1.5),
  minNodesPerView: z.number().int().min(0).max(100).default(3),
  maxNodesPerView: z.number().int().min(1).max(1000).default(50),
});

export type MergerOptions = z.infer<typeof MergerOptionsSchema>;

const DEFAULT_OPTIONS: MergerOptions = {
  multiViewBoost: 1.5,
  minNodesPerView: 3,
  maxNodesPerView: 50,
};

/**
 * SubgraphMerger combines results from multiple graph views into a unified
 * scored subgraph. Nodes appearing in multiple views get boosted scores.
 */
export class SubgraphMerger {
  private options: MergerOptions;

  constructor(options?: Partial<MergerOptions>) {
    // Validate and merge options
    const merged = { ...DEFAULT_OPTIONS, ...options };
    const result = MergerOptionsSchema.safeParse(merged);

    if (!result.success) {
      throw new RetrievalValidationError(
        'Invalid merger options',
        'SubgraphMerger',
        result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      );
    }

    this.options = result.data;
  }

  /**
   * Merge multiple graph views into a single scored subgraph
   * @throws {RetrievalValidationError} If views array contains invalid data
   * @throws {MergeError} If merge operation fails
   */
  merge(views: GraphView[]): MergedSubgraph {
    // Validate input views
    const validatedViews = this.validateViews(views);

    try {
      // Track nodes by UUID across all views
      const nodeMap = new Map<
        string,
        {
          data: unknown;
          scores: number[];
          views: GraphViewSource[];
        }
      >();

      // Track contribution counts per view
      const viewContributions: Record<GraphViewSource, number> = {
        semantic: 0,
        entity: 0,
        temporal: 0,
        causal: 0,
      };

      // Process each view
      for (const view of validatedViews) {
        // Limit nodes per view to prevent explosion
        const limitedNodes = view.nodes.slice(0, this.options.maxNodesPerView);
        viewContributions[view.source] = limitedNodes.length;

        for (const node of limitedNodes) {
          const existing = nodeMap.get(node.uuid);

          if (existing) {
            // Node found in multiple views - accumulate
            existing.scores.push(node.score ?? 1.0);
            if (!existing.views.includes(view.source)) {
              existing.views.push(view.source);
            }
          } else {
            // First time seeing this node
            nodeMap.set(node.uuid, {
              data: node.data,
              scores: [node.score ?? 1.0],
              views: [view.source],
            });
          }
        }
      }

      // Calculate final scores with multi-view boost
      // Note: finalScore can exceed 1.0 when nodes appear in multiple views
      // (e.g., avgScore=0.8 with 2 views and boost=1.5 → 0.8 × 1.5 = 1.2)
      // This is intentional - multi-view nodes should rank higher than single-view nodes.
      const scoredNodes: ScoredNode[] = [];

      for (const [uuid, info] of nodeMap) {
        const viewCount = info.views.length;
        const avgScore =
          info.scores.reduce((a, b) => a + b, 0) / info.scores.length;

        // Apply multi-view boost: nodes in 2+ views get boosted
        const boost =
          viewCount > 1 ? this.options.multiViewBoost ** (viewCount - 1) : 1.0;

        scoredNodes.push({
          uuid,
          data: info.data,
          viewCount,
          views: info.views,
          finalScore: avgScore * boost,
        });
      }

      // Sort by final score descending
      scoredNodes.sort((a, b) => b.finalScore - a.finalScore);

      const result: MergedSubgraph = {
        nodes: scoredNodes,
        viewContributions,
      };

      // Validate output
      return this.validateOutput(result);
    } catch (error) {
      if (error instanceof RetrievalValidationError) {
        throw error;
      }
      throw new MergeError(
        `Failed to merge ${views.length} views`,
        views.length,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Validate input views array
   */
  private validateViews(views: GraphView[]): GraphView[] {
    if (!Array.isArray(views)) {
      throw new RetrievalValidationError(
        'Views must be an array',
        'SubgraphMerger',
        [`Expected array, got ${typeof views}`],
      );
    }

    const errors: string[] = [];
    const validated: GraphView[] = [];

    for (let i = 0; i < views.length; i++) {
      const result = GraphViewSchema.safeParse(views[i]);
      if (result.success) {
        validated.push(result.data);
      } else {
        errors.push(
          ...result.error.issues.map(
            (issue) => `views[${i}].${issue.path.join('.')}: ${issue.message}`,
          ),
        );
      }
    }

    if (errors.length > 0) {
      throw new RetrievalValidationError(
        `Invalid graph views: ${errors.length} validation error(s)`,
        'SubgraphMerger',
        errors,
      );
    }

    return validated;
  }

  /**
   * Validate output merged subgraph
   */
  private validateOutput(result: MergedSubgraph): MergedSubgraph {
    const validated = MergedSubgraphSchema.safeParse(result);
    if (!validated.success) {
      throw new RetrievalValidationError(
        'Invalid merge result',
        'SubgraphMerger',
        validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      );
    }
    return validated.data;
  }

  /**
   * Filter to only nodes appearing in multiple views (high-confidence filtering).
   *
   * Useful for surfacing nodes that are corroborated across different graph views
   * (semantic, entity, temporal, causal), indicating stronger relevance.
   *
   * @param merged - The merged subgraph to filter
   * @param minViews - Minimum number of views a node must appear in (>= 1)
   * @returns Filtered subgraph with only multi-view nodes
   * @throws {RetrievalValidationError} If minViews < 1
   *
   * @remarks Currently unused in core pipeline. Available for MCP tools or custom filtering.
   * @example
   * ```ts
   * const highConfidence = merger.filterByViewCount(merged, 2);
   * // Only nodes found in 2+ views (e.g., semantic AND entity)
   * ```
   */
  filterByViewCount(merged: MergedSubgraph, minViews: number): MergedSubgraph {
    if (minViews < 1) {
      throw new RetrievalValidationError(
        'minViews must be at least 1',
        'SubgraphMerger',
        [`Expected minViews >= 1, got ${minViews}`],
      );
    }
    return {
      nodes: merged.nodes.filter((n) => n.viewCount >= minViews),
      viewContributions: merged.viewContributions,
    };
  }

  /**
   * Filter to only nodes above a minimum relevance score.
   *
   * Useful for quality threshold filtering, removing low-relevance nodes
   * from results. Note: finalScore can exceed 1.0 due to multi-view boost.
   *
   * @param merged - The merged subgraph to filter
   * @param minScore - Minimum finalScore threshold (>= 0)
   * @returns Filtered subgraph with only high-scoring nodes
   * @throws {RetrievalValidationError} If minScore < 0
   *
   * @remarks Currently unused in core pipeline. Available for MCP tools or custom filtering.
   * @example
   * ```ts
   * const quality = merger.filterByScore(merged, 0.7);
   * // Only nodes with finalScore >= 0.7
   * ```
   */
  filterByScore(merged: MergedSubgraph, minScore: number): MergedSubgraph {
    if (minScore < 0) {
      throw new RetrievalValidationError(
        'minScore must be non-negative',
        'SubgraphMerger',
        [`Expected minScore >= 0, got ${minScore}`],
      );
    }
    return {
      nodes: merged.nodes.filter((n) => n.finalScore >= minScore),
      viewContributions: merged.viewContributions,
    };
  }

  /**
   * Extract nodes that originated from a specific graph view.
   *
   * Useful for debugging, analysis, or when you need to examine
   * which nodes came from a particular expansion (semantic, entity, temporal, causal).
   *
   * @param merged - The merged subgraph to query
   * @param source - The view source to filter by
   * @returns Array of nodes that include the specified view in their sources
   *
   * @remarks Currently unused in core pipeline. Available for debugging or custom analysis.
   * @example
   * ```ts
   * const causalNodes = merger.getNodesFromView(merged, 'causal');
   * // All nodes found during causal expansion
   * ```
   */
  getNodesFromView(
    merged: MergedSubgraph,
    source: GraphViewSource,
  ): ScoredNode[] {
    return merged.nodes.filter((n) => n.views.includes(source));
  }

  /**
   * Get current options (for debugging/testing)
   */
  getOptions(): Readonly<MergerOptions> {
    return { ...this.options };
  }
}
