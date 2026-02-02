// Entity Tree Visualization - ASCII relationship tree display

export interface EntityNode {
  name: string;
  type: string;
  properties?: Record<string, unknown>;
  relationships?: EntityRelation[];
}

export interface EntityRelation {
  target: string;
  type: string;
  direction?: 'outgoing' | 'incoming';
}

/**
 * Truncate text to fit width
 */
function truncate(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  return text.slice(0, maxWidth - 3) + '...';
}

/**
 * Format entity type badge
 */
function typeBadge(type: string): string {
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
 * Render an entity tree showing relationships
 */
export function renderEntityTree(
  entities: EntityNode[],
  title?: string,
): string {
  if (entities.length === 0) {
    return '  (No entities to display)\n';
  }

  const lines = [
    '',
    `  ENTITIES${title ? `: ${title}` : ''}`,
    '  ' + '─'.repeat(50),
  ];

  for (const entity of entities) {
    const badge = typeBadge(entity.type);
    lines.push(`  ${badge} ${entity.name}`);

    // Show properties if present
    if (entity.properties && Object.keys(entity.properties).length > 0) {
      const props = Object.entries(entity.properties)
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      lines.push(`       └─ ${truncate(props, 45)}`);
    }

    // Show relationships
    if (entity.relationships && entity.relationships.length > 0) {
      const relCount = entity.relationships.length;
      for (let i = 0; i < relCount; i++) {
        const rel = entity.relationships[i];
        const isLast = i === relCount - 1;
        const connector = isLast ? '└─' : '├─';
        const arrow = rel.direction === 'incoming' ? '←' : '→';
        lines.push(`       ${connector} ${arrow} ${rel.type} ${rel.target}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Render a compact entity list
 */
export function renderCompactEntityList(entities: EntityNode[]): string {
  if (entities.length === 0) return '  (No entities)';

  const byType = new Map<string, string[]>();
  for (const entity of entities) {
    const type = entity.type;
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type)!.push(entity.name);
  }

  const parts: string[] = [];
  for (const [type, names] of byType) {
    parts.push(`${type}: ${names.length}`);
  }

  return `  Entities: ${entities.length} total (${parts.join(', ')})`;
}

/**
 * Parse entity lookup results into EntityNode array
 */
export function parseEntityResults(results: unknown): EntityNode[] {
  const entities: EntityNode[] = [];

  if (!results || typeof results !== 'object') return entities;

  const items = Array.isArray(results) ? results : [results];

  for (const item of items) {
    if (typeof item !== 'object' || !item) continue;

    const record = item as Record<string, unknown>;

    const name = record.name || record.id || record.entity;
    const type = record.type || record.entityType || record.label || 'unknown';

    if (typeof name !== 'string') continue;

    const relationships: EntityRelation[] = [];
    if (Array.isArray(record.relationships)) {
      for (const rel of record.relationships) {
        if (typeof rel !== 'object' || !rel) continue;
        const relRecord = rel as Record<string, unknown>;
        const target = relRecord.target || relRecord.to || relRecord.entity;
        const relType =
          relRecord.type || relRecord.relationship || 'RELATED_TO';
        if (typeof target === 'string') {
          relationships.push({
            target,
            type: String(relType),
            direction:
              relRecord.direction === 'incoming' ? 'incoming' : 'outgoing',
          });
        }
      }
    }

    // Extract properties (exclude known fields)
    const knownFields = [
      'name',
      'id',
      'entity',
      'type',
      'entityType',
      'label',
      'relationships',
      'uuid',
    ];
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (!knownFields.includes(key) && value !== null && value !== undefined) {
        properties[key] = value;
      }
    }

    entities.push({
      name: String(name),
      type: String(type),
      properties: Object.keys(properties).length > 0 ? properties : undefined,
      relationships: relationships.length > 0 ? relationships : undefined,
    });
  }

  return entities;
}
