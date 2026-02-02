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

function padCenter(s: string, width: number): string {
  if (s.length >= width) return s;
  const left = Math.floor((width - s.length) / 2);
  const right = width - s.length - left;
  return ' '.repeat(left) + s + ' '.repeat(right);
}

/**
 * Render the graph state dashboard
 */
export function renderDashboard(stats: GraphStats): string {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false });

  const maxNodes = Math.max(
    stats.semantic_nodes,
    stats.temporal_nodes,
    stats.causal_nodes,
    stats.entity_nodes,
    10
  );

  const xRep = stats.cross_links?.represents ?? 0;
  const xInv = stats.cross_links?.involves ?? 0;

  const gap = '  ';
  const barW = 10;

  const semBar = renderProgressBar(stats.semantic_nodes, maxNodes, barW);
  const entBar = renderProgressBar(stats.entity_nodes, maxNodes, barW);
  const tmpBar = renderProgressBar(stats.temporal_nodes, maxNodes, barW);
  const cauBar = renderProgressBar(stats.causal_nodes, maxNodes, barW);

  const semLabel = `${stats.semantic_nodes} concepts`;
  const entLabel = `${stats.entity_nodes} entities`;
  const tmpLabel = `${stats.temporal_nodes} events`;
  const cauLabel = `${stats.causal_nodes} links`;

  const repStr = `REP: ${xRep}`;
  const invStr = `INV: ${xInv}`;

  const semW = Math.max('SEMANTIC'.length, semBar.length, semLabel.length);
  const entW = Math.max('ENTITY'.length, entBar.length, entLabel.length);
  const tmpW = Math.max('TEMPORAL'.length, tmpBar.length, tmpLabel.length);
  const cauW = Math.max('CAUSAL'.length, cauBar.length, cauLabel.length);
  const xW   = Math.max('CROSS-LINKS'.length, repStr.length, invStr.length);

  const headerRow =
    padCenter('SEMANTIC', semW) + gap +
    padCenter('ENTITY', entW)   + gap +
    padCenter('TEMPORAL', tmpW) + gap +
    padCenter('CAUSAL', cauW)   + gap +
    padCenter('CROSS-LINKS', xW);

  const barRow =
    semBar.padEnd(semW) + gap +
    entBar.padEnd(entW) + gap +
    tmpBar.padEnd(tmpW) + gap +
    cauBar.padEnd(cauW) + gap +
    repStr.padEnd(xW);

  const labelRow =
    semLabel.padEnd(semW) + gap +
    entLabel.padEnd(entW) + gap +
    tmpLabel.padEnd(tmpW) + gap +
    cauLabel.padEnd(cauW) + gap +
    invStr.padEnd(xW);

  const innerWidth = Math.max(
    headerRow.length,
    barRow.length,
    labelRow.length
  );

  const wrap = (content: string) =>
    `  ║ ${content.padEnd(innerWidth)} ║`;

  const topBorder    = `  ╔${'═'.repeat(innerWidth + 2)}╗`;
  const bottomBorder = `  ╚${'═'.repeat(innerWidth + 2)}╝`;
  const totalWidth   = topBorder.length;

  const leftTitle  = '  GRAPH STATE';
  const rightTitle = `Updated: ${timeStr}`;
  const titleSpaces = Math.max(
    1,
    totalWidth - leftTitle.length - rightTitle.length
  );

  const titleLine =
    leftTitle + ' '.repeat(titleSpaces) + rightTitle;

  return [
    '',
    titleLine,
    topBorder,
    wrap(headerRow),
    wrap(barRow),
    wrap(labelRow),
    bottomBorder,
    '',
  ].join('\n');
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
