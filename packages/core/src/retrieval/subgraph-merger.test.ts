// Tests for SubgraphMerger

import type { GraphView } from '@polyg-mcp/shared';
import { describe, expect, it } from 'vitest';
import { RetrievalValidationError } from './errors.js';
import { SubgraphMerger } from './subgraph-merger.js';

describe('SubgraphMerger', () => {
  describe('constructor', () => {
    it('should create merger with default options', () => {
      const merger = new SubgraphMerger();
      const options = merger.getOptions();
      expect(options.multiViewBoost).toBe(1.5);
      expect(options.minNodesPerView).toBe(3);
      expect(options.maxNodesPerView).toBe(50);
    });

    it('should accept custom options', () => {
      const merger = new SubgraphMerger({
        multiViewBoost: 2.0,
        minNodesPerView: 5,
        maxNodesPerView: 100,
      });
      const options = merger.getOptions();
      expect(options.multiViewBoost).toBe(2.0);
      expect(options.minNodesPerView).toBe(5);
      expect(options.maxNodesPerView).toBe(100);
    });

    it('should throw for invalid multiViewBoost', () => {
      expect(() => new SubgraphMerger({ multiViewBoost: 0.5 })).toThrow(
        RetrievalValidationError,
      );
      expect(() => new SubgraphMerger({ multiViewBoost: 15 })).toThrow(
        RetrievalValidationError,
      );
    });

    it('should throw for invalid minNodesPerView', () => {
      expect(() => new SubgraphMerger({ minNodesPerView: -1 })).toThrow(
        RetrievalValidationError,
      );
    });

    it('should throw for invalid maxNodesPerView', () => {
      expect(() => new SubgraphMerger({ maxNodesPerView: 0 })).toThrow(
        RetrievalValidationError,
      );
    });
  });

  describe('merge', () => {
    it('should merge empty views array', () => {
      const merger = new SubgraphMerger();
      const result = merger.merge([]);
      expect(result.nodes).toHaveLength(0);
      expect(result.viewContributions).toEqual({
        semantic: 0,
        entity: 0,
        temporal: 0,
        causal: 0,
      });
    });

    it('should merge single view', () => {
      const merger = new SubgraphMerger();
      const views: GraphView[] = [
        {
          source: 'semantic',
          nodes: [
            { uuid: 'node1', data: { name: 'Node 1' }, score: 0.9 },
            { uuid: 'node2', data: { name: 'Node 2' }, score: 0.8 },
          ],
        },
      ];

      const result = merger.merge(views);

      expect(result.nodes).toHaveLength(2);
      expect(result.viewContributions.semantic).toBe(2);
      expect(result.nodes[0].uuid).toBe('node1');
      expect(result.nodes[0].finalScore).toBe(0.9);
      expect(result.nodes[0].viewCount).toBe(1);
      expect(result.nodes[0].views).toEqual(['semantic']);
    });

    it('should merge multiple views with unique nodes', () => {
      const merger = new SubgraphMerger();
      const views: GraphView[] = [
        {
          source: 'semantic',
          nodes: [{ uuid: 'node1', data: { name: 'Node 1' }, score: 0.9 }],
        },
        {
          source: 'entity',
          nodes: [{ uuid: 'node2', data: { name: 'Node 2' }, score: 0.8 }],
        },
      ];

      const result = merger.merge(views);

      expect(result.nodes).toHaveLength(2);
      expect(result.viewContributions.semantic).toBe(1);
      expect(result.viewContributions.entity).toBe(1);
    });

    it('should boost nodes appearing in multiple views', () => {
      const merger = new SubgraphMerger({ multiViewBoost: 2.0 });
      const views: GraphView[] = [
        {
          source: 'semantic',
          nodes: [{ uuid: 'shared', data: { name: 'Shared' }, score: 0.8 }],
        },
        {
          source: 'entity',
          nodes: [{ uuid: 'shared', data: { name: 'Shared' }, score: 0.8 }],
        },
      ];

      const result = merger.merge(views);

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].viewCount).toBe(2);
      expect(result.nodes[0].views).toContain('semantic');
      expect(result.nodes[0].views).toContain('entity');
      // Score should be boosted: avgScore * boost = 0.8 * 2.0 = 1.6
      expect(result.nodes[0].finalScore).toBe(1.6);
    });

    it('should sort nodes by finalScore descending', () => {
      const merger = new SubgraphMerger();
      const views: GraphView[] = [
        {
          source: 'semantic',
          nodes: [
            { uuid: 'low', data: {}, score: 0.3 },
            { uuid: 'high', data: {}, score: 0.9 },
            { uuid: 'mid', data: {}, score: 0.6 },
          ],
        },
      ];

      const result = merger.merge(views);

      expect(result.nodes[0].uuid).toBe('high');
      expect(result.nodes[1].uuid).toBe('mid');
      expect(result.nodes[2].uuid).toBe('low');
    });

    it('should limit nodes per view to maxNodesPerView', () => {
      const merger = new SubgraphMerger({ maxNodesPerView: 2 });
      const views: GraphView[] = [
        {
          source: 'semantic',
          nodes: [
            { uuid: 'node1', data: {}, score: 0.9 },
            { uuid: 'node2', data: {}, score: 0.8 },
            { uuid: 'node3', data: {}, score: 0.7 },
            { uuid: 'node4', data: {}, score: 0.6 },
          ],
        },
      ];

      const result = merger.merge(views);

      expect(result.nodes).toHaveLength(2);
      expect(result.viewContributions.semantic).toBe(2);
    });

    it('should handle nodes without explicit score', () => {
      const merger = new SubgraphMerger();
      const views: GraphView[] = [
        {
          source: 'semantic',
          nodes: [{ uuid: 'node1', data: { name: 'Node 1' } }],
        },
      ];

      const result = merger.merge(views);

      expect(result.nodes[0].finalScore).toBe(1.0); // Default score
    });

    it('should throw for non-array input', () => {
      const merger = new SubgraphMerger();
      expect(() =>
        merger.merge('not an array' as unknown as GraphView[]),
      ).toThrow(RetrievalValidationError);
    });

    it('should throw for invalid view structure', () => {
      const merger = new SubgraphMerger();
      const invalidViews = [
        { source: 'invalid_source', nodes: [] },
      ] as unknown as GraphView[];

      expect(() => merger.merge(invalidViews)).toThrow(
        RetrievalValidationError,
      );
    });

    it('should handle three-view boost correctly', () => {
      const merger = new SubgraphMerger({ multiViewBoost: 1.5 });
      const views: GraphView[] = [
        {
          source: 'semantic',
          nodes: [{ uuid: 'triple', data: {}, score: 0.6 }],
        },
        {
          source: 'entity',
          nodes: [{ uuid: 'triple', data: {}, score: 0.6 }],
        },
        {
          source: 'temporal',
          nodes: [{ uuid: 'triple', data: {}, score: 0.6 }],
        },
      ];

      const result = merger.merge(views);

      expect(result.nodes[0].viewCount).toBe(3);
      // Boost = 1.5^(3-1) = 1.5^2 = 2.25
      // Final = 0.6 * 2.25 = 1.35
      expect(result.nodes[0].finalScore).toBeCloseTo(1.35, 2);
    });
  });

  describe('hasMinimumNodes', () => {
    it('should return true when view has enough nodes', () => {
      const merger = new SubgraphMerger({ minNodesPerView: 2 });
      const view: GraphView = {
        source: 'semantic',
        nodes: [
          { uuid: 'n1', data: {} },
          { uuid: 'n2', data: {} },
          { uuid: 'n3', data: {} },
        ],
      };
      expect(merger.hasMinimumNodes(view)).toBe(true);
    });

    it('should return false when view has too few nodes', () => {
      const merger = new SubgraphMerger({ minNodesPerView: 5 });
      const view: GraphView = {
        source: 'semantic',
        nodes: [
          { uuid: 'n1', data: {} },
          { uuid: 'n2', data: {} },
        ],
      };
      expect(merger.hasMinimumNodes(view)).toBe(false);
    });

    it('should return false for invalid view', () => {
      const merger = new SubgraphMerger();
      expect(merger.hasMinimumNodes({} as GraphView)).toBe(false);
    });
  });

  describe('topN', () => {
    it('should return top N nodes', () => {
      const merger = new SubgraphMerger();
      const merged = merger.merge([
        {
          source: 'semantic',
          nodes: [
            { uuid: 'n1', data: {}, score: 0.9 },
            { uuid: 'n2', data: {}, score: 0.8 },
            { uuid: 'n3', data: {}, score: 0.7 },
          ],
        },
      ]);

      const top2 = merger.topN(merged, 2);

      expect(top2.nodes).toHaveLength(2);
      expect(top2.nodes[0].uuid).toBe('n1');
      expect(top2.nodes[1].uuid).toBe('n2');
    });

    it('should throw for negative n', () => {
      const merger = new SubgraphMerger();
      const merged = {
        nodes: [],
        viewContributions: { semantic: 0, entity: 0, temporal: 0, causal: 0 },
      };
      expect(() => merger.topN(merged, -1)).toThrow(RetrievalValidationError);
    });
  });

  describe('filterByViewCount', () => {
    it('should filter nodes by minimum view count', () => {
      const merger = new SubgraphMerger();
      const views: GraphView[] = [
        {
          source: 'semantic',
          nodes: [
            { uuid: 'shared', data: {} },
            { uuid: 'single', data: {} },
          ],
        },
        {
          source: 'entity',
          nodes: [{ uuid: 'shared', data: {} }],
        },
      ];

      const merged = merger.merge(views);
      const filtered = merger.filterByViewCount(merged, 2);

      expect(filtered.nodes).toHaveLength(1);
      expect(filtered.nodes[0].uuid).toBe('shared');
    });

    it('should throw for minViews < 1', () => {
      const merger = new SubgraphMerger();
      const merged = {
        nodes: [],
        viewContributions: { semantic: 0, entity: 0, temporal: 0, causal: 0 },
      };
      expect(() => merger.filterByViewCount(merged, 0)).toThrow(
        RetrievalValidationError,
      );
    });
  });

  describe('filterByScore', () => {
    it('should filter nodes by minimum score', () => {
      const merger = new SubgraphMerger();
      const views: GraphView[] = [
        {
          source: 'semantic',
          nodes: [
            { uuid: 'high', data: {}, score: 0.9 },
            { uuid: 'low', data: {}, score: 0.3 },
          ],
        },
      ];

      const merged = merger.merge(views);
      const filtered = merger.filterByScore(merged, 0.5);

      expect(filtered.nodes).toHaveLength(1);
      expect(filtered.nodes[0].uuid).toBe('high');
    });

    it('should throw for negative minScore', () => {
      const merger = new SubgraphMerger();
      const merged = {
        nodes: [],
        viewContributions: { semantic: 0, entity: 0, temporal: 0, causal: 0 },
      };
      expect(() => merger.filterByScore(merged, -0.5)).toThrow(
        RetrievalValidationError,
      );
    });
  });

  describe('getNodesFromView', () => {
    it('should return nodes from specific view', () => {
      const merger = new SubgraphMerger();
      const views: GraphView[] = [
        {
          source: 'semantic',
          nodes: [{ uuid: 'sem1', data: {} }],
        },
        {
          source: 'entity',
          nodes: [{ uuid: 'ent1', data: {} }],
        },
      ];

      const merged = merger.merge(views);
      const semanticNodes = merger.getNodesFromView(merged, 'semantic');
      const entityNodes = merger.getNodesFromView(merged, 'entity');

      expect(semanticNodes).toHaveLength(1);
      expect(semanticNodes[0].uuid).toBe('sem1');
      expect(entityNodes).toHaveLength(1);
      expect(entityNodes[0].uuid).toBe('ent1');
    });
  });
});
