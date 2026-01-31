# POLYG-MCP Process Flows Validation Checklist

This document tracks validation of all process flows for gaps and edge cases.

**Status Legend:**
- [ ] Not analyzed
- [x] Analyzed - OK
- [!] Analyzed - Gap found (see notes)
- [~] Analyzed - Minor issue (see notes)

---

## 1. MAGMA RETRIEVAL PIPELINE (Core Flow)

### 1.1 Intent Classification

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1.1.1 | Empty query handling | [x] | `intent-classifier.ts:26-28` - throws `ClassifierError`. Tested in `agents.test.ts:45-52` |
| 1.1.2 | Very long query handling (tokenization limits) | [x] | **FIXED**: Added `maxQueryLength` (8000) and `maxContextLength` (4000) validation. Configurable via env vars `MAGMA_MAX_QUERY_LENGTH`, `MAGMA_MAX_CONTEXT_LENGTH` |
| 1.1.3 | Non-English/multilingual queries | [x] | Pass-through to LLM (design decision). LLM handles translation/understanding |
| 1.1.4 | Ambiguous intents (low confidence score) | [x] | **REMOVED**: Unused `MAGMAIntent.confidence` field removed entirely. Synthesizer has its own confidence. |
| 1.1.5 | Malformed LLM JSON response | [x] | `intent-classifier.ts:58-66` - throws `LLMResponseParseError` with raw response. Tested |
| 1.1.6 | LLM timeout during classification | [~] | Catches LLM errors but relies on provider timeout. No classifier-level timeout config |
| 1.1.7 | Context parameter handling (empty vs long) | [x] | `intent-classifier.ts:33` - empty context becomes `""`. Long context: no limit (see 1.1.2) |
| 1.1.8 | Depth hints validation (1-5 range) | [x] | `schemas.ts:100-104` - Zod enforces `min(1).max(5)`. Tested in `agents.test.ts` |
| 1.1.9 | Intent type fallback (EXPLORE as default) | [!] | **GAP**: Invalid type throws error. No graceful fallback to EXPLORE |

### 1.2 Semantic Search → Seed Extraction

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1.2.1 | No concepts match query (empty results) | [ ] | |
| 1.2.2 | All concepts below `minSemanticScore` threshold | [ ] | |
| 1.2.3 | Concepts with no `X_REPRESENTS` links (orphan concepts) | [ ] | |
| 1.2.4 | Duplicate entity IDs across multiple concepts | [ ] | |
| 1.2.5 | Embedding generation failure | [ ] | |
| 1.2.6 | Cosine similarity edge cases (zero vectors) | [ ] | |
| 1.2.7 | `semanticTopK` limit enforcement (1-100) | [ ] | |

### 1.3 Parallel Graph Expansion

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1.3.1 | **Entity**: No seed entities found | [ ] | |
| 1.3.2 | **Entity**: Circular relationship loops (BFS cycle detection) | [ ] | |
| 1.3.3 | **Entity**: Depth exhaustion (max depth reached) | [ ] | |
| 1.3.4 | **Entity**: Batch query failure (partial results) | [ ] | |
| 1.3.5 | **Temporal**: No events linked to seed entities | [ ] | |
| 1.3.6 | **Temporal**: Date range parsing (relative: "last week") | [ ] | |
| 1.3.7 | **Temporal**: Events with missing `occurred_at` | [ ] | |
| 1.3.8 | **Causal**: No `X_AFFECTS` links to seed entities | [ ] | |
| 1.3.9 | **Causal**: Circular causal chains | [ ] | |
| 1.3.10 | **Causal**: Missing cause/effect nodes (dangling references) | [ ] | |
| 1.3.11 | **All**: Timeout during expansion | [ ] | |
| 1.3.12 | **All**: One expansion fails, others succeed (graceful degradation) | [ ] | |

