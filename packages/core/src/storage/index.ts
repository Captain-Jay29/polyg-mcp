// Storage adapters and types

// Error types
export {
  ConnectionError,
  isStorageError,
  NotFoundError,
  QueryError,
  StorageConfigError,
  StorageError,
  TimeoutError,
  ValidationError,
  wrapError,
} from './errors.js';
export {
  ConnectionState,
  FalkorDBAdapter,
  type NodeData,
  type StorageQueryResult,
  type StorageStatistics,
} from './falkordb.js';
// Storage interface for abstraction
export {
  type IStorageAdapter,
  isValidIdentifier,
  sanitizeIdentifier,
} from './interface.js';
