import type { LLMProvider } from '@polyg-mcp/shared';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentProfile, ParsedChunk } from './types.js';
import { profileDocument } from './profiler.js';

function makeChunks(count: number, format: 'text' | 'structured' = 'text'): ParsedChunk[] {
  return Array.from({ length: count }, (_, i) => ({
    chunk_id: `chunk_${i.toString().padStart(3, '0')}`,
    content: `Sample content for chunk ${i}. This has some interesting data.`,
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
  it('should parse LLM response into a DocumentProfile', async () => {
    const llm = makeMockLlm(JSON.stringify(validProfile));
    const result = await profileDocument(makeChunks(5), llm);

    expect(result.document_type).toBe('technical_doc');
    expect(result.domain).toBe('engineering');
    expect(result.entity_types_expected).toContain('component');
    expect(result.temporal_structure).toBe('explicit_timestamps');
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

  it('should fall back to default profile on LLM failure', async () => {
    const llm = {
      complete: vi.fn().mockRejectedValue(new Error('API error')),
    } as unknown as LLMProvider;

    const result = await profileDocument(makeChunks(3), llm);

    // Falls back to GENERIC_PROFILE for 'text' format
    expect(result.document_type).toBe('generic');
    expect(result.domain).toBe('general');
  });

  it('should fall back on invalid JSON from LLM', async () => {
    const llm = makeMockLlm('not valid json');
    const result = await profileDocument(makeChunks(3), llm);
    expect(result.document_type).toBe('generic');
  });

  it('should fall back on schema validation failure', async () => {
    const llm = makeMockLlm(JSON.stringify({ document_type: 'test' })); // missing fields
    const result = await profileDocument(makeChunks(3), llm);
    expect(result.document_type).toBe('generic');
  });

  it('should cache successful profiles by document_type', async () => {
    const llm = makeMockLlm(JSON.stringify(validProfile));
    const cache = new Map<string, DocumentProfile>();

    await profileDocument(makeChunks(3), llm, { cache });

    expect(cache.has('technical_doc')).toBe(true);
    expect(cache.get('technical_doc')!.domain).toBe('engineering');
  });

  it('should use cached profile on LLM failure', async () => {
    const cache = new Map<string, DocumentProfile>();
    cache.set('cached_type', validProfile);

    const llm = {
      complete: vi.fn().mockRejectedValue(new Error('fail')),
    } as unknown as LLMProvider;

    const result = await profileDocument(makeChunks(3), llm, { cache });
    // Should return the cached profile rather than generic default
    expect(result.document_type).toBe('technical_doc');
  });

  it('should not call LLM more than once per invocation', async () => {
    const llm = makeMockLlm(JSON.stringify(validProfile));
    await profileDocument(makeChunks(10), llm);

    const complete = llm.complete as ReturnType<typeof vi.fn>;
    expect(complete).toHaveBeenCalledOnce();
  });

  it('should include first 5 chunks in prompt even with more chunks', async () => {
    const llm = makeMockLlm(JSON.stringify(validProfile));
    await profileDocument(makeChunks(10), llm);

    const complete = llm.complete as ReturnType<typeof vi.fn>;
    const prompt = complete.mock.calls[0][0].prompt;
    expect(prompt).toContain('Chunk 1:');
    expect(prompt).toContain('Chunk 5:');
    // Should NOT include chunk 6+
    expect(prompt).not.toContain('Chunk 6:');
  });
});
