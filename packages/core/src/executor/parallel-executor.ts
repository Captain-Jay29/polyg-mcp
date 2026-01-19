/**
 * Parallel Graph Executor - queries multiple graphs concurrently
 *
 * @deprecated This executor will be replaced by MAGMAExecutor in Phase 4.
 * The current implementation queries graphs independently based on intent,
 * while MAGMAExecutor uses semantic seeding for cascading graph traversal:
 * semantic search → seed extraction → parallel expansion from seeds → merge
 */
import type {
  ClassifierOutput,
  GraphResult,
  GraphResults,
} from '@polyg-mcp/shared';
import type { CausalGraph } from '../graphs/causal.js';
import type { EntityGraph } from '../graphs/entity.js';
import type { SemanticGraph } from '../graphs/semantic.js';
import type { TemporalGraph } from '../graphs/temporal.js';

export interface GraphRegistry {
  semantic: SemanticGraph;
  temporal: TemporalGraph;
  causal: CausalGraph;
  entity: EntityGraph;
}

/**
 * @deprecated Use MAGMAExecutor (Phase 4) for new implementations
 */
export class ParallelGraphExecutor {
  constructor(
    private graphs: GraphRegistry,
    private timeout = 5000,
  ) {}

  async execute(plan: ClassifierOutput): Promise<GraphResults> {
    const queries: Promise<GraphResult>[] = [];

    if (plan.intents.includes('semantic') && plan.semantic_query) {
      queries.push(
        this.withTimeout(
          this.graphs.semantic
            .search(plan.semantic_query)
            .then((data) => ({ graph: 'semantic' as const, data })),
        ),
      );
    }

    if (plan.intents.includes('temporal') && plan.timeframe) {
      queries.push(
        this.withTimeout(
          this.graphs.temporal
            .query(plan.timeframe)
            .then((data) => ({ graph: 'temporal' as const, data })),
        ),
      );
    }

    if (plan.intents.includes('causal') && plan.entities.length > 0) {
      queries.push(
        this.withTimeout(
          this.graphs.causal
            .traverse(plan.entities, plan.causal_direction || 'both')
            .then((data) => ({ graph: 'causal' as const, data })),
        ),
      );
    }

    if (plan.intents.includes('entity') && plan.entities.length > 0) {
      queries.push(
        this.withTimeout(
          this.graphs.entity
            .resolve(plan.entities)
            .then((data) => ({ graph: 'entity' as const, data })),
        ),
      );
    }

    const results = await Promise.allSettled(queries);
    return this.aggregateResults(results);
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Query timeout')), this.timeout),
      ),
    ]);
  }

  private aggregateResults(
    results: PromiseSettledResult<GraphResult>[],
  ): GraphResults {
    const successful: GraphResult[] = [];
    const failed: { graph: string; error: Error }[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        successful.push(result.value);
      } else {
        failed.push({
          graph: 'unknown',
          error:
            result.reason instanceof Error
              ? result.reason
              : new Error(String(result.reason)),
        });
      }
    }

    return { successful, failed };
  }
}
