// Graph implementations
export { SemanticGraph } from './semantic.js';
export { TemporalGraph } from './temporal.js';
export { CausalGraph } from './causal.js';
export { EntityGraph } from './entity.js';
export { CrossLinker } from './cross-linker.js';
export type { EntityRelationship } from './entity.js';
export type { CrossLink, CrossLinkType } from './cross-linker.js';
export type { CausalNode } from './parsers.js';

// Graph errors - for MCP to catch and display appropriately
export {
  GraphError,
  EntityNotFoundError,
  EntityResolutionError,
  GraphQueryError,
  GraphParseError,
  EmbeddingGenerationError,
  RelationshipError,
  TemporalError,
  CausalTraversalError,
  isGraphError,
  wrapGraphError,
} from './errors.js';
