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
  type MAGMAConfig,
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
   * Create merger from MAGMA config
   */
  static fromConfig(config: MAGMAConfig): SubgraphMerger {
    return new SubgraphMerger({
      multiViewBoost: config.multiViewBoost,
      minNodesPerView: config.minNodesPerView,
      maxNodesPerView: config.maxNodesPerView,
    });
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
   * Check if a view has sufficient nodes (for fallback logic)
   */
  hasMinimumNodes(view: GraphView): boolean {
    const validated = GraphViewSchema.safeParse(view);
    if (!validated.success) {
      return false;
    }
    return validated.data.nodes.length >= this.options.minNodesPerView;
  }

  /**
   * Filter merged subgraph to top N nodes
   */
  topN(merged: MergedSubgraph, n: number): MergedSubgraph {
    if (n < 0) {
      throw new RetrievalValidationError(
        'n must be non-negative',
        'SubgraphMerger',
        [`Expected n >= 0, got ${n}`],
      );
    }
    return {
      nodes: merged.nodes.slice(0, n),
      viewContributions: merged.viewContributions,
    };
  }

  /**
   * Filter to only nodes with minimum view count
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
   * Filter to only nodes with minimum score
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
   * Get nodes from a specific view source
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
