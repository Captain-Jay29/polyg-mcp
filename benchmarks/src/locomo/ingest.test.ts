import type { MAGMAGraphRegistry } from '@polyg-mcp/core';
import type { LLMProvider, StorageStatistics } from '@polyg-mcp/shared';
import { describe, expect, it, type Mock, vi } from 'vitest';
import { ingestConversation } from './ingest.js';
import type { LoCoMoConversation } from './types.js';

function makeConversation(): LoCoMoConversation {
  return {
    conversation_id: 'test_conv_0',
    sessions: [
      {
        date_time: '2023-05-08T13:56:00Z',
        speaker_a: 'Alice',
        speaker_b: 'Bob',
        turns: [
          {
            speaker: 'Alice',
            dia_id: 'd1',
            text: 'I started a new job at Acme.',
          },
          { speaker: 'Bob', dia_id: 'd2', text: 'That caused you to move!' },
        ],
      },
    ],
    questions: [],
  };
}

const VALID_EXTRACTION = JSON.stringify({
  entities: [
    { name: 'Alice', entity_type: 'person' },
    { name: 'Acme', entity_type: 'organization' },
  ],
  events: [
    {
      description: 'Alice started a new job',
      occurred_at: '2023-05-08T00:00:00Z',
      entities: ['Alice', 'Acme'],
    },
  ],
  facts: [
    {
      subject: 'Alice',
      predicate: 'works_at',
      object: 'Acme',
      valid_from: '2023-05-08T00:00:00Z',
      subject_entity: 'Alice',
    },
  ],
  causal_links: [
    {
      cause: 'Alice got new job',
      effect: 'Alice moved to new city',
      confidence: 0.9,
      entities: ['Alice'],
    },
  ],
  concepts: [
    { name: 'career', description: 'Professional life', entities: ['Alice'] },
  ],
});

function makeHealthyStats(): StorageStatistics {
  return {
    semantic_nodes: 5,
    temporal_nodes: 3,
    causal_nodes: 4,
    entity_nodes: 10,
    total_relationships: 15,
    cross_links: {
      X_REPRESENTS: 3,
      X_INVOLVES: 4,
      X_REFERS_TO: 2,
      X_AFFECTS: 3,
    },
  };
}

function makeMockLLM(response: string): LLMProvider {
  return { complete: vi.fn().mockResolvedValue(response) };
}

function makeMockGraphs(): MAGMAGraphRegistry {
  const entityUuids = new Map<string, string>();
  let entityCounter = 0;

  return {
    entity: {
      addEntity: vi.fn().mockImplementation((name: string) => {
        const uuid = `entity-${entityCounter++}`;
        entityUuids.set(name, uuid);
        return Promise.resolve({
          uuid,
          name,
          entity_type: 'person',
          properties: {},
          created_at: new Date(),
        });
      }),
      getEntity: vi.fn().mockImplementation((nameOrId: string) => {
        const uuid = entityUuids.get(nameOrId);
        if (uuid)
          return Promise.resolve({
            uuid,
            name: nameOrId,
            entity_type: 'person',
            properties: {},
            created_at: new Date(),
          });
        return Promise.resolve(null);
      }),
    },
    temporal: {
      addEvent: vi.fn().mockResolvedValue({
        uuid: 'event-0',
        description: 'test',
        occurred_at: new Date(),
      }),
      addFact: vi.fn().mockResolvedValue({
        uuid: 'fact-0',
        subject: 's',
        predicate: 'p',
        object: 'o',
        valid_from: new Date(),
      }),
      linkEventToEntity: vi.fn().mockResolvedValue(undefined),
      linkFactToEntity: vi.fn().mockResolvedValue(undefined),
    },
    causal: {
      findOrCreate: vi.fn().mockImplementation((desc: string) =>
        Promise.resolve({
          uuid: `causal-${desc}`,
          description: desc,
          node_type: 'cause',
        }),
      ),
      addLink: vi
        .fn()
        .mockResolvedValue({ cause: 'a', effect: 'b', confidence: 0.9 }),
      linkToEntity: vi.fn().mockResolvedValue(undefined),
    },
    semantic: {
      addConcept: vi
        .fn()
        .mockResolvedValue({ uuid: 'concept-0', name: 'career' }),
      linkToEntity: vi.fn().mockResolvedValue(undefined),
    },
    crossLinker: {},
  } as unknown as MAGMAGraphRegistry;
}

