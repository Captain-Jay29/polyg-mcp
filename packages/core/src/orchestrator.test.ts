import type {
  EmbeddingProvider,
  LLMProvider,
  MAGMAIntent,
  SynthesizerOutput,
} from '@polyg-mcp/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Orchestrator } from './orchestrator.js';
import type { FalkorDBAdapter } from './storage/falkordb.js';

// Mock FalkorDBAdapter
function createMockDb(): FalkorDBAdapter {
  return {
    query: vi.fn(),
    createNode: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    findNodeByUuid: vi.fn(),
    findNodesByLabel: vi.fn(),
    deleteNode: vi.fn(),
    createRelationship: vi.fn(),
    vectorSearch: vi.fn(),
    getStatistics: vi.fn(),
    healthCheck: vi.fn(),
  } as unknown as FalkorDBAdapter;
}

// Mock LLMProvider
function createMockLLM(): LLMProvider {
  return {
    complete: vi.fn(),
  };
}

// Mock EmbeddingProvider
function createMockEmbeddings(): EmbeddingProvider {
  return {
    embed: vi.fn(),
    embedBatch: vi.fn(),
  };
}

// Helper to create a valid MAGMAIntent for the new MAGMA flow
function mockMAGMAIntent(overrides: Partial<MAGMAIntent> = {}): MAGMAIntent {
  return {
    type: 'WHO',
    entities: ['test entity'],
    confidence: 0.9,
    depthHints: {
      entity: 3,
      temporal: 1,
      causal: 1,
    },
    ...overrides,
  };
}

// Helper to create a valid SynthesizerOutput
function mockSynthesizerOutput(
  overrides: Partial<SynthesizerOutput> = {},
): SynthesizerOutput {
  return {
    answer: 'This is a test answer',
    confidence: 0.85,
    reasoning: {
      entities_involved: [],
    },
    sources: ['entity'],
    ...overrides,
  };
}