### 1.4 Subgraph Merge

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1.4.1 | Empty views array (all expansions failed) | [ ] | |
| 1.4.2 | Single view only (no multi-view boost) | [ ] | |
| 1.4.3 | Duplicate nodes across views (score averaging) | [ ] | |
| 1.4.4 | Multi-view boost calculation correctness | [ ] | |
| 1.4.5 | `maxNodesPerView` limit (explosion prevention) | [ ] | |
| 1.4.6 | View contribution tracking | [ ] | |
| 1.4.7 | Score normalization | [ ] | |

### 1.5 Context Linearization

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1.5.1 | WHY intent → causal chain ordering | [ ] | |
| 1.5.2 | WHEN intent → temporal ordering (date parsing) | [ ] | |
| 1.5.3 | WHO/WHAT intent → entity grouping by type | [ ] | |
| 1.5.4 | EXPLORE intent → score-ranked ordering | [ ] | |
| 1.5.5 | Token budget exhaustion (truncation behavior) | [ ] | |
| 1.5.6 | Missing date fields in temporal nodes | [ ] | |
| 1.5.7 | Very long node descriptions (200-char truncation) | [ ] | |
| 1.5.8 | Empty merged subgraph handling | [ ] | |

### 1.6 Synthesis

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1.6.1 | Empty linearized context | [ ] | |
| 1.6.2 | LLM JSON parsing failure | [ ] | |
| 1.6.3 | LLM schema validation failure | [ ] | |
| 1.6.4 | Missing confidence score in response | [ ] | |
| 1.6.5 | `follow_ups` generation (optional field) | [ ] | |
| 1.6.6 | Sources attribution accuracy | [ ] | |
| 1.6.7 | Reasoning structure completeness | [ ] | |

---

## 2. WRITE TOOLS (Data Ingestion)

### 2.1 `add_entity`

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 2.1.1 | Duplicate entity name handling | [ ] | |
| 2.1.2 | Empty entity type | [ ] | |
| 2.1.3 | Invalid properties (non-JSON) | [ ] | |
| 2.1.4 | UUID generation uniqueness | [ ] | |
| 2.1.5 | Name resolution (fuzzy matching) | [ ] | |

### 2.2 `add_concept`

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 2.2.1 | Embedding generation failure | [ ] | |
| 2.2.2 | `entities` parameter linking (X_REPRESENTS creation) | [ ] | |
| 2.2.3 | Entity resolution for linking (name vs UUID) | [ ] | |
| 2.2.4 | Duplicate concept name handling | [ ] | |
| 2.2.5 | Empty description → name used for embedding | [ ] | |

### 2.3 `add_event`

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 2.3.1 | Invalid `occurred_at` date format | [ ] | |
| 2.3.2 | `entities` parameter linking (X_INVOLVES creation) | [ ] | |
| 2.3.3 | Entity resolution for linking | [ ] | |
| 2.3.4 | Duplicate event descriptions | [ ] | |
| 2.3.5 | Optional `duration` field handling | [ ] | |

### 2.4 `add_fact`

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 2.4.1 | `valid_from`/`valid_to` date validation | [ ] | |
| 2.4.2 | `valid_to` before `valid_from` (invalid range) | [ ] | |
| 2.4.3 | `subject_entity` linking (X_INVOLVES creation) | [ ] | |
| 2.4.4 | Entity resolution for subject | [ ] | |
| 2.4.5 | Fact invalidation (setting `valid_to`) | [ ] | |

### 2.5 `add_causal_link`

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 2.5.1 | Cause/effect resolution (description vs UUID) | [ ] | |
| 2.5.2 | `confidence` range validation (0-1) | [ ] | |
| 2.5.3 | `entities` parameter (X_AFFECTS creation) | [ ] | |
| 2.5.4 | `events` parameter (X_REFERS_TO creation) | [ ] | |
| 2.5.5 | Self-loop prevention (cause = effect) | [ ] | |
| 2.5.6 | Duplicate link handling | [ ] | |

