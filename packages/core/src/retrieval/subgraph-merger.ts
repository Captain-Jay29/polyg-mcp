/**
 * SubgraphMerger - Combines graph views and boosts multi-view nodes
 *
 * Part of MAGMA retrieval: merges results from semantic, entity, temporal,
 * and causal graph expansions into a unified scored subgraph.
 */
import type {
  GraphView,
  GraphViewSource,
  MAGMAConfig,
  MergedSubgraph,
  ScoredNode,
} from '@polyg-mcp/shared';

export interface MergerOptions {
  /** Boost multiplier for nodes found in multiple views (default: 1.5) */
  multiViewBoost: number;
  /** Minimum nodes per view before fallback (default: 3) */
  minNodesPerView: number;
  /** Maximum nodes per view to prevent explosion (default: 50) */
  maxNodesPerView: number;
}

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
    this.options = { ...DEFAULT_OPTIONS, ...options };
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
   */
  merge(views: GraphView[]): MergedSubgraph {
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
    for (const view of views) {
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

    return {
      nodes: scoredNodes,
      viewContributions,
    };
  }

  /**
   * Check if a view has sufficient nodes (for fallback logic)
   */
  hasMinimumNodes(view: GraphView): boolean {
    return view.nodes.length >= this.options.minNodesPerView;
  }

  /**
   * Filter merged subgraph to top N nodes
   */
  topN(merged: MergedSubgraph, n: number): MergedSubgraph {
    return {
      nodes: merged.nodes.slice(0, n),
      viewContributions: merged.viewContributions,
    };
  }

  /**
   * Filter to only nodes with minimum view count
   */
  filterByViewCount(merged: MergedSubgraph, minViews: number): MergedSubgraph {
    return {
      nodes: merged.nodes.filter((n) => n.viewCount >= minViews),
      viewContributions: merged.viewContributions,
    };
  }

  /**
   * Filter to only nodes with minimum score
   */
  filterByScore(merged: MergedSubgraph, minScore: number): MergedSubgraph {
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
}
