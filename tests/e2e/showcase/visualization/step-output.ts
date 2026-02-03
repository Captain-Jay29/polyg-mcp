// Step Output - Rich step visualization with graph context

import { parseCausalResults } from './causal-chain.js';
import { parseEntityResults } from './entity-tree.js';
import { parseTemporalResults } from './timeline.js';

/**
 * Session findings accumulated across all steps
 */
export interface SessionFindings {
  concepts: Array<{ name: string; source: string; description?: string }>;
  entities: Array<{
    name: string;
    type: string;
    relationships: Array<{ target: string; type: string }>;
  }>;
  events: Array<{ time: string; description: string; type?: string }>;
  causalLinks: Array<{ cause: string; effect: string; confidence: number }>;
  toolsUsed: string[];
  queriesAnswered: number;
}

/**
 * Create empty session findings
 */
export function createSessionFindings(): SessionFindings {
  return {
    concepts: [],
    entities: [],
    events: [],
    causalLinks: [],
    toolsUsed: [],
    queriesAnswered: 0,
  };
}

/**
 * Graph type badge mapping
 */
const GRAPH_BADGES: Record<string, string> = {
  semantic_search: '[SEMANTIC GRAPH]',
  entity_lookup: '[ENTITY GRAPH]',
  temporal_expand: '[TEMPORAL GRAPH]',
  causal_expand: '[CAUSAL GRAPH]',
  get_statistics: '[STATS]',
};

/**
 * Get graph badge for tool
 */
export function getGraphBadge(toolName: string): string {
  return GRAPH_BADGES[toolName] ?? '[TOOL]';
}

/**
 * Truncate text for display
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

/**
 * Render rich step result with graph context
 */