### 2.6 `link_entities`

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 2.6.1 | Source/target entity resolution | [ ] | |
| 2.6.2 | Entity not found errors | [ ] | |
| 2.6.3 | Self-link prevention | [ ] | |
| 2.6.4 | Duplicate relationship handling | [ ] | |
| 2.6.5 | `relationship_type` validation | [ ] | |

### 2.7 `remember` (Simple Logging)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 2.7.1 | Empty content handling | [ ] | |
| 2.7.2 | Context parameter usage | [ ] | |
| 2.7.3 | Current timestamp generation | [ ] | |
| 2.7.4 | Return value structure | [ ] | |

---

## 3. CROSS-GRAPH LINKING (X_ Relationships)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 3.1 | `X_REPRESENTS`: Concept → Entity creation | [ ] | |
| 3.2 | `X_INVOLVES`: Event/Fact → Entity creation | [ ] | |
| 3.3 | `X_AFFECTS`: CausalNode → Entity creation | [ ] | |
| 3.4 | `X_REFERS_TO`: CausalNode → Event creation | [ ] | |
| 3.5 | Orphan node detection (no X_ links) | [ ] | |
| 3.6 | Link deletion on node deletion | [ ] | |
| 3.7 | Bidirectional link queries (from/to) | [ ] | |

---

## 4. ADMIN TOOLS

### 4.1 `clear_graph`

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 4.1.1 | Selective clearing (semantic/temporal/causal/entity) | [ ] | |
| 4.1.2 | "all" clearing (all graphs) | [ ] | |
| 4.1.3 | Cross-link cleanup on clear | [ ] | |
| 4.1.4 | Node count verification after clear | [ ] | |

### 4.2 `get_statistics`

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 4.2.1 | Node counts by type | [ ] | |
| 4.2.2 | Edge counts by type | [ ] | |
| 4.2.3 | Cross-link statistics | [ ] | |
| 4.2.4 | Empty graph handling | [ ] | |

---

## 5. DATABASE OPERATIONS (FalkorDB)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 5.1 | Connection failure handling | [ ] | |
| 5.2 | Query timeout handling | [ ] | |
| 5.3 | Transaction rollback on failure | [ ] | |
| 5.4 | Concurrent write conflicts | [ ] | |
| 5.5 | Index usage (embedding vectors) | [ ] | |
| 5.6 | Large result set pagination | [ ] | |
| 5.7 | Cypher injection prevention | [ ] | |

---

## 6. PROVIDER INTEGRATIONS

### 6.1 LLM Provider (OpenAI)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 6.1.1 | API key validation | [ ] | |
| 6.1.2 | Rate limiting / 429 handling | [ ] | |
| 6.1.3 | Model availability (gpt-3.5-turbo) | [ ] | |
| 6.1.4 | Response format enforcement (JSON mode) | [ ] | |
| 6.1.5 | Token limit exceeded | [ ] | |
| 6.1.6 | Network timeout (30s default) | [ ] | |

### 6.2 Embedding Provider (OpenAI)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 6.2.1 | API key validation | [ ] | |
| 6.2.2 | Batch embedding efficiency | [ ] | |
| 6.2.3 | Vector dimension consistency (1536) | [ ] | |
| 6.2.4 | Empty text handling | [ ] | |
| 6.2.5 | Rate limiting | [ ] | |

---

## 7. ERROR PROPAGATION & RECOVERY

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 7.1 | `ClassifierError` → `OrchestratorError` wrapping | [ ] | |
| 7.2 | `ExecutorError` → Step identification | [ ] | |
| 7.3 | `MergeError` → Graceful fallback (semantic-only) | [ ] | |
| 7.4 | `LinearizationError` → Raw results fallback | [ ] | |
| 7.5 | `SynthesizerError` → Partial response | [ ] | |
| 7.6 | Error logging with context | [ ] | |
| 7.7 | MCP error format compliance | [ ] | |

