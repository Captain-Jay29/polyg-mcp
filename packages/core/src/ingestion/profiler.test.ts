import type { LLMProvider } from '@polyg-mcp/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearProfileCache,
  getProfileCacheSize,
  profileDocument,
} from './profiler.js';
import type { DocumentProfile, ParsedChunk } from './types.js';

function makeChunks(
  count: number,
  contentPrefix = 'Sample content for chunk',
  format: 'text' | 'structured' = 'text',
): ParsedChunk[] {
  return Array.from({ length: count }, (_, i) => ({
    chunk_id: `chunk_${i.toString().padStart(3, '0')}`,
    content: `${contentPrefix} ${i}. This has some interesting data.`,
    position: i,
    metadata: { source_format: format },
  }));
}

const validProfile: DocumentProfile = {
  document_type: 'technical_doc',
  domain: 'engineering',
  entity_types_expected: ['component', 'service', 'developer'],
  relationship_types_expected: ['depends_on', 'maintains', 'calls'],
  causal_patterns: ['failure → outage', 'deployment → incident'],
  temporal_structure: 'explicit_timestamps',
  extraction_focus: 'Focus on system components, dependencies, and incidents.',
  confidence_calibration: {
    explicit_causation: 1.0,
    strong_implication: 0.85,
    weak_inference: 0.6,
  },
};

function makeMockLlm(response: string): LLMProvider {
  return {
    complete: vi.fn().mockResolvedValue(response),
  } as unknown as LLMProvider;
}

describe('profileDocument', () => {
  beforeEach(() => {
    clearProfileCache();
  });

  // --- Basic profiling ---

  it('should parse LLM response into a DocumentProfile', async () => {
    const llm = makeMockLlm(JSON.stringify(validProfile));
    const { profile, cached } = await profileDocument(makeChunks(5), llm);

    expect(cached).toBe(false);
    expect(profile.document_type).toBe('technical_doc');
    expect(profile.domain).toBe('engineering');
    expect(profile.entity_types_expected).toContain('component');
    expect(profile.temporal_structure).toBe('explicit_timestamps');
  });

  it('should call LLM with prompt containing chunk content', async () => {
    const llm = makeMockLlm(JSON.stringify(validProfile));
    await profileDocument(makeChunks(3), llm);

    const complete = llm.complete as ReturnType<typeof vi.fn>;
    expect(complete).toHaveBeenCalledOnce();
    const callArg = complete.mock.calls[0][0];
    expect(callArg.responseFormat).toBe('json');
    expect(callArg.prompt).toContain('Sample content for chunk 0');
    expect(callArg.prompt).toContain('document analyst');
  });

  it('should include first 5 chunks in prompt even with more chunks', async () => {
    const llm = makeMockLlm(JSON.stringify(validProfile));
    await profileDocument(makeChunks(10), llm);

    const complete = llm.complete as ReturnType<typeof vi.fn>;
    const prompt = complete.mock.calls[0][0].prompt;
    expect(prompt).toContain('Chunk 1:');
    expect(prompt).toContain('Chunk 5:');
    expect(prompt).not.toContain('Chunk 6:');
  });

  // --- Fallback behavior ---

  it('should fall back to default profile on LLM failure', async () => {
    const llm = {
      complete: vi.fn().mockRejectedValue(new Error('API error')),
    } as unknown as LLMProvider;

    const { profile, cached } = await profileDocument(makeChunks(3), llm);

    expect(cached).toBe(false);
    expect(profile.document_type).toBe('generic');
    expect(profile.domain).toBe('general');
  });

  it('should fall back on invalid JSON from LLM', async () => {
    const llm = makeMockLlm('not valid json');
    const { profile } = await profileDocument(makeChunks(3), llm);
    expect(profile.document_type).toBe('generic');
  });

  it('should fall back on schema validation failure', async () => {
    const llm = makeMockLlm(JSON.stringify({ document_type: 'test' }));
    const { profile } = await profileDocument(makeChunks(3), llm);
    expect(profile.document_type).toBe('generic');
  });

  // --- Cache hit / miss ---

  it('should return cached profile on second call with same content', async () => {
    const llm = makeMockLlm(JSON.stringify(validProfile));
    const chunks = makeChunks(5);

    const first = await profileDocument(chunks, llm);
    const second = await profileDocument(chunks, llm);

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.profile.document_type).toBe('technical_doc');

    // LLM should only be called once
    const complete = llm.complete as ReturnType<typeof vi.fn>;
    expect(complete).toHaveBeenCalledOnce();
  });

  it('should call LLM for different content (cache miss)', async () => {
    const llm = makeMockLlm(JSON.stringify(validProfile));

    const chunksA = makeChunks(3, 'Document A content');
    const chunksB = makeChunks(3, 'Document B content');

    const first = await profileDocument(chunksA, llm);
    const second = await profileDocument(chunksB, llm);

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(false);

    const complete = llm.complete as ReturnType<typeof vi.fn>;
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('should not cache fallback profiles (allows retry on transient errors)', async () => {
    const llm = {
      complete: vi
        .fn()
        .mockRejectedValueOnce(new Error('transient error'))
        .mockResolvedValueOnce(JSON.stringify(validProfile)),
    } as unknown as LLMProvider;

    const chunks = makeChunks(3);

    // First call: LLM fails → fallback, NOT cached
    const first = await profileDocument(chunks, llm);
    expect(first.cached).toBe(false);
    expect(first.profile.document_type).toBe('generic');

    // Second call: same content, LLM succeeds → should call LLM again (not cached)
    const second = await profileDocument(chunks, llm);
    expect(second.cached).toBe(false);
    expect(second.profile.document_type).toBe('technical_doc');

    const complete = llm.complete as ReturnType<typeof vi.fn>;
    expect(complete).toHaveBeenCalledTimes(2);
  });

  // --- Cache management ---

  it('should evict oldest entry when cache exceeds max size', async () => {
    const llm = makeMockLlm(JSON.stringify(validProfile));

    // Fill cache with 100 unique entries
    for (let i = 0; i < 100; i++) {
      const chunks = makeChunks(1, `Unique document content ${i}`);
      await profileDocument(chunks, llm);
    }
    expect(getProfileCacheSize()).toBe(100);

    // Add one more — should evict the first
    const chunks101 = makeChunks(1, 'Unique document content 100');
    await profileDocument(chunks101, llm);
    expect(getProfileCacheSize()).toBe(100);

    // First entry should be evicted — calling it again should miss
    const llm2 = makeMockLlm(JSON.stringify(validProfile));
    const firstChunks = makeChunks(1, 'Unique document content 0');
    const result = await profileDocument(firstChunks, llm2);
    expect(result.cached).toBe(false);

    const complete = llm2.complete as ReturnType<typeof vi.fn>;
    expect(complete).toHaveBeenCalledOnce();
  });

  it('should clear cache with clearProfileCache()', async () => {
    const llm = makeMockLlm(JSON.stringify(validProfile));
    const chunks = makeChunks(3);

    await profileDocument(chunks, llm);
    expect(getProfileCacheSize()).toBe(1);

    clearProfileCache();
    expect(getProfileCacheSize()).toBe(0);

    // Same content should now miss
    const result = await profileDocument(chunks, llm);
    expect(result.cached).toBe(false);

    const complete = llm.complete as ReturnType<typeof vi.fn>;
    expect(complete).toHaveBeenCalledTimes(2);
  });
});
