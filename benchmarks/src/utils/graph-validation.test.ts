import { describe, expect, it } from 'vitest';
import type { StorageStatistics } from '@polyg-mcp/shared';
import { validateExtractionQuality } from './graph-validation.js';

function makeStats(
  overrides?: Partial<StorageStatistics>,
): StorageStatistics {
  return {
    semantic_nodes: 10,
    temporal_nodes: 3,
    causal_nodes: 5,
    entity_nodes: 15,
    total_relationships: 20,
    cross_links: {
      X_REPRESENTS: 2,
      X_INVOLVES: 2,
      X_REFERS_TO: 1,
      X_AFFECTS: 1,
    },
    ...overrides,
  };
}

describe('validateExtractionQuality', () => {
  it('passes for healthy stats', () => {
    const result = validateExtractionQuality(makeStats());
    expect(result.passed).toBe(true);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it('fails when entity count is zero', () => {
    const result = validateExtractionQuality(
      makeStats({ entity_nodes: 0 }),
    );
    expect(result.passed).toBe(false);
    const check = result.checks.find((c) => c.name === 'entity_count');
    expect(check?.passed).toBe(false);
  });

  it('fails when entity count exceeds max', () => {
    const result = validateExtractionQuality(
      makeStats({ entity_nodes: 100 }),
    );
    expect(result.passed).toBe(false);
    const check = result.checks.find((c) => c.name === 'entity_count');
    expect(check?.passed).toBe(false);
  });

  it('fails when causal nodes are zero', () => {
    const result = validateExtractionQuality(
      makeStats({ causal_nodes: 0 }),
    );
    expect(result.passed).toBe(false);
    const check = result.checks.find((c) => c.name === 'causal_nodes');
    expect(check?.passed).toBe(false);
  });

  it('fails when cross-links are zero', () => {
    const result = validateExtractionQuality(
      makeStats({
        cross_links: {
          X_REPRESENTS: 0,
          X_INVOLVES: 0,
          X_REFERS_TO: 0,
          X_AFFECTS: 0,
        },
      }),
    );
    expect(result.passed).toBe(false);
    const check = result.checks.find((c) => c.name === 'cross_links');
    expect(check?.passed).toBe(false);
  });

  it('fails when cross_links field is undefined', () => {
    const result = validateExtractionQuality(
      makeStats({ cross_links: undefined }),
    );
    expect(result.passed).toBe(false);
    const check = result.checks.find((c) => c.name === 'cross_links');
    expect(check?.passed).toBe(false);
    expect(check?.actual).toBe(0);
  });

  it('fails when temporal nodes are zero', () => {
    const result = validateExtractionQuality(
      makeStats({ temporal_nodes: 0 }),
    );
    expect(result.passed).toBe(false);
    const check = result.checks.find((c) => c.name === 'temporal_nodes');
    expect(check?.passed).toBe(false);
  });

  it('uses custom thresholds when provided', () => {
    // With default thresholds entity_nodes=3 would fail (min is 5)
    // but with a custom min of 1 it should pass
    const result = validateExtractionQuality(
      makeStats({ entity_nodes: 3 }),
      { minEntities: 1 },
    );
    const check = result.checks.find((c) => c.name === 'entity_count');
    expect(check?.passed).toBe(true);
  });

  it('reports overall failure when a single check fails', () => {
    const result = validateExtractionQuality(
      makeStats({ total_relationships: 0 }),
    );
    expect(result.passed).toBe(false);
    const failedChecks = result.checks.filter((c) => !c.passed);
    expect(failedChecks).toHaveLength(1);
    expect(failedChecks[0].name).toBe('total_relationships');
  });
});
