import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FalkorDBAdapter } from '../storage/falkordb.js';
import { GraphParseError, TemporalError } from './errors.js';
import { TemporalGraph } from './temporal.js';

// Mock FalkorDBAdapter
function createMockDb(): FalkorDBAdapter {
  return {
    query: vi.fn(),
    createNode: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as FalkorDBAdapter;
}

// Helper to create a mock event node
function mockEventNode(props: Record<string, unknown> = {}) {
  return {
    properties: {
      uuid: 'event-uuid-123',
      description: 'Test event occurred',
      occurred_at: '2024-06-15T10:00:00.000Z',
      ...props,
    },
  };
}

// Helper to create a mock fact node
function mockFactNode(props: Record<string, unknown> = {}) {
  return {
    properties: {
      uuid: 'fact-uuid-456',
      subject: 'Alice',
      predicate: 'works_at',
      object: 'Acme Corp',
      valid_from: '2024-01-01T00:00:00.000Z',
      ...props,
    },
  };
}

describe('TemporalGraph', () => {
  let db: FalkorDBAdapter;
  let graph: TemporalGraph;

  beforeEach(() => {
    db = createMockDb();
    graph = new TemporalGraph(db);
    vi.clearAllMocks();
  });

  describe('addEvent', () => {
    it('should create a new event', async () => {
      vi.mocked(db.createNode).mockResolvedValue('new-event-uuid');
      const occurredAt = new Date('2024-06-15T10:00:00.000Z');

      const event = await graph.addEvent('Meeting happened', occurredAt);

      expect(db.createNode).toHaveBeenCalledWith('T_Event', {
        description: 'Meeting happened',
        occurred_at: occurredAt.toISOString(),
      });
      expect(event).toMatchObject({
        uuid: 'new-event-uuid',
        description: 'Meeting happened',
        occurred_at: occurredAt,
      });
    });

    it('should create event with duration', async () => {
      vi.mocked(db.createNode).mockResolvedValue('uuid');

      const event = await graph.addEvent(
        'Long meeting',
        new Date(),
        3600, // 1 hour in seconds
      );

      expect(db.createNode).toHaveBeenCalledWith(
        'T_Event',
        expect.objectContaining({ duration: 3600 }),
      );
      expect(event.duration).toBe(3600);
    });

    it('should throw on database error', async () => {
      vi.mocked(db.createNode).mockRejectedValue(new Error('DB error'));

      await expect(graph.addEvent('Event', new Date())).rejects.toThrow(
        'Failed to add event',
      );
    });
  });

  describe('addFact', () => {
    it('should create a time-bounded fact', async () => {
      vi.mocked(db.createNode).mockResolvedValue('fact-uuid');
      const validFrom = new Date('2024-01-01');

      const fact = await graph.addFact('Alice', 'works_at', 'Acme', validFrom);

      expect(db.createNode).toHaveBeenCalledWith('T_Fact', {
        subject: 'Alice',
        predicate: 'works_at',
        object: 'Acme',
        valid_from: validFrom.toISOString(),
      });
      expect(fact).toMatchObject({
        uuid: 'fact-uuid',
        subject: 'Alice',
        predicate: 'works_at',
        object: 'Acme',
        valid_from: validFrom,
        valid_to: undefined,
      });
    });

    it('should create fact with end date', async () => {
      vi.mocked(db.createNode).mockResolvedValue('uuid');
      const validFrom = new Date('2024-01-01');
      const validTo = new Date('2024-12-31');

      const fact = await graph.addFact(
        'Bob',
        'employed_at',
        'Corp',
        validFrom,
        validTo,
      );

      expect(db.createNode).toHaveBeenCalledWith(
        'T_Fact',
        expect.objectContaining({ valid_to: validTo.toISOString() }),
      );
      expect(fact.valid_to).toEqual(validTo);
    });
  });

  describe('queryTimeline', () => {
    it('should return events in chronological order', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [
          { e: mockEventNode({ occurred_at: '2024-06-15T09:00:00Z' }) },
          { e: mockEventNode({ occurred_at: '2024-06-15T10:00:00Z' }) },
        ],
        metadata: [],
      });

      const events = await graph.queryTimeline(
        new Date('2024-06-01'),
        new Date('2024-06-30'),
      );

      expect(events).toHaveLength(2);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY'),
        expect.objectContaining({
          from: expect.any(String),
          to: expect.any(String),
        }),
      );
    });

    it('should filter by entity when provided', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await graph.queryTimeline(new Date(), new Date(), 'entity-uuid');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('X_INVOLVES'),
        expect.objectContaining({ entityId: 'entity-uuid' }),
      );
    });

    it('should throw TemporalError on query failure', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Query failed'));

      await expect(graph.queryTimeline(new Date(), new Date())).rejects.toThrow(
        TemporalError,
      );
    });
  });

  describe('getFactsAt', () => {
    it('should return facts valid at a specific point in time', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [
          { f: mockFactNode({ valid_from: '2024-01-01' }) }, // No valid_to means still valid
          {
            f: mockFactNode({
              valid_from: '2024-03-01',
              valid_to: '2024-12-31',
            }),
          },
        ],
        metadata: [],
      });

      const facts = await graph.getFactsAt(new Date('2024-06-15'));

      expect(facts).toHaveLength(2);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('valid_from'),
        expect.objectContaining({ time: expect.any(String) }),
      );
    });
  });

  describe('getFactsInRange', () => {
    it('should return facts overlapping with time range', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [{ f: mockFactNode() }],
        metadata: [],
      });

      const facts = await graph.getFactsInRange(
        new Date('2024-01-01'),
        new Date('2024-12-31'),
      );

      expect(facts).toHaveLength(1);
    });
  });

  describe('query (with Timeframe)', () => {
    it('should handle specific timeframe type', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      const result = await graph.query({
        type: 'specific',
        value: '2024-06-15T10:00:00Z',
      });

      expect(result).toHaveProperty('events');
      expect(result).toHaveProperty('facts');
    });

    it('should handle range timeframe type', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await graph.query({
        type: 'range',
        value: '2024-01-01',
        end: '2024-12-31',
      });

      expect(db.query).toHaveBeenCalled();
    });

    it('should handle relative timeframe "last week"', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      const result = await graph.query({
        type: 'relative',
        value: 'last week',
      });

      expect(result).toBeDefined();
    });

    it('should handle relative timeframe "last month"', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await graph.query({ type: 'relative', value: 'last month' });

      expect(db.query).toHaveBeenCalled();
    });

    it('should handle relative timeframe "past year"', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await graph.query({ type: 'relative', value: 'past year' });

      expect(db.query).toHaveBeenCalled();
    });
  });

  describe('getEvent', () => {
    it('should return event by UUID', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [{ e: mockEventNode() }],
        metadata: [],
      });

      const event = await graph.getEvent('event-uuid-123');

      expect(event?.uuid).toBe('event-uuid-123');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('uuid: $id'),
        expect.objectContaining({ id: 'event-uuid-123' }),
      );
    });

    it('should return event by description when UUID not found', async () => {
      // First call (UUID lookup) returns empty, second call (description lookup) returns event
      vi.mocked(db.query)
        .mockResolvedValueOnce({ records: [], metadata: [] })
        .mockResolvedValueOnce({
          records: [{ e: mockEventNode() }],
          metadata: [],
        });

      const event = await graph.getEvent('Test event occurred');

      expect(event?.uuid).toBe('event-uuid-123');
      expect(event?.description).toBe('Test event occurred');
      // Should have made two queries: first by UUID, then by description
      expect(db.query).toHaveBeenCalledTimes(2);
      expect(db.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('description: $description'),
        expect.objectContaining({ description: 'Test event occurred' }),
      );
    });

    it('should return null for nonexistent event', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      const event = await graph.getEvent('nonexistent');

      expect(event).toBeNull();
    });

    it('should prioritize UUID lookup over description', async () => {
      // If UUID matches, should not try description lookup
      vi.mocked(db.query).mockResolvedValueOnce({
        records: [{ e: mockEventNode() }],
        metadata: [],
      });

      await graph.getEvent('event-uuid-123');

      // Should only have made one query (UUID lookup succeeded)
      expect(db.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('getFact', () => {
    it('should return fact by UUID', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [{ f: mockFactNode() }],
        metadata: [],
      });

      const fact = await graph.getFact('fact-uuid');

      expect(fact?.subject).toBe('Alice');
      expect(fact?.predicate).toBe('works_at');
    });

    it('should return null for nonexistent fact', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      const fact = await graph.getFact('nonexistent');

      expect(fact).toBeNull();
    });
  });

  describe('invalidateFact', () => {
    it('should set valid_to date on fact', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });
      const invalidAt = new Date('2024-06-01');

      await graph.invalidateFact('fact-uuid', invalidAt);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('SET'),
        expect.objectContaining({
          uuid: 'fact-uuid',
          validTo: invalidAt.toISOString(),
        }),
      );
    });

    it('should use current date if not provided', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await graph.invalidateFact('fact-uuid');

      expect(db.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ validTo: expect.any(String) }),
      );
    });
  });

  describe('linkEventToEntity', () => {
    it('should create cross-graph relationship', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await graph.linkEventToEntity('event-uuid', 'entity-uuid');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('X_INVOLVES'),
        expect.objectContaining({
          eventId: 'event-uuid',
          entityId: 'entity-uuid',
        }),
      );
    });

    it('should throw RelationshipError on failure', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Link failed'));

      await expect(graph.linkEventToEntity('event', 'entity')).rejects.toThrow(
        'Failed to link event to entity',
      );
    });
  });

  describe('linkFactToEntity', () => {
    it('should create cross-graph relationship from fact to entity', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await graph.linkFactToEntity('fact-uuid', 'entity-uuid');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('X_INVOLVES'),
        expect.objectContaining({
          factId: 'fact-uuid',
          entityId: 'entity-uuid',
        }),
      );
    });

    it('should include T_Fact label in query', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await graph.linkFactToEntity('fact-uuid', 'entity-uuid');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('T_Fact'),
        expect.any(Object),
      );
    });

    it('should throw RelationshipError on failure', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Link failed'));

      await expect(graph.linkFactToEntity('fact', 'entity')).rejects.toThrow(
        'Failed to link fact to entity',
      );
    });
  });

  describe('error handling', () => {
    it('should wrap parse errors in GraphParseError', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [{ e: { properties: {} } }], // Missing required fields
        metadata: [],
      });

      await expect(graph.getEvent('uuid')).rejects.toThrow(GraphParseError);
    });
  });
});
