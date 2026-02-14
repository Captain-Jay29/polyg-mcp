import type { EmbeddingProvider } from '@polyg-mcp/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FalkorDBAdapter } from '../storage/falkordb.js';
import { EMBED_TEXT_LIMIT, runFastPath } from './fast-path.js';
import type { IngestionDeps, ParsedChunk } from './types.js';

function createMockDb(): FalkorDBAdapter {
  let nodeCounter = 0;
  return {
    query: vi.fn().mockResolvedValue({ records: [], metadata: [] }),
    createNode: vi.fn().mockImplementation(() => {
      nodeCounter++;
      return Promise.resolve(`uuid-${nodeCounter}`);
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as FalkorDBAdapter;
}

function createMockEmbeddings(): EmbeddingProvider {
  return {
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedBatch: vi
      .fn()
      .mockImplementation((texts: string[]) =>
        Promise.resolve(texts.map((_, i) => [0.1 * (i + 1), 0.2 * (i + 1)])),
      ),
  };
}

function makeChunks(count: number): ParsedChunk[] {
  return Array.from({ length: count }, (_, i) => ({
    chunk_id: `chunk_${i.toString().padStart(3, '0')}`,
    content: `Message content ${i}`,
    position: i,
    metadata: {
      source_format: 'conversation' as const,
      speaker: i % 2 === 0 ? 'Alice' : 'Bob',
      turn_index: i,
      ...(i === 0 ? { timestamp: '2024-01-15T10:00:00Z' } : {}),
    },
  }));
}

describe('runFastPath', () => {
  let db: FalkorDBAdapter;
  let embeddings: EmbeddingProvider;
  let deps: IngestionDeps;

  beforeEach(() => {
    db = createMockDb();
    embeddings = createMockEmbeddings();
    deps = {
      db,
      embeddings,
      llm: { complete: vi.fn() },
    } as unknown as IngestionDeps;
    vi.clearAllMocks();
  });

  it('should call embedBatch once with all chunk texts', async () => {
    const chunks = makeChunks(5);
    // Re-create db to reset counter
    db = createMockDb();
    deps.db = db;

    await runFastPath(chunks, deps);

    expect(embeddings.embedBatch).toHaveBeenCalledTimes(1);
    expect(embeddings.embedBatch).toHaveBeenCalledWith(
      chunks.map((c) => c.content.slice(0, EMBED_TEXT_LIMIT)),
    );
  });

  it('should create T_Event and S_Concept for each chunk', async () => {
    const chunks = makeChunks(3);
    db = createMockDb();
    deps.db = db;

    const result = await runFastPath(chunks, deps);

    // Each chunk creates 2 nodes: 1 T_Event + 1 S_Concept = 6 total
    expect(db.createNode).toHaveBeenCalledTimes(6);
    expect(result.eventIds).toHaveLength(3);
    expect(result.conceptIds).toHaveLength(3);
  });

  it('should create FOLLOWS edges for temporal backbone', async () => {
    const chunks = makeChunks(3);
    db = createMockDb();
    deps.db = db;

    await runFastPath(chunks, deps);

    // 3 chunks → 2 FOLLOWS edges (between consecutive events)
    // Plus: 3 getConceptByName queries (dedup checks) + 2 FOLLOWS MERGE queries
    const queryCalls = vi.mocked(db.query).mock.calls;
    const followsQueries = queryCalls.filter(
      ([cypher]) => typeof cypher === 'string' && cypher.includes('FOLLOWS'),
    );
    expect(followsQueries).toHaveLength(2);
  });

  it('should return timing information', async () => {
    const chunks = makeChunks(2);
    db = createMockDb();
    deps.db = db;

    const result = await runFastPath(chunks, deps);

    expect(result.embeddingTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.writeTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should handle empty chunk list', async () => {
    const result = await runFastPath([], deps);

    expect(result.eventIds).toHaveLength(0);
    expect(result.conceptIds).toHaveLength(0);
    expect(embeddings.embedBatch).toHaveBeenCalledWith([]);
  });

  it('should use chunk timestamp for event occurred_at when available', async () => {
    const chunks = makeChunks(1);
    chunks[0].metadata.timestamp = '2024-06-15T14:30:00Z';
    db = createMockDb();
    deps.db = db;

    await runFastPath(chunks, deps);

    // First createNode call should be for T_Event with the timestamp
    const createCalls = vi.mocked(db.createNode).mock.calls;
    const eventCall = createCalls.find(([label]) => label === 'T_Event');
    if (!eventCall) throw new Error('eventCall not found');
    expect(eventCall[1].occurred_at).toBe('2024-06-15T14:30:00.000Z');
  });

  it('should use synthetic timestamps for chunks without real ones', async () => {
    // chunk 0 has a timestamp, chunks 1-2 do not
    const chunks: ParsedChunk[] = [
      {
        chunk_id: 'chunk_000',
        content: 'First message',
        position: 0,
        metadata: {
          source_format: 'conversation',
          timestamp: '2024-01-15T10:00:00Z',
        },
      },
      {
        chunk_id: 'chunk_001',
        content: 'Second message',
        position: 1,
        metadata: { source_format: 'conversation' },
      },
      {
        chunk_id: 'chunk_002',
        content: 'Third message',
        position: 2,
        metadata: { source_format: 'conversation' },
      },
    ];
    db = createMockDb();
    deps.db = db;

    await runFastPath(chunks, deps);

    const createCalls = vi.mocked(db.createNode).mock.calls;
    const eventCalls = createCalls.filter(([label]) => label === 'T_Event');
    expect(eventCalls).toHaveLength(3);

    // chunk 0: real timestamp
    expect(eventCalls[0][1].occurred_at).toBe('2024-01-15T10:00:00.000Z');
    // chunk 1: base + 1 * 60_000ms = 1 minute after base
    const base = new Date('2024-01-15T10:00:00Z').getTime();
    expect(eventCalls[1][1].occurred_at).toBe(
      new Date(base + 1 * 60_000).toISOString(),
    );
    // chunk 2: base + 2 * 60_000ms = 2 minutes after base
    expect(eventCalls[2][1].occurred_at).toBe(
      new Date(base + 2 * 60_000).toISOString(),
    );
  });

  it('should offset base time when first timestamp is mid-array', async () => {
    // chunk 0-1 have no timestamp, chunk 2 has one
    const chunks: ParsedChunk[] = [
      {
        chunk_id: 'chunk_000',
        content: 'First',
        position: 0,
        metadata: { source_format: 'conversation' },
      },
      {
        chunk_id: 'chunk_001',
        content: 'Second',
        position: 1,
        metadata: { source_format: 'conversation' },
      },
      {
        chunk_id: 'chunk_002',
        content: 'Third',
        position: 2,
        metadata: {
          source_format: 'conversation',
          timestamp: '2024-01-15T10:02:00Z',
        },
      },
    ];
    db = createMockDb();
    deps.db = db;

    await runFastPath(chunks, deps);

    const createCalls = vi.mocked(db.createNode).mock.calls;
    const eventCalls = createCalls.filter(([label]) => label === 'T_Event');

    // base = chunk2 timestamp - 2*60s = 10:00:00
    const base = new Date('2024-01-15T10:02:00Z').getTime() - 2 * 60_000;
    // chunk 0: base + 0 = 10:00:00 (before chunk 2)
    expect(eventCalls[0][1].occurred_at).toBe(new Date(base).toISOString());
    // chunk 1: base + 60s = 10:01:00 (before chunk 2)
    expect(eventCalls[1][1].occurred_at).toBe(
      new Date(base + 60_000).toISOString(),
    );
    // chunk 2: real timestamp
    expect(eventCalls[2][1].occurred_at).toBe('2024-01-15T10:02:00.000Z');
  });

  it('should truncate content for concept name and description', async () => {
    const longContent = 'A'.repeat(600);
    const chunks: ParsedChunk[] = [
      {
        chunk_id: 'chunk_000',
        content: longContent,
        position: 0,
        metadata: { source_format: 'conversation' },
      },
    ];
    db = createMockDb();
    deps.db = db;

    await runFastPath(chunks, deps);

    // S_Concept createNode: name should be truncated to 100 chars
    const createCalls = vi.mocked(db.createNode).mock.calls;
    const conceptCall = createCalls.find(([label]) => label === 'S_Concept');
    if (!conceptCall) throw new Error('conceptCall not found');
    expect((conceptCall[1].name as string).length).toBe(100);
    expect((conceptCall[1].description as string).length).toBe(500);
  });
});
