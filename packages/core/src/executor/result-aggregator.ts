// Result Aggregator - merges and deduplicates graph results
import type { GraphResult, GraphResults } from '@polyg-mcp/shared';

export interface AggregatedResults {
  results: GraphResult[];
  sources: string[];
  hasErrors: boolean;
  errorCount: number;
}

export class ResultAggregator {
  aggregate(results: GraphResults): AggregatedResults {
    return {
      results: results.successful,
      sources: results.successful.map((r) => r.graph),
      hasErrors: results.failed.length > 0,
      errorCount: results.failed.length,
    };
  }

  deduplicate(results: GraphResult[]): GraphResult[] {
    // TODO: Implement deduplication logic based on entity UUIDs
    return results;
  }

  merge(results: GraphResult[]): Record<string, unknown> {
    // TODO: Implement merge logic for multi-graph results
    const merged: Record<string, unknown> = {};

    for (const result of results) {
      merged[result.graph] = result.data;
    }

    return merged;
  }
}
