/**
 * ContextLinearizer - Orders nodes for LLM context based on intent
 *
 * Part of MAGMA retrieval: formats merged subgraph into a linear context
 * string optimized for the query intent type.
 */
import type {
  MAGMAIntentType,
  MergedSubgraph,
  ScoredNode,
} from '@polyg-mcp/shared';

export interface LinearizedContext {
  /** Formatted context string for LLM */
  text: string;
  /** Number of nodes included */
  nodeCount: number;
  /** Ordering strategy used */
  strategy: OrderingStrategy;
  /** Token estimate (rough, ~4 chars per token) */
  estimatedTokens: number;
}

export type OrderingStrategy =
  | 'causal_chain' // WHY: cause → effect ordering
  | 'temporal' // WHEN: chronological ordering
  | 'entity_grouped' // WHO/WHAT: group by entity type
  | 'score_ranked'; // EXPLORE: by relevance score

/**
 * ContextLinearizer formats merged subgraphs into LLM-ready context strings.
 * The ordering strategy varies by intent type to optimize comprehension.
 */
export class ContextLinearizer {
  private maxTokens: number;

  constructor(maxTokens = 4000) {
    this.maxTokens = maxTokens;
  }

  /**
   * Linearize merged subgraph based on intent type
   */
  linearize(
    merged: MergedSubgraph,
    intentType: MAGMAIntentType,
  ): LinearizedContext {
    const strategy = this.getStrategy(intentType);
    const orderedNodes = this.orderNodes(merged.nodes, strategy);
    const text = this.formatContext(orderedNodes, strategy, intentType);

    return {
      text,
      nodeCount: orderedNodes.length,
      strategy,
      estimatedTokens: Math.ceil(text.length / 4),
    };
  }

  /**
   * Determine ordering strategy from intent type
   */
  private getStrategy(intentType: MAGMAIntentType): OrderingStrategy {
    switch (intentType) {
      case 'WHY':
        return 'causal_chain';
      case 'WHEN':
        return 'temporal';
      case 'WHO':
      case 'WHAT':
        return 'entity_grouped';
      default:
        return 'score_ranked';
    }
  }

  /**
   * Order nodes according to strategy
   */
  private orderNodes(
    nodes: ScoredNode[],
    strategy: OrderingStrategy,
  ): ScoredNode[] {
    const ordered = [...nodes];

    switch (strategy) {
      case 'causal_chain':
        // For causal: prioritize causal view nodes, then by score
        return ordered.sort((a, b) => {
          const aIsCausal = a.views.includes('causal') ? 1 : 0;
          const bIsCausal = b.views.includes('causal') ? 1 : 0;
          if (aIsCausal !== bIsCausal) return bIsCausal - aIsCausal;
          return b.finalScore - a.finalScore;
        });

      case 'temporal':
        // For temporal: prioritize temporal view, try to order by date
        return ordered.sort((a, b) => {
          const aIsTemporal = a.views.includes('temporal') ? 1 : 0;
          const bIsTemporal = b.views.includes('temporal') ? 1 : 0;
          if (aIsTemporal !== bIsTemporal) return bIsTemporal - aIsTemporal;

          // Try to extract dates from data for ordering
          const aDate = this.extractDate(a.data);
          const bDate = this.extractDate(b.data);
          if (aDate && bDate) return aDate.getTime() - bDate.getTime();

          return b.finalScore - a.finalScore;
        });

      case 'entity_grouped':
        // For entity: group by entity type, then by score within groups
        return ordered.sort((a, b) => {
          const aType = this.extractEntityType(a.data);
          const bType = this.extractEntityType(b.data);
          if (aType !== bType) return aType.localeCompare(bType);
          return b.finalScore - a.finalScore;
        });
      default:
        // Default: pure score ranking
        return ordered.sort((a, b) => b.finalScore - a.finalScore);
    }
  }