---

## 8. CONFIGURATION EDGE CASES

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 8.1 | Missing environment variables → defaults | [ ] | |
| 8.2 | Invalid config values (out of range) | [ ] | |
| 8.3 | `MAGMAConfig` validation at startup | [ ] | |
| 8.4 | Hot-reload of config (if supported) | [ ] | |
| 8.5 | `timeout` enforcement across pipeline | [ ] | |

---

## 9. MCP PROTOCOL COMPLIANCE

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 9.1 | Tool input schema validation (Zod) | [ ] | |
| 9.2 | `isError: true` response handling | [ ] | |
| 9.3 | Tool result formatting | [ ] | |
| 9.4 | Concurrent tool calls | [ ] | |
| 9.5 | Session management | [ ] | |
| 9.6 | stdio/SSE transport compatibility | [ ] | |

---

## 10. REACT AGENT COMPATIBILITY (Phase 8 Fixes)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 10.1 | `semantic_search` response structure (seedEntityIds at top) | [ ] | |
| 10.2 | `instruction` field guidance for agents | [ ] | |
| 10.3 | Entity ID vs Concept UUID disambiguation | [ ] | |
| 10.4 | `causal_expand` entity-based lookup (not text match) | [ ] | |
| 10.5 | `temporal_expand` entity-based lookup | [ ] | |
| 10.6 | MCP client `isError` detection | [ ] | |

---

## Analysis Log

### Session: 2026-01-31

#### 1.1 Intent Classification Analysis

**Files Analyzed:**
- `packages/core/src/agents/intent-classifier.ts`
- `packages/core/src/agents/prompts.ts`
- `packages/core/src/agents/errors.ts`
- `packages/core/src/agents/agents.test.ts`
- `packages/shared/src/schemas.ts`

**Gaps Found:**

##### 1.1.2 - Very long query handling ✅ FIXED
- **Issue**: No validation of input query length before sending to LLM
- **Risk**: Queries exceeding LLM context window will fail with unclear error
- **Fix Applied**:
  - Added `ClassifierConfig` with `maxQueryLength` (default 8000) and `maxContextLength` (default 4000)
  - Added validation in `IntentClassifier.classifyMAGMA()` with clear error messages
  - Config values read from env vars: `MAGMA_MAX_QUERY_LENGTH`, `MAGMA_MAX_CONTEXT_LENGTH`
  - Added 5 new tests for length validation
- **Files Changed**: `intent-classifier.ts`, `orchestrator.ts`, `schemas.ts`, `config.ts`, `agents.test.ts`

##### 1.1.4 - Ambiguous intents (low confidence) ✅ REMOVED
- **Issue**: Confidence score was returned but never used for decision-making
- **Analysis**: The `MAGMAIntent.confidence` was dead code - never consumed by any component
- **Decision**: Remove unused field entirely (YAGNI principle)
- **Fix Applied**:
  - Removed `confidence` from `MAGMAIntentSchema`
  - Updated `MAGMA_CLASSIFIER_PROMPT` to not request confidence
  - Updated all tests
- **Note**: `SynthesizerOutput.confidence` remains - that's the user-facing confidence score

##### 1.1.9 - Intent type fallback
- **Issue**: If LLM returns invalid type (e.g., "EXPLAIN"), validation throws error
- **Risk**: LLM occasionally hallucinates new intent types
- **Recommendation**:
  - Add pre-validation that maps unknown types to EXPLORE
  - Or: Add retry logic with stricter prompt
- **Priority**: Low (LLM rarely returns invalid types with good prompt)

**Test Coverage:**
- Empty query: ✓ Tested
- LLM failure: ✓ Tested
- Invalid JSON: ✓ Tested
- Invalid schema: ✓ Tested
- All 5 intent types: ✓ Tested
- Confidence range: ✓ Tested

**Missing Tests:**
- Very long query behavior
- Context parameter with content
- Timeout behavior

