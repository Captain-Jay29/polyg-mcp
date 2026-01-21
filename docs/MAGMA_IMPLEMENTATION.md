# MAGMA-Style Retrieval Implementation

## Core Principle

> **"Vectors locate. Graphs explain. Policies decide how to think."**

- **LLM** = Planner (intent, depth hints, synthesis)
- **Graphs** = Executor (deterministic, parallel, explainable)

---

## Audit: Current State vs MAGMA

| Component | Current State | MAGMA Alignment | Action |
|-----------|---------------|-----------------|--------|
| **Orchestrator** | MAGMA cascading flow | ✅ ALIGNED | Completed in Phase 5 |
| **Intent Classifier** | WHY/WHEN/WHO/WHAT + depth hints | ✅ ALIGNED | Completed in Phase 3 |
| **Cross-Linker** | X_ relationships used via seedFromSemantic | ✅ ALIGNED | Completed in Phase 2/4 |
| **Graph Methods** | Basic operations work | PARTIAL | Add seed-accepting variants |
| **MCP Tools** | 15 tools (9 write/admin + 6 MAGMA retrieval) | ✅ ALIGNED | Completed in Phase 6 |
| **Types** | MAGMAIntent, DepthHints, GraphView, etc. | ✅ ALIGNED | Completed in Phase 1 |

### Architecture (Implemented)

```
MAGMA:    Query → Classifier → Semantic → [Entity ‖ Temporal ‖ Causal] → Merge → Linearize → Synthesize
                    (WHY/WHEN)    (seeds)     (from seeds, depth varies)
```

**Cross-links are now used via `seedFromSemantic()` to extract entity IDs from semantic matches.**

---

## Architecture Flow

```
Query
  │
  ├──────────────────────────────────┐
  │                                  │
  ▼                                  ▼
┌─────────────────┐          ┌─────────────────┐
│ Intent Analyze  │          │ Semantic Search │
│ (LLM)           │          │ (Vector)        │
│                 │          │                 │
│ Output:         │          │ Output:         │
│ - WHY/WHEN/WHO  │          │ - Top-K seeds   │
│ - Depth hints   │          │ - Linked nodes  │
└────────┬────────┘          └────────┬────────┘
         │                            │
         └──────────┬─────────────────┘
                    │
                    ▼
    ┌───────────────────────────────────┐
    │     Adaptive Graph Traversal      │
    │     (PARALLEL from seeds)         │
    │                                   │
    │  ┌─────────┐ ┌─────────┐ ┌─────────┐
    │  │ Entity  │ │Temporal │ │ Causal  │
    │  │ Expand  │ │ Expand  │ │ Expand  │
    │  │         │ │         │ │         │
    │  │ depth=N │ │ depth=N │ │ depth=N │
    │  └─────────┘ └─────────┘ └─────────┘
    │     (depth varies by intent)      │
    └───────────────┬───────────────────┘
                    │
                    ▼
    ┌───────────────────────────────────┐
    │     Subgraph Merge & Prune        │
    │     (CPU-only)                    │
    │                                   │
    │  - Combine all graph views        │
    │  - Boost nodes in 2+ views        │
    │  - Prune low-relevance nodes      │
    └───────────────┬───────────────────┘
                    │
                    ▼
    ┌───────────────────────────────────┐
    │     Context Linearization         │
    │     (String formatting)           │
    │                                   │
    │  WHY  → causal chain order        │
    │  WHEN → temporal order            │
    │  WHO  → entity grouping           │
    └───────────────┬───────────────────┘
                    │
                    ▼
    ┌───────────────────────────────────┐
    │     LLM Synthesis                 │
    │     (Answer generation)           │
    └───────────────────────────────────┘
```

---

## Intent-Based Traversal Depth

| Intent | Entity | Temporal | Causal |
|--------|--------|----------|--------|
| WHY    | 1      | 1        | **3**  |
| WHEN   | 1      | **3**    | 1      |
| WHO    | **3**  | 1        | 1      |
| WHAT   | **3**  | 1        | 1      |
| EXPLORE| 2      | 2        | 2      |

---

## What We Have vs What We Build

