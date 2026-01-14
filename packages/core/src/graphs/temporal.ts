// Temporal Graph - chronological ordering and time-bounded facts
import type {
  TemporalContext,
  TemporalEvent,
  TemporalFact,
  Timeframe,
} from '@polyg-mcp/shared';
import type { FalkorDBAdapter } from '../storage/falkordb.js';
import {
  GraphParseError,
  RelationshipError,
  TemporalError,
  wrapGraphError,
} from './errors.js';
import {
  ParseError,
  parseTemporalEvent,
  parseTemporalFact,
} from './parsers.js';

// Node labels for temporal graph
const EVENT_LABEL = 'T_Event';
const FACT_LABEL = 'T_Fact';
const INVOLVES_REL = 'X_INVOLVES';

/**
 * Temporal Graph manages events and time-bounded facts.
 * - T_Event: Things that happened at a point in time
 * - T_Fact: Statements that are valid within a time window
 */
export class TemporalGraph {
  constructor(private db: FalkorDBAdapter) {}

  /**
   * Safely parse a temporal event node
   */
  private safeParseEvent(node: unknown): TemporalEvent {
    try {
      return parseTemporalEvent(node);
    } catch (error) {
      if (error instanceof ParseError) {
        throw new GraphParseError(error.message, error.nodeType, error);
      }
      throw error;
    }
  }

  /**
   * Safely parse a temporal fact node
   */
  private safeParseFact(node: unknown): TemporalFact {
    try {
      return parseTemporalFact(node);
    } catch (error) {
      if (error instanceof ParseError) {
        throw new GraphParseError(error.message, error.nodeType, error);
      }
      throw error;
    }
  }

  /**
   * Add a new event to the temporal graph
   */
  async addEvent(
    description: string,
    occurredAt: Date,
    duration?: number,
  ): Promise<TemporalEvent> {
    try {
      const nodeProps: Record<string, unknown> = {
        description,
        occurred_at: occurredAt.toISOString(),
      };

      if (duration !== undefined) {
        nodeProps.duration = duration;
      }

      const uuid = await this.db.createNode(EVENT_LABEL, nodeProps);

      return {
        uuid,
        description,
        occurred_at: occurredAt,
        duration,
      };
    } catch (error) {
      throw wrapGraphError(
        error,
        `Failed to add event: ${description}`,
        'Temporal',
        'addEvent',
      );
    }
  }

  /**
   * Add a time-bounded fact
   */
  async addFact(
    subject: string,
    predicate: string,
    object: string,
    validFrom: Date,
    validTo?: Date,
  ): Promise<TemporalFact> {
    try {
      const nodeProps: Record<string, unknown> = {
        subject,
        predicate,
        object,
        valid_from: validFrom.toISOString(),
      };

      if (validTo) {
        nodeProps.valid_to = validTo.toISOString();
      }

      const uuid = await this.db.createNode(FACT_LABEL, nodeProps);

      return {
        uuid,
        subject,
        predicate,
        object,
        valid_from: validFrom,
        valid_to: validTo,
      };
    } catch (error) {
      throw wrapGraphError(
        error,
        `Failed to add fact: ${subject} ${predicate} ${object}`,
        'Temporal',
        'addFact',
      );
    }
  }

