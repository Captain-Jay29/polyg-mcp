// Summary Graph - Final session findings visualization

import type { SessionFindings } from './step-output.js';

/**
 * Truncate text for display
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
}

/**
 * Format entity type badge
 */
function typeBadge(type: string | undefined): string {
  if (!type) return '[UNK]';
  const badges: Record<string, string> = {
    service: '[SVC]',
    person: '[USR]',
    infrastructure: '[INF]',
    environment_variable: '[ENV]',
    config: '[CFG]',
    event: '[EVT]',
  };
  return badges[type.toLowerCase()] ?? `[${type.slice(0, 3).toUpperCase()}]`;
}

/**
 * Render the session findings summary
 */
export function renderSessionSummary(
  findings: SessionFindings,
  sessionDurationSec: number,
): string {
  const lines: string[] = [];
  const width = 67;

  lines.push('');
  lines.push('═'.repeat(width));
  lines.push('  SESSION FINDINGS SUMMARY');
  lines.push('═'.repeat(width));
  lines.push('');

  // Entities and Relationships side by side
  if (findings.entities.length > 0) {
    const leftCol: string[] = [];
    const rightCol: string[] = [];

    leftCol.push('ENTITIES DISCOVERED');
    leftCol.push('─'.repeat(23));

    rightCol.push('RELATIONSHIPS FOUND');
    rightCol.push('─'.repeat(25));

    // Entities
    for (const entity of findings.entities.slice(0, 6)) {
      const badge = typeBadge(entity.type);
      leftCol.push(`${badge} ${truncate(entity.name, 16)}`);
    }
    if (findings.entities.length > 6) {
      leftCol.push(`... +${findings.entities.length - 6} more`);
    }

    // Relationships
    const allRels: Array<{ from: string; to: string; type: string }> = [];
    for (const entity of findings.entities) {
      for (const rel of entity.relationships) {
        allRels.push({ from: entity.name, to: rel.target, type: rel.type });
      }
    }

    for (const rel of allRels.slice(0, 6)) {
      rightCol.push(
        `${truncate(rel.from, 12)} ─${truncate(rel.type, 8)}─ ${truncate(rel.to, 12)}`,
      );
    }
    if (allRels.length > 6) {
      rightCol.push(`... +${allRels.length - 6} more`);
    }

    // Pad columns to equal length
    const maxLen = Math.max(leftCol.length, rightCol.length);
    while (leftCol.length < maxLen) leftCol.push('');
    while (rightCol.length < maxLen) rightCol.push('');

    // Render side by side
    for (let i = 0; i < maxLen; i++) {
      const left = leftCol[i].padEnd(28);
      const right = rightCol[i];
      lines.push(`  ${left}  ${right}`);
    }
    lines.push('');
  }

  // Causal Chain
  if (findings.causalLinks.length > 0) {
    lines.push('  CAUSAL CHAIN (Root Cause Analysis)');
    lines.push(`  ${'─'.repeat(width - 2)}`);

    // Find root cause (cause that is not an effect)
    const allCauses = new Set(findings.causalLinks.map((l) => l.cause));
    const allEffects = new Set(findings.causalLinks.map((l) => l.effect));
    const roots = [...allCauses].filter((c) => !allEffects.has(c));
    const root = roots[0] ?? findings.causalLinks[0]?.cause ?? 'unknown';

    // Build chain from root
    const visited = new Set<string>();
    const chainLines: string[] = [];

    const buildChain = (node: string): void => {
      if (visited.has(node)) return;
      visited.add(node);

      chainLines.push(`  ${truncate(node, 50)}`);

      const children = findings.causalLinks.filter((l) => l.cause === node);
      if (children.length > 0) {
        const child = children[0];
        chainLines.push(`       ↓ ${(child.confidence * 100).toFixed(0)}%`);
        buildChain(child.effect);
      }
    };

    buildChain(root);

    for (const line of chainLines.slice(0, 14)) {
      lines.push(line);
    }
    if (chainLines.length > 14) {
      lines.push(
        `  ... chain continues (${findings.causalLinks.length} total links)`,
      );
    }
    lines.push('');
  }

  // Timeline
  if (findings.events.length > 0) {
    lines.push('  TIMELINE (Key Events)');
    lines.push(`  ${'─'.repeat(width - 2)}`);

    const sorted = [...findings.events].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
    );

    for (const evt of sorted.slice(0, 8)) {
      const time =
        new Date(evt.time).toISOString().split('T')[1]?.slice(0, 5) ?? '??:??';
      let icon = '●';
      if (evt.type === 'incident') icon = '▲';
      else if (evt.type === 'resolution') icon = '✓';

      lines.push(`  ${time}  ${icon} ${truncate(evt.description, 50)}`);
    }
    if (findings.events.length > 8) {
      lines.push(`  ... +${findings.events.length - 8} more events`);
    }
    lines.push('');
  }

  // Concepts (if any found)
  if (findings.concepts.length > 0) {
    lines.push('  CONCEPTS DISCOVERED');
    lines.push(`  ${'─'.repeat(width - 2)}`);

    for (const concept of findings.concepts.slice(0, 5)) {
      const desc = concept.description
        ? ` - ${truncate(concept.description, 40)}`
        : '';
      lines.push(`  ● ${truncate(concept.name, 20)}${desc}`);
    }
    if (findings.concepts.length > 5) {
      lines.push(`  ... +${findings.concepts.length - 5} more`);
    }
    lines.push('');
  }

  // Session stats
  const durationMin = Math.floor(sessionDurationSec / 60);
  const durationSec = sessionDurationSec % 60;
  const durationStr =
    durationMin > 0 ? `${durationMin}m ${durationSec}s` : `${durationSec}s`;

  lines.push(
    `  SESSION STATS: ${findings.queriesAnswered} queries | ${findings.toolsUsed.length} tool calls | ${findings.entities.length} entities | ${findings.causalLinks.length} causal links | ${durationStr}`,
  );
  lines.push('═'.repeat(width));
  lines.push('');

  return lines.join('\n');
}
