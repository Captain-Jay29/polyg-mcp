/**
 * Simple logger utility for consistent logging across the codebase.
 * Provides structured logging with configurable levels.
 *
 * Can be extended to integrate with external logging services (Winston, Pino, etc.)
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  error?: Error;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(
    message: string,
    error?: Error,
    metadata?: Record<string, unknown>,
  ): void;
}

// Log level priority (higher = more severe)
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Default minimum log level (can be configured via environment)
let minLogLevel: LogLevel = 'info';

/**
 * Set the minimum log level. Messages below this level will be suppressed.
 */
export function setLogLevel(level: LogLevel): void {
  minLogLevel = level;
}

/**
 * Get the current minimum log level
 */
export function getLogLevel(): LogLevel {
  return minLogLevel;
}

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLogLevel];
}

/**
 * Format a log entry for console output
 */
function formatLogEntry(entry: LogEntry): string {
  const parts = [`[${entry.context || 'polyg'}]`, entry.message];

  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    parts.push(JSON.stringify(entry.metadata));
  }

  if (entry.error) {
    parts.push(`Error: ${entry.error.message}`);
  }

  return parts.join(' ');
}

/**
 * Create a logger instance with a specific context
 */
export function createLogger(context: string): Logger {
  return {
    debug(message: string, metadata?: Record<string, unknown>): void {
      if (!shouldLog('debug')) return;
      const entry: LogEntry = {
        level: 'debug',
        message,
        context,
        metadata,
        timestamp: new Date(),
      };
      console.debug(formatLogEntry(entry));
    },

    info(message: string, metadata?: Record<string, unknown>): void {
      if (!shouldLog('info')) return;
      const entry: LogEntry = {
        level: 'info',
        message,
        context,
        metadata,
        timestamp: new Date(),
      };
      console.info(formatLogEntry(entry));
    },

    warn(message: string, metadata?: Record<string, unknown>): void {
      if (!shouldLog('warn')) return;
      const entry: LogEntry = {
        level: 'warn',
        message,
        context,
        metadata,
        timestamp: new Date(),
      };
      console.warn(formatLogEntry(entry));
    },

    error(
      message: string,
      error?: Error,
      metadata?: Record<string, unknown>,
    ): void {
      if (!shouldLog('error')) return;
      const entry: LogEntry = {
        level: 'error',
        message,
        context,
        error,
        metadata,
        timestamp: new Date(),
      };
      console.error(formatLogEntry(entry));
    },
  };
}

// Pre-configured loggers for common contexts
export const loggers = {
  storage: createLogger('FalkorDB'),
  executor: createLogger('MAGMAExecutor'),
  agents: createLogger('Agents'),
  http: createLogger('HTTP'),
  session: createLogger('Session'),
  parser: createLogger('Parser'),
  tools: createLogger('Tools'),
};
