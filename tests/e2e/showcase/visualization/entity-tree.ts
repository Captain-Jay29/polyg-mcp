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
 * Handles both flat structure { name, type } and nested { entity: { name, ... }, relationships: [...] }
 */
export function parseEntityResults(results: unknown): EntityNode[] {
  const entities: EntityNode[] = [];

  if (!results || typeof results !== 'object') return entities;

  const items = Array.isArray(results) ? results : [results];

  for (const item of items) {
    if (typeof item !== 'object' || !item) continue;

    const record = item as Record<string, unknown>;

    // Handle nested structure: { entity: { uuid, name, entity_type }, relationships: [...] }
    const entityData = record.entity as Record<string, unknown> | undefined;

    let name: string | undefined;
    let type: string;
    let properties: Record<string, unknown> | undefined;

    if (entityData && typeof entityData === 'object') {
      // Nested structure from entity_lookup
      name = entityData.name as string | undefined;
      type = (entityData.entity_type as string) || (entityData.type as string) || 'unknown';
      properties = entityData.properties as Record<string, unknown> | undefined;
    } else {
      // Flat structure
      name = (record.name || record.id) as string | undefined;
      type = (record.type || record.entityType || record.label || 'unknown') as string;
    }

    if (typeof name !== 'string') continue;

    const relationships: EntityRelation[] = [];
    if (Array.isArray(record.relationships)) {
      for (const rel of record.relationships) {
        if (typeof rel !== 'object' || !rel) continue;
        const relRecord = rel as Record<string, unknown>;
        // Handle nested target: { source: {...}, target: {...}, relationshipType: "..." }
        const targetData = relRecord.target as Record<string, unknown> | undefined;
        const sourceData = relRecord.source as Record<string, unknown> | undefined;

        let target: string | undefined;
        let direction: 'incoming' | 'outgoing' = 'outgoing';

        if (targetData && typeof targetData === 'object' && targetData.name) {
          // If target.name equals our entity name, this is an incoming relationship
          if (targetData.name === name && sourceData && sourceData.name) {
            target = sourceData.name as string;
            direction = 'incoming';
          } else {
            target = targetData.name as string;
          }
        } else {
          target = (relRecord.target || relRecord.to || relRecord.entity) as string | undefined;
        }

        const relType = relRecord.relationshipType || relRecord.type || relRecord.relationship || 'RELATED_TO';

        if (typeof target === 'string') {
          relationships.push({
            target,
            type: String(relType),
            direction: relRecord.direction === 'incoming' ? 'incoming' : direction,
          });
        }
      }
    }

    entities.push({
      name: String(name),
      type: String(type),
      properties,
      relationships: relationships.length > 0 ? relationships : undefined,
    });
  }

  return entities;
}