describe('Orchestrator', () => {
  let db: FalkorDBAdapter;
  let llm: LLMProvider;
  let embeddings: EmbeddingProvider;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    db = createMockDb();
    llm = createMockLLM();
    embeddings = createMockEmbeddings();
    orchestrator = new Orchestrator(db, llm, embeddings);
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create all graph instances', () => {
      const graphs = orchestrator.getGraphs();

      expect(graphs.entity).toBeDefined();
      expect(graphs.temporal).toBeDefined();
      expect(graphs.causal).toBeDefined();
      expect(graphs.semantic).toBeDefined();
      expect(graphs.crossLinker).toBeDefined();
    });

    it('should expose graphs as readonly properties', () => {
      expect(orchestrator.entityGraph).toBeDefined();
      expect(orchestrator.temporalGraph).toBeDefined();
      expect(orchestrator.causalGraph).toBeDefined();
      expect(orchestrator.semanticGraph).toBeDefined();
      expect(orchestrator.crossLinker).toBeDefined();
    });

    it('should store db, llm, and embeddings references', () => {
      expect(orchestrator.db).toBe(db);
      expect(orchestrator.llm).toBe(llm);
      expect(orchestrator.embeddings).toBe(embeddings);
    });

    it('should accept custom timeout config', () => {
      const customOrchestrator = new Orchestrator(db, llm, embeddings, {
        timeout: 10000,
      });
      expect(customOrchestrator).toBeDefined();
    });
  });

  describe('recall', () => {
    it('should execute full MAGMA pipeline: classify → execute → linearize → synthesize', async () => {
      const magmaIntent = mockMAGMAIntent({
        type: 'WHO',
        entities: ['Alice'],
      });

      const synthesizerOutput = mockSynthesizerOutput({
        answer: 'Alice is a person',
        sources: ['entity'],
      });

      // Mock LLM to return MAGMA intent first, then synthesizer output
      vi.mocked(llm.complete)
        .mockResolvedValueOnce(JSON.stringify(magmaIntent))
        .mockResolvedValueOnce(JSON.stringify(synthesizerOutput));

      // Mock graph queries to return empty (no entities found)
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      const result = await orchestrator.recall('Who is Alice?');

      expect(result.answer).toBe('Alice is a person');
      expect(result.sources).toContain('entity');
      expect(llm.complete).toHaveBeenCalledTimes(2);
    });

    it('should pass context to classifier', async () => {
      const magmaIntent = mockMAGMAIntent();
      const synthesizerOutput = mockSynthesizerOutput();

      vi.mocked(llm.complete)
        .mockResolvedValueOnce(JSON.stringify(magmaIntent))
        .mockResolvedValueOnce(JSON.stringify(synthesizerOutput));
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await orchestrator.recall(
        'What happened?',
        'Previous conversation context',
      );

      // Verify first call (classifier) includes context in prompt
      const classifierCall = vi.mocked(llm.complete).mock.calls[0][0];
      expect(classifierCall.prompt).toContain('Previous conversation context');
    });

    it('should throw with context when classifier fails', async () => {
      vi.mocked(llm.complete).mockRejectedValueOnce(
        new Error('LLM unavailable'),
      );

      await expect(orchestrator.recall('test query')).rejects.toThrow(
        'Intent classification failed: Failed to get LLM response for MAGMA classification',
      );
    });

    it('should handle graph expansion with empty results gracefully', async () => {
      // MAGMA executor handles graph failures gracefully - returns semantic-only
      const magmaIntent = mockMAGMAIntent({
        type: 'WHEN',
        entities: ['deployment'],
        depthHints: { entity: 1, temporal: 3, causal: 1 },
      });

      const synthesizerOutput = mockSynthesizerOutput({
        answer: 'No temporal events found',
        confidence: 0.5,
      });

      vi.mocked(llm.complete)
        .mockResolvedValueOnce(JSON.stringify(magmaIntent))
        .mockResolvedValueOnce(JSON.stringify(synthesizerOutput));

      // Return empty results - MAGMA handles this gracefully
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      const result = await orchestrator.recall('What happened last week?');

      // Pipeline completes with semantic-only fallback
      expect(result.answer).toBe('No temporal events found');
    });

    it('should throw with context when synthesizer fails', async () => {
      const magmaIntent = mockMAGMAIntent({
        type: 'WHO',
        entities: ['test'],
      });

      vi.mocked(llm.complete)
        .mockResolvedValueOnce(JSON.stringify(magmaIntent))
        .mockRejectedValueOnce(new Error('LLM rate limited'));

      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await expect(orchestrator.recall('test query')).rejects.toThrow(
        'Response synthesis failed: Failed to get LLM response for synthesis',
      );
    });

    it('should handle EXPLORE intent with balanced depth hints', async () => {
      const magmaIntent = mockMAGMAIntent({
        type: 'EXPLORE',
        entities: [],
        depthHints: { entity: 2, temporal: 2, causal: 2 },
      });

      const synthesizerOutput = mockSynthesizerOutput({
        answer: 'Exploring the topic broadly',
        confidence: 0.6,
      });

      vi.mocked(llm.complete)
        .mockResolvedValueOnce(JSON.stringify(magmaIntent))
        .mockResolvedValueOnce(JSON.stringify(synthesizerOutput));
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      const result = await orchestrator.recall('Tell me about the system');

      expect(result.confidence).toBe(0.6);
    });
  });

  describe('remember', () => {
    it('should store content as a temporal event', async () => {
      vi.mocked(db.createNode).mockResolvedValue('event-uuid');

      const result = await orchestrator.remember('Meeting with Alice at 3pm');

      expect(result.events_logged).toBe(1);
      expect(result.entities_created).toBe(0);
      expect(result.facts_added).toBe(0);
      expect(db.createNode).toHaveBeenCalledWith(
        'T_Event',
        expect.objectContaining({
          description: 'Meeting with Alice at 3pm',
        }),
      );
    });

    it('should reject empty content', async () => {
      await expect(orchestrator.remember('')).rejects.toThrow(
        'Content cannot be empty',
      );
    });

    it('should reject whitespace-only content', async () => {
      await expect(orchestrator.remember('   ')).rejects.toThrow(
        'Content cannot be empty',
      );
    });

    it('should reject tab and newline only content', async () => {
      await expect(orchestrator.remember('\t\n  \n')).rejects.toThrow(
        'Content cannot be empty',
      );
    });

    it('should throw with context when storage fails', async () => {
      vi.mocked(db.createNode).mockRejectedValue(new Error('Disk full'));

      await expect(orchestrator.remember('Test content')).rejects.toThrow(
        'Failed to store content in temporal graph: Failed to add event:',
      );
    });

    it('should accept context parameter (for future use)', async () => {
      vi.mocked(db.createNode).mockResolvedValue('event-uuid');

      const result = await orchestrator.remember(
        'Important note',
        'During project planning session',
      );

      expect(result.events_logged).toBe(1);
    });
  });

  describe('getGraphs', () => {
    it('should return all graph instances', () => {
      const graphs = orchestrator.getGraphs();

      expect(graphs).toHaveProperty('entity');
      expect(graphs).toHaveProperty('temporal');
      expect(graphs).toHaveProperty('causal');
      expect(graphs).toHaveProperty('semantic');
      expect(graphs).toHaveProperty('crossLinker');
    });

    it('should return the same instances as readonly properties', () => {
      const graphs = orchestrator.getGraphs();

      expect(graphs.entity).toBe(orchestrator.entityGraph);
      expect(graphs.temporal).toBe(orchestrator.temporalGraph);
      expect(graphs.causal).toBe(orchestrator.causalGraph);
      expect(graphs.semantic).toBe(orchestrator.semanticGraph);
      expect(graphs.crossLinker).toBe(orchestrator.crossLinker);
    });
  });
});
