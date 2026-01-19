// Tests for ContextLinearizer

import type {
  GraphViewSource,
  MAGMAIntentType,
  MergedSubgraph,
  ScoredNode,
} from '@polyg-mcp/shared';
import { describe, expect, it } from 'vitest';
import { ContextLinearizer } from './context-linearizer.js';
import { RetrievalValidationError } from './errors.js';

// Helper to create a valid merged subgraph
function createMergedSubgraph(nodes: ScoredNode[] = []): MergedSubgraph {
  return {
    nodes,
    viewContributions: { semantic: 0, entity: 0, temporal: 0, causal: 0 },
  };
}

// Helper to create a scored node
function createNode(
  uuid: string,
  data: Record<string, unknown> = {},
  views: GraphViewSource[] = ['semantic'],
  finalScore = 0.8,
): ScoredNode {
  return {
    uuid,
    data,
    views,
    finalScore,
    viewCount: views.length,
  };
}

describe('ContextLinearizer', () => {
  describe('constructor', () => {
    it('should create linearizer with default maxTokens', () => {
      const linearizer = new ContextLinearizer();
      expect(linearizer.getMaxTokens()).toBe(4000);
    });

    it('should accept custom maxTokens', () => {
      const linearizer = new ContextLinearizer(8000);
      expect(linearizer.getMaxTokens()).toBe(8000);
    });

    it('should throw for maxTokens below minimum (100)', () => {
      expect(() => new ContextLinearizer(50)).toThrow(RetrievalValidationError);
    });

    it('should throw for maxTokens above maximum (100000)', () => {
      expect(() => new ContextLinearizer(200000)).toThrow(
        RetrievalValidationError,
      );
    });

    it('should accept minimum valid maxTokens', () => {
      const linearizer = new ContextLinearizer(100);
      expect(linearizer.getMaxTokens()).toBe(100);
    });

    it('should accept maximum valid maxTokens', () => {
      const linearizer = new ContextLinearizer(100000);
      expect(linearizer.getMaxTokens()).toBe(100000);
    });
  });

  describe('linearize', () => {
    describe('basic functionality', () => {
      it('should linearize empty merged subgraph', () => {
        const linearizer = new ContextLinearizer();
        const merged = createMergedSubgraph([]);
        const result = linearizer.linearize(merged, 'EXPLORE');

        expect(result.nodeCount).toBe(0);
        expect(result.strategy).toBe('score_ranked');
        expect(result.text).toContain('## Retrieved Context');
        expect(result.estimatedTokens).toBeGreaterThan(0);
      });

      it('should linearize single node', () => {
        const linearizer = new ContextLinearizer();
        const node = createNode('n1', {
          name: 'Test Node',
          entity_type: 'Concept',
        });
        const merged = createMergedSubgraph([node]);
        const result = linearizer.linearize(merged, 'EXPLORE');

        expect(result.nodeCount).toBe(1);
        expect(result.text).toContain('Test Node');
        expect(result.text).toContain('Concept');
      });

      it('should linearize multiple nodes', () => {
        const linearizer = new ContextLinearizer();
        const nodes = [
          createNode('n1', { name: 'Node 1' }, ['semantic'], 0.9),
          createNode('n2', { name: 'Node 2' }, ['entity'], 0.8),
          createNode('n3', { name: 'Node 3' }, ['temporal'], 0.7),
        ];
        const merged = createMergedSubgraph(nodes);
        const result = linearizer.linearize(merged, 'EXPLORE');

        expect(result.nodeCount).toBe(3);
        expect(result.text).toContain('Node 1');
        expect(result.text).toContain('Node 2');
        expect(result.text).toContain('Node 3');
      });

      it('should include view sources in output', () => {
        const linearizer = new ContextLinearizer();
        const node = createNode('n1', { name: 'Multi-view' }, [
          'semantic',
          'entity',
        ]);
        const merged = createMergedSubgraph([node]);
        const result = linearizer.linearize(merged, 'EXPLORE');

        expect(result.text).toContain('[Found in: semantic, entity]');
      });

      it('should include view summary', () => {
        const linearizer = new ContextLinearizer();
        const nodes = [
          createNode('n1', { name: 'N1' }, ['semantic']),
          createNode('n2', { name: 'N2' }, ['entity']),
        ];
        const merged = createMergedSubgraph(nodes);
        const result = linearizer.linearize(merged, 'EXPLORE');

        expect(result.text).toContain('Sources:');
        expect(result.text).toContain('Total nodes: 2');
      });
    });

    describe('intent-specific strategies', () => {
      it('should use causal_chain strategy for WHY intent', () => {
        const linearizer = new ContextLinearizer();
        const merged = createMergedSubgraph([]);
        const result = linearizer.linearize(merged, 'WHY');

        expect(result.strategy).toBe('causal_chain');
        expect(result.text).toContain('## Causal Analysis Context');
      });

      it('should use temporal strategy for WHEN intent', () => {
        const linearizer = new ContextLinearizer();
        const merged = createMergedSubgraph([]);
        const result = linearizer.linearize(merged, 'WHEN');

        expect(result.strategy).toBe('temporal');
        expect(result.text).toContain('## Temporal Context');
      });

      it('should use entity_grouped strategy for WHO intent', () => {
        const linearizer = new ContextLinearizer();
        const merged = createMergedSubgraph([]);
        const result = linearizer.linearize(merged, 'WHO');

        expect(result.strategy).toBe('entity_grouped');
        expect(result.text).toContain('## Entity Context');
      });

      it('should use entity_grouped strategy for WHAT intent', () => {
        const linearizer = new ContextLinearizer();
        const merged = createMergedSubgraph([]);
        const result = linearizer.linearize(merged, 'WHAT');

        expect(result.strategy).toBe('entity_grouped');
        expect(result.text).toContain('## Descriptive Context');
      });

      it('should use score_ranked strategy for EXPLORE intent', () => {
        const linearizer = new ContextLinearizer();
        const merged = createMergedSubgraph([]);
        const result = linearizer.linearize(merged, 'EXPLORE');

        expect(result.strategy).toBe('score_ranked');
        expect(result.text).toContain('## Retrieved Context');
      });
    });

    describe('node ordering', () => {
      it('should prioritize causal view nodes for WHY intent', () => {
        const linearizer = new ContextLinearizer();
        const nodes = [
          createNode('semantic', { name: 'Semantic Node' }, ['semantic'], 0.9),
          createNode('causal', { name: 'Causal Node' }, ['causal'], 0.7),
        ];
        const merged = createMergedSubgraph(nodes);
        const result = linearizer.linearize(merged, 'WHY');

        // Causal node should appear before semantic despite lower score
        const causalIndex = result.text.indexOf('Causal Node');
        const semanticIndex = result.text.indexOf('Semantic Node');
        expect(causalIndex).toBeLessThan(semanticIndex);
      });

      it('should prioritize temporal view nodes for WHEN intent', () => {
        const linearizer = new ContextLinearizer();
        const nodes = [
          createNode('semantic', { name: 'Semantic Node' }, ['semantic'], 0.9),
          createNode('temporal', { name: 'Temporal Node' }, ['temporal'], 0.7),
        ];
        const merged = createMergedSubgraph(nodes);
        const result = linearizer.linearize(merged, 'WHEN');

        const temporalIndex = result.text.indexOf('Temporal Node');
        const semanticIndex = result.text.indexOf('Semantic Node');
        expect(temporalIndex).toBeLessThan(semanticIndex);
      });

      it('should order temporal nodes by date when available', () => {
        const linearizer = new ContextLinearizer();
        const nodes = [
          createNode(
            'later',
            { name: 'Later', occurred_at: '2024-06-15' },
            ['temporal'],
            0.9,
          ),
          createNode(
            'earlier',
            { name: 'Earlier', occurred_at: '2024-01-01' },
            ['temporal'],
            0.8,
          ),
        ];
        const merged = createMergedSubgraph(nodes);
        const result = linearizer.linearize(merged, 'WHEN');

        const earlierIndex = result.text.indexOf('Earlier');
        const laterIndex = result.text.indexOf('Later');
        expect(earlierIndex).toBeLessThan(laterIndex);
      });

      it('should group nodes by entity type for WHO/WHAT intent', () => {
        const linearizer = new ContextLinearizer();
        const nodes = [
          createNode(
            'p1',
            { name: 'Person 1', entity_type: 'Person' },
            ['entity'],
            0.9,
          ),
          createNode(
            'o1',
            { name: 'Org 1', entity_type: 'Organization' },
            ['entity'],
            0.95,
          ),
          createNode(
            'p2',
            { name: 'Person 2', entity_type: 'Person' },
            ['entity'],
            0.8,
          ),
        ];
        const merged = createMergedSubgraph(nodes);
        const result = linearizer.linearize(merged, 'WHO');

        // Organizations should be grouped together before Persons (alphabetically)
        const orgIndex = result.text.indexOf('Org 1');
        const person1Index = result.text.indexOf('Person 1');
        const person2Index = result.text.indexOf('Person 2');
        expect(orgIndex).toBeLessThan(person1Index);
        expect(person1Index).toBeLessThan(person2Index);
      });

      it('should order by score within same entity type group', () => {
        const linearizer = new ContextLinearizer();
        const nodes = [
          createNode(
            'low',
            { name: 'Low Score', entity_type: 'Person' },
            ['entity'],
            0.5,
          ),
          createNode(
            'high',
            { name: 'High Score', entity_type: 'Person' },
            ['entity'],
            0.9,
          ),
        ];
        const merged = createMergedSubgraph(nodes);
        const result = linearizer.linearize(merged, 'WHO');

        const highIndex = result.text.indexOf('High Score');
        const lowIndex = result.text.indexOf('Low Score');
        expect(highIndex).toBeLessThan(lowIndex);
      });

      it('should order by score for EXPLORE intent', () => {
        const linearizer = new ContextLinearizer();
        const nodes = [
          createNode('low', { name: 'Low' }, ['semantic'], 0.3),
          createNode('high', { name: 'High' }, ['semantic'], 0.9),
          createNode('mid', { name: 'Mid' }, ['semantic'], 0.6),
        ];
        const merged = createMergedSubgraph(nodes);
        const result = linearizer.linearize(merged, 'EXPLORE');

        const highIndex = result.text.indexOf('High');
        const midIndex = result.text.indexOf('Mid');
        const lowIndex = result.text.indexOf('Low');
        expect(highIndex).toBeLessThan(midIndex);
        expect(midIndex).toBeLessThan(lowIndex);
      });
    });

    describe('node formatting', () => {
      it('should format node with name and type', () => {
        const linearizer = new ContextLinearizer();
        const node = createNode('n1', {
          name: 'Test Entity',
          entity_type: 'Service',
        });
        const merged = createMergedSubgraph([node]);
        const result = linearizer.linearize(merged, 'EXPLORE');

        expect(result.text).toContain('**Test Entity** (Service)');
      });

      it('should fall back to description when no name', () => {
        const linearizer = new ContextLinearizer();
        const node = createNode('n1', { description: 'A test description' });
        const merged = createMergedSubgraph([node]);
        const result = linearizer.linearize(merged, 'EXPLORE');

        expect(result.text).toContain('A test description');
      });

      it('should show confidence for causal_chain strategy', () => {
        const linearizer = new ContextLinearizer();
        const node = createNode(
          'n1',
          { name: 'Causal Node', confidence: 0.85 },
          ['causal'],
        );
        const merged = createMergedSubgraph([node]);
        const result = linearizer.linearize(merged, 'WHY');

        expect(result.text).toContain('Confidence: 0.85');
      });

      it('should show date for temporal strategy', () => {
        const linearizer = new ContextLinearizer();
        const node = createNode(
          'n1',
          { name: 'Event', occurred_at: '2024-03-15' },
          ['temporal'],
        );
        const merged = createMergedSubgraph([node]);
        const result = linearizer.linearize(merged, 'WHEN');

        expect(result.text).toContain('Date: 2024-03-15');
      });

      it('should include description if different from name', () => {
        const linearizer = new ContextLinearizer();
        const node = createNode('n1', {
          name: 'Server',
          description: 'A production web server handling API requests',
        });
        const merged = createMergedSubgraph([node]);
        const result = linearizer.linearize(merged, 'EXPLORE');

        expect(result.text).toContain('Server');
        expect(result.text).toContain(
          'A production web server handling API requests',
        );
      });

      it('should truncate long descriptions', () => {
        const linearizer = new ContextLinearizer();
        const longDesc = 'A'.repeat(300);
        const node = createNode('n1', { name: 'Node', description: longDesc });
        const merged = createMergedSubgraph([node]);
        const result = linearizer.linearize(merged, 'EXPLORE');

        // Description should be truncated to 200 chars
        expect(result.text).not.toContain('A'.repeat(300));
        expect(result.text).toContain('A'.repeat(200));
      });
    });

    describe('token truncation', () => {
      it('should truncate when exceeding maxTokens', () => {
        const linearizer = new ContextLinearizer(150); // Very low token limit
        // Create nodes with longer content to ensure truncation
        const longDescription =
          'This is a longer description that takes up more tokens in the context window to ensure truncation happens properly.';
        const nodes = Array.from({ length: 20 }, (_, i) =>
          createNode(`n${i}`, {
            name: `Node Number ${i}`,
            description: longDescription,
            entity_type: 'TestType',
          }),
        );
        const merged = createMergedSubgraph(nodes);
        const result = linearizer.linearize(merged, 'EXPLORE');

        // Verify truncation happened via truncation indicator in text
        expect(result.text).toContain('[... additional context truncated ...]');
        // nodeCount should reflect actual included nodes, not total input
        expect(result.nodeCount).toBeLessThan(20);
        expect(result.nodeCount).toBeGreaterThan(0);
        // Not all nodes should appear in the text (some were truncated)
        const lastNode = 'Node Number 19';
        expect(result.text).not.toContain(lastNode);
      });

      it('should include all nodes when within token budget', () => {
        const linearizer = new ContextLinearizer(10000);
        const nodes = [
          createNode('n1', { name: 'Node 1' }),
          createNode('n2', { name: 'Node 2' }),
        ];
        const merged = createMergedSubgraph(nodes);
        const result = linearizer.linearize(merged, 'EXPLORE');

        expect(result.text).not.toContain(
          '[... additional context truncated ...]',
        );
        expect(result.nodeCount).toBe(2);
      });
    });

    describe('token estimation', () => {
      it('should estimate tokens as text length / 4', () => {
        const linearizer = new ContextLinearizer();
        const merged = createMergedSubgraph([]);
        const result = linearizer.linearize(merged, 'EXPLORE');

        // Estimated tokens should be approximately text.length / 4, rounded up
        expect(result.estimatedTokens).toBe(Math.ceil(result.text.length / 4));
      });
    });

    describe('validation', () => {
      it('should throw for invalid merged subgraph', () => {
        const linearizer = new ContextLinearizer();
        const invalidMerged = { invalid: true } as unknown as MergedSubgraph;

        expect(() => linearizer.linearize(invalidMerged, 'EXPLORE')).toThrow(
          RetrievalValidationError,
        );
      });

      it('should throw for invalid intent type', () => {
        const linearizer = new ContextLinearizer();
        const merged = createMergedSubgraph([]);
        const invalidIntent = 'INVALID' as MAGMAIntentType;

        expect(() => linearizer.linearize(merged, invalidIntent)).toThrow(
          RetrievalValidationError,
        );
      });

      it('should throw for null merged subgraph', () => {
        const linearizer = new ContextLinearizer();

        expect(() =>
          linearizer.linearize(null as unknown as MergedSubgraph, 'EXPLORE'),
        ).toThrow(RetrievalValidationError);
      });
    });
  });

  describe('date extraction', () => {
    it('should extract date from occurred_at field', () => {
      const linearizer = new ContextLinearizer();
      const nodes = [
        createNode('n1', { name: 'Event 1', occurred_at: '2024-06-01' }, [
          'temporal',
        ]),
        createNode('n2', { name: 'Event 2', occurred_at: '2024-01-01' }, [
          'temporal',
        ]),
      ];
      const merged = createMergedSubgraph(nodes);
      const result = linearizer.linearize(merged, 'WHEN');

      // Earlier event should come first
      const event2Index = result.text.indexOf('Event 2');
      const event1Index = result.text.indexOf('Event 1');
      expect(event2Index).toBeLessThan(event1Index);
    });

    it('should extract date from valid_from field', () => {
      const linearizer = new ContextLinearizer();
      const nodes = [
        createNode('n1', { name: 'Later', valid_from: '2024-12-01' }, [
          'temporal',
        ]),
        createNode('n2', { name: 'Earlier', valid_from: '2024-01-01' }, [
          'temporal',
        ]),
      ];
      const merged = createMergedSubgraph(nodes);
      const result = linearizer.linearize(merged, 'WHEN');

      const earlierIndex = result.text.indexOf('Earlier');
      const laterIndex = result.text.indexOf('Later');
      expect(earlierIndex).toBeLessThan(laterIndex);
    });

    it('should fall back to score when dates are invalid', () => {
      const linearizer = new ContextLinearizer();
      const nodes = [
        createNode(
          'low',
          { name: 'Low Score', occurred_at: 'invalid' },
          ['temporal'],
          0.3,
        ),
        createNode(
          'high',
          { name: 'High Score', occurred_at: 'also-invalid' },
          ['temporal'],
          0.9,
        ),
      ];
      const merged = createMergedSubgraph(nodes);
      const result = linearizer.linearize(merged, 'WHEN');

      // Should fall back to score ordering
      const highIndex = result.text.indexOf('High Score');
      const lowIndex = result.text.indexOf('Low Score');
      expect(highIndex).toBeLessThan(lowIndex);
    });
  });

  describe('entity type extraction', () => {
    it('should use entity_type field', () => {
      const linearizer = new ContextLinearizer();
      const nodes = [
        createNode('n1', { name: 'N1', entity_type: 'Person' }, ['entity']),
        createNode('n2', { name: 'N2', entity_type: 'Organization' }, [
          'entity',
        ]),
      ];
      const merged = createMergedSubgraph(nodes);
      const result = linearizer.linearize(merged, 'WHO');

      // Should be grouped by entity type
      expect(result.text).toContain('(Person)');
      expect(result.text).toContain('(Organization)');
    });

    it('should fall back to node_type field', () => {
      const linearizer = new ContextLinearizer();
      const node = createNode('n1', { name: 'Node', node_type: 'Concept' });
      const merged = createMergedSubgraph([node]);
      const result = linearizer.linearize(merged, 'EXPLORE');

      expect(result.text).toContain('(Concept)');
    });

    it('should fall back to type field', () => {
      const linearizer = new ContextLinearizer();
      const node = createNode('n1', { name: 'Node', type: 'Service' });
      const merged = createMergedSubgraph([node]);
      const result = linearizer.linearize(merged, 'EXPLORE');

      expect(result.text).toContain('(Service)');
    });

    it('should use Unknown for missing type', () => {
      const linearizer = new ContextLinearizer();
      const node = createNode('n1', { name: 'Node' });
      const merged = createMergedSubgraph([node]);
      const result = linearizer.linearize(merged, 'EXPLORE');

      expect(result.text).toContain('(Unknown)');
    });
  });

  describe('getMaxTokens', () => {
    it('should return configured maxTokens', () => {
      const linearizer = new ContextLinearizer(5000);
      expect(linearizer.getMaxTokens()).toBe(5000);
    });
  });
});
