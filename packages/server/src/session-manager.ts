// SessionManager - Manages per-session McpServer instances with automatic cleanup
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SessionLimitError, SessionNotFoundError } from './errors.js';
import { createMcpServer } from './mcp-server-factory.js';
import type { SharedResources } from './shared-resources.js';

/**
 * Configuration options for SessionManager
 */
export interface SessionManagerOptions {
  /** Session inactivity timeout in milliseconds (default: 1800000 = 30 min) */
  sessionTimeoutMs?: number;
  /** Cleanup timer interval in milliseconds (default: 300000 = 5 min) */
  cleanupIntervalMs?: number;
  /** Maximum concurrent sessions (default: 100) */
  maxSessions?: number;
}

/**
 * Context for a single session
 */
export interface SessionContext {
  sessionId: string;
  transport: StreamableHTTPServerTransport;
  mcpServer: McpServer;
  createdAt: Date;
  lastActivity: Date;
}

// Default configuration values
const DEFAULT_SESSION_TIMEOUT_MS = 1800000; // 30 minutes
const DEFAULT_CLEANUP_INTERVAL_MS = 300000; // 5 minutes
const DEFAULT_MAX_SESSIONS = 100;

/**
 * SessionManager manages per-session McpServer instances.
 * Each client connection gets its own McpServer while sharing expensive resources.
 */
export class SessionManager {
  private readonly sessions = new Map<string, SessionContext>();
  private readonly sharedResources: SharedResources;
  private readonly sessionTimeoutMs: number;
  private readonly cleanupIntervalMs: number;
  private readonly maxSessions: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(sharedResources: SharedResources, options: SessionManagerOptions = {}) {
    this.sharedResources = sharedResources;
    this.sessionTimeoutMs = options.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS;
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;

    // Start cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Create a new session
   * @throws {SessionLimitError} if maximum sessions reached
   */
  async createSession(): Promise<SessionContext> {
    // Check session limit
    if (this.sessions.size >= this.maxSessions) {
      throw new SessionLimitError(this.maxSessions);
    }

    const sessionId = randomUUID();
    const now = new Date();

    // Create McpServer for this session
    const mcpServer = createMcpServer(this.sharedResources);

    // Create transport for this session
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
    });

    // Connect the McpServer to the transport
    await mcpServer.connect(transport);

    const context: SessionContext = {
      sessionId,
      transport,
      mcpServer,
      createdAt: now,
      lastActivity: now,
    };

    this.sessions.set(sessionId, context);
    return context;
  }

  /**
   * Get an existing session by ID
   */
  getSession(sessionId: string): SessionContext | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Update the lastActivity timestamp for a session
   */
  touchSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
  }

  /**
   * Remove a session and clean up its resources
   */
  async removeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const errors: Error[] = [];

    // Close the MCP server if connected
    if (session.mcpServer.isConnected()) {
      try {
        await session.mcpServer.close();
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Close the transport
    try {
      await session.transport.close();
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    this.sessions.delete(sessionId);

    // Log errors but don't throw - we want to continue cleanup
    if (errors.length > 0) {
      console.warn(`Errors removing session ${sessionId}:`, errors.map(e => e.message).join('; '));
    }
  }

  /**
   * Get the number of active sessions
   */
  getActiveCount(): number {
    return this.sessions.size;
  }

  /**
   * Get the maximum number of sessions
   */
  getMaxSessions(): number {
    return this.maxSessions;
  }

  /**
   * Shutdown all sessions and stop the cleanup timer
   */
  async shutdown(): Promise<void> {
    // Stop cleanup timer
    this.stopCleanupTimer();

    // Remove all sessions
    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map(id => this.removeSession(id)));
  }

  /**
   * Start the background cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      return;
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.cleanupIntervalMs);

    // Allow the process to exit even if this timer is running
    this.cleanupTimer.unref();
  }

  /**
   * Stop the background cleanup timer
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Clean up sessions that have been inactive for too long
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      const inactiveTime = now - session.lastActivity.getTime();
      if (inactiveTime > this.sessionTimeoutMs) {
        expiredSessions.push(sessionId);
      }
    }

    // Remove expired sessions asynchronously
    for (const sessionId of expiredSessions) {
      this.removeSession(sessionId).catch(error => {
        console.error(`Error cleaning up expired session ${sessionId}:`, error);
      });
    }

    if (expiredSessions.length > 0) {
      console.log(`Cleaned up ${expiredSessions.length} expired session(s)`);
    }
  }
}
