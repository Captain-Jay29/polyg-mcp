import type { StorageStatistics } from '@polyg-mcp/shared';

export interface ValidationCheck {
  name: string;
  passed: boolean;
  actual: number;
  expected: string;
  message: string;
}

export interface ValidationResult {
  passed: boolean;
  checks: ValidationCheck[];
}

export interface ValidationThresholds {
  minEntities: number;
  maxEntities: number;
  minCausalNodes: number;
  minCrossLinks: number;
  minTemporalNodes: number;
}

const DEFAULT_THRESHOLDS: ValidationThresholds = {
  minEntities: 5,
  maxEntities: 50,
  minCausalNodes: 2,
  minCrossLinks: 1,
  minTemporalNodes: 1,
};

export function validateExtractionQuality(
  stats: StorageStatistics,
  thresholds?: Partial<ValidationThresholds>,
): ValidationResult {
  const t: ValidationThresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };

  const crossLinksTotal = stats.cross_links
    ? stats.cross_links.X_REPRESENTS +
      stats.cross_links.X_INVOLVES +
      stats.cross_links.X_REFERS_TO +
      stats.cross_links.X_AFFECTS
    : 0;

  const checks: ValidationCheck[] = [
    {
      name: 'entity_count',
      passed:
        stats.entity_nodes >= t.minEntities &&
        stats.entity_nodes <= t.maxEntities,
      actual: stats.entity_nodes,
      expected: `[${t.minEntities}, ${t.maxEntities}]`,
      message:
        stats.entity_nodes >= t.minEntities &&
        stats.entity_nodes <= t.maxEntities
          ? `Entity count ${stats.entity_nodes} is within range`
          : `Entity count ${stats.entity_nodes} is outside [${t.minEntities}, ${t.maxEntities}]`,
    },
    {
      name: 'causal_nodes',
      passed: stats.causal_nodes >= t.minCausalNodes,
      actual: stats.causal_nodes,
      expected: `>= ${t.minCausalNodes}`,
      message:
        stats.causal_nodes >= t.minCausalNodes
          ? `Causal nodes ${stats.causal_nodes} meets minimum`
          : `Causal nodes ${stats.causal_nodes} is below minimum ${t.minCausalNodes}`,
    },
    {
      name: 'cross_links',
      passed: crossLinksTotal >= t.minCrossLinks,
      actual: crossLinksTotal,
      expected: `>= ${t.minCrossLinks}`,
      message:
        crossLinksTotal >= t.minCrossLinks
          ? `Cross-links total ${crossLinksTotal} meets minimum`
          : `Cross-links total ${crossLinksTotal} is below minimum ${t.minCrossLinks}`,
    },
    {
      name: 'temporal_nodes',
      passed: stats.temporal_nodes >= t.minTemporalNodes,
      actual: stats.temporal_nodes,
      expected: `>= ${t.minTemporalNodes}`,
      message:
        stats.temporal_nodes >= t.minTemporalNodes
          ? `Temporal nodes ${stats.temporal_nodes} meets minimum`
          : `Temporal nodes ${stats.temporal_nodes} is below minimum ${t.minTemporalNodes}`,
    },
    {
      name: 'total_relationships',
      passed: stats.total_relationships > 0,
      actual: stats.total_relationships,
      expected: '> 0',
      message:
        stats.total_relationships > 0
          ? `Total relationships ${stats.total_relationships} is positive`
          : 'Total relationships is 0',
    },
  ];

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
}
