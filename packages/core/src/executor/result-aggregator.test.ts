import type { GraphResult, GraphResults } from '@polyg-mcp/shared';
import { describe, expect, it } from 'vitest';
import { ResultAggregator } from './result-aggregator.js';

describe('ResultAggregator', () => {
  const aggregator = new ResultAggregator();

  describe('aggregate', () => {
    it('should extract successful results', () => {
      const results: GraphResults = {
        successful: [
          { graph: 'entity', data: [{ uuid: '1', name: 'Alice' }] },
          { graph: 'temporal', data: { events: [], facts: [] } },
        ],
        failed: [],
      };

      const aggregated = aggregator.aggregate(results);

      expect(aggregated.results).toHaveLength(2);
      expect(aggregated.hasErrors).toBe(false);
      expect(aggregated.errorCount).toBe(0);
    });

    it('should extract source graph names', () => {
      const results: GraphResults = {
        successful: [
          { graph: 'semantic', data: [] },
          { graph: 'causal', data: { nodes: [], relationships: [] } },
          { graph: 'entity', data: [] },
        ],
        failed: [],
      };

      const aggregated = aggregator.aggregate(results);

      expect(aggregated.sources).toEqual(['semantic', 'causal', 'entity']);
    });

    it('should flag when errors are present', () => {
      const results: GraphResults = {
        successful: [{ graph: 'entity', data: [] }],
        failed: [{ graph: 'temporal', error: new Error('Query failed') }],
      };

      const aggregated = aggregator.aggregate(results);

      expect(aggregated.hasErrors).toBe(true);
      expect(aggregated.errorCount).toBe(1);
    });

    it('should count multiple errors', () => {
      const results: GraphResults = {
        successful: [],
        failed: [
          { graph: 'entity', error: new Error('Error 1') },
          { graph: 'temporal', error: new Error('Error 2') },
          { graph: 'causal', error: new Error('Error 3') },
        ],
      };

      const aggregated = aggregator.aggregate(results);

      expect(aggregated.hasErrors).toBe(true);
      expect(aggregated.errorCount).toBe(3);
      expect(aggregated.results).toHaveLength(0);
      expect(aggregated.sources).toHaveLength(0);
    });

    it('should handle empty results', () => {
      const results: GraphResults = {
        successful: [],
        failed: [],
      };

      const aggregated = aggregator.aggregate(results);

      expect(aggregated.results).toHaveLength(0);
      expect(aggregated.sources).toHaveLength(0);
      expect(aggregated.hasErrors).toBe(false);
      expect(aggregated.errorCount).toBe(0);
    });

    it('should preserve result data', () => {
      const entityData = [
        { uuid: '1', name: 'Alice', entity_type: 'person' },
        { uuid: '2', name: 'Bob', entity_type: 'person' },
      ];
      const results: GraphResults = {
        successful: [{ graph: 'entity', data: entityData }],
        failed: [],
      };

      const aggregated = aggregator.aggregate(results);

      expect(aggregated.results[0].data).toEqual(entityData);
    });
  });

  describe('deduplicate', () => {
    it('should return results unchanged (placeholder implementation)', () => {
      const results: GraphResult[] = [
        { graph: 'entity', data: [{ uuid: '1', name: 'Alice' }] },
        { graph: 'entity', data: [{ uuid: '1', name: 'Alice' }] },
      ];

      const deduplicated = aggregator.deduplicate(results);

      // Current implementation is a pass-through
      expect(deduplicated).toEqual(results);
      expect(deduplicated).toHaveLength(2);
    });

    it('should handle empty array', () => {
      const results: GraphResult[] = [];

      const deduplicated = aggregator.deduplicate(results);

      expect(deduplicated).toHaveLength(0);
    });
  });

  describe('merge', () => {
    it('should combine results by graph name', () => {
      const results: GraphResult[] = [
        { graph: 'entity', data: [{ uuid: '1', name: 'Alice' }] },
        { graph: 'temporal', data: { events: [{ id: 'e1' }], facts: [] } },
      ];

      const merged = aggregator.merge(results);

      expect(merged.entity).toEqual([{ uuid: '1', name: 'Alice' }]);
      expect(merged.temporal).toEqual({ events: [{ id: 'e1' }], facts: [] });
    });

    it('should handle single result', () => {
      const results: GraphResult[] = [
        { graph: 'semantic', data: [{ concept: 'test' }] },
      ];

      const merged = aggregator.merge(results);

      expect(Object.keys(merged)).toHaveLength(1);
      expect(merged.semantic).toEqual([{ concept: 'test' }]);
    });

    it('should handle empty results', () => {
      const results: GraphResult[] = [];

      const merged = aggregator.merge(results);

      expect(Object.keys(merged)).toHaveLength(0);
    });

    it('should overwrite if same graph appears twice', () => {
      // This tests current behavior - later results overwrite earlier ones
      const results: GraphResult[] = [
        { graph: 'entity', data: [{ uuid: '1', name: 'First' }] },
        { graph: 'entity', data: [{ uuid: '2', name: 'Second' }] },
      ];

      const merged = aggregator.merge(results);

      // Last one wins with current implementation
      expect(merged.entity).toEqual([{ uuid: '2', name: 'Second' }]);
    });

    it('should handle all four graph types', () => {
      const results: GraphResult[] = [
        { graph: 'entity', data: { entities: [] } },
        { graph: 'temporal', data: { events: [], facts: [] } },
        { graph: 'causal', data: { nodes: [], relationships: [] } },
        { graph: 'semantic', data: { concepts: [] } },
      ];

      const merged = aggregator.merge(results);

      expect(Object.keys(merged)).toHaveLength(4);
      expect(merged).toHaveProperty('entity');
      expect(merged).toHaveProperty('temporal');
      expect(merged).toHaveProperty('causal');
      expect(merged).toHaveProperty('semantic');
    });
  });
});
