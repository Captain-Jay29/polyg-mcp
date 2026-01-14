// Causal Graph - cause-effect relationships and reasoning chains
import type { CausalLink, CausalNode } from '@polyg-mcp/shared';
import type { FalkorDBAdapter } from '../storage/falkordb.js';
import { parseCausalNode, safeNumber, safeString } from './parsers.js';

// Node labels for causal graph
const NODE_LABEL = 'C_Node';
const CAUSES_REL = 'C_CAUSES';
const REFERS_TO_REL = 'X_REFERS_TO';
const AFFECTS_REL = 'X_AFFECTS';

/**
 * Causal Graph manages cause-effect relationships and enables causal reasoning.
 * - C_Node: Represents causes, effects, or intermediate nodes in causal chains
 * - C_CAUSES: Directed relationship from cause to effect with confidence
 */
export class CausalGraph {
  constructor(private db: FalkorDBAdapter) {}

  /**
   * Add a new causal node
   */
  async addNode(description: string, nodeType: string): Promise<CausalNode> {
    const nodeProps = {
      description,
      node_type: nodeType,
      created_at: new Date().toISOString(),
    };

    const uuid = await this.db.createNode(NODE_LABEL, nodeProps);

    return {
      uuid,
      description,
      node_type: nodeType,
    };
  }

  /**
   * Create a causal link between two nodes
   */
  async addLink(
    causeId: string,
    effectId: string,
    confidence = 1.0,
    evidence?: string,
  ): Promise<CausalLink> {
    const relProps: Record<string, unknown> = {
      confidence,
      created_at: new Date().toISOString(),
    };

    if (evidence) {
      relProps.evidence = evidence;
    }

    await this.db.query(
      `MATCH (cause:${NODE_LABEL} {uuid: $causeId}), (effect:${NODE_LABEL} {uuid: $effectId})
       CREATE (cause)-[:${CAUSES_REL} {confidence: $confidence, evidence: $evidence, created_at: $createdAt}]->(effect)`,
      {
        causeId,
        effectId,
        confidence,
        evidence: evidence || null,
        createdAt: new Date().toISOString(),
      },
    );

    // Get the descriptions for the response
    const causeNode = await this.getNode(causeId);
    const effectNode = await this.getNode(effectId);

    return {
      cause: causeNode?.description || causeId,
      effect: effectNode?.description || effectId,
      confidence,
      evidence,
    };
  }

  /**
   * Get a causal node by UUID
   */
  async getNode(uuid: string): Promise<CausalNode | null> {
    const result = await this.db.query(
      `MATCH (n:${NODE_LABEL} {uuid: $uuid}) RETURN n`,
      { uuid },
    );

    if (result.records.length === 0) {
      return null;
    }

    return parseCausalNode(result.records[0].n);
  }

