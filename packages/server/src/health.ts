// Health check endpoint
import type { FalkorDBAdapter } from '@polyg-mcp/core';
import { loggers } from '@polyg-mcp/shared';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  falkordb: 'connected' | 'disconnected';
  graphs: number;
  uptime: number;
}

export class HealthChecker {
  private startTime: number;

  constructor(private db: FalkorDBAdapter) {
    this.startTime = Date.now();
  }

  async check(): Promise<HealthStatus> {
    const dbConnected = await this.db.healthCheck().catch((error) => {
      loggers.storage.warn('Database health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    });

    return {
      status: dbConnected ? 'ok' : 'error',
      falkordb: dbConnected ? 'connected' : 'disconnected',
      graphs: 4, // semantic, temporal, causal, entity
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }
}
