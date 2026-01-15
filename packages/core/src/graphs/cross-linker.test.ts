import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FalkorDBAdapter } from '../storage/falkordb.js';
import { CrossLinker, type CrossLinkType } from './cross-linker.js';
import { RelationshipError } from './errors.js';

// Mock FalkorDBAdapter
function createMockDb(): FalkorDBAdapter {
  return {
    query: vi.fn(),
    createNode: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as FalkorDBAdapter;
}

describe('CrossLinker', () => {
  let db: FalkorDBAdapter;
  let crossLinker: CrossLinker;

  beforeEach(() => {
    db = createMockDb();
    crossLinker = new CrossLinker(db);
    vi.clearAllMocks();
  });

  describe('createLink', () => {
    it('should create a cross-graph link', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await crossLinker.createLink(
        'source-uuid',
        'target-uuid',
        'X_REPRESENTS',
      );

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('X_REPRESENTS'),
        expect.objectContaining({
          sourceId: 'source-uuid',
          targetId: 'target-uuid',
          createdAt: expect.any(String),
        }),
      );
    });

    it('should create X_INVOLVES link', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await crossLinker.createLink('event-uuid', 'entity-uuid', 'X_INVOLVES');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('X_INVOLVES'),
        expect.objectContaining({
          sourceId: 'event-uuid',
          targetId: 'entity-uuid',
        }),
      );
    });

    it('should create X_REFERS_TO link', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await crossLinker.createLink('causal-uuid', 'event-uuid', 'X_REFERS_TO');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('X_REFERS_TO'),
        expect.objectContaining({
          sourceId: 'causal-uuid',
          targetId: 'event-uuid',
        }),
      );
    });

    it('should create X_AFFECTS link', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await crossLinker.createLink('causal-uuid', 'entity-uuid', 'X_AFFECTS');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('X_AFFECTS'),
        expect.objectContaining({
          sourceId: 'causal-uuid',
          targetId: 'entity-uuid',
        }),
      );
    });

    it('should throw RelationshipError on database failure', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('DB connection lost'));

      await expect(
        crossLinker.createLink('source', 'target', 'X_REPRESENTS'),
      ).rejects.toThrow(RelationshipError);

      await expect(
        crossLinker.createLink('source', 'target', 'X_REPRESENTS'),
      ).rejects.toThrow('Failed to create cross-graph link');
    });
  });

  describe('removeLink', () => {
    it('should remove a specific cross-graph link', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await crossLinker.removeLink(
        'source-uuid',
        'target-uuid',
        'X_REPRESENTS',
      );

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE r'),
        expect.objectContaining({
          sourceId: 'source-uuid',
          targetId: 'target-uuid',
        }),
      );
    });

    it('should throw RelationshipError on database failure', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('DB error'));

      await expect(
        crossLinker.removeLink('source', 'target', 'X_INVOLVES'),
      ).rejects.toThrow(RelationshipError);

      await expect(
        crossLinker.removeLink('source', 'target', 'X_INVOLVES'),
      ).rejects.toThrow('Failed to remove cross-graph link');
    });
  });

  describe('getLinksFrom', () => {
    it('should return all outgoing cross-graph links', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [
          {
            sourceId: 'source-uuid',
            targetId: 'target-1',
            linkType: 'X_REPRESENTS',
            createdAt: '2024-01-01T00:00:00.000Z',
          },
          {
            sourceId: 'source-uuid',
            targetId: 'target-2',
            linkType: 'X_INVOLVES',
            createdAt: '2024-01-02T00:00:00.000Z',
          },
        ],
        metadata: [],
      });

      const links = await crossLinker.getLinksFrom('source-uuid');

      expect(links).toHaveLength(2);
      expect(links[0]).toMatchObject({
        sourceId: 'source-uuid',
        targetId: 'target-1',
        linkType: 'X_REPRESENTS',
      });
      expect(links[1]).toMatchObject({
        sourceId: 'source-uuid',
        targetId: 'target-2',
        linkType: 'X_INVOLVES',
      });
    });

    it('should return empty array when no links exist', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      const links = await crossLinker.getLinksFrom('orphan-uuid');

      expect(links).toEqual([]);
    });

    it('should parse createdAt date correctly', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [
          {
            sourceId: 'src',
            targetId: 'tgt',
            linkType: 'X_AFFECTS',
            createdAt: '2024-06-15T12:30:00.000Z',
          },
        ],
        metadata: [],
      });

      const links = await crossLinker.getLinksFrom('src');

      expect(links[0].createdAt).toBeInstanceOf(Date);
      expect(links[0].createdAt?.toISOString()).toBe(
        '2024-06-15T12:30:00.000Z',
      );
    });

    it('should handle missing createdAt', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [
          {
            sourceId: 'src',
            targetId: 'tgt',
            linkType: 'X_REFERS_TO',
            createdAt: null,
          },
        ],
        metadata: [],
      });

      const links = await crossLinker.getLinksFrom('src');

      expect(links[0].createdAt).toBeUndefined();
    });

    it('should throw on database error', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Query failed'));

      await expect(crossLinker.getLinksFrom('uuid')).rejects.toThrow(
        'Failed to get links from: uuid',
      );
    });
  });

  describe('getLinksTo', () => {
    it('should return all incoming cross-graph links', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [
          {
            sourceId: 'source-1',
            targetId: 'target-uuid',
            linkType: 'X_AFFECTS',
            createdAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        metadata: [],
      });

      const links = await crossLinker.getLinksTo('target-uuid');

      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({
        sourceId: 'source-1',
        targetId: 'target-uuid',
        linkType: 'X_AFFECTS',
      });
    });

    it('should return empty array when no incoming links', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      const links = await crossLinker.getLinksTo('isolated-uuid');

      expect(links).toEqual([]);
    });

    it('should throw on database error', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Query failed'));

      await expect(crossLinker.getLinksTo('uuid')).rejects.toThrow(
        'Failed to get links to: uuid',
      );
    });
  });

  describe('findOrphans', () => {
    it('should return nodes with no cross-graph links', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [
          { uuid: 'orphan-1' },
          { uuid: 'orphan-2' },
          { uuid: 'orphan-3' },
        ],
        metadata: [],
      });

      const orphans = await crossLinker.findOrphans();

      expect(orphans).toEqual(['orphan-1', 'orphan-2', 'orphan-3']);
    });

    it('should return empty array when all nodes are linked', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      const orphans = await crossLinker.findOrphans();

      expect(orphans).toEqual([]);
    });

    it('should throw on database error', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Query failed'));

      await expect(crossLinker.findOrphans()).rejects.toThrow(
        'Failed to find orphan nodes',
      );
    });
  });

  describe('getLinksByType', () => {
    it('should return all links of X_REPRESENTS type', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [
          {
            sourceId: 'concept-1',
            targetId: 'entity-1',
            linkType: 'X_REPRESENTS',
            createdAt: '2024-01-01T00:00:00.000Z',
          },
          {
            sourceId: 'concept-2',
            targetId: 'entity-2',
            linkType: 'X_REPRESENTS',
            createdAt: '2024-01-02T00:00:00.000Z',
          },
        ],
        metadata: [],
      });

      const links = await crossLinker.getLinksByType('X_REPRESENTS');

      expect(links).toHaveLength(2);
      expect(links.every((l) => l.linkType === 'X_REPRESENTS')).toBe(true);
    });

    it('should return empty array when no links of type exist', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      const links = await crossLinker.getLinksByType('X_INVOLVES');

      expect(links).toEqual([]);
    });

    it('should query with correct link type', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await crossLinker.getLinksByType('X_AFFECTS');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('X_AFFECTS'),
        {},
      );
    });

    it('should throw on database error', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Query failed'));

      await expect(crossLinker.getLinksByType('X_REFERS_TO')).rejects.toThrow(
        'Failed to get links by type: X_REFERS_TO',
      );
    });
  });

  describe('hasLink', () => {
    it('should return true when link exists', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [{ count: 1 }],
        metadata: [],
      });

      const exists = await crossLinker.hasLink(
        'source-uuid',
        'target-uuid',
        'X_REPRESENTS',
      );

      expect(exists).toBe(true);
    });

    it('should return false when link does not exist', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [{ count: 0 }],
        metadata: [],
      });

      const exists = await crossLinker.hasLink(
        'source-uuid',
        'target-uuid',
        'X_INVOLVES',
      );

      expect(exists).toBe(false);
    });

    it('should handle empty result', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [],
        metadata: [],
      });

      const exists = await crossLinker.hasLink('a', 'b', 'X_AFFECTS');

      expect(exists).toBe(false);
    });

    it('should throw on database error', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Query failed'));

      await expect(
        crossLinker.hasLink('a', 'b', 'X_REPRESENTS'),
      ).rejects.toThrow('Failed to check link existence');
    });
  });

  describe('getStatistics', () => {
    it('should return counts for all link types', async () => {
      // Mock responses for each link type query
      vi.mocked(db.query)
        .mockResolvedValueOnce({ records: [{ count: 5 }], metadata: [] }) // X_REPRESENTS
        .mockResolvedValueOnce({ records: [{ count: 10 }], metadata: [] }) // X_INVOLVES
        .mockResolvedValueOnce({ records: [{ count: 3 }], metadata: [] }) // X_REFERS_TO
        .mockResolvedValueOnce({ records: [{ count: 7 }], metadata: [] }); // X_AFFECTS

      const stats = await crossLinker.getStatistics();

      expect(stats).toEqual({
        X_REPRESENTS: 5,
        X_INVOLVES: 10,
        X_REFERS_TO: 3,
        X_AFFECTS: 7,
      });
    });

    it('should return zeros when no links exist', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [{ count: 0 }],
        metadata: [],
      });

      const stats = await crossLinker.getStatistics();

      expect(stats).toEqual({
        X_REPRESENTS: 0,
        X_INVOLVES: 0,
        X_REFERS_TO: 0,
        X_AFFECTS: 0,
      });
    });

    it('should handle empty records', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [],
        metadata: [],
      });

      const stats = await crossLinker.getStatistics();

      expect(stats).toEqual({
        X_REPRESENTS: 0,
        X_INVOLVES: 0,
        X_REFERS_TO: 0,
        X_AFFECTS: 0,
      });
    });

    it('should throw on database error', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Query failed'));

      await expect(crossLinker.getStatistics()).rejects.toThrow(
        'Failed to get link statistics',
      );
    });
  });

  describe('removeAllLinksFrom', () => {
    it('should remove all outgoing links and return count', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [{ deleted: 3 }],
        metadata: [],
      });

      const deleted = await crossLinker.removeAllLinksFrom('source-uuid');

      expect(deleted).toBe(3);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE r'),
        { sourceId: 'source-uuid' },
      );
    });

    it('should return 0 when no links to remove', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [{ deleted: 0 }],
        metadata: [],
      });

      const deleted = await crossLinker.removeAllLinksFrom('orphan-uuid');

      expect(deleted).toBe(0);
    });

    it('should handle empty result', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [],
        metadata: [],
      });

      const deleted = await crossLinker.removeAllLinksFrom('uuid');

      expect(deleted).toBe(0);
    });

    it('should throw on database error', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Query failed'));

      await expect(crossLinker.removeAllLinksFrom('uuid')).rejects.toThrow(
        'Failed to remove links from: uuid',
      );
    });
  });

  describe('removeAllLinksTo', () => {
    it('should remove all incoming links and return count', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [{ deleted: 5 }],
        metadata: [],
      });

      const deleted = await crossLinker.removeAllLinksTo('target-uuid');

      expect(deleted).toBe(5);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE r'),
        { targetId: 'target-uuid' },
      );
    });

    it('should return 0 when no incoming links', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [{ deleted: 0 }],
        metadata: [],
      });

      const deleted = await crossLinker.removeAllLinksTo('isolated-uuid');

      expect(deleted).toBe(0);
    });

    it('should handle empty result', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [],
        metadata: [],
      });

      const deleted = await crossLinker.removeAllLinksTo('uuid');

      expect(deleted).toBe(0);
    });

    it('should throw on database error', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Query failed'));

      await expect(crossLinker.removeAllLinksTo('uuid')).rejects.toThrow(
        'Failed to remove links to: uuid',
      );
    });
  });

  describe('link type validation', () => {
    const validLinkTypes: CrossLinkType[] = [
      'X_REPRESENTS',
      'X_INVOLVES',
      'X_REFERS_TO',
      'X_AFFECTS',
    ];

    it.each(
      validLinkTypes,
    )('should accept %s as valid link type', async (linkType) => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await expect(
        crossLinker.createLink('source', 'target', linkType),
      ).resolves.not.toThrow();
    });
  });
});
