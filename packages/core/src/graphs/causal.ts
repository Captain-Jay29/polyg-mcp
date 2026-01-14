// Causal Graph - cause-effect relationships and reasoning chains
import type { CausalLink, CausalNode } from '@polyg-mcp/shared';
import type { FalkorDBAdapter } from '../storage/falkordb.js';
import {
  CausalTraversalError,
  GraphParseError,
  RelationshipError,
  wrapGraphError,
} from './errors.js';
import {
  ParseError,
  parseCausalNode,
  safeNumber,
  safeString,
} from './parsers.js';

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
   * Safely parse a causal node
   */
  private safeParseNode(node: unknown): CausalNode {
    try {
      return parseCausalNode(node);
    } catch (error) {
      if (error instanceof ParseError) {
        throw new GraphParseError(error.message, error.nodeType, error);
      }
      throw error;
    }
  }

  /**
   * Add a new causal node
   */
  async addNode(description: string, nodeType: string): Promise<CausalNode> {
    try {
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
    } catch (error) {
      throw wrapGraphError(
        error,
        `Failed to add causal node: ${description}`,
        'Causal',
        'addNode',
      );
    }
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
    try {
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
    } catch (error) {
      throw new RelationshipError(
        'Failed to create causal link',
        causeId,
        effectId,
        CAUSES_REL,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get a causal node by UUID
   */
  async getNode(uuid: string): Promise<CausalNode | null> {
    try {
      const result = await this.db.query(
        `MATCH (n:${NODE_LABEL} {uuid: $uuid}) RETURN n`,
        { uuid },
      );

      if (result.records.length === 0) {
        return null;
      }

      return this.safeParseNode(result.records[0].n);
    } catch (error) {
      if (error instanceof GraphParseError) {
        throw error;
      }
      throw wrapGraphError(
        error,
        `Failed to get causal node: ${uuid}`,
        'Causal',
        'getNode',
      );
    }
  }

  /**
   * Traverse the causal chain from starting nodes
   */
  async traverse(
    startNodes: { mention: string; type?: string }[],
    direction: 'upstream' | 'downstream' | 'both',
    maxDepth = 3,
  ): Promise<CausalLink[]> {
    try {
      const links: CausalLink[] = [];

      for (const { mention } of startNodes) {
        // Find matching nodes
        const matchResult = await this.db.query(
          `MATCH (n:${NODE_LABEL}) WHERE toLower(n.description) CONTAINS toLower($mention) RETURN n`,
          { mention },
        );

        for (const record of matchResult.records) {
          const node = this.safeParseNode(record.n);

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
    } catch (error) {
      if (
        error instanceof GraphParseError ||
        error instanceof CausalTraversalError
      ) {
        throw error;
      }
      throw new CausalTraversalError(
        'Failed to traverse causal chain',
        direction,
        maxDepth,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get upstream causes (what caused this node)
   */
  async getUpstreamCauses(nodeId: string, maxDepth = 3): Promise<CausalLink[]> {
    try {
      const result = await this.db.query(
        `MATCH path = (cause:${NODE_LABEL})-[:${CAUSES_REL}*1..${maxDepth}]->(effect:${NODE_LABEL} {uuid: $nodeId})
         UNWIND relationships(path) as r
         WITH startNode(r) as c, endNode(r) as e, r
         RETURN c, e, r.confidence as confidence, r.evidence as evidence`,
        { nodeId },
      );

      return result.records.map((record: Record<string, unknown>) => ({
        cause: this.safeParseNode(record.c).description,
        effect: this.safeParseNode(record.e).description,
        confidence: safeNumber(record.confidence, 1.0),
        evidence: record.evidence ? safeString(record.evidence) : undefined,
      }));
    } catch (error) {
      if (error instanceof GraphParseError) {
        throw error;
      }
      throw new CausalTraversalError(
        `Failed to get upstream causes for node: ${nodeId}`,
        'upstream',
        maxDepth,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get downstream effects (what this node causes)
   */
  async getDownstreamEffects(
    nodeId: string,
    maxDepth = 3,
  ): Promise<CausalLink[]> {
    try {
      const result = await this.db.query(
        `MATCH path = (cause:${NODE_LABEL} {uuid: $nodeId})-[:${CAUSES_REL}*1..${maxDepth}]->(effect:${NODE_LABEL})
         UNWIND relationships(path) as r
         WITH startNode(r) as c, endNode(r) as e, r
         RETURN c, e, r.confidence as confidence, r.evidence as evidence`,
        { nodeId },
      );

      return result.records.map((record: Record<string, unknown>) => ({
        cause: this.safeParseNode(record.c).description,
        effect: this.safeParseNode(record.e).description,
        confidence: safeNumber(record.confidence, 1.0),
        evidence: record.evidence ? safeString(record.evidence) : undefined,
      }));
    } catch (error) {
      if (error instanceof GraphParseError) {
        throw error;
      }
      throw new CausalTraversalError(
        `Failed to get downstream effects for node: ${nodeId}`,
        'downstream',
        maxDepth,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find causal explanation for an event description
   */
  async explainWhy(eventDescription: string): Promise<CausalLink[]> {
    try {
      // Find nodes matching the event description
      const matchResult = await this.db.query(
        `MATCH (n:${NODE_LABEL}) WHERE toLower(n.description) CONTAINS toLower($desc) RETURN n LIMIT 5`,
        { desc: eventDescription },
      );

      const allLinks: CausalLink[] = [];

      for (const record of matchResult.records) {
        const node = this.safeParseNode(record.n);
        const upstream = await this.getUpstreamCauses(node.uuid, 5);
        allLinks.push(...upstream);
      }

      // Sort by confidence (highest first)
      return allLinks.sort((a, b) => b.confidence - a.confidence);
    } catch (error) {
      if (
        error instanceof GraphParseError ||
        error instanceof CausalTraversalError
      ) {
        throw error;
      }
      throw wrapGraphError(
        error,
        `Failed to explain: ${eventDescription}`,
        'Causal',
        'explainWhy',
      );
    }
  }

  /**
   * Link a causal node to an event (cross-graph)
   */
  async linkToEvent(nodeId: string, eventId: string): Promise<void> {
    try {
      await this.db.query(
        `MATCH (n:${NODE_LABEL} {uuid: $nodeId}), (e {uuid: $eventId})
         CREATE (n)-[:${REFERS_TO_REL} {created_at: $createdAt}]->(e)`,
        {
          nodeId,
          eventId,
          createdAt: new Date().toISOString(),
        },
      );
    } catch (error) {
      throw new RelationshipError(
        'Failed to link causal node to event',
        nodeId,
        eventId,
        REFERS_TO_REL,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Link a causal node to an entity (cross-graph)
   */
  async linkToEntity(nodeId: string, entityId: string): Promise<void> {
    try {
      await this.db.query(
        `MATCH (n:${NODE_LABEL} {uuid: $nodeId}), (e {uuid: $entityId})
         CREATE (n)-[:${AFFECTS_REL} {created_at: $createdAt}]->(e)`,
        {
          nodeId,
          entityId,
          createdAt: new Date().toISOString(),
        },
      );
    } catch (error) {
      throw new RelationshipError(
        'Failed to link causal node to entity',
        nodeId,
        entityId,
        AFFECTS_REL,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find or create a causal node by description
   */
  async findOrCreate(
    description: string,
    nodeType = 'event',
  ): Promise<CausalNode> {
    try {
      // Try to find existing
      const result = await this.db.query(
        `MATCH (n:${NODE_LABEL}) WHERE toLower(n.description) = toLower($desc) RETURN n LIMIT 1`,
        { desc: description },
      );

      if (result.records.length > 0) {
        return this.safeParseNode(result.records[0].n);
      }

      // Create new
      return this.addNode(description, nodeType);
    } catch (error) {
      if (error instanceof GraphParseError) {
        throw error;
      }
      throw wrapGraphError(
        error,
        `Failed to find or create causal node: ${description}`,
        'Causal',
        'findOrCreate',
      );
    }
  }
}
