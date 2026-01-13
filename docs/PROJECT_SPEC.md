# Project Specification: Multi-Graph Agent Memory MCP Server

## Project Name

**`polyg-mcp`** (npm package: `@polyg/mcp-server`)

Short for "poly-graph" — multiple orthogonal graphs for agent memory.

---

## Problem Statement

### What Already Exists

Temporal knowledge graph MCP servers already exist:

| Existing Solution | What It Offers | Limitations |
|-------------------|----------------|-------------|
| **[Graphiti MCP Server](https://github.com/getzep/graphiti)** (Zep) | Temporal KG, episodic memory, FalkorDB/Neo4j, 8 MCP tools | Python-only, SSE issues, macOS bugs, single-graph architecture |
| **[MemoryGraph](https://github.com/gregorydickson/memory-graph)** | 7 relationship types incl. causal, 8 backends, bi-temporal | Single graph, no query intent routing |
| **Neo4j MCP Server** | Generic graph operations | No temporal semantics, no memory abstractions |

### The Actual Gap

No existing MCP server implements **MAGMA's multi-graph paradigm** with **LLM-powered routing**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXISTING SOLUTIONS                           │
│                                                                 │
│   User Query → Keyword Search → Single Graph → Raw Results      │
│                                                                 │
│   Problem: No understanding of query intent                     │
│            No structured reasoning across dimensions            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    POLYG-MCP APPROACH                           │
│                                                                 │
│   User Query                                                    │
│       ↓                                                         │
│   LLM Intent Classifier (understands what user is asking)       │
│       ↓                                                         │
│   Parallel Multi-Graph Query (semantic, temporal, causal, etc.) │
│       ↓                                                         │
│   LLM Synthesizer (coherent, reasoned response)                 │
└─────────────────────────────────────────────────────────────────┘
```

### The True Opportunity

Build the **first MCP server** that implements:

1. **LLM Intent Classification** — Understand query intent, extract entities, identify time references
2. **Multi-Graph Architecture** — 4 orthogonal graphs queried in parallel
3. **LLM Synthesis** — Aggregate results into coherent, reasoned responses
4. **TypeScript-first** — Better DX, fixes known Python issues

---

## Core Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              MCP Client                                 │
│                    (Claude, Cursor, ChatGPT, etc.)                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ stdio / JSON-RPC
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            polyg-mcp Server                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                     LLM INTENT CLASSIFIER                         │  │
│  │                                                                   │  │
│  │  Input: "Why did the deployment fail last Tuesday?"               │  │
│  │                                                                   │  │
│  │  Output: {                                                        │  │
│  │    intents: ['causal', 'temporal'],                               │  │
│  │    entities: ['deployment'],                                      │  │
│  │    timeframe: { type: 'specific', value: '2026-01-07' },          │  │
│  │    causal_direction: 'upstream'  // looking for causes            │  │
│  │  }                                                                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│                                    ▼                                    │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    PARALLEL GRAPH EXECUTOR                        │  │
│  │                                                                   │  │
│  │                    Promise.allSettled([                           │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │  │
│  │  │  Semantic  │  │  Temporal  │  │   Causal   │  │   Entity   │  │  │
│  │  │   Graph    │  │   Graph    │  │   Graph    │  │   Graph    │  │  │
│  │  │            │  │            │  │            │  │            │  │  │
│  │  │  Skipped   │  │  ✓ Query   │  │  ✓ Query   │  │  ✓ Query   │  │  │
│  │  │ (not in    │  │  events    │  │  causal    │  │  resolve   │  │  │
│  │  │  intents)  │  │  on date   │  │  chains    │  │  entities  │  │  │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘  │  │
│  │                    ])                                             │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│                                    ▼                                    │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      LLM SYNTHESIZER                              │  │
│  │                                                                   │  │
│  │  Input: Raw results from multiple graphs                          │  │
│  │                                                                   │  │
│  │  Output: {                                                        │  │
│  │    answer: "The deployment failed due to a memory leak caused     │  │
│  │             by missing environment variable AUTH_SECRET...",      │  │
│  │    confidence: 0.87,                                              │  │
│  │    reasoning: {                                                   │  │
│  │      causal_chain: [...],                                         │  │
│  │      temporal_context: {...},                                     │  │
│  │      entities_involved: [...]                                     │  │
│  │    },                                                             │  │
│  │    sources: ['causal_graph', 'temporal_graph', 'entity_graph']    │  │
│  │  }                                                                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                           STORAGE LAYER                                 │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │ FalkorDB                    │  │ LLM Provider                    │  │
│  │ (All 4 graphs, vectors)     │  │ (OpenAI / Anthropic / Ollama)   │  │
│  └─────────────────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## LLM Intent Classifier

### Purpose
Transform natural language queries into structured graph query plans.

### Input/Output Schema

```typescript
interface ClassifierInput {
  query: string;
  context?: string;  // Optional conversation context
}

interface ClassifierOutput {
  // Which graphs to query
  intents: Array<'semantic' | 'temporal' | 'causal' | 'entity'>;

  // Extracted entities to resolve
  entities: Array<{
    mention: string;      // "the deployment"
    type?: string;        // "Deployment"
    resolved?: string;    // UUID if already known
  }>;

  // Time references
  timeframe?: {
    type: 'specific' | 'range' | 'relative';
    value: string;        // ISO date or duration
    end?: string;         // For ranges
  };

  // Causal query direction
  causal_direction?: 'upstream' | 'downstream' | 'both';

  // Semantic search parameters
  semantic_query?: string;  // Reformulated for embedding search

  // Confidence in classification
  confidence: number;
}
```

### Prompt Template

```typescript
const CLASSIFIER_PROMPT = `You are a query intent classifier for a multi-graph memory system.

Given a user query, extract:
1. INTENTS: Which graphs to query (semantic, temporal, causal, entity)
2. ENTITIES: Named entities mentioned (people, systems, projects, etc.)
3. TIMEFRAME: Any time references (dates, durations, "last week", etc.)
4. CAUSAL_DIRECTION: If asking "why" → upstream, if asking "what happens if" → downstream

Respond in JSON format.

Examples:
- "What do we know about the auth system?" → intents: [semantic, entity]
- "What happened last Tuesday?" → intents: [temporal], timeframe: relative
- "Why did the build fail?" → intents: [causal], causal_direction: upstream
- "Who owns the payment service?" → intents: [entity]

User query: {query}`;
```

### Implementation

```typescript
// src/agents/intent-classifier.ts
export class IntentClassifier {
  constructor(private llm: LLMProvider) {}

  async classify(input: ClassifierInput): Promise<ClassifierOutput> {
    const response = await this.llm.complete({
      prompt: CLASSIFIER_PROMPT.replace('{query}', input.query),
      responseFormat: 'json',
      maxTokens: 500,
    });

    return this.parseAndValidate(response);
  }
}
```

---

## Parallel Graph Executor

### Purpose
Query multiple graphs concurrently based on classified intents.

### Execution Strategy

```typescript
// src/executor/parallel-executor.ts
export class ParallelGraphExecutor {
  constructor(
    private graphs: {
      semantic: SemanticGraph;
      temporal: TemporalGraph;
      causal: CausalGraph;
      entity: EntityGraph;
    }
  ) {}

  async execute(plan: ClassifierOutput): Promise<GraphResults> {
    // Build query promises only for relevant graphs
    const queries: Promise<GraphResult>[] = [];

    if (plan.intents.includes('semantic')) {
      queries.push(
        this.graphs.semantic
          .search(plan.semantic_query!)
          .then(r => ({ graph: 'semantic', data: r }))
      );
    }

    if (plan.intents.includes('temporal')) {
      queries.push(
        this.graphs.temporal
          .query(plan.timeframe!)
          .then(r => ({ graph: 'temporal', data: r }))
      );
    }

    if (plan.intents.includes('causal')) {
      queries.push(
        this.graphs.causal
          .traverse(plan.entities, plan.causal_direction!)
          .then(r => ({ graph: 'causal', data: r }))
      );
    }

    if (plan.intents.includes('entity')) {
      queries.push(
        this.graphs.entity
          .resolve(plan.entities)
          .then(r => ({ graph: 'entity', data: r }))
      );
    }

    // Execute all in parallel, don't fail if one graph errors
    const results = await Promise.allSettled(queries);

    return this.aggregateResults(results);
  }

  private aggregateResults(
    results: PromiseSettledResult<GraphResult>[]
  ): GraphResults {
    const successful: GraphResult[] = [];
    const failed: { graph: string; error: Error }[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        successful.push(result.value);
      } else {
        failed.push({
          graph: 'unknown',
          error: result.reason
        });
      }
    }

    return { successful, failed };
  }
}
```

### Performance Characteristics

| Scenario | Graphs Queried | Sequential Time | Parallel Time |
|----------|----------------|-----------------|---------------|
| Simple entity lookup | 1 | 50ms | 50ms |
| Temporal + Entity | 2 | 120ms | 70ms |
| Full causal analysis | 4 | 280ms | 100ms |

---

## LLM Synthesizer

### Purpose
Transform raw graph results into coherent, reasoned responses.

### Input/Output Schema

```typescript
interface SynthesizerInput {
  original_query: string;
  classification: ClassifierOutput;
  graph_results: GraphResults;
}

interface SynthesizerOutput {
  // Natural language answer
  answer: string;

  // How confident is the synthesis
  confidence: number;

  // Structured reasoning (for transparency)
  reasoning: {
    causal_chain?: CausalChain[];
    temporal_context?: TemporalContext;
    entities_involved?: Entity[];
    semantic_matches?: SemanticMatch[];
  };

  // Which graphs contributed
  sources: string[];

  // Follow-up suggestions
  follow_ups?: string[];
}
```

### Prompt Template

```typescript
const SYNTHESIZER_PROMPT = `You are a response synthesizer for a multi-graph memory system.

Given raw results from multiple knowledge graphs, synthesize a coherent answer.

Guidelines:
1. Prioritize causal explanations when available
2. Include temporal context (when things happened)
3. Reference specific entities by name
4. Express confidence based on evidence strength
5. Suggest follow-up questions if relevant

Original Query: {query}

Graph Results:
{results}

Respond with a JSON object containing:
- answer: string (natural language response)
- confidence: number (0-1)
- reasoning: object (structured evidence)
- sources: string[] (which graphs contributed)
- follow_ups: string[] (optional follow-up questions)`;
```

### Implementation

```typescript
// src/agents/synthesizer.ts
export class Synthesizer {
  constructor(private llm: LLMProvider) {}

  async synthesize(input: SynthesizerInput): Promise<SynthesizerOutput> {
    const prompt = SYNTHESIZER_PROMPT
      .replace('{query}', input.original_query)
      .replace('{results}', JSON.stringify(input.graph_results, null, 2));

    const response = await this.llm.complete({
      prompt,
      responseFormat: 'json',
      maxTokens: 1000,
    });

    return this.parseAndValidate(response);
  }
}
```

---

## The Four Graphs

### 1. Semantic Graph
**Purpose:** Conceptual similarity and topic clustering

```cypher
(:S_Concept {uuid, name, description, embedding})
(:S_Concept)-[:S_SIMILAR_TO {score}]->(:S_Concept)
(:S_Memory)-[:S_ABOUT]->(:S_Concept)
```

**Query types:** "What do I know about X?", "Find related topics"

### 2. Temporal Graph
**Purpose:** Chronological ordering and time-bounded facts

```cypher
(:T_Event {uuid, description, occurred_at, duration})
(:T_Fact {uuid, subject, predicate, object, valid_from, valid_to})
(:T_Event)-[:T_BEFORE]->(:T_Event)
```

**Query types:** "What happened last week?", "What was true on date X?"

### 3. Causal Graph
**Purpose:** Cause-effect relationships and reasoning chains

```cypher
(:C_Node {uuid, description, node_type})
(:C_Node)-[:C_CAUSES {confidence, evidence}]->(:C_Node)
(:C_Node)-[:C_SOLVED_BY]->(:C_Node)
```

**Query types:** "Why did X happen?", "What caused Y?"

### 4. Entity Graph
**Purpose:** Persistent entities, properties, and hierarchies

```cypher
(:E_Entity {uuid, name, entity_type, properties, created_at})
(:E_Entity)-[:E_RELATES {relationship_type}]->(:E_Entity)
```

**Query types:** "Who is X?", "What projects does team Y own?"

### Cross-Graph Links

```cypher
// Connecting the graphs
(:S_Concept)-[:X_REPRESENTS]->(:E_Entity)
(:T_Event)-[:X_INVOLVES]->(:E_Entity)
(:C_Node)-[:X_REFERS_TO]->(:T_Event)
(:C_Node)-[:X_AFFECTS]->(:E_Entity)
```

---

## MCP Tools (API Surface)

### High-Level Tools (LLM-Powered)

```typescript
// Primary interface - full LLM pipeline
recall: {
  query: string;                // Natural language query
  include_reasoning?: boolean;  // Return structured reasoning
  max_results?: number;
}
// Returns: SynthesizerOutput

// Store new information - LLM extracts structure
remember: {
  content: string;              // What to remember
  context?: string;             // Optional context
}
// Returns: { entities_created, facts_added, events_logged }
```

### Direct Graph Tools (Bypass LLM)

```typescript
// Semantic
search_semantic: { query: string; limit?: number }
add_concept: { name: string; description?: string }

// Temporal
query_timeline: { from: string; to: string; entity?: string }
add_event: { description: string; occurred_at: string }
add_fact: { subject: string; predicate: string; object: string; valid_from: string }

// Causal
get_causal_chain: { event: string; direction: 'upstream' | 'downstream' }
add_causal_link: { cause: string; effect: string; confidence?: number }
explain_why: { event: string }

// Entity
get_entity: { name: string; include_relationships?: boolean }
add_entity: { name: string; entity_type: string; properties?: object }
link_entities: { source: string; target: string; relationship: string }
```

### Management Tools

```typescript
get_statistics: {}  // Stats for all graphs
clear_graph: { graph: 'semantic' | 'temporal' | 'causal' | 'entity' | 'all' }
export_graph: { format: 'cypher' | 'json' }
```

---

## Tech Stack

### Core

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Runtime** | Node.js 20+ | User preference |
| **Language** | TypeScript 5.x | Type safety, better DX |
| **MCP SDK** | `@modelcontextprotocol/sdk` | Official SDK |
| **Graph DB** | FalkorDB | Already deployed, vectors |
| **DB Client** | `falkordb` | Official TS client |
| **Schema** | Zod | MCP SDK requirement |

### LLM Providers

| Provider | Package | Use Case |
|----------|---------|----------|
| OpenAI | `openai` | Default, GPT-4o-mini for speed |
| Anthropic | `@anthropic-ai/sdk` | Claude as alternative |
| Ollama | `ollama` | Local/offline mode |

### Embeddings

| Provider | Package | Use Case |
|----------|---------|----------|
| OpenAI | `openai` | text-embedding-3-small |
| Ollama | `ollama` | Local embeddings |

---

## Configuration

```typescript
// polyg.config.ts
export interface PolygConfig {
  // FalkorDB connection
  falkordb: {
    host: string;           // default: localhost
    port: number;           // default: 6379
    password?: string;
    graphName: string;      // default: polyg
  };

  // LLM configuration (for classifier + synthesizer)
  llm: {
    provider: 'openai' | 'anthropic' | 'ollama';
    model: string;          // default: gpt-4o-mini
    baseUrl?: string;       // for Ollama
    apiKey?: string;        // from env

    // Token limits
    classifierMaxTokens: number;   // default: 500
    synthesizerMaxTokens: number;  // default: 1000
  };

  // Embedding configuration (for semantic graph)
  embeddings: {
    provider: 'openai' | 'ollama';
    model: string;          // default: text-embedding-3-small
    dimensions: number;     // default: 1536
  };

  // Execution settings
  execution: {
    parallelTimeout: number;     // default: 5000ms
    maxRetries: number;          // default: 2
  };
}
```

---

## Project Structure

```
polyg-mcp/
├── src/
│   ├── index.ts                    # Entry point
│   ├── server.ts                   # MCP server setup
│   │
│   ├── agents/                     # LLM-powered components
│   │   ├── intent-classifier.ts    # Query → structured plan
│   │   ├── synthesizer.ts          # Results → coherent answer
│   │   └── prompts.ts              # Prompt templates
│   │
│   ├── executor/                   # Query execution
│   │   ├── parallel-executor.ts    # Promise.allSettled orchestration
│   │   └── result-aggregator.ts    # Merge graph results
│   │
│   ├── graphs/                     # Graph implementations
│   │   ├── semantic.ts
│   │   ├── temporal.ts
│   │   ├── causal.ts
│   │   ├── entity.ts
│   │   └── cross-linker.ts         # X_ relationships
│   │
│   ├── tools/                      # MCP tool definitions
│   │   ├── high-level.ts           # recall, remember
│   │   ├── semantic.ts
│   │   ├── temporal.ts
│   │   ├── causal.ts
│   │   ├── entity.ts
│   │   └── management.ts
│   │
│   ├── storage/
│   │   └── falkordb.ts             # Database adapter
│   │
│   ├── llm/                        # LLM provider abstraction
│   │   ├── index.ts
│   │   ├── openai.ts
│   │   ├── anthropic.ts
│   │   └── ollama.ts
│   │
│   ├── embeddings/
│   │   ├── index.ts
│   │   ├── openai.ts
│   │   └── ollama.ts
│   │
│   └── config.ts
│
├── tests/
│   ├── agents/
│   ├── executor/
│   ├── graphs/
│   └── integration/
│
├── examples/
│   ├── claude-desktop.json
│   └── scenarios.md
│
├── package.json
├── tsconfig.json
├── biome.json
└── README.md
```

---

## Request Flow Example

```
┌─────────────────────────────────────────────────────────────────────────┐
│ User: "Why did the auth service fail after the Tuesday deployment?"     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. INTENT CLASSIFIER (LLM Call #1, ~200ms)                              │
│                                                                         │
│    Output: {                                                            │
│      intents: ['causal', 'temporal', 'entity'],                         │
│      entities: [                                                        │
│        { mention: 'auth service', type: 'Service' },                    │
│        { mention: 'Tuesday deployment', type: 'Deployment' }            │
│      ],                                                                 │
│      timeframe: { type: 'relative', value: 'last Tuesday' },            │
│      causal_direction: 'upstream'                                       │
│    }                                                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. PARALLEL GRAPH QUERIES (~100ms total, slowest graph)                 │
│                                                                         │
│    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │
│    │ Causal Graph    │  │ Temporal Graph  │  │ Entity Graph    │       │
│    │                 │  │                 │  │                 │       │
│    │ Find upstream   │  │ Events on       │  │ Resolve:        │       │
│    │ causes of       │  │ 2026-01-07      │  │ - auth service  │       │
│    │ "auth failure"  │  │ ±1 day          │  │ - deployment    │       │
│    │                 │  │                 │  │                 │       │
│    │ Returns:        │  │ Returns:        │  │ Returns:        │       │
│    │ - env var miss  │  │ - deploy event  │  │ - service UUID  │       │
│    │ - config error  │  │ - failure event │  │ - deploy UUID   │       │
│    └─────────────────┘  └─────────────────┘  └─────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. SYNTHESIZER (LLM Call #2, ~300ms)                                    │
│                                                                         │
│    Output: {                                                            │
│      answer: "The auth service failed after the Tuesday deployment      │
│               because the AUTH_SECRET environment variable was not      │
│               included in the new deployment configuration. The         │
│               deployment at 14:32 UTC triggered the auth service        │
│               restart, which then failed to initialize without the      │
│               required secret.",                                        │
│                                                                         │
│      confidence: 0.89,                                                  │
│                                                                         │
│      reasoning: {                                                       │
│        causal_chain: [                                                  │
│          { cause: "missing AUTH_SECRET", effect: "auth init failure" }, │
│          { cause: "deployment v2.3.1", effect: "missing AUTH_SECRET" }  │
│        ],                                                               │
│        temporal_context: {                                              │
│          deployment_time: "2026-01-07T14:32:00Z",                       │
│          failure_time: "2026-01-07T14:33:12Z"                           │
│        }                                                                │
│      },                                                                 │
│                                                                         │
│      sources: ['causal', 'temporal', 'entity'],                         │
│                                                                         │
│      follow_ups: [                                                      │
│        "What other services depend on AUTH_SECRET?",                    │
│        "Has this happened before?"                                      │
│      ]                                                                  │
│    }                                                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    Total time: ~600ms (2 LLM calls + parallel DB)
```

---

## Future Scope: BullMQ Integration

### Why Queues (Not MVP)

| Operation | Why Queue? | Benefit |
|-----------|------------|---------|
| Entity extraction from long content | LLM call, 2-5s | Non-blocking |
| Bulk episode ingestion | Many LLM calls | Rate limiting |
| Cross-graph consistency updates | Cascade effects | Eventual consistency |
| Embedding generation | API quotas | Backpressure handling |
| Scheduled graph maintenance | Background | No user impact |

### Planned Architecture (Future)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         polyg-mcp (Future)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐   │
│  │ MCP Tools       │────→│ BullMQ Queues   │────→│ Workers         │   │
│  │ (sync response) │     │ (Redis-backed)  │     │ (background)    │   │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘   │
│                                │                         │              │
│                                │                         │              │
│                          ┌─────┴─────┐             ┌─────┴─────┐       │
│                          │           │             │           │       │
│                     ┌────▼───┐  ┌────▼───┐   ┌─────▼───┐ ┌─────▼───┐  │
│                     │extract │  │embed   │   │Extract  │ │Embed    │  │
│                     │-entity │  │-content│   │Worker   │ │Worker   │  │
│                     │-queue  │  │-queue  │   │         │ │         │  │
│                     └────────┘  └────────┘   └─────────┘ └─────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Interface Design (Queue-Ready)

```typescript
// MVP: Direct execution
interface GraphOperations {
  addEntity(entity: Entity): Promise<void>;
}

// Future: Same interface, queue-backed
interface GraphOperations {
  addEntity(entity: Entity, options?: { async?: boolean }): Promise<void | JobId>;
}
```

---

## Deployment Architecture

### End Goal

A **self-hosted, Docker-deployable** multi-graph memory service that users can:

1. Clone the repo
2. Run `docker-compose up`
3. Connect any MCP-compatible agent or workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                         POLYG-MCP STACK                                 │
│                         (Docker Compose)                                │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                                                                   │  │
│  │                      polyg-mcp-server                             │  │
│  │                      (MCP over HTTP)                              │  │
│  │                                                                   │  │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │  │
│  │   │ HTTP/SSE    │  │ Intent      │  │ Parallel Graph          │  │  │
│  │   │ Transport   │  │ Classifier  │  │ Executor                │  │  │
│  │   │ :3000       │  │ (LLM)       │  │                         │  │  │
│  │   └─────────────┘  └─────────────┘  └─────────────────────────┘  │  │
│  │                                                                   │  │
│  │   ┌─────────────────────────────────────────────────────────────┐│  │
│  │   │  Semantic  │  Temporal  │  Causal   │  Entity   │ Synth.   ││  │
│  │   └─────────────────────────────────────────────────────────────┘│  │
│  │                                                                   │  │
│  └───────────────────────────────────┬───────────────────────────────┘  │
│                                      │                                  │
│                         ┌────────────┴────────────┐                     │
│                         ▼                         ▼                     │
│                ┌──────────────────┐     ┌──────────────────┐           │
│                │    FalkorDB      │     │   Redis          │           │
│                │    (Graph DB)    │     │   (BullMQ)       │           │
│                │    :6379         │     │   :6380          │           │
│                └──────────────────┘     └──────────────────┘           │
│                                                (Future)                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP (MCP Streamable HTTP)
                                    │ ws://host:3000/mcp
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENTS                                       │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │ Claude      │  │ Cursor      │  │ Custom      │  │ LangGraph   │   │
│  │ Desktop     │  │ IDE         │  │ Agents      │  │ Workflows   │   │
│  │             │  │             │  │             │  │             │   │
│  │ (via mcp-   │  │ (via mcp-   │  │ (direct     │  │ (MCP        │   │
│  │  remote)    │  │  remote)    │  │  HTTP)      │  │  client)    │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Docker Compose Configuration

```yaml
# docker-compose.yml
version: '3.8'

services:
  # Main MCP Server
  polyg-mcp:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"           # MCP HTTP endpoint
    environment:
      - NODE_ENV=production
      - FALKORDB_HOST=falkordb
      - FALKORDB_PORT=6379
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - LLM_PROVIDER=${LLM_PROVIDER:-openai}
      - LLM_MODEL=${LLM_MODEL:-gpt-4o-mini}
      - EMBEDDING_MODEL=${EMBEDDING_MODEL:-text-embedding-3-small}
    depends_on:
      - falkordb
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Graph Database
  falkordb:
    image: falkordb/falkordb:latest
    ports:
      - "6379:6379"           # Expose for debugging (optional)
    volumes:
      - falkordb_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Future: BullMQ Workers
  # polyg-worker:
  #   build:
  #     context: .
  #     dockerfile: Dockerfile.worker
  #   environment:
  #     - REDIS_HOST=redis
  #   depends_on:
  #     - redis
  #     - falkordb

  # Future: Redis for BullMQ
  # redis:
  #   image: redis:7-alpine
  #   ports:
  #     - "6380:6379"
  #   volumes:
  #     - redis_data:/data

volumes:
  falkordb_data:
  # redis_data:
```

### Client Connection Methods

#### 1. Claude Desktop (via mcp-remote)

Since Claude Desktop uses stdio, use `mcp-remote` as a bridge:

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "polyg": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:3000/mcp"
      ]
    }
  }
}
```

#### 2. Cursor IDE (via mcp-remote)

```json
// .cursor/mcp.json
{
  "mcpServers": {
    "polyg": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:3000/mcp"]
    }
  }
}
```

#### 3. Custom Agents (Direct HTTP)

```typescript
// Using MCP TypeScript SDK
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const transport = new StreamableHTTPClientTransport(
  new URL('http://localhost:3000/mcp')
);

const client = new Client({
  name: 'my-agent',
  version: '1.0.0',
});

await client.connect(transport);

// Use polyg-mcp tools
const result = await client.callTool('recall', {
  query: 'Why did the deployment fail?',
});
```

#### 4. LangChain / LangGraph Integration

```typescript
// Using MCP tools in LangGraph
import { McpToolkit } from 'langchain/tools/mcp';

const toolkit = new McpToolkit({
  serverUrl: 'http://localhost:3000/mcp',
});

const tools = await toolkit.getTools();
// tools: [recall, remember, add_entity, ...]
```

#### 5. Remote Deployment (Cloud/VPS)

```bash
# On your server
git clone https://github.com/yourname/polyg-mcp.git
cd polyg-mcp
cp .env.example .env
# Edit .env with your OPENAI_API_KEY
docker-compose up -d

# Connect from anywhere
# http://your-server-ip:3000/mcp
```

### Repository Structure (Monorepo)

```
polyg-mcp/
├── docker-compose.yml          # Full stack orchestration
├── Dockerfile                  # MCP server image
├── .env.example                # Environment template
│
├── packages/
│   ├── server/                 # MCP Server (main entry)
│   │   ├── src/
│   │   │   ├── index.ts        # Entry point
│   │   │   ├── server.ts       # MCP server setup
│   │   │   ├── http.ts         # HTTP transport handler
│   │   │   └── health.ts       # Health check endpoint
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── core/                   # Shared graph logic
│   │   ├── src/
│   │   │   ├── agents/         # Intent classifier, synthesizer
│   │   │   ├── graphs/         # Semantic, temporal, causal, entity
│   │   │   ├── executor/       # Parallel query execution
│   │   │   └── storage/        # FalkorDB adapter
│   │   └── package.json
│   │
│   ├── shared/                 # Types, schemas, utils
│   │   ├── src/
│   │   │   ├── types.ts
│   │   │   ├── schemas.ts      # Zod schemas
│   │   │   └── config.ts
│   │   └── package.json
│   │
│   └── cli/                    # Optional CLI tools
│       ├── src/
│       │   ├── import.ts       # Bulk import data
│       │   └── export.ts       # Export graph
│       └── package.json
│
├── examples/
│   ├── claude-desktop/         # Claude Desktop config
│   ├── langchain/              # LangChain integration
│   ├── langgraph/              # LangGraph workflow
│   └── custom-agent/           # Custom agent example
│
├── scripts/
│   ├── setup.sh                # First-time setup
│   └── seed.sh                 # Seed demo data
│
├── docs/
│   ├── getting-started.md
│   ├── configuration.md
│   ├── api-reference.md
│   └── deployment.md
│
├── pnpm-workspace.yaml         # Monorepo config
├── turbo.json                  # Turborepo (optional)
└── README.md
```

### Quick Start (User Perspective)

```bash
# 1. Clone the repo
git clone https://github.com/yourname/polyg-mcp.git
cd polyg-mcp

# 2. Configure environment
cp .env.example .env
# Edit .env: Add OPENAI_API_KEY (required)

# 3. Start the stack
docker-compose up -d

# 4. Verify it's running
curl http://localhost:3000/health
# {"status": "ok", "falkordb": "connected", "graphs": 4}

# 5. Connect Claude Desktop
# Add to claude_desktop_config.json (see above)

# Done! Start using polyg-mcp with Claude
```

### Environment Variables

```bash
# .env.example

# Required
OPENAI_API_KEY=sk-...           # For LLM + embeddings

# LLM Configuration
LLM_PROVIDER=openai             # openai | anthropic | ollama
LLM_MODEL=gpt-4o-mini           # Model for classifier/synthesizer
EMBEDDING_MODEL=text-embedding-3-small

# Ollama (if using local LLM)
OLLAMA_BASE_URL=http://host.docker.internal:11434

# Anthropic (if using Claude)
ANTHROPIC_API_KEY=sk-ant-...

# FalkorDB (defaults work with docker-compose)
FALKORDB_HOST=falkordb
FALKORDB_PORT=6379
FALKORDB_PASSWORD=              # Optional

# Server
PORT=3000
LOG_LEVEL=info
```

### Deployment Options

| Option | Setup | Best For |
|--------|-------|----------|
| **Local Docker** | `docker-compose up` | Development, testing |
| **VPS (DigitalOcean, Linode)** | Docker on VM | Personal/small team |
| **Railway/Render** | Connect repo, auto-deploy | Easy cloud hosting |
| **Kubernetes** | Helm chart (future) | Enterprise scale |
| **Air-gapped** | Docker + Ollama | Privacy-sensitive |

### Security Considerations

```yaml
# Production docker-compose.override.yml
services:
  polyg-mcp:
    environment:
      - API_KEY_REQUIRED=true       # Require API key for MCP
      - ALLOWED_ORIGINS=https://...  # CORS whitelist
    # Don't expose FalkorDB port in production

  falkordb:
    ports: []  # Remove external port exposure
```

---

## Testing Strategy

### Coverage Requirements

> **Minimum 80% code coverage is mandatory for all packages.**
>
> - All PRs must pass coverage gates before merge
> - Coverage is enforced in CI/CD pipeline
> - Run `pnpm test:coverage` to check locally

| Package | Branches | Functions | Lines | Statements |
|---------|----------|-----------|-------|------------|
| `@polyg/core` | ≥80% | ≥80% | ≥80% | ≥80% |
| `@polyg/server` | ≥80% | ≥80% | ≥80% | ≥80% |
| `@polyg/shared` | ≥80% | ≥80% | ≥80% | ≥80% |

```bash
# Run all tests with coverage
pnpm test:coverage

# Run specific test suites
pnpm test:unit          # Fast, no external deps
pnpm test:integration   # Requires FalkorDB
pnpm test:e2e           # Requires full Docker stack

# Watch mode for development
pnpm test:watch
```

### Test Pyramid

```
                    ┌─────────────────┐
                    │   E2E Tests     │  ← MCP client integration
                    │   (Few, Slow)   │
                    ├─────────────────┤
                    │  Integration    │  ← Full pipeline tests
                    │  Tests          │
                    ├─────────────────┤
                    │                 │
                    │   Unit Tests    │  ← Graph operations, agents
                    │   (Many, Fast)  │
                    │                 │
                    └─────────────────┘
```

### Unit Tests

#### Graph Operations (`packages/core/tests/graphs/`)

| Test Suite | Test Cases |
|------------|------------|
| **Entity Graph** | Create entity, update entity, delete entity, get by name, get by UUID, link entities, get relationships, property merge vs replace |
| **Temporal Graph** | Add event, add fact, query timeline, point-in-time query, fact invalidation, overlapping intervals, timezone handling |
| **Causal Graph** | Add causal link, traverse upstream, traverse downstream, chain depth limits, confidence scoring, cycle detection |
| **Semantic Graph** | Add concept, vector similarity search, k-NN retrieval, embedding dimension validation, similarity threshold |
| **Cross-Graph Linker** | Create X_ relationships, resolve cross-references, orphan detection |

#### Agent Tests (`packages/core/tests/agents/`)

| Test Suite | Test Cases |
|------------|------------|
| **Intent Classifier** | Single intent queries, multi-intent queries, entity extraction, timeframe parsing, causal direction detection, edge cases (empty query, very long query), confidence thresholds |
| **Synthesizer** | Single graph results, multi-graph aggregation, empty results handling, confidence calculation, follow-up generation, malformed input handling |
| **Prompts** | Prompt template rendering, variable substitution, token count estimation |

#### Executor Tests (`packages/core/tests/executor/`)

| Test Suite | Test Cases |
|------------|------------|
| **Parallel Executor** | Single graph query, multi-graph parallel, partial failure handling, timeout behavior, result aggregation |
| **Result Aggregator** | Merge strategies, deduplication, source tracking, empty result sets |

### Integration Tests

#### Full Pipeline (`packages/server/tests/integration/`)

```typescript
// Example integration test structure
describe('Recall Pipeline', () => {
  it('should handle temporal query end-to-end', async () => {
    // 1. Seed test data
    await seedTemporalEvents([
      { description: 'Deployment started', occurred_at: '2026-01-07T14:00:00Z' },
      { description: 'Deployment failed', occurred_at: '2026-01-07T14:30:00Z' },
    ]);

    // 2. Execute recall
    const result = await recall({ query: 'What happened on January 7th?' });

    // 3. Assert
    expect(result.sources).toContain('temporal');
    expect(result.answer).toContain('Deployment');
    expect(result.reasoning.temporal_context).toBeDefined();
  });

  it('should handle causal + temporal hybrid query', async () => {
    // Seed causal chain + temporal events
    // Query: "Why did the deployment fail last Tuesday?"
    // Assert: Both causal_chain and temporal_context in response
  });
});
```

| Test Scenario | What It Tests |
|---------------|---------------|
| **Temporal Query** | `recall("What happened yesterday?")` → Temporal graph only |
| **Causal Query** | `recall("Why did X fail?")` → Causal graph traversal |
| **Entity Query** | `recall("Who owns the auth service?")` → Entity graph |
| **Semantic Query** | `recall("What do we know about caching?")` → Semantic search |
| **Hybrid Query** | `recall("Why did auth fail after Tuesday's deploy?")` → Multi-graph |
| **Remember Flow** | `remember("The deploy failed due to missing env var")` → Extracts entities, facts, causal links |
| **Empty Graph** | Query on fresh database → Graceful empty response |
| **Large Result Set** | Query returning 100+ results → Pagination/truncation |

### End-to-End Tests

#### MCP Protocol Tests (`packages/server/tests/e2e/`)

| Test | Description |
|------|-------------|
| **MCP Handshake** | Client connects, lists tools, lists resources |
| **Tool Invocation** | Call each tool, verify response schema |
| **Error Handling** | Invalid tool params, DB connection failure, LLM timeout |
| **Concurrent Requests** | Multiple clients, simultaneous tool calls |
| **Health Endpoint** | `/health` returns correct status |

#### Docker Tests (`tests/docker/`)

| Test | Description |
|------|-------------|
| **Stack Startup** | `docker-compose up` succeeds, all services healthy |
| **Service Discovery** | MCP server can reach FalkorDB |
| **Persistence** | Data survives container restart |
| **Environment Config** | All env vars properly applied |

### Test Datasets

#### 1. Synthetic Datasets (Generated)

**Purpose:** Controlled testing with known ground truth

```typescript
// scripts/generate-test-data.ts

interface TestScenario {
  name: string;
  entities: Entity[];
  events: TemporalEvent[];
  facts: TemporalFact[];
  causalLinks: CausalLink[];
  expectedQueries: {
    query: string;
    expectedIntents: string[];
    expectedEntities: string[];
  }[];
}

const SCENARIOS: TestScenario[] = [
  {
    name: 'deployment-failure',
    entities: [
      { name: 'auth-service', type: 'Service' },
      { name: 'deploy-v2.3.1', type: 'Deployment' },
      { name: 'AUTH_SECRET', type: 'EnvVar' },
    ],
    events: [
      { description: 'Deployment v2.3.1 started', occurred_at: '2026-01-07T14:00:00Z' },
      { description: 'Auth service crashed', occurred_at: '2026-01-07T14:05:00Z' },
    ],
    causalLinks: [
      { cause: 'missing AUTH_SECRET', effect: 'auth service crash', confidence: 0.95 },
      { cause: 'deploy-v2.3.1', effect: 'missing AUTH_SECRET', confidence: 0.88 },
    ],
    expectedQueries: [
      {
        query: 'Why did auth crash?',
        expectedIntents: ['causal', 'entity'],
        expectedEntities: ['auth-service'],
      },
    ],
  },
  // More scenarios...
];
```

**Scenarios to Generate:**
| Scenario | Entities | Events | Causal Links | Purpose |
|----------|----------|--------|--------------|---------|
| Deployment Failure | 5 | 10 | 4 | Causal chain testing |
| Project Timeline | 8 | 50 | 2 | Temporal range queries |
| Team Structure | 20 | 5 | 0 | Entity relationship testing |
| Knowledge Evolution | 10 | 30 | 10 | Fact validity windows |
| Incident Response | 15 | 100 | 20 | Complex multi-graph |

#### 2. Adapted Academic Datasets

**LoCoMo (Long Context Memory)**
- Used by MAGMA paper for evaluation
- Tests long-horizon memory retrieval
- [Paper](https://arxiv.org/abs/2401.17476)

```typescript
// Adaptation strategy
interface LoCoMoAdapter {
  // Convert LoCoMo conversation format to polyg events/facts
  convertSession(session: LoCoMoSession): {
    events: TemporalEvent[];
    facts: TemporalFact[];
    entities: Entity[];
  };

  // Convert LoCoMo queries to recall format
  convertQuery(query: LoCoMoQuery): RecallInput;

  // Evaluate response against ground truth
  evaluate(response: SynthesizerOutput, groundTruth: LoCoMoAnswer): Score;
}
```

**LongMemEval**
- Multi-session memory benchmark
- Tests memory across conversation boundaries
- [Paper](https://arxiv.org/abs/2402.16288)

**ConvQuestions**
- Conversational QA over knowledge graphs
- Good for entity graph testing
- [Dataset](https://convex.mpi-inf.mpg.de/)

#### 3. Real-World Test Sets (Curated)

**Software Engineering Domain:**
```yaml
# test-data/software-engineering.yaml
entities:
  - name: "PostgreSQL"
    type: "Database"
    properties:
      version: "15.2"

  - name: "connection-pool-exhaustion"
    type: "Incident"

events:
  - description: "Database connection pool exhausted"
    occurred_at: "2026-01-05T09:15:00Z"
    entities: ["PostgreSQL", "connection-pool-exhaustion"]

  - description: "Increased pool size from 20 to 50"
    occurred_at: "2026-01-05T10:30:00Z"

causal_links:
  - cause: "Traffic spike from marketing campaign"
    effect: "connection-pool-exhaustion"
    confidence: 0.92
    evidence: "Correlated with campaign launch time"

queries:
  - input: "Why did the database connections run out?"
    expected_intents: ["causal"]
    expected_answer_contains: ["traffic spike", "marketing"]
```

**Personal Knowledge Domain:**
```yaml
# test-data/personal-knowledge.yaml
entities:
  - name: "Alice"
    type: "Person"
    properties:
      role: "Tech Lead"
      team: "Platform"

facts:
  - subject: "Alice"
    predicate: "works_on"
    object: "Auth Service"
    valid_from: "2025-06-01"
    valid_to: null  # Still valid

  - subject: "Alice"
    predicate: "works_on"
    object: "Payment Service"
    valid_from: "2024-01-01"
    valid_to: "2025-05-31"  # No longer valid

queries:
  - input: "What is Alice working on?"
    expected_intents: ["entity", "temporal"]
    expected_answer_contains: ["Auth Service"]
    expected_answer_not_contains: ["Payment Service"]  # Temporal awareness
```

### Test Utilities

```typescript
// packages/core/tests/utils/

// Test database setup/teardown
export async function setupTestGraph(): Promise<TestGraph>;
export async function teardownTestGraph(graph: TestGraph): Promise<void>;

// Data seeding
export async function seedScenario(scenario: TestScenario): Promise<void>;
export async function clearAllData(): Promise<void>;

// Assertions
export function assertIntentsMatch(actual: string[], expected: string[]): void;
export function assertEntitiesExtracted(actual: Entity[], expected: string[]): void;
export function assertCausalChainContains(chain: CausalLink[], expected: string): void;

// Mocks
export function mockLLMProvider(responses: Map<string, string>): LLMProvider;
export function mockEmbeddingProvider(dimensions: number): EmbeddingProvider;
```

### Test Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    // Unit tests: fast, no external deps
    include: ['packages/*/tests/unit/**/*.test.ts'],
    exclude: ['packages/*/tests/integration/**', 'packages/*/tests/e2e/**'],

    // Integration tests: need FalkorDB
    // Run with: pnpm test:integration
    environmentMatchGlobs: [
      ['packages/*/tests/integration/**', 'packages/server/tests/env/integration.ts'],
    ],

    // E2E tests: need full Docker stack
    // Run with: pnpm test:e2e
  },

  // Coverage thresholds
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html'],
    thresholds: {
      global: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
```

### Git Workflow

**Simplified main-only workflow** (single developer):

```
main
  │
  ├── feature/* ← New features
  ├── fix/* ← Bug fixes
  └── docs/* ← Documentation
```

1. Create branch from `main`: `git checkout -b feature/your-feature`
2. Make changes, ensure tests pass: `pnpm test:coverage` (≥80%)
3. Push and create PR to `main`
4. After CI passes, squash and merge

**Commit Convention:**
```
feat(scope): description   # New feature
fix(scope): description    # Bug fix
docs(scope): description   # Documentation
test(scope): description   # Tests
chore(scope): description  # Maintenance
```

### CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Build
        run: pnpm build

      - name: Test with coverage
        run: pnpm test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          fail_ci_if_error: false
```

> **Note:** Branch protection is disabled for private repos on GitHub Free tier.
> CI runs on push/PR but enforcement relies on developer discipline.

---

## Benchmarks

### Benchmark Categories

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         BENCHMARK FRAMEWORK                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │  PERFORMANCE    │  │  ACCURACY       │  │  RESOURCE USAGE         │ │
│  │                 │  │                 │  │                         │ │
│  │  • Latency      │  │  • Intent       │  │  • Memory               │ │
│  │  • Throughput   │  │  • Retrieval    │  │  • CPU                  │ │
│  │  • Cold Start   │  │  • Synthesis    │  │  • Storage              │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘ │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │  SCALE          │  │  COMPARISON     │  │  COST                   │ │
│  │                 │  │                 │  │                         │ │
│  │  • Entity count │  │  • vs Graphiti  │  │  • LLM tokens           │ │
│  │  • Query volume │  │  • vs MemoryGr. │  │  • Embedding tokens     │ │
│  │  • Concurrency  │  │  • vs Baseline  │  │  • $/1000 queries       │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1. Performance Benchmarks

#### Latency (P50, P95, P99)

| Operation | Target P50 | Target P95 | Target P99 | Actual P50 | Actual P95 | Actual P99 |
|-----------|------------|------------|------------|------------|------------|------------|
| **Full Recall Pipeline** | <600ms | <1000ms | <1500ms | TBD | TBD | TBD |
| ├─ Intent Classification | <200ms | <350ms | <500ms | TBD | TBD | TBD |
| ├─ Parallel Graph Query | <100ms | <200ms | <350ms | TBD | TBD | TBD |
| └─ Synthesis | <300ms | <450ms | <650ms | TBD | TBD | TBD |
| **Remember Pipeline** | <1200ms | <1800ms | <2500ms | TBD | TBD | TBD |
| **Direct Entity Lookup** | <30ms | <50ms | <100ms | TBD | TBD | TBD |
| **Timeline Query** | <50ms | <100ms | <200ms | TBD | TBD | TBD |
| **Causal Chain (depth=3)** | <80ms | <150ms | <250ms | TBD | TBD | TBD |
| **Semantic Search (k=10)** | <100ms | <180ms | <300ms | TBD | TBD | TBD |

#### Throughput (Queries/Second)

| Scenario | Target QPS | Actual QPS | Notes |
|----------|------------|------------|-------|
| Recall (single client) | >5 | TBD | Limited by LLM latency |
| Recall (10 concurrent) | >30 | TBD | Parallel LLM calls |
| Direct graph ops (single) | >100 | TBD | No LLM overhead |
| Direct graph ops (concurrent) | >500 | TBD | FalkorDB throughput |
| Mixed workload (80% read) | >50 | TBD | Realistic usage |

#### Cold Start

| Metric | Target | Actual |
|--------|--------|--------|
| Docker stack startup | <30s | TBD |
| First query latency | <3s | TBD |
| FalkorDB connection | <500ms | TBD |
| LLM provider init | <1s | TBD |

### 2. Accuracy Benchmarks

#### Intent Classification Accuracy

| Intent Type | Precision | Recall | F1 Score | Test Queries |
|-------------|-----------|--------|----------|--------------|
| Temporal | TBD | TBD | TBD | 100 |
| Causal | TBD | TBD | TBD | 100 |
| Entity | TBD | TBD | TBD | 100 |
| Semantic | TBD | TBD | TBD | 100 |
| Hybrid (multi-intent) | TBD | TBD | TBD | 100 |
| **Overall** | TBD | TBD | TBD | 500 |

#### Entity Extraction Accuracy

| Metric | Target | Actual |
|--------|--------|--------|
| Entity mention detection | >90% | TBD |
| Entity type classification | >85% | TBD |
| Entity resolution (to existing) | >80% | TBD |

#### Retrieval Quality (on LoCoMo/LongMemEval)

| Dataset | Metric | Baseline | polyg-mcp | Δ |
|---------|--------|----------|-----------|---|
| LoCoMo | Accuracy | TBD | TBD | TBD |
| LoCoMo | F1 | TBD | TBD | TBD |
| LongMemEval | Accuracy | TBD | TBD | TBD |
| LongMemEval | F1 | TBD | TBD | TBD |

#### Synthesis Quality (Human Eval)

| Criterion | Score (1-5) | Notes |
|-----------|-------------|-------|
| Relevance | TBD | Does answer address the query? |
| Accuracy | TBD | Are facts correct? |
| Completeness | TBD | All relevant info included? |
| Coherence | TBD | Is response well-structured? |
| Confidence calibration | TBD | Is confidence score accurate? |

### 3. Resource Usage Benchmarks

#### Memory Usage

| State | Target | Actual |
|-------|--------|--------|
| Idle (server only) | <150MB | TBD |
| Under load (10 QPS) | <500MB | TBD |
| Peak (burst traffic) | <1GB | TBD |

#### Storage (FalkorDB)

| Scale | Graph Size | Index Size | Total |
|-------|------------|------------|-------|
| Small (1K entities) | TBD | TBD | TBD |
| Medium (10K entities) | TBD | TBD | TBD |
| Large (100K entities) | TBD | TBD | TBD |
| XL (1M entities) | TBD | TBD | TBD |

#### CPU Usage

| Operation | Avg CPU | Peak CPU |
|-----------|---------|----------|
| Idle | <5% | TBD |
| Recall query | TBD | TBD |
| Bulk import (1K records) | TBD | TBD |

### 4. Scale Benchmarks

#### Entity Scale

| Entity Count | Add Latency | Query Latency | Memory |
|--------------|-------------|---------------|--------|
| 100 | TBD | TBD | TBD |
| 1,000 | TBD | TBD | TBD |
| 10,000 | TBD | TBD | TBD |
| 100,000 | TBD | TBD | TBD |
| 1,000,000 | TBD | TBD | TBD |

#### Relationship Scale

| Relationships | Traversal (depth=3) | Memory |
|---------------|---------------------|--------|
| 1K | TBD | TBD |
| 10K | TBD | TBD |
| 100K | TBD | TBD |
| 1M | TBD | TBD |

#### Concurrency Scale

| Concurrent Clients | Avg Latency | P99 Latency | Error Rate |
|--------------------|-------------|-------------|------------|
| 1 | TBD | TBD | TBD |
| 10 | TBD | TBD | TBD |
| 50 | TBD | TBD | TBD |
| 100 | TBD | TBD | TBD |

### 5. Comparison Benchmarks

#### vs Graphiti MCP

| Metric | Graphiti | polyg-mcp | Notes |
|--------|----------|-----------|-------|
| Query latency (simple) | TBD | TBD | |
| Query latency (complex) | TBD | TBD | Multi-graph advantage? |
| Intent accuracy | N/A | TBD | Graphiti has no intent classification |
| Causal reasoning | N/A | TBD | Graphiti has no causal graph |
| Setup complexity | TBD | TBD | Docker commands needed |

#### vs MemoryGraph

| Metric | MemoryGraph | polyg-mcp | Notes |
|--------|-------------|-----------|-------|
| Query latency | TBD | TBD | |
| Causal chain depth | TBD | TBD | |
| Multi-intent handling | N/A | TBD | |
| Synthesis quality | N/A | TBD | |

#### vs Baseline (No Memory)

| Task | No Memory | polyg-mcp | Improvement |
|------|-----------|-----------|-------------|
| Context recall | TBD | TBD | TBD |
| Temporal reasoning | TBD | TBD | TBD |
| Causal explanation | TBD | TBD | TBD |

### 6. Cost Benchmarks

#### LLM Token Usage

| Operation | Input Tokens | Output Tokens | Cost (GPT-4o-mini) |
|-----------|--------------|---------------|-------------------|
| Intent Classification | ~200 | ~150 | ~$0.00015 |
| Synthesis | ~500 | ~300 | ~$0.00035 |
| Remember (extraction) | ~400 | ~200 | ~$0.00025 |
| **Per Recall Query** | ~700 | ~450 | ~$0.0005 |

#### Embedding Token Usage

| Operation | Tokens | Cost (text-embedding-3-small) |
|-----------|--------|-------------------------------|
| Per entity | ~100 | ~$0.000002 |
| Per search query | ~50 | ~$0.000001 |

#### Cost Projections

| Usage Level | Queries/Day | Monthly Cost |
|-------------|-------------|--------------|
| Light (personal) | 100 | ~$1.50 |
| Medium (team) | 1,000 | ~$15 |
| Heavy (product) | 10,000 | ~$150 |

### Benchmark Tooling

```typescript
// packages/benchmarks/src/runner.ts

interface BenchmarkSuite {
  name: string;
  warmup: number;      // Warmup iterations
  iterations: number;  // Measured iterations
  setup: () => Promise<void>;
  teardown: () => Promise<void>;
  benchmarks: Benchmark[];
}

interface Benchmark {
  name: string;
  fn: () => Promise<void>;
}

interface BenchmarkResult {
  name: string;
  iterations: number;
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  stddev: number;
  opsPerSecond: number;
}

// Usage
const suite: BenchmarkSuite = {
  name: 'Recall Pipeline',
  warmup: 5,
  iterations: 100,
  setup: async () => { /* seed data */ },
  teardown: async () => { /* cleanup */ },
  benchmarks: [
    {
      name: 'temporal-query',
      fn: async () => {
        await recall({ query: 'What happened yesterday?' });
      },
    },
    {
      name: 'causal-query',
      fn: async () => {
        await recall({ query: 'Why did the service fail?' });
      },
    },
  ],
};
```

### Benchmark Data Collection

```yaml
# benchmarks/results/2026-01-15.yaml
metadata:
  date: 2026-01-15
  commit: abc123
  environment:
    node: 20.10.0
    docker: 24.0.7
    falkordb: 4.2.0
    llm_model: gpt-4o-mini

results:
  performance:
    recall_p50: 580
    recall_p95: 920
    recall_p99: 1350
    # ...

  accuracy:
    intent_precision: 0.91
    intent_recall: 0.88
    # ...

  scale:
    entities_10k_query_latency: 85
    # ...
```

### Benchmark Dashboard (Future)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    POLYG-MCP BENCHMARK DASHBOARD                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Latency Trend (P50)              Throughput                            │
│  ┌────────────────────┐           ┌────────────────────┐               │
│  │    ╭──╮            │           │         ╭──────────│               │
│  │ ╭──╯  ╰──╮   ╭─    │           │    ╭────╯          │               │
│  │ ╯        ╰───╯     │           │ ───╯               │               │
│  └────────────────────┘           └────────────────────┘               │
│  600ms → 580ms (-3%)              45 QPS → 52 QPS (+15%)               │
│                                                                         │
│  Accuracy (Intent Classification)  Cost per 1K Queries                 │
│  ┌────────────────────┐           ┌────────────────────┐               │
│  │ ████████████░░ 91% │           │ $0.48 → $0.45      │               │
│  └────────────────────┘           │ (-6% vs last week) │               │
│                                   └────────────────────┘               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Development Phases (Updated)

### Phase 1: Foundation (Week 1)

- [ ] Monorepo scaffolding (pnpm workspaces, TypeScript, Biome)
- [ ] MCP server with HTTP transport (Streamable HTTP)
- [ ] Health check endpoint
- [ ] FalkorDB connection layer
- [ ] LLM provider abstraction (OpenAI first)
- [ ] Basic schema for all 4 graphs
- [ ] Docker Compose setup
- [ ] `get_statistics` tool

### Phase 2: Core Graphs (Week 2)

- [ ] Entity graph CRUD
- [ ] Temporal graph (events, facts, timeline queries)
- [ ] Causal graph (links, chain traversal)
- [ ] Semantic graph with embeddings
- [ ] Cross-graph linker

### Phase 3: LLM Pipeline (Week 3)

- [ ] Intent Classifier implementation
- [ ] Parallel Graph Executor
- [ ] Synthesizer implementation
- [ ] High-level `recall` tool
- [ ] High-level `remember` tool

### Phase 4: Polish & Release (Week 4)

- [ ] All direct graph tools
- [ ] Error handling and retries
- [ ] Comprehensive tests
- [ ] Documentation (getting-started, API reference)
- [ ] Dockerfile optimization
- [ ] Example integrations (Claude Desktop, LangChain)
- [ ] GitHub repo setup + README

---

## Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Simple entity lookup | <100ms | Direct graph, no LLM |
| Full recall query | <800ms | 2 LLM calls + parallel graphs |
| Remember (extraction) | <1500ms | LLM extraction + writes |
| Intent classification | <300ms | GPT-4o-mini |
| Synthesis | <400ms | GPT-4o-mini |

---

## Differentiators Summary

| Feature | Graphiti MCP | MemoryGraph | **polyg-mcp** |
|---------|--------------|-------------|---------------|
| Multi-graph architecture | No | No | **Yes** |
| LLM intent classification | No | No | **Yes** |
| LLM synthesis | No | No | **Yes** |
| Parallel graph queries | N/A | N/A | **Yes** |
| Causal reasoning | No | Edges only | **Full chains** |
| TypeScript | No | Yes | **Yes** |
| Queue-ready design | No | No | **Yes** |
| Self-hosted Docker stack | Partial | No | **Yes** |
| One-command deployment | No | No | **Yes** |

---

## References

- [MAGMA Paper](https://arxiv.org/abs/2601.03236) — Multi-graph architecture inspiration
- [Graphiti](https://github.com/getzep/graphiti) — Temporal KG patterns
- [MemoryGraph](https://github.com/gregorydickson/memory-graph) — Causal edge patterns
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [FalkorDB TypeScript Client](https://github.com/FalkorDB/falkordb-ts)
- [BullMQ](https://docs.bullmq.io/) — Future queue integration

---

*Spec Version: 5.1 | Revised: January 13, 2026*
*Architecture: LLM Intent Classifier → Parallel Graph Queries → LLM Synthesizer*
*Deployment: Self-hosted Docker stack with MCP over HTTP*
*Git: Main-only workflow, CI on push/PR*
*Testing: Unit → Integration → E2E with synthetic + academic datasets*