  /**
   * Traverse the causal chain from starting nodes
   */
  async traverse(
    startNodes: { mention: string; type?: string }[],
    direction: 'upstream' | 'downstream' | 'both',
    maxDepth = 3,
  ): Promise<CausalLink[]> {
    const links: CausalLink[] = [];

    for (const { mention } of startNodes) {
      // Find matching nodes
      const matchResult = await this.db.query(
        `MATCH (n:${NODE_LABEL}) WHERE toLower(n.description) CONTAINS toLower($mention) RETURN n`,
        { mention },
      );

      for (const record of matchResult.records) {
        const node = parseCausalNode(record.n);

        if (direction === 'upstream' || direction === 'both') {
          const upstream = await this.getUpstreamCauses(node.uuid, maxDepth);
          links.push(...upstream);
        }

        if (direction === 'downstream' || direction === 'both') {
          const downstream = await this.getDownstreamEffects(
            node.uuid,
            maxDepth,
          );
          links.push(...downstream);
        }
      }
    }

    // Deduplicate links
    const seen = new Set<string>();
    return links.filter((link) => {
      const key = `${link.cause}->${link.effect}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Get upstream causes (what caused this node)
   */
  async getUpstreamCauses(nodeId: string, maxDepth = 3): Promise<CausalLink[]> {
    const result = await this.db.query(
      `MATCH path = (cause:${NODE_LABEL})-[:${CAUSES_REL}*1..${maxDepth}]->(effect:${NODE_LABEL} {uuid: $nodeId})
       UNWIND relationships(path) as r
       WITH startNode(r) as c, endNode(r) as e, r
       RETURN c, e, r.confidence as confidence, r.evidence as evidence`,
      { nodeId },
    );

    return result.records.map((record) => ({
      cause: parseCausalNode(record.c).description,
      effect: parseCausalNode(record.e).description,
      confidence: safeNumber(record.confidence, 1.0),
      evidence: record.evidence ? safeString(record.evidence) : undefined,
    }));
  }

  /**
   * Get downstream effects (what this node causes)
   */
  async getDownstreamEffects(
    nodeId: string,
    maxDepth = 3,
  ): Promise<CausalLink[]> {
    const result = await this.db.query(
      `MATCH path = (cause:${NODE_LABEL} {uuid: $nodeId})-[:${CAUSES_REL}*1..${maxDepth}]->(effect:${NODE_LABEL})
       UNWIND relationships(path) as r
       WITH startNode(r) as c, endNode(r) as e, r
       RETURN c, e, r.confidence as confidence, r.evidence as evidence`,
      { nodeId },
    );

    return result.records.map((record) => ({
      cause: parseCausalNode(record.c).description,
      effect: parseCausalNode(record.e).description,
      confidence: safeNumber(record.confidence, 1.0),
      evidence: record.evidence ? safeString(record.evidence) : undefined,
    }));
  }

  /**
   * Find causal explanation for an event description
   */
  async explainWhy(eventDescription: string): Promise<CausalLink[]> {
    // Find nodes matching the event description
    const matchResult = await this.db.query(
      `MATCH (n:${NODE_LABEL}) WHERE toLower(n.description) CONTAINS toLower($desc) RETURN n LIMIT 5`,
      { desc: eventDescription },
    );

    const allLinks: CausalLink[] = [];

    for (const record of matchResult.records) {
      const node = parseCausalNode(record.n);
      const upstream = await this.getUpstreamCauses(node.uuid, 5);
      allLinks.push(...upstream);
    }

    // Sort by confidence (highest first)
    return allLinks.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Link a causal node to an event (cross-graph)
   */
  async linkToEvent(nodeId: string, eventId: string): Promise<void> {
    await this.db.query(
      `MATCH (n:${NODE_LABEL} {uuid: $nodeId}), (e {uuid: $eventId})
       CREATE (n)-[:${REFERS_TO_REL} {created_at: $createdAt}]->(e)`,
      {
        nodeId,
        eventId,
        createdAt: new Date().toISOString(),
      },
    );
  }

  /**
   * Link a causal node to an entity (cross-graph)
   */
  async linkToEntity(nodeId: string, entityId: string): Promise<void> {
    await this.db.query(
      `MATCH (n:${NODE_LABEL} {uuid: $nodeId}), (e {uuid: $entityId})
       CREATE (n)-[:${AFFECTS_REL} {created_at: $createdAt}]->(e)`,
      {
        nodeId,
        entityId,
        createdAt: new Date().toISOString(),
      },
    );
  }

  /**
   * Find or create a causal node by description
   */
  async findOrCreate(
    description: string,
    nodeType = 'event',
  ): Promise<CausalNode> {
    // Try to find existing
    const result = await this.db.query(
      `MATCH (n:${NODE_LABEL}) WHERE toLower(n.description) = toLower($desc) RETURN n LIMIT 1`,
      { desc: description },
    );

    if (result.records.length > 0) {
      return parseCausalNode(result.records[0].n);
    }

    // Create new
    return this.addNode(description, nodeType);
  }
}