  /**
   * Query events and facts within a timeframe
   */
  async query(timeframe: Timeframe): Promise<TemporalContext> {
    try {
      const { from, to } = this.resolveTimeframe(timeframe);

      const events = await this.queryTimeline(from, to);
      const facts = await this.getFactsInRange(from, to);

      return {
        events: events.length > 0 ? events : undefined,
        facts: facts.length > 0 ? facts : undefined,
      };
    } catch (error) {
      if (error instanceof TemporalError || error instanceof GraphParseError) {
        throw error;
      }
      throw new TemporalError(
        'Failed to query temporal context',
        JSON.stringify(timeframe),
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get events in chronological order within a time range
   */
  async queryTimeline(
    from: Date,
    to: Date,
    entityId?: string,
  ): Promise<TemporalEvent[]> {
    try {
      let query: string;
      const params: Record<string, unknown> = {
        from: from.toISOString(),
        to: to.toISOString(),
      };

      if (entityId) {
        // Query events linked to a specific entity
        query = `
          MATCH (e:${EVENT_LABEL})-[:${INVOLVES_REL}]->(entity {uuid: $entityId})
          WHERE e.occurred_at >= $from AND e.occurred_at <= $to
          RETURN e
          ORDER BY e.occurred_at ASC
        `;
        params.entityId = entityId;
      } else {
        query = `
          MATCH (e:${EVENT_LABEL})
          WHERE e.occurred_at >= $from AND e.occurred_at <= $to
          RETURN e
          ORDER BY e.occurred_at ASC
        `;
      }

      const result = await this.db.query(query, params);
      return result.records.map((r) => this.safeParseEvent(r.e));
    } catch (error) {
      if (error instanceof GraphParseError) {
        throw error;
      }
      throw new TemporalError(
        `Failed to query timeline from ${from.toISOString()} to ${to.toISOString()}`,
        `${from.toISOString()} - ${to.toISOString()}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get facts valid at a specific point in time
   */
  async getFactsAt(pointInTime: Date): Promise<TemporalFact[]> {
    try {
      const timestamp = pointInTime.toISOString();

      const result = await this.db.query(
        `MATCH (f:${FACT_LABEL})
         WHERE f.valid_from <= $time AND (f.valid_to IS NULL OR f.valid_to >= $time)
         RETURN f
         ORDER BY f.valid_from DESC`,
        { time: timestamp },
      );

      return result.records.map((r) => this.safeParseFact(r.f));
    } catch (error) {
      if (error instanceof GraphParseError) {
        throw error;
      }
      throw new TemporalError(
        `Failed to get facts at ${pointInTime.toISOString()}`,
        pointInTime.toISOString(),
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get facts valid within a time range
   */
  async getFactsInRange(from: Date, to: Date): Promise<TemporalFact[]> {
    try {
      const result = await this.db.query(
        `MATCH (f:${FACT_LABEL})
         WHERE f.valid_from <= $to AND (f.valid_to IS NULL OR f.valid_to >= $from)
         RETURN f
         ORDER BY f.valid_from ASC`,
        { from: from.toISOString(), to: to.toISOString() },
      );

      return result.records.map((r) => this.safeParseFact(r.f));
    } catch (error) {
      if (error instanceof GraphParseError) {
        throw error;
      }
      throw new TemporalError(
        `Failed to get facts in range ${from.toISOString()} to ${to.toISOString()}`,
        `${from.toISOString()} - ${to.toISOString()}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Link an event to an entity (cross-graph relationship)
   */
  async linkEventToEntity(eventId: string, entityId: string): Promise<void> {
    try {
      await this.db.query(
        `MATCH (e:${EVENT_LABEL} {uuid: $eventId}), (entity {uuid: $entityId})
         CREATE (e)-[:${INVOLVES_REL} {created_at: $createdAt}]->(entity)`,
        {
          eventId,
          entityId,
          createdAt: new Date().toISOString(),
        },
      );
    } catch (error) {
      throw new RelationshipError(
        'Failed to link event to entity',
        eventId,
        entityId,
        INVOLVES_REL,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get an event by UUID
   */
  async getEvent(uuid: string): Promise<TemporalEvent | null> {
    try {
      const result = await this.db.query(
        `MATCH (e:${EVENT_LABEL} {uuid: $uuid}) RETURN e`,
        { uuid },
      );

      if (result.records.length === 0) {
        return null;
      }

      return this.safeParseEvent(result.records[0].e);
    } catch (error) {
      if (error instanceof GraphParseError) {
        throw error;
      }
      throw wrapGraphError(
        error,
        `Failed to get event: ${uuid}`,
        'Temporal',
        'getEvent',
      );
    }
  }

  /**
   * Get a fact by UUID
   */
  async getFact(uuid: string): Promise<TemporalFact | null> {
    try {
      const result = await this.db.query(
        `MATCH (f:${FACT_LABEL} {uuid: $uuid}) RETURN f`,
        { uuid },
      );

      if (result.records.length === 0) {
        return null;
      }

      return this.safeParseFact(result.records[0].f);
    } catch (error) {
      if (error instanceof GraphParseError) {
        throw error;
      }
      throw wrapGraphError(
        error,
        `Failed to get fact: ${uuid}`,
        'Temporal',
        'getFact',
      );
    }
  }

  /**
   * Invalidate a fact by setting its valid_to date
   */
  async invalidateFact(uuid: string, invalidAt?: Date): Promise<void> {
    try {
      const timestamp = (invalidAt || new Date()).toISOString();

      await this.db.query(
        `MATCH (f:${FACT_LABEL} {uuid: $uuid}) SET f.valid_to = $validTo`,
        { uuid, validTo: timestamp },
      );
    } catch (error) {
      throw wrapGraphError(
        error,
        `Failed to invalidate fact: ${uuid}`,
        'Temporal',
        'invalidateFact',
      );
    }
  }

  /**
   * Resolve a Timeframe to concrete from/to dates
   */
  private resolveTimeframe(timeframe: Timeframe): { from: Date; to: Date } {
    const now = new Date();

    switch (timeframe.type) {
      case 'specific': {
        // Single point in time - create a small window around it
        const specific = new Date(timeframe.value);
        return {
          from: new Date(specific.getTime() - 1000), // 1 second before
          to: new Date(specific.getTime() + 1000), // 1 second after
        };
      }

      case 'range':
        return {
          from: new Date(timeframe.value),
          to: timeframe.end ? new Date(timeframe.end) : now,
        };

      case 'relative': {
        // Parse relative time expressions like "last week", "past month"
        const { from, to } = this.parseRelativeTime(timeframe.value);
        return { from, to };
      }

      default:
        return { from: new Date(0), to: now };
    }
  }

  /**
   * Parse relative time expressions
   */
  private parseRelativeTime(expression: string): { from: Date; to: Date } {
    const now = new Date();
    const lowerExpr = expression.toLowerCase();

    // Common patterns
    if (lowerExpr.includes('last hour') || lowerExpr.includes('past hour')) {
      return { from: new Date(now.getTime() - 60 * 60 * 1000), to: now };
    }
    if (
      lowerExpr.includes('last day') ||
      lowerExpr.includes('yesterday') ||
      lowerExpr.includes('past day')
    ) {
      return { from: new Date(now.getTime() - 24 * 60 * 60 * 1000), to: now };
    }
    if (lowerExpr.includes('last week') || lowerExpr.includes('past week')) {
      return {
        from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        to: now,
      };
    }
    if (lowerExpr.includes('last month') || lowerExpr.includes('past month')) {
      return {
        from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        to: now,
      };
    }
    if (lowerExpr.includes('last year') || lowerExpr.includes('past year')) {
      return {
        from: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
        to: now,
      };
    }

    // Default to last week
    return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: now };
  }
}