### Already Have (Reuse as-is)
| Component | Location | Status |
|-----------|----------|--------|
| `SemanticGraph.search()` | `core/graphs/semantic.ts` | Works - returns top-K matches |
| `EntityGraph.getRelationships()` | `core/graphs/entity.ts` | Works - returns 1-hop relations |
| `TemporalGraph.query()` | `core/graphs/temporal.ts` | Works - time-range queries |
| `CausalGraph.traverse()` | `core/graphs/causal.ts` | Works - **has maxDepth param** |
| `CrossLinker.getLinksFrom/To()` | `core/graphs/cross-linker.ts` | Works - **unused in recall** |
| `Synthesizer` | `core/agents/synthesizer.ts` | Works - answer generation |

### Built (Completed) ✅
| Component | Location | Purpose |
|-----------|----------|---------|
| `SubgraphMerger` | `core/retrieval/subgraph-merger.ts` | Combine views, boost multi-view nodes |
| `ContextLinearizer` | `core/retrieval/context-linearizer.ts` | Order nodes for LLM context |
| `MAGMAIntent` types | `shared/types.ts` | WHY/WHEN/WHO + depth hints |
| `seedFromSemantic()` | `core/retrieval/seed-extractor.ts` | Extract entity IDs from semantic matches via X_REPRESENTS |
| `MAGMAExecutor` | `core/executor/magma-executor.ts` | Cascading retrieval with seed-based expansion |
| `OrchestratorError` | `core/retrieval/errors.ts` | Step-specific error context |

### Updated (Completed) ✅
| Component | Before | After |
|-----------|--------|-------|
| `IntentClassifier` | Outputs `intents: ['semantic', 'entity', ...]` | `classifyMAGMA()` outputs `MAGMAIntent` with WHY/WHEN/WHO + `depthHints` |
| `Orchestrator.recall()` | Parallel independent queries | Cascading: semantic → expand from seeds → merge → linearize → synthesize |
| `ParallelGraphExecutor` | All graphs in parallel | **Removed** - replaced by `MAGMAExecutor` |

### Removed (Legacy Cleanup)

**Files to Delete:**
| File | Reason |
|------|--------|
| `core/executor/parallel-executor.ts` | Replaced by `MAGMAExecutor` |
| `core/executor/parallel-executor.test.ts` | Tests for deleted executor |
| `core/executor/result-aggregator.ts` | Unused - MAGMA uses `SubgraphMerger` |
| `core/executor/result-aggregator.test.ts` | Tests for deleted aggregator |
| `server/tools/high-level.ts` | Dead code - unused stubs |

**Code to Remove from Existing Files:**
| Component | Location | Reason |
|-----------|----------|--------|
| `classify()` method | `core/agents/intent-classifier.ts` | Replaced by `classifyMAGMA()` |
| `CLASSIFIER_PROMPT` | `core/agents/prompts.ts` | Replaced by `MAGMA_CLASSIFIER_PROMPT` |
| `ClassifierOutputSchema` | `shared/schemas.ts` | Replaced by `MAGMAIntentSchema` |
| `ClassifierOutputSchema` tests | `shared/index.test.ts` | Tests for deleted schema |
| `ParallelGraphExecutor` export | `core/executor/index.ts` | Export for deleted file |
| `ResultAggregator` export | `core/executor/index.ts` | Export for deleted file |
| `high-level.ts` export | `server/tools/index.ts` | Export for deleted file |

### Existing Tools Decision ✅
- **Keep 9**: Write tools (7) + Admin tools (2)
- **Remove 6**: Old read/query tools → replaced by MAGMA tools
- **Add 6**: New MAGMA retrieval tools with explicit Zod validation

---

## MCP Tool Surface

### Kept Tools (9 tools)
```
WRITE:  remember, add_entity, add_event, add_fact, add_concept, add_causal_link, link_entities
ADMIN:  get_statistics, clear_graph
```

### Removed Tools (6 tools) ✅
```
OLD:    recall, get_entity, query_timeline, get_causal_chain, explain_why, search_semantic
```

