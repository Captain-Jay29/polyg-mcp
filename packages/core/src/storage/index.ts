// Storage adapters and types
export { FalkorDBAdapter } from './falkordb.js';
export {
  ConnectionState,
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

// Error types
export {
  StorageError,
  StorageConfigError,
  ConnectionError,
  QueryError,
  ValidationError,
  NotFoundError,
  TimeoutError,
  isStorageError,
  wrapError,
} from './errors.js';