export function renderStepResult(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
  findings: SessionFindings,
): string {
  // Note: Badge is already shown in step header, so we don't repeat it here
  const lines: string[] = [];

  switch (toolName) {
    case 'semantic_search': {
      const query = String(args.query ?? '');
      // Server returns { matches: [...] } with conceptName field
      const parsed = result as { matches?: unknown[]; results?: unknown[] } | unknown[];
      const results = Array.isArray(parsed)
        ? parsed
        : (parsed.matches ?? parsed.results ?? []);
      const concepts = results as Array<{
        name?: string;
        conceptName?: string;
        description?: string;
        score?: number;
      }>;

      lines.push('');
      lines.push(`  Query: "${truncate(query, 50)}"`);
      lines.push('');

      if (concepts.length > 0) {
        lines.push('  FOUND CONCEPTS:');
        for (const c of concepts.slice(0, 5)) {
          const name = c.conceptName ?? c.name ?? 'unknown';
          const scoreStr = c.score ? ` (${(c.score * 100).toFixed(0)}%)` : '';
          const desc = c.description ? ` - ${truncate(c.description, 40)}` : '';
          lines.push(`    ● ${name}${scoreStr}${desc}`);

          // Accumulate findings
          const conceptName = c.conceptName ?? c.name ?? 'unknown';
          if (!findings.concepts.find((f) => f.name === conceptName)) {
            findings.concepts.push({
              name: conceptName,
              source: 'semantic_search',
              description: c.description,
            });
          }
        }
        if (concepts.length > 5) {
          lines.push(`    ... and ${concepts.length - 5} more`);
        }
      } else {
        lines.push('  No concepts found.');
      }
      lines.push('');
      break;
    }

    case 'entity_lookup': {
      // entity_ids is an array of UUIDs/names from semantic_search seedEntityIds
      const entityIds = args.entity_ids as string[] | undefined;
      const entityArg = Array.isArray(entityIds) && entityIds.length > 0
        ? entityIds.slice(0, 3).join(', ') + (entityIds.length > 3 ? ` (+${entityIds.length - 3} more)` : '')
        : String(args.entity ?? args.name ?? '(none provided)');
      const parsed = result as { entities?: unknown[] } | unknown[];
      const rawEntities = Array.isArray(parsed)
        ? parsed
        : (parsed.entities ?? []);
      // Use proper parsing with fallbacks for field names
      const entities = parseEntityResults(rawEntities);

      lines.push('');
      lines.push(`  Looking up: ${truncate(entityArg, 50)}`);
      lines.push(`  Max depth: ${args.depth ?? 2}`);
      lines.push('');

      if (entities.length > 0) {
        lines.push('  DISCOVERED:');
        let totalRelationships = 0;
        for (const e of entities.slice(0, 6)) {
          const typeBadge = `[${e.type.slice(0, 3).toUpperCase()}]`;
          lines.push(`    ${typeBadge} ${e.name}`);

          if (e.relationships && e.relationships.length > 0) {
            totalRelationships += e.relationships.length;
            for (const rel of e.relationships.slice(0, 2)) {
              const arrow = rel.direction === 'incoming' ? '←' : '→';
              lines.push(`        ${arrow} ${rel.type} ${rel.target}`);
            }
            if (e.relationships.length > 2) {
              lines.push(
                `        ... +${e.relationships.length - 2} more relationships`,
              );
            }
          }

          // Accumulate findings (type is guaranteed by parseEntityResults)
          if (!findings.entities.find((f) => f.name === e.name)) {
            findings.entities.push({
              name: e.name,
              type: e.type,
              relationships: (e.relationships ?? []).map((r) => ({
                target: r.target,
                type: r.type,
              })),
            });
          }
        }

        lines.push('');
        lines.push(
          `  Found: ${entities.length} entities, ${totalRelationships} relationships`,
        );
      } else {
        lines.push('  No entities found.');
      }
      lines.push('');
      break;
    }

    case 'temporal_expand': {
      const startTime = args.start_time ?? args.after;
      const endTime = args.end_time ?? args.before;
      const parsed = result as { events?: unknown[] } | unknown[];
      const rawEvents = Array.isArray(parsed) ? parsed : (parsed.events ?? []);
      // Use proper parsing with type detection
      const events = parseTemporalResults(rawEvents);

      lines.push('');
      if (startTime || endTime) {
        const start = startTime ? String(startTime).split('T')[1]?.slice(0, 5) ?? String(startTime) : '...';
        const end = endTime ? String(endTime).split('T')[1]?.slice(0, 5) ?? String(endTime) : '...';
        lines.push(`  Time range: ${start} → ${end}`);
      }
      lines.push('');

      if (events.length > 0) {
        lines.push('  TIMELINE:');
        const sorted = [...events].sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );

        for (const evt of sorted.slice(0, 8)) {
          const time = new Date(evt.timestamp)
            .toISOString()
            .split('T')[1]
            ?.slice(0, 5) ?? '??:??';
          const icon =
            evt.type === 'incident'
              ? '▲'
              : evt.type === 'resolution'
                ? '✓'
                : '●';
          lines.push(`    ${time}  ${icon} ${truncate(evt.description, 45)}`);

          // Accumulate findings
          if (
            !findings.events.find(
              (f) =>
                f.time === evt.timestamp &&
                f.description === evt.description,
            )
          ) {
            findings.events.push({
              time: evt.timestamp,
              description: evt.description,
              type: evt.type,
            });
          }
        }

        if (events.length > 8) {
          lines.push(`    ... and ${events.length - 8} more events`);
        }

        lines.push('');
        lines.push(`  Found: ${events.length} events`);
      } else {
        lines.push('  No events found in time range.');
      }
      lines.push('');
      break;
    }

    case 'causal_expand': {
      // entity_ids is an array of UUIDs/names from semantic_search seedEntityIds
      const entityIds = args.entity_ids as string[] | undefined;
      const startFrom = Array.isArray(entityIds) && entityIds.length > 0
        ? entityIds.slice(0, 3).join(', ') + (entityIds.length > 3 ? ` (+${entityIds.length - 3} more)` : '')
        : String(args.concept ?? args.entity ?? args.effect ?? '(none provided)');
      const direction = (args.direction as string) ?? 'upstream';
      const parsed = result as { links?: unknown[] } | unknown[];
      const rawLinks = Array.isArray(parsed) ? parsed : (parsed.links ?? []);
      // Use proper parsing with field name fallbacks
      const links = parseCausalResults(rawLinks);

      lines.push('');
      lines.push(`  Starting from: ${truncate(startFrom, 50)}`);
      lines.push(`  Direction: ${direction} | Max depth: ${args.depth ?? 5}`);
      lines.push('');

      if (links.length > 0) {
        lines.push('  TRAVERSAL:');

        // Build simple chain display
        const visited = new Set<string>();
        const allCauses = new Set(links.map((l) => l.cause));
        const allEffects = new Set(links.map((l) => l.effect));
        const roots = [...allCauses].filter((c) => !allEffects.has(c));
        const root = roots[0] ?? links[0].cause;

        const renderChain = (
          node: string,
          depth: number,
          maxDepth: number,
        ): void => {
          if (depth > maxDepth || visited.has(node)) return;
          visited.add(node);

          const indent = '  '.repeat(depth);
          const prefix = depth === 0 ? '  ├─' : `  │${indent}└─`;
          lines.push(`${prefix} ${truncate(node, 50 - depth * 2)}`);

          const children = links.filter((l) => l.cause === node);
          for (const child of children.slice(0, 3)) {
            const confStr = `(${(child.confidence * 100).toFixed(0)}%)`;
            lines.push(`  │${indent}   ↓ ${confStr}`);
            renderChain(child.effect, depth + 1, maxDepth);

            // Accumulate findings
            if (
              !findings.causalLinks.find(
                (f) => f.cause === child.cause && f.effect === child.effect,
              )
            ) {
              findings.causalLinks.push({
                cause: child.cause,
                effect: child.effect,
                confidence: child.confidence,
              });
            }
          }
        };

        renderChain(root, 0, 4);

        lines.push('');
        lines.push(
          `  Found: ${visited.size} nodes, ${links.length} links | Depth: ${Math.min(visited.size, 5)} hops`,
        );
      } else {
        lines.push('  No causal links found.');
      }
      lines.push('');
      break;
    }

    default: {
      // Generic output for other tools
      const summary =
        typeof result === 'object' && result !== null
          ? JSON.stringify(result).slice(0, 80)
          : String(result).slice(0, 80);
      lines.push(`\n  Result: ${summary}${summary.length >= 80 ? '...' : ''}`);
      lines.push('');
    }
  }

  // Track tool usage
  if (!findings.toolsUsed.includes(toolName)) {
    findings.toolsUsed.push(toolName);
  }

  return lines.join('\n');
}