### New MAGMA Tools (6 tools) ✅
```
semantic_search      → Find seed concepts via vector similarity
entity_lookup        → Expand entity relationships from seeds
temporal_expand      → Query events involving seed entities
causal_expand        → Traverse causal chains from seed entities
subgraph_merge       → Combine and score graph views
linearize_context    → Format merged subgraph for LLM
```

### Final Tool Count: 15 (9 kept + 6 new MAGMA)

### Write Tool Cross-Graph Linking

The MAGMA retrieval pipeline depends on cross-graph relationships to connect semantic concepts to other graph types. These relationships are created by the write tools:

| Tool | Cross-Link Created | Purpose |
|------|-------------------|---------|
| `add_event` | `X_INVOLVES` (Event → Entity) | Links events to entities they mention |
| `add_concept` | `X_REPRESENTS` (Concept → Entity) | Links concepts to entities they describe |
| `add_causal_link` | `X_AFFECTS` (CausalNode → Entity) | Links causal nodes to affected entities |
| `add_causal_link` | `X_REFERS_TO` (CausalNode → Event) | Links causal nodes to related events |
| `add_fact` | `X_INVOLVES` (Fact → Entity) | Links facts to the entity they describe |

**add_event parameters:**
```typescript
{
  description: string,      // Event description
  occurred_at: string,      // ISO timestamp
  entities?: string[]       // Entity names/UUIDs to link via X_INVOLVES
}
```

**add_concept parameters:**
```typescript
{
  name: string,             // Concept name
  description?: string,     // Concept description (used for embedding)
  entities?: string[]       // Entity names/UUIDs to link via X_REPRESENTS
}
```

**add_causal_link parameters:**
```typescript
{
  cause: string,            // Cause description or UUID
  effect: string,           // Effect description or UUID
  confidence?: number,      // Confidence score (0-1)
  entities?: string[],      // Entity names/UUIDs to link via X_AFFECTS
  events?: string[]         // Event UUIDs/descriptions to link via X_REFERS_TO
}
```

**add_fact parameters:**
```typescript
{
  subject: string,          // Fact subject
  predicate: string,        // Fact predicate
  object: string,           // Fact object
  valid_from: string,       // ISO timestamp
  valid_to?: string,        // ISO timestamp (optional)
  subject_entity?: string   // Entity name/UUID to link via X_INVOLVES
}
```

**Why this matters for MAGMA:**
1. `semantic_search` finds concepts by vector similarity
2. `seedFromSemantic()` extracts entity IDs via `X_REPRESENTS` links
3. `temporal_expand` finds events linked to those entities via `X_INVOLVES`
4. `causal_expand` finds causal chains linked to entities via `X_AFFECTS`
5. Without these links, graph expansion returns empty results

### Example Tool Flows
```
WHY Query:  semantic_search → causal_expand → temporal_expand → subgraph_merge → linearize_context
WHO Query:  semantic_search → entity_lookup → subgraph_merge → linearize_context
WHEN Query: semantic_search → temporal_expand → entity_lookup → subgraph_merge → linearize_context
```

The full MAGMA pipeline is available via `Orchestrator.recall()` internally.

---

## Fallbacks

1. **Semantic-only**: If graph expansion yields <3 nodes per view
2. **View skipping**: If no seeds link to that graph type
3. **Early stopping**: If node count exceeds 50 per view

---

## Implementation Phases

> **Note:** Tests (Phase 7) will be added after all implementation phases (1-6) are complete.

### Phase 1: Types & Schemas ✅
- [x] Add `MAGMAIntent`, `DepthHints`, `GraphView`, `MergedSubgraph`, `ScoredNode` to `shared/types.ts`
- [x] Add `MAGMAIntentSchema`, `DepthHintsSchema`, `GraphViewSchema`, `ScoredNodeSchema`, `MergedSubgraphSchema` to `shared/schemas.ts`
- [x] Add `MAGMAConfig` type with env var parsing (`loadMAGMAConfig`, `validateMAGMAConfig`, `DEFAULT_MAGMA_CONFIG`)