  /**
   * Format nodes into context string
   */
  private formatContext(
    nodes: ScoredNode[],
    strategy: OrderingStrategy,
    intentType: MAGMAIntentType,
  ): string {
    const sections: string[] = [];
    let currentTokens = 0;
    const tokenBudget = this.maxTokens;

    // Add header based on intent
    const header = this.getHeader(intentType);
    sections.push(header);
    currentTokens += Math.ceil(header.length / 4);

    // Format each node
    for (const node of nodes) {
      const formatted = this.formatNode(node, strategy);
      const nodeTokens = Math.ceil(formatted.length / 4);

      if (currentTokens + nodeTokens > tokenBudget) {
        sections.push('\n[... additional context truncated ...]');
        break;
      }

      sections.push(formatted);
      currentTokens += nodeTokens;
    }

    // Add view summary
    const summary = this.formatViewSummary(nodes);
    if (currentTokens + Math.ceil(summary.length / 4) <= tokenBudget) {
      sections.push(summary);
    }

    return sections.join('\n');
  }

  /**
   * Get context header based on intent
   */
  private getHeader(intentType: MAGMAIntentType): string {
    switch (intentType) {
      case 'WHY':
        return '## Causal Analysis Context\nThe following shows cause-and-effect relationships:\n';
      case 'WHEN':
        return '## Temporal Context\nThe following events are ordered chronologically:\n';
      case 'WHO':
        return '## Entity Context\nThe following entities are relevant to your query:\n';
      case 'WHAT':
        return '## Descriptive Context\nThe following information describes the subject:\n';
      default:
        return '## Retrieved Context\nThe following information is relevant to your query:\n';
    }
  }

  /**
   * Format a single node for context
   */
  private formatNode(node: ScoredNode, strategy: OrderingStrategy): string {
    const data = node.data as Record<string, unknown>;
    const lines: string[] = [];

    // Extract key fields based on node type
    const name =
      data.name || data.description || data.content || data.uuid || node.uuid;
    const type = data.entity_type || data.node_type || data.type || 'Unknown';

    lines.push(`- **${name}** (${type})`);

    // Add relevant details based on strategy
    if (strategy === 'causal_chain' && data.confidence) {
      lines.push(`  Confidence: ${data.confidence}`);
    }

    if (strategy === 'temporal') {
      const date = data.occurred_at || data.valid_from || data.created_at;
      if (date) lines.push(`  Date: ${date}`);
    }

    if (data.description && data.description !== name) {
      const desc = String(data.description).slice(0, 200);
      lines.push(`  ${desc}`);
    }

    // Show which views found this node
    lines.push(`  [Found in: ${node.views.join(', ')}]`);

    return lines.join('\n');
  }

  /**
   * Format summary of view contributions
   */
  private formatViewSummary(nodes: ScoredNode[]): string {
    const viewCounts: Record<string, number> = {};
    for (const node of nodes) {
      for (const view of node.views) {
        viewCounts[view] = (viewCounts[view] || 0) + 1;
      }
    }

    const parts = Object.entries(viewCounts)
      .map(([view, count]) => `${view}: ${count}`)
      .join(', ');

    return `\n---\nSources: ${parts} | Total nodes: ${nodes.length}`;
  }

  /**
   * Try to extract a date from node data
   */
  private extractDate(data: unknown): Date | null {
    if (!data || typeof data !== 'object') return null;
    const obj = data as Record<string, unknown>;

    const dateFields = [
      'occurred_at',
      'valid_from',
      'created_at',
      'date',
      'timestamp',
    ];

    for (const field of dateFields) {
      if (obj[field]) {
        const d = new Date(String(obj[field]));
        if (!Number.isNaN(d.getTime())) return d;
      }
    }

    return null;
  }

  /**
   * Extract entity type from node data
   */
  private extractEntityType(data: unknown): string {
    if (!data || typeof data !== 'object') return 'unknown';
    const obj = data as Record<string, unknown>;
    return String(obj.entity_type || obj.node_type || obj.type || 'unknown');
  }
}
