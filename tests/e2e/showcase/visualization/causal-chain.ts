// Causal Chain Visualization - ASCII cause-effect tree display

export interface CausalLink {
  cause: string;
  effect: string;
  confidence: number;
  mechanism?: string;
}

export interface CausalNode {
  id: string;
  description: string;
  confidence: number;
  children: CausalNode[];
}

/**
 * Format confidence as percentage
 */
function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Truncate text to fit width
 */
function truncate(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  return text.slice(0, maxWidth - 3) + '...';
}

/**
 * Build a tree from flat causal links
 */
export function buildCausalTree(links: CausalLink[]): CausalNode[] {
  if (links.length === 0) return [];

  // Find all unique causes and effects
  const allCauses = new Set(links.map((l) => l.cause));
  const allEffects = new Set(links.map((l) => l.effect));

  // Root causes are causes that are not effects of anything
  const rootCauses = [...allCauses].filter((c) => !allEffects.has(c));

  // Build tree recursively
  function buildNode(description: string, visited: Set<string>): CausalNode {
    if (visited.has(description)) {
      return { id: description, description, confidence: 1, children: [] };
    }
    visited.add(description);

    const childLinks = links.filter((l) => l.cause === description);
    const children = childLinks.map((link) => {
      const childNode = buildNode(link.effect, visited);
      childNode.confidence = link.confidence;
      return childNode;
    });

    return {
      id: description,
      description,
      confidence: 1,
      children,
    };
  }

  // If no clear root causes, use the first cause as root
  const roots = rootCauses.length > 0 ? rootCauses : [links[0].cause];

  return roots.map((root) => buildNode(root, new Set()));
}

/**
 * Render a causal tree as ASCII
 */
export function renderCausalTree(roots: CausalNode[]): string {
  if (roots.length === 0) {
    return '  (No causal links to display)\n';
  }

  const lines = [
    '',
    '  ROOT CAUSE                                    Confidence',
    '  ' + '─'.repeat(57),
  ];

  function renderNode(
    node: CausalNode,
    prefix: string,
    isLast: boolean,
    isRoot: boolean,
  ): void {
    const desc = truncate(node.description, 42);
    const conf = formatConfidence(node.confidence);
    const confPadded = conf.padStart(5);

    if (isRoot) {
      lines.push(`  ${desc.padEnd(48)}${confPadded}`);
    } else {
      lines.push(`  ${prefix}${desc.padEnd(48 - prefix.length)}${confPadded}`);
    }

    const childCount = node.children.length;
    for (let i = 0; i < childCount; i++) {
      const child = node.children[i];
      const isLastChild = i === childCount - 1;
      const newPrefix = isRoot
        ? ''
        : prefix.replace(/[├└]/, ' ').replace(/─/g, ' ');

      if (childCount > 1 && !isLastChild) {
        // Multiple children - show branch
        lines.push(`  ${newPrefix}     │`);
        lines.push(`  ${newPrefix}     ├${'─'.repeat(19)}┐`);
      } else {
        lines.push(`  ${newPrefix}     │`);
        lines.push(`  ${newPrefix}     ▼`);
      }

      renderNode(child, newPrefix + '  ', isLastChild, false);
    }
  }

  for (const root of roots) {
    renderNode(root, '', true, true);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Render a compact causal chain (single line per hop)
 */
export function renderCompactCausalChain(links: CausalLink[]): string {
  if (links.length === 0) return '  (No causal chain)';

  // Find the root cause
  const allCauses = new Set(links.map((l) => l.cause));
  const allEffects = new Set(links.map((l) => l.effect));
  const roots = [...allCauses].filter((c) => !allEffects.has(c));

  const root = roots[0] ?? links[0].cause;
  const truncatedRoot = truncate(root, 30);

  return `  Root: "${truncatedRoot}" → ${links.length} effects (chain depth: ${links.length})`;
}

/**
 * Parse causal expand results into CausalLink array
 */
export function parseCausalResults(results: unknown): CausalLink[] {
  const links: CausalLink[] = [];

  if (!results || typeof results !== 'object') return links;

  const items = Array.isArray(results) ? results : [results];

  for (const item of items) {
    if (typeof item !== 'object' || !item) continue;

    const record = item as Record<string, unknown>;

    const cause = record.cause || record.from || record.source;
    const effect = record.effect || record.to || record.target;
    const confidence = record.confidence ?? record.score ?? 1;

    if (typeof cause !== 'string' || typeof effect !== 'string') continue;

    links.push({
      cause,
      effect,
      confidence: typeof confidence === 'number' ? confidence : 1,
      mechanism:
        typeof record.mechanism === 'string' ? record.mechanism : undefined,
    });
  }

  return links;
}
