/**
 * ContextLinearizer - Orders nodes for LLM context based on intent
 *
 * Part of MAGMA retrieval: formats merged subgraph into a linear context
 * string optimized for the query intent type.
 */
import {
  type MAGMAIntentType,
  MAGMAIntentTypeSchema,
  type MergedSubgraph,
  MergedSubgraphSchema,
  type ScoredNode,
} from '@polyg-mcp/shared';
import { z } from 'zod';
import { LinearizationError, RetrievalValidationError } from './errors.js';

// Schema for linearized context output
const LinearizedContextSchema = z.object({
  text: z.string(),
  nodeCount: z.number().int().min(0),
  strategy: z.enum([
    'causal_chain',
    'temporal',
    'entity_grouped',
    'score_ranked',
  ]),
  estimatedTokens: z.number().int().min(0),
});

export type LinearizedContext = z.infer<typeof LinearizedContextSchema>;

export type OrderingStrategy =
  | 'causal_chain' // WHY: cause → effect ordering
  | 'temporal' // WHEN: chronological ordering
  | 'entity_grouped' // WHO/WHAT: group by entity type
  | 'score_ranked'; // EXPLORE: by relevance score

// Schema for constructor options
const LinearizerOptionsSchema = z.object({
  maxTokens: z.number().int().min(100).max(100000).default(4000),
});

/**
 * ContextLinearizer formats merged subgraphs into LLM-ready context strings.
 * The ordering strategy varies by intent type to optimize comprehension.
 */
export class ContextLinearizer {
  private maxTokens: number;

  constructor(maxTokens = 4000) {
    const result = LinearizerOptionsSchema.safeParse({ maxTokens });
    if (!result.success) {
      throw new RetrievalValidationError(
        'Invalid linearizer options',
        'ContextLinearizer',
        result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      );
    }
    this.maxTokens = result.data.maxTokens;
  }

  /**
   * Linearize merged subgraph based on intent type
   * @throws {RetrievalValidationError} If inputs are invalid
   * @throws {LinearizationError} If linearization fails
   */
  linearize(
    merged: MergedSubgraph,
    intentType: MAGMAIntentType,
  ): LinearizedContext {
    // Validate inputs
    const validatedMerged = this.validateMergedSubgraph(merged);
    const validatedIntent = this.validateIntentType(intentType);

    try {
      const strategy = this.getStrategy(validatedIntent);
      const orderedNodes = this.orderNodes(validatedMerged.nodes, strategy);
      const { text, includedNodeCount } = this.formatContext(
        orderedNodes,
        strategy,
        validatedIntent,
      );

      const result: LinearizedContext = {
        text,
        nodeCount: includedNodeCount, // Actual count post-truncation
        strategy,
        estimatedTokens: Math.ceil(text.length / 4),
      };

      // Validate output
      return this.validateOutput(result);
    } catch (error) {
      if (
        error instanceof RetrievalValidationError ||
        error instanceof LinearizationError
      ) {
        throw error;
      }
      throw new LinearizationError(
        `Failed to linearize context for intent ${intentType}`,
        intentType,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Validate merged subgraph input
   */
  private validateMergedSubgraph(merged: MergedSubgraph): MergedSubgraph {
    const result = MergedSubgraphSchema.safeParse(merged);
    if (!result.success) {
      throw new RetrievalValidationError(
        'Invalid merged subgraph',
        'ContextLinearizer',
        result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      );
    }
    return result.data;
  }

  /**
   * Validate intent type
   */
  private validateIntentType(intentType: MAGMAIntentType): MAGMAIntentType {
    const result = MAGMAIntentTypeSchema.safeParse(intentType);
    if (!result.success) {
      throw new RetrievalValidationError(
        `Invalid intent type: ${intentType}`,
        'ContextLinearizer',
        [`Expected one of: WHY, WHEN, WHO, WHAT, EXPLORE. Got: ${intentType}`],
      );
    }
    return result.data;
  }

  /**
   * Validate output
   */
  private validateOutput(result: LinearizedContext): LinearizedContext {
    const validated = LinearizedContextSchema.safeParse(result);
    if (!validated.success) {
      throw new RetrievalValidationError(
        'Invalid linearization result',
        'ContextLinearizer',
        validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      );
    }
    return validated.data;
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
   * @returns Object with text and actual count of nodes included (post-truncation)
   */
  private formatContext(
    nodes: ScoredNode[],
    strategy: OrderingStrategy,
    intentType: MAGMAIntentType,
  ): { text: string; includedNodeCount: number } {
    const sections: string[] = [];
    let currentTokens = 0;
    const tokenBudget = this.maxTokens;
    const includedNodes: ScoredNode[] = [];

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
      includedNodes.push(node);
      currentTokens += nodeTokens;
    }

    // Add view summary (only for included nodes)
    const summary = this.formatViewSummary(includedNodes);
    if (currentTokens + Math.ceil(summary.length / 4) <= tokenBudget) {
      sections.push(summary);
    }

    return {
      text: sections.join('\n'),
      includedNodeCount: includedNodes.length,
    };
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

  /**
   * Get max tokens setting (for debugging/testing)
   */
  getMaxTokens(): number {
    return this.maxTokens;
  }
}