describe('ingestConversation', () => {
  it('calls LLM and writes extracted data to graphs', async () => {
    const llm = makeMockLLM(VALID_EXTRACTION);
    const graphs = makeMockGraphs();
    const getStats = vi.fn().mockResolvedValue(makeHealthyStats());

    const result = await ingestConversation(
      makeConversation(),
      graphs,
      llm,
      getStats,
    );

    expect(result.conversationId).toBe('test_conv_0');
    expect(result.entities).toBe(2);
    expect(result.events).toBe(1);
    expect(result.facts).toBe(1);
    expect(result.causalLinks).toBe(1);
    expect(result.concepts).toBe(1);
  });

  it('makes correct number of graph write calls', async () => {
    const llm = makeMockLLM(VALID_EXTRACTION);
    const graphs = makeMockGraphs();
    const getStats = vi.fn().mockResolvedValue(makeHealthyStats());

    await ingestConversation(makeConversation(), graphs, llm, getStats);

    expect(graphs.entity.addEntity).toHaveBeenCalledTimes(2);
    expect(graphs.temporal.addEvent).toHaveBeenCalledTimes(1);
    expect(graphs.temporal.addFact).toHaveBeenCalledTimes(1);
    expect(graphs.causal.findOrCreate).toHaveBeenCalledTimes(2); // cause + effect
    expect(graphs.causal.addLink).toHaveBeenCalledTimes(1);
    expect(graphs.semantic.addConcept).toHaveBeenCalledTimes(1);
  });

  it('creates cross-links for events to entities', async () => {
    const llm = makeMockLLM(VALID_EXTRACTION);
    const graphs = makeMockGraphs();
    const getStats = vi.fn().mockResolvedValue(makeHealthyStats());

    await ingestConversation(makeConversation(), graphs, llm, getStats);

    // Event references Alice and Acme → 2 linkEventToEntity calls
    expect(graphs.temporal.linkEventToEntity).toHaveBeenCalledTimes(2);
  });

  it('runs extraction quality gate and returns validation', async () => {
    const llm = makeMockLLM(VALID_EXTRACTION);
    const graphs = makeMockGraphs();
    const getStats = vi.fn().mockResolvedValue(makeHealthyStats());

    const result = await ingestConversation(
      makeConversation(),
      graphs,
      llm,
      getStats,
    );

    expect(getStats).toHaveBeenCalledTimes(1);
    expect(result.validation.passed).toBe(true);
  });

  it('throws on invalid JSON from LLM', async () => {
    const llm = makeMockLLM('not valid json {{{');
    const graphs = makeMockGraphs();
    const getStats = vi.fn().mockResolvedValue(makeHealthyStats());

    await expect(
      ingestConversation(makeConversation(), graphs, llm, getStats),
    ).rejects.toThrow('invalid JSON');
  });

  it('throws on schema validation failure', async () => {
    const badExtraction = JSON.stringify({
      entities: [{ name: 'Alice' }], // missing entity_type
      events: [],
      facts: [],
      causal_links: [],
      concepts: [],
    });
    const llm = makeMockLLM(badExtraction);
    const graphs = makeMockGraphs();
    const getStats = vi.fn().mockResolvedValue(makeHealthyStats());

    await expect(
      ingestConversation(makeConversation(), graphs, llm, getStats),
    ).rejects.toThrow('schema validation failed');
  });

  it('handles empty extraction without crashing', async () => {
    const emptyExtraction = JSON.stringify({
      entities: [],
      events: [],
      facts: [],
      causal_links: [],
      concepts: [],
    });
    const llm = makeMockLLM(emptyExtraction);
    const graphs = makeMockGraphs();
    const emptyStats: StorageStatistics = {
      semantic_nodes: 0,
      temporal_nodes: 0,
      causal_nodes: 0,
      entity_nodes: 0,
      total_relationships: 0,
    };
    const getStats = vi.fn().mockResolvedValue(emptyStats);

    const result = await ingestConversation(
      makeConversation(),
      graphs,
      llm,
      getStats,
    );

    expect(result.entities).toBe(0);
    expect(result.validation.passed).toBe(false);
  });

  it('skips graph writes when validateOnly is true', async () => {
    const llm = makeMockLLM(VALID_EXTRACTION);
    const graphs = makeMockGraphs();
    const getStats = vi.fn().mockResolvedValue(makeHealthyStats());

    const result = await ingestConversation(
      makeConversation(),
      graphs,
      llm,
      getStats,
      { validateOnly: true },
    );

    expect(result.entities).toBe(2);
    expect(graphs.entity.addEntity).not.toHaveBeenCalled();
    expect(graphs.temporal.addEvent).not.toHaveBeenCalled();
    expect(graphs.causal.addLink).not.toHaveBeenCalled();
    expect(graphs.semantic.addConcept).not.toHaveBeenCalled();
  });

  it('passes conversation text in LLM prompt', async () => {
    const llm = makeMockLLM(VALID_EXTRACTION);
    const graphs = makeMockGraphs();
    const getStats = vi.fn().mockResolvedValue(makeHealthyStats());

    await ingestConversation(makeConversation(), graphs, llm, getStats);

    const call = (llm.complete as Mock).mock.calls[0][0];
    expect(call.prompt).toContain('I started a new job at Acme');
    expect(call.responseFormat).toBe('json');
  });
});