### Phase 2: New Components (CPU-only, no graph changes) ✅
- [x] Create `SubgraphMerger` - combine views, boost multi-view nodes (`core/retrieval/subgraph-merger.ts`)
- [x] Create `ContextLinearizer` - order nodes for LLM (`core/retrieval/context-linearizer.ts`)
- [x] Create `seedFromSemantic()` - extract entity IDs via X_REPRESENTS (`core/retrieval/seed-extractor.ts`)
- [x] Add Zod validation and error handling (`core/retrieval/errors.ts`)

### Phase 3: Update IntentClassifier ✅
- [x] New prompt for WHY/WHEN/WHO/WHAT extraction (`MAGMA_CLASSIFIER_PROMPT` in `core/agents/prompts.ts`)
- [x] New `classifyMAGMA()` method returns `MAGMAIntent` with intent type + `depthHints`
- [x] Remove legacy `classify()` method and `CLASSIFIER_PROMPT`

### Phase 4: New Executor (Replace ParallelGraphExecutor) ✅
- [x] Create `MAGMAExecutor` with cascading flow (`core/executor/magma-executor.ts`):
  1. Semantic search → get seed concepts
  2. Extract entity IDs from seeds via X_REPRESENTS (using `seedFromSemantic`)
  3. Parallel: entity expand, temporal expand, causal expand (from seed entities)
  4. Merge results (using `SubgraphMerger`)
- [x] Depth controlled by intent type via `MAGMAIntent.depthHints`
- [x] Delete `parallel-executor.ts` and `parallel-executor.test.ts`
- [x] Delete `result-aggregator.ts` and `result-aggregator.test.ts`
- [x] Update `core/executor/index.ts` exports

### Phase 5: Wire Orchestrator ✅
- [x] Replaced `recall()` entirely with MAGMA flow (classify → execute → linearize → synthesize)
- [x] Added `recallRaw()` method for advanced use cases (returns raw MAGMA execution result)
- [x] Added Zod validation for `OrchestratorConfig`
- [x] Added query validation with `RetrievalValidationError`
- [x] Added `OrchestratorError` with step-specific context for pipeline failures
- [x] Removed dependency on `ParallelGraphExecutor` (replaced by `MAGMAExecutor`)

### Phase 6: MCP Tools ✅
- [x] Remove 6 old read tools: `recall`, `get_entity`, `query_timeline`, `get_causal_chain`, `explain_why`, `search_semantic`
- [x] Add 6 new MAGMA tools: `semantic_search`, `entity_lookup`, `temporal_expand`, `causal_expand`, `subgraph_merge`, `linearize_context`
- [x] Keep 9 existing: 7 write + 2 admin
- [x] Add MAGMA tool input schemas to `shared/schemas.ts`
- [x] Add explicit Zod validation with `validateToolInput()` helper
- [x] Add 20 validation error tests for all MAGMA tools
- [x] Delete `server/tools/high-level.ts` (unused recall/remember stubs)
- [x] Update `server/tools/index.ts` exports
- [x] Remove `ClassifierOutputSchema` from `shared/schemas.ts`
- [x] Remove `ClassifierOutputSchema` tests from `shared/index.test.ts`

### Phase 7: Tests ✅
> **Note:** Tests added after Phases 1-6 implementation was complete.

- [x] Unit tests for MAGMA tool validation (20 tests)
- [x] Unit tests for SubgraphMerger (25 tests)
- [x] Unit tests for ContextLinearizer (42 tests) + bug fix for `nodeCount` truncation
- [x] Unit tests for seedFromSemantic (27 tests)
- [x] Unit tests for MAGMAExecutor (22 tests)
- [x] E2E test file updated to expect MAGMA tools (skipped pending semantic indexing in write tools)
- [x] Fixed flaky FalkorDB tests with vitest config (`singleFork: true`)
- [x] Removed dead tool stubs and legacy schemas

**Total new tests added in Phase 7: 116**

### Phase 8: Tool Fixes for ReAct Agent Compatibility ✅
> **Note:** These fixes were discovered during E2E testing with a ReAct agent.

#### Problem: Agent passing wrong IDs to expansion tools

