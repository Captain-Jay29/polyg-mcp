// Post-processing — entity dedup, fact conflict resolution, orphan cleanup, quality checks
import type { DeduplicationResult, IngestionDeps } from './types.js';

// ---------------------------------------------------------------------------
// Name normalization
// ---------------------------------------------------------------------------

/**
 * Normalize an entity name for deduplication grouping.
 * Stricter than slow-path's `normalizeEntityKey` (which only lowercases + trims)
 * because cross-chunk duplicates may use hyphens vs underscores vs spaces.
 */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Entity deduplication
// ---------------------------------------------------------------------------

interface RawEntity {
  uuid: string;
  name: string;
  type: string;
  created_at: string;
  properties: string;
}

async function deduplicateEntities(deps: IngestionDeps): Promise<number> {
  // 1. Fetch all entities
  const result = await deps.db.query(
    `MATCH (e:E_Entity)
     RETURN e.uuid AS uuid, e.name AS name, e.entity_type AS type,
            e.created_at AS created_at, e.properties AS properties`,
  );

  const entities: RawEntity[] = result.records.map(
    (r: Record<string, unknown>) => ({
      uuid: r.uuid as string,
      name: r.name as string,
      type: r.type as string,
      created_at: (r.created_at as string) ?? '',
      properties: (r.properties as string) ?? '{}',
    }),
  );

  // 2. Group by normalized name + type
  const groups = new Map<string, RawEntity[]>();
  for (const ent of entities) {
    const key = `${normalizeName(ent.name)}::${ent.type}`;
    const group = groups.get(key);
    if (group) {
      group.push(ent);
    } else {
      groups.set(key, [ent]);
    }
  }

  // 3. Merge each group with >1 member
  let merged = 0;
  for (const group of groups.values()) {
    if (group.length <= 1) continue;

    // Pick canonical: earliest created_at
    group.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const canonical = group[0];
    const duplicates = group.slice(1);

    for (const dup of duplicates) {
      await mergeEntityInto(deps, canonical, dup);
      merged++;
    }
  }

  return merged;
}

async function mergeEntityInto(
  deps: IngestionDeps,
  canonical: RawEntity,
  dup: RawEntity,
): Promise<void> {
  // Merge properties into canonical (canonical wins on conflict)
  const canonProps = safeJsonParse(canonical.properties);
  const dupProps = safeJsonParse(dup.properties);
  const merged = { ...dupProps, ...canonProps };
  await deps.db.query(
    `MATCH (e:E_Entity {uuid: $canonId}) SET e.properties = $props`,
    { canonId: canonical.uuid, props: JSON.stringify(merged) },
  );

  // Move E_RELATES edges (outgoing) — guard self-loops
  await deps.db.query(
    `MATCH (dup:E_Entity {uuid: $dupId})-[r:E_RELATES]->(target:E_Entity)
     WHERE target.uuid <> $canonId
     MERGE (canon:E_Entity {uuid: $canonId})-[:E_RELATES {relationship_type: r.relationship_type}]->(target)
     DELETE r`,
    { dupId: dup.uuid, canonId: canonical.uuid },
  );

  // Move E_RELATES edges (incoming) — guard self-loops
  await deps.db.query(
    `MATCH (source:E_Entity)-[r:E_RELATES]->(dup:E_Entity {uuid: $dupId})
     WHERE source.uuid <> $canonId
     MERGE (source)-[:E_RELATES {relationship_type: r.relationship_type}]->(canon:E_Entity {uuid: $canonId})
     DELETE r`,
    { dupId: dup.uuid, canonId: canonical.uuid },
  );

  // Move X_REPRESENTS (S_Concept → E_Entity)
  await deps.db.query(
    `MATCH (concept:S_Concept)-[r:X_REPRESENTS]->(dup:E_Entity {uuid: $dupId})
     MERGE (concept)-[:X_REPRESENTS]->(canon:E_Entity {uuid: $canonId})
     DELETE r`,
    { dupId: dup.uuid, canonId: canonical.uuid },
  );

  // Move X_INVOLVES (T_Event / T_Fact → E_Entity)
  await deps.db.query(
    `MATCH (event)-[r:X_INVOLVES]->(dup:E_Entity {uuid: $dupId})
     MERGE (event)-[:X_INVOLVES]->(canon:E_Entity {uuid: $canonId})
     DELETE r`,
    { dupId: dup.uuid, canonId: canonical.uuid },
  );

  // Move X_AFFECTS (C_Node → E_Entity)
  await deps.db.query(
    `MATCH (causal:C_Node)-[r:X_AFFECTS]->(dup:E_Entity {uuid: $dupId})
     MERGE (causal)-[:X_AFFECTS]->(canon:E_Entity {uuid: $canonId})
     DELETE r`,
    { dupId: dup.uuid, canonId: canonical.uuid },
  );

  // Delete the duplicate
  await deps.db.query(`MATCH (dup:E_Entity {uuid: $dupId}) DETACH DELETE dup`, {
    dupId: dup.uuid,
  });
}

// ---------------------------------------------------------------------------
// Fact conflict resolution
// ---------------------------------------------------------------------------

