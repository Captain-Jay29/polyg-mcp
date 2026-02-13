import { describe, expect, it } from 'vitest';
import {
  buildExtractionPrompt,
  formatNeighborhoodSummary,
} from './extraction-prompt.js';
import type { NeighborhoodContext } from './neighborhood.js';
import type { DocumentProfile, ParsedChunk } from './types.js';

const testProfile: DocumentProfile = {
  document_type: 'conversation',
  domain: 'general',
  entity_types_expected: ['person', 'place', 'organization'],
  relationship_types_expected: ['knows', 'works_at'],
  causal_patterns: ['decision → action', 'event → reaction'],
  temporal_structure: 'session_ordered',
  extraction_focus: 'Focus on people and their relationships.',
  confidence_calibration: {
    explicit_causation: 1.0,
    strong_implication: 0.85,
    weak_inference: 0.65,
  },
};

const testChunk: ParsedChunk = {
  chunk_id: 'chunk_003',
  content: 'Alice: I just started working at Acme Corp last week.',
  position: 3,
  metadata: {
    source_format: 'conversation',
    speaker: 'Alice',
    turn_index: 3,
  },
};

const emptyNeighborhood: NeighborhoodContext = {
  knownEntities: [],
  recentEvents: [],
  activeCausalChains: [],
  similarConcepts: [],
};

const richNeighborhood: NeighborhoodContext = {
  knownEntities: [
    { name: 'Alice', type: 'person', uuid: 'uuid-1' },
    { name: 'Acme Corp', type: 'organization', uuid: 'uuid-2' },
  ],
  recentEvents: [
    {
      description: 'Alice mentioned job search',
      occurred_at: '2024-01-15T10:00:00Z',
    },
  ],
  activeCausalChains: [
    { cause: 'Job search', effect: 'Got hired', confidence: 0.9 },
  ],
  similarConcepts: [
    { name: 'Employment', score: 0.85 },
    { name: 'Career change', score: 0.72 },
  ],
};

describe('buildExtractionPrompt', () => {
  describe('system prompt', () => {
    it('should include document type and domain', () => {
      const { system } = buildExtractionPrompt(
        testChunk,
        testProfile,
        emptyNeighborhood,
      );
      expect(system).toContain('Document type: conversation');
      expect(system).toContain('Domain: general');
    });

    it('should include entity types', () => {
      const { system } = buildExtractionPrompt(
        testChunk,
        testProfile,
        emptyNeighborhood,
      );
      expect(system).toContain('person, place, organization');
    });

    it('should include relationship types', () => {
      const { system } = buildExtractionPrompt(
        testChunk,
        testProfile,
        emptyNeighborhood,
      );
      expect(system).toContain('knows, works_at');
    });

    it('should include causal patterns', () => {
      const { system } = buildExtractionPrompt(
        testChunk,
        testProfile,
        emptyNeighborhood,
      );
      expect(system).toContain('decision → action');
      expect(system).toContain('event → reaction');
    });

    it('should include confidence calibration', () => {
      const { system } = buildExtractionPrompt(
        testChunk,
        testProfile,
        emptyNeighborhood,
      );
      expect(system).toContain('Explicit causation');
      expect(system).toContain('1');
      expect(system).toContain('0.85');
      expect(system).toContain('0.65');
    });

    it('should include extraction focus', () => {
      const { system } = buildExtractionPrompt(
        testChunk,
        testProfile,
        emptyNeighborhood,
      );
      expect(system).toContain('Focus on people and their relationships.');
    });

    it('should include JSON output format', () => {
      const { system } = buildExtractionPrompt(
        testChunk,
        testProfile,
        emptyNeighborhood,
      );
      expect(system).toContain('"entities"');
      expect(system).toContain('"relationships"');
      expect(system).toContain('"causal_links"');
      expect(system).toContain('"facts"');
    });

    it('should include entity reuse directive', () => {
      const { system } = buildExtractionPrompt(
        testChunk,
        testProfile,
        emptyNeighborhood,
      );
      expect(system).toContain('REUSE the exact same name');
    });
  });

  describe('user prompt', () => {
    it('should include chunk content', () => {
      const { user } = buildExtractionPrompt(
        testChunk,
        testProfile,
        emptyNeighborhood,
      );
      expect(user).toContain(
        'Alice: I just started working at Acme Corp last week.',
      );
    });

    it('should not include context section when neighborhood is empty', () => {
      const { user } = buildExtractionPrompt(
        testChunk,
        testProfile,
        emptyNeighborhood,
      );
      expect(user).not.toContain('Context from existing graph');
      expect(user).not.toContain('Known entities');
    });

    it('should include known entities when available', () => {
      const { user } = buildExtractionPrompt(
        testChunk,
        testProfile,
        richNeighborhood,
      );
      expect(user).toContain(
        'Known entities: Alice (person), Acme Corp (organization)',
      );
    });

    it('should include recent events when available', () => {
      const { user } = buildExtractionPrompt(
        testChunk,
        testProfile,
        richNeighborhood,
      );
      expect(user).toContain('Recent events: Alice mentioned job search');
    });

    it('should include causal chains when available', () => {
      const { user } = buildExtractionPrompt(
        testChunk,
        testProfile,
        richNeighborhood,
      );
      expect(user).toContain(
        'Active causal chains: Job search → Got hired (0.9)',
      );
    });

    it('should include similar concepts when available', () => {
      const { user } = buildExtractionPrompt(
        testChunk,
        testProfile,
        richNeighborhood,
      );
      expect(user).toContain('Related concepts: Employment, Career change');
    });
  });
});

describe('formatNeighborhoodSummary', () => {
  it('should return empty summary for empty neighborhood', () => {
    expect(formatNeighborhoodSummary(emptyNeighborhood)).toBe(
      '(empty neighborhood)',
    );
  });

  it('should format rich neighborhood', () => {
    const summary = formatNeighborhoodSummary(richNeighborhood);
    expect(summary).toContain('Entities(2)');
    expect(summary).toContain('Events(1)');
    expect(summary).toContain('Causal(1)');
    expect(summary).toContain('Concepts(2)');
  });
});
