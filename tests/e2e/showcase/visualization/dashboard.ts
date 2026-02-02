// Graph State Dashboard - ASCII visualization of graph statistics

export interface GraphStats {
  semantic_nodes: number;
  temporal_nodes: number;
  causal_nodes: number;
  entity_nodes: number;
  total_relationships: number;
  cross_links?: {
    represents: number;
    involves: number;
  };
}

/**
 * Render a progress bar using filled/empty circles
 */
function renderProgressBar(value: number, max: number, width = 10): string {
  const filled = Math.min(Math.round((value / max) * width), width);
  const empty = width - filled;
  return '●'.repeat(filled) + '○'.repeat(empty);
}

/**
 * Format a number with padding for alignment
 */
function padNumber(n: number, width = 3): string {
  return String(n).padStart(width);
}

/**
 * Render the graph state dashboard
 */
export function renderDashboard(stats: GraphStats): string {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false });

  // Calculate max for scaling (minimum 10 to avoid division by zero)
  const maxNodes = Math.max(
    stats.semantic_nodes,
    stats.temporal_nodes,
    stats.causal_nodes,
    stats.entity_nodes,
    10,
  );

  const xRep = stats.cross_links?.represents ?? 0;
  const xInv = stats.cross_links?.involves ?? 0;

  const lines = [
    '',
    `  GRAPH STATE                                        Updated: ${timeStr}`,
    '  ╔═════════════════════════════════════════════════════════════════╗',
    '  ║  SEMANTIC     ENTITY       TEMPORAL     CAUSAL      CROSS-LINKS ║',
    `  ║  ${renderProgressBar(stats.semantic_nodes, maxNodes)}   ${renderProgressBar(stats.entity_nodes, maxNodes)}   ${renderProgressBar(stats.temporal_nodes, maxNodes)}   ${renderProgressBar(stats.causal_nodes, maxNodes)}   X_REP: ${padNumber(xRep, 3)}   ║`,
    `  ║  ${padNumber(stats.semantic_nodes)} concepts  ${padNumber(stats.entity_nodes)} entities   ${padNumber(stats.temporal_nodes)} events    ${padNumber(stats.causal_nodes)} links     X_INV: ${padNumber(xInv, 3)}   ║`,
    '  ╚═════════════════════════════════════════════════════════════════╝',
    '',
  ];

  return lines.join('\n');
}

/**
 * Render a compact single-line dashboard
 */
export function renderCompactDashboard(stats: GraphStats): string {
  const xRep = stats.cross_links?.represents ?? 0;
  const xInv = stats.cross_links?.involves ?? 0;

  return `  [Semantic: ${stats.semantic_nodes} | Entity: ${stats.entity_nodes} | Temporal: ${stats.temporal_nodes} | Causal: ${stats.causal_nodes} | X-Links: ${xRep + xInv}]`;
}

/**
 * Render a delta view showing what changed
 */
export function renderDashboardDelta(
  before: GraphStats,
  after: GraphStats,
): string {
  const delta = (a: number, b: number): string => {
    const diff = b - a;
    if (diff === 0) return '  ';
    return diff > 0 ? `+${diff}` : `${diff}`;
  };

  const semDelta = delta(before.semantic_nodes, after.semantic_nodes);
  const entDelta = delta(before.entity_nodes, after.entity_nodes);
  const tmpDelta = delta(before.temporal_nodes, after.temporal_nodes);
  const cauDelta = delta(before.causal_nodes, after.causal_nodes);

  if (
    semDelta === '  ' &&
    entDelta === '  ' &&
    tmpDelta === '  ' &&
    cauDelta === '  '
  ) {
    return '';
  }

  return `  [Changes: Semantic ${semDelta} | Entity ${entDelta} | Temporal ${tmpDelta} | Causal ${cauDelta}]`;
}
