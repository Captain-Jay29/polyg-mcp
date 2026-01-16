import { DEFAULT_CONFIG, type PolygConfig } from '@polyg-mcp/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionLimitError } from './errors.js';
import { SessionManager } from './session-manager.js';
import { SharedResources } from './shared-resources.js';

// Test config with mock API key
const TEST_CONFIG: PolygConfig = {
  ...DEFAULT_CONFIG,
  llm: {
    ...DEFAULT_CONFIG.llm,
    apiKey: 'test-api-key-for-testing-only',
  },
};

describe('SessionManager', () => {
  let resources: SharedResources;

  beforeEach(async () => {
    resources = new SharedResources(TEST_CONFIG);
    await resources.start();
  });

  afterEach(async () => {
    await resources.stop();
  });

  describe('constructor', () => {
    it('should create session manager with default options', () => {
      const manager = new SessionManager(resources);
      expect(manager).toBeDefined();
      expect(manager.getActiveCount()).toBe(0);
      expect(manager.getMaxSessions()).toBe(100);
      manager.shutdown();
    });

    it('should create session manager with custom options', () => {
      const manager = new SessionManager(resources, {
        sessionTimeoutMs: 60000,
        cleanupIntervalMs: 10000,
        maxSessions: 50,
      });
      expect(manager.getMaxSessions()).toBe(50);
      manager.shutdown();
    });
  });

  describe('createSession', () => {
    it('should create a new session', async () => {
      const manager = new SessionManager(resources);

      const session = await manager.createSession();

      expect(session.sessionId).toBeDefined();
      expect(session.mcpServer).toBeDefined();
      expect(session.transport).toBeDefined();
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastActivity).toBeInstanceOf(Date);
      expect(manager.getActiveCount()).toBe(1);

      await manager.shutdown();
    });

    it('should create unique session IDs', async () => {
      const manager = new SessionManager(resources);

      const session1 = await manager.createSession();
      const session2 = await manager.createSession();

      expect(session1.sessionId).not.toBe(session2.sessionId);
      expect(manager.getActiveCount()).toBe(2);

      await manager.shutdown();
    });

    it('should throw SessionLimitError when max sessions reached', async () => {
      const manager = new SessionManager(resources, { maxSessions: 2 });

      await manager.createSession();
      await manager.createSession();

      await expect(manager.createSession()).rejects.toThrow(SessionLimitError);
      await expect(manager.createSession()).rejects.toThrow(
        'maximum 2 sessions',
      );

      await manager.shutdown();
    });
  });

  describe('getSession', () => {
    it('should return existing session by ID', async () => {
      const manager = new SessionManager(resources);

      const created = await manager.createSession();
      const retrieved = manager.getSession(created.sessionId);

      expect(retrieved).toBe(created);

      await manager.shutdown();
    });

    it('should return undefined for non-existent session', async () => {
      const manager = new SessionManager(resources);

      const result = manager.getSession('non-existent-id');

      expect(result).toBeUndefined();

      await manager.shutdown();
    });
  });

  describe('touchSession', () => {
    it('should update lastActivity timestamp', async () => {
      const manager = new SessionManager(resources);

      const session = await manager.createSession();
      const originalActivity = session.lastActivity;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      manager.touchSession(session.sessionId);

      expect(session.lastActivity.getTime()).toBeGreaterThan(
        originalActivity.getTime(),
      );

      await manager.shutdown();
    });

    it('should not error for non-existent session', async () => {
      const manager = new SessionManager(resources);

      // Should not throw
      manager.touchSession('non-existent-id');

      await manager.shutdown();
    });
  });

  describe('removeSession', () => {
    it('should remove existing session', async () => {
      const manager = new SessionManager(resources);

      const session = await manager.createSession();
      expect(manager.getActiveCount()).toBe(1);

      await manager.removeSession(session.sessionId);

      expect(manager.getActiveCount()).toBe(0);
      expect(manager.getSession(session.sessionId)).toBeUndefined();

      await manager.shutdown();
    });

    it('should not error for non-existent session', async () => {
      const manager = new SessionManager(resources);

      await manager.removeSession('non-existent-id');

      expect(manager.getActiveCount()).toBe(0);

      await manager.shutdown();
    });
  });

  describe('shutdown', () => {
    it('should remove all sessions', async () => {
      const manager = new SessionManager(resources);

      await manager.createSession();
      await manager.createSession();
      await manager.createSession();
      expect(manager.getActiveCount()).toBe(3);

      await manager.shutdown();

      expect(manager.getActiveCount()).toBe(0);
    });
  });

  describe('session cleanup', () => {
    it('should clean up expired sessions', async () => {
      const manager = new SessionManager(resources, {
        sessionTimeoutMs: 50, // Very short timeout
        cleanupIntervalMs: 25,
      });

      const session = await manager.createSession();
      expect(manager.getActiveCount()).toBe(1);

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(manager.getActiveCount()).toBe(0);
      expect(manager.getSession(session.sessionId)).toBeUndefined();

      await manager.shutdown();
    });

    it('should not clean up active sessions', async () => {
      const manager = new SessionManager(resources, {
        sessionTimeoutMs: 200,
        cleanupIntervalMs: 50,
      });

      const session = await manager.createSession();
      expect(manager.getActiveCount()).toBe(1);

      // Touch the session to keep it active
      await new Promise((resolve) => setTimeout(resolve, 60));
      manager.touchSession(session.sessionId);

      // Wait a bit more
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Session should still exist
      expect(manager.getActiveCount()).toBe(1);
      expect(manager.getSession(session.sessionId)).toBeDefined();

      await manager.shutdown();
    });
  });

  describe('metrics', () => {
    it('should track active session count', async () => {
      const manager = new SessionManager(resources);

      expect(manager.getActiveCount()).toBe(0);

      const s1 = await manager.createSession();
      expect(manager.getActiveCount()).toBe(1);

      const s2 = await manager.createSession();
      expect(manager.getActiveCount()).toBe(2);

      await manager.removeSession(s1.sessionId);
      expect(manager.getActiveCount()).toBe(1);

      await manager.removeSession(s2.sessionId);
      expect(manager.getActiveCount()).toBe(0);

      await manager.shutdown();
    });

    it('should report max sessions', async () => {
      const manager = new SessionManager(resources, { maxSessions: 42 });

      expect(manager.getMaxSessions()).toBe(42);

      await manager.shutdown();
    });
  });
});