async function resolveFactConflicts(deps: IngestionDeps): Promise<number> {
  // Find overlapping fact pairs: same (subject, predicate), earlier has open/overlapping validity
  const result = await deps.db.query(
    `MATCH (f1:T_Fact), (f2:T_Fact)
     WHERE f1.subject = f2.subject
       AND f1.predicate = f2.predicate
       AND f1.uuid <> f2.uuid
       AND f1.valid_from < f2.valid_from
       AND (f1.valid_to IS NULL OR f1.valid_to >= f2.valid_from)
     RETURN f1.uuid AS f1_uuid, f2.valid_from AS f2_valid_from`,
  );

  // Deduplicate: a fact may appear in multiple pairs, only update once
  const updated = new Set<string>();
  for (const record of result.records) {
    const f1Uuid = record.f1_uuid as string;
    if (updated.has(f1Uuid)) continue;

    await deps.db.query(
      `MATCH (f:T_Fact {uuid: $uuid}) SET f.valid_to = $validTo`,
      { uuid: f1Uuid, validTo: record.f2_valid_from as string },
    );
    updated.add(f1Uuid);
  }

  return updated.size;
}

// ---------------------------------------------------------------------------
// Orphan cleanup
// ---------------------------------------------------------------------------

async function cleanupOrphans(deps: IngestionDeps): Promise<number> {
  // Two-step: count first, then delete (FalkorDB may not support RETURN after DELETE)
  const countResult = await deps.db.query(
    `MATCH (e:E_Entity)
     WHERE NOT (e)-[:E_RELATES]-()
       AND NOT (e)<-[:X_REPRESENTS]-()
       AND NOT (e)<-[:X_INVOLVES]-()
       AND NOT (e)<-[:X_AFFECTS]-()
     RETURN count(e) AS orphanCount`,
  );
  const orphanCount = asNumber(countResult.records[0]?.orphanCount) ?? 0;

  if (orphanCount > 0) {
    await deps.db.query(
      `MATCH (e:E_Entity)
       WHERE NOT (e)-[:E_RELATES]-()
         AND NOT (e)<-[:X_REPRESENTS]-()
         AND NOT (e)<-[:X_INVOLVES]-()
         AND NOT (e)<-[:X_AFFECTS]-()
       DELETE e`,
    );
  }

  return orphanCount;
}

// ---------------------------------------------------------------------------
// Quality checks
// ---------------------------------------------------------------------------

/**
 * Pure function — returns warning strings based on graph metrics.
 */
export function checkQuality(
  entityCount: number,
  chunkCount: number,
  failedChunkCount: number,
  disconnectedRatio: number,
  maxCausalDepth: number,
): string[] {
  const warnings: string[] = [];

  if (entityCount < 3) {
    warnings.push(
      `Low entity count: ${entityCount} entities extracted (expected >= 3)`,
    );
  }

  if (chunkCount > 0 && entityCount > 2 * chunkCount) {
    warnings.push(
      `High entity count: ${entityCount} entities from ${chunkCount} chunks (> 2x ratio)`,
    );
  }

  if (chunkCount > 0 && failedChunkCount / chunkCount > 0.2) {
    warnings.push(
      `High extraction failure rate: ${failedChunkCount}/${chunkCount} chunks failed (> 20%)`,
    );
  }

  if (maxCausalDepth < 2) {
    warnings.push(
      `Shallow causal chains: max depth ${maxCausalDepth} (expected >= 2)`,
    );
  }

  if (disconnectedRatio > 0.3) {
    warnings.push(
      `High disconnection rate: ${Math.round(disconnectedRatio * 100)}% of entities are disconnected (> 30%)`,
    );
  }

  return warnings;
}

/**
 * Gather quality metrics from the graph via Cypher queries.
 */
export async function getQualityMetrics(deps: IngestionDeps): Promise<{
  entityCount: number;
  disconnectedRatio: number;
  maxCausalDepth: number;
}> {
  const entityResult = await deps.db.query(
    `MATCH (e:E_Entity) RETURN count(e) AS cnt`,
  );
  const entityCount = asNumber(entityResult.records[0]?.cnt) ?? 0;

  let disconnectedRatio = 0;
  if (entityCount > 0) {
    const disconnectedResult = await deps.db.query(
      `MATCH (e:E_Entity)
       WHERE NOT (e)-[:E_RELATES]-()
         AND NOT (e)<-[:X_REPRESENTS]-()
         AND NOT (e)<-[:X_INVOLVES]-()
         AND NOT (e)<-[:X_AFFECTS]-()
       RETURN count(e) AS cnt`,
    );
    const disconnected = asNumber(disconnectedResult.records[0]?.cnt) ?? 0;
    disconnectedRatio = disconnected / entityCount;
  }

  const depthResult = await deps.db.query(
    `MATCH p = (a:C_Node)-[:C_CAUSES*1..20]->(b:C_Node)
     RETURN max(length(p)) AS maxDepth`,
  );
  const maxCausalDepth = asNumber(depthResult.records[0]?.maxDepth) ?? 0;

  return { entityCount, disconnectedRatio, maxCausalDepth };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function runPostProcess(
  deps: IngestionDeps,
): Promise<DeduplicationResult> {
  const mergedEntities = await deduplicateEntities(deps);
  const factsWithUpdatedValidity = await resolveFactConflicts(deps);
  const orphanedLinksRemoved = await cleanupOrphans(deps);

  return {
    mergedEntities,
    mergedCausalNodes: 0, // deferred to future work
    factsWithUpdatedValidity,
    orphanedLinksRemoved,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeJsonParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function asNumber(val: unknown): number | undefined {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = Number(val);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}