The ReAct agent was passing **concept UUIDs** to `causal_expand` instead of **entity UUIDs**. This happened because:
1. `semantic_search` returned concept matches with UUIDs
2. The agent didn't see the linked entity IDs (response truncation)
3. `causal_expand` searched for C_Nodes by description text match (not entity links)

#### Fix 1: `semantic_search` response restructuring

**Before:** Entity IDs buried at end of each match object (often truncated)
```json
{
  "concept": { "uuid": "...", "name": "...", "description": "..." },
  "score": 0.85,
  "linkedEntityIds": ["..."]  // Often not seen by agent
}
```

**After:** Entity IDs prominently at top with explicit instruction
```json
{
  "seedEntityIds": ["entity-uuid-1", "entity-uuid-2", ...],
  "seedEntityCount": 7,
  "instruction": "Use seedEntityIds (not concept UUIDs) for entity_lookup, temporal_expand, and causal_expand tools",
  "matches": [...]
}
```

The custom `instruction` field guides ReAct agents to use the correct IDs for subsequent tool calls.

#### Fix 2: `causal_expand` entity-based lookup

**Before:** Searched C_Node descriptions for text mentions
```typescript
// Old: text-based search (didn't work with UUIDs)
MATCH (n:C_Node) WHERE toLower(n.description) CONTAINS toLower($mention)
```

**After:** Finds C_Nodes via X_AFFECTS links to entities
```typescript
// New: uses cross-graph relationships
MATCH (c:C_Node)-[:X_AFFECTS]->(e:E_Entity)
WHERE e.uuid IN $entityIds
RETURN DISTINCT c.uuid AS nodeId
```

Then traverses causal chains from those C_Nodes using `getUpstreamCauses()` / `getDownstreamEffects()`.

#### Fix 3: `TemporalGraph.getEvent()` dual lookup

**Before:** Only looked up events by UUID
**After:** Tries UUID first, then falls back to description match

```typescript
async getEvent(uuidOrDescription: string): Promise<TemporalEvent | null> {
  // Try by UUID first
  const byUuid = await this.db.query(
    `MATCH (e:T_Event {uuid: $id}) RETURN e`,
    { id: uuidOrDescription }
  );
  if (byUuid.records.length > 0) return this.safeParseEvent(byUuid.records[0].e);

  // Fallback: try by description
  const byDescription = await this.db.query(
    `MATCH (e:T_Event {description: $description}) RETURN e`,
    { description: uuidOrDescription }
  );
  if (byDescription.records.length > 0) return this.safeParseEvent(byDescription.records[0].e);

  return null;
}
```

This enables `add_causal_link` to link to events by description (from dataset definitions).

#### Fix 4: MCP Client error detection

**Before:** Client extracted text content but ignored `isError` flag
**After:** Client throws when tool returns `isError: true`

```typescript
// In tests/e2e/agent/mcp-client.ts
if (result.isError) {
  const errorText = /* extract text from result.content */;
  throw new Error(`Tool ${name} failed: ${errorText}`);
}
```

This ensures seeding scripts properly report failures instead of silently continuing.

#### Summary of Cross-Graph Link Usage

| Tool | Link Type | Direction | Purpose |
|------|-----------|-----------|---------|
| `semantic_search` | `X_REPRESENTS` | Concept → Entity | Extract seed entity IDs from concept matches |
| `causal_expand` | `X_AFFECTS` | C_Node → Entity | Find causal nodes related to seed entities |
| `temporal_expand` | `X_INVOLVES` | Event → Entity | Find events involving seed entities |
| `entity_lookup` | `E_RELATES` | Entity → Entity | Expand entity relationship graph |

---

## Configuration (Environment Variables)

```bash
# Seeding
MAGMA_SEMANTIC_TOP_K=10
MAGMA_MIN_SEMANTIC_SCORE=0.5

# Traversal depths (defaults, overridden by intent)
MAGMA_ENTITY_DEPTH=2
MAGMA_TEMPORAL_DEPTH=2
MAGMA_CAUSAL_DEPTH=3

# Fallbacks
MAGMA_MIN_NODES_PER_VIEW=3
MAGMA_MAX_NODES_PER_VIEW=50

# Multi-view scoring
MAGMA_MULTI_VIEW_BOOST=1.5
```
