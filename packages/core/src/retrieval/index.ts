/**
 * MAGMA Retrieval Components
 *
 * These components implement the MAGMA-style retrieval pattern:
 * "Vectors locate. Graphs explain. Policies decide how to think."
 */

export {
  ContextLinearizer,
  type LinearizedContext,
  type OrderingStrategy,
} from './context-linearizer.js';
export {
  filterSeedsByScore,
  getEntityIds,
  type SeedEntity,
  type SeedExtractionResult,
  seedFromSemantic,
  seedFromSemanticBatch,
} from './seed-extractor.js';
export { type MergerOptions, SubgraphMerger } from './subgraph-merger.js';
