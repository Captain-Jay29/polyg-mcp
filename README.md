<p align="center">
  <img src="docs/assets/polyg-hero-banner.svg" alt="polyg-mcp" width="100%"/>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/polyg-mcp"><img src="https://img.shields.io/npm/v/polyg-mcp?style=for-the-badge&logo=npm&color=CB3837" alt="npm version"/></a>
  <a href="#-quick-start"><img src="https://img.shields.io/badge/Quick_Start-5_min-brightgreen?style=for-the-badge" alt="Quick Start"/></a>
  <a href="https://github.com/Captain-Jay29/polyg-mcp/stargazers"><img src="https://img.shields.io/github/stars/Captain-Jay29/polyg-mcp?style=for-the-badge&logo=github&color=yellow" alt="Stars"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License"/></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/></a>
</p>

<p align="center">
  <b>The memory system that understands causality.</b><br/>
  <sub>Ask "why did auth fail?" and get a traced causal chain — not just similar documents.</sub>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-how-polyg-mcp-thinks">How It Thinks</a> •
  <a href="#-the-four-memory-graphs">Architecture</a> •
  <a href="#-see-it-in-action">Demo</a> •
  <a href="#-quick-start">Quick Start</a>
</p>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🔗 Causal Chain Traversal
Trace cause→effect relationships with confidence scores. Answer "why" questions by walking the causal graph, not guessing from similar text.

### 🕐 Temporal Intelligence
Events are first-class citizens with timestamps. Reconstruct timelines, query time ranges, understand sequences.

</td>
<td width="50%">

### 🧠 Multi-Graph Reasoning
Four graphs (semantic, entity, temporal, causal) work together. One question can traverse all four for a complete answer.

### 🔌 MCP Native
Built for the Model Context Protocol — works with Claude, Cursor, and any MCP-compatible agent out of the box.

</td>
</tr>
</table>

---

## 🧩 Why polyg-mcp?

### The Problem

Your agent has memory. But can it answer **"why"**?

```
"Why did the auth service fail?"
```

Most memory systems return similar documents. polyg-mcp returns this:

```
JWT_SECRET removed (PR #1234) → deployment missing secret → CrashLoopBackOff → 503s → dashboard down
       ↓ 100%                        ↓ 100%                    ↓ 95%            ↓ 90%
```

*Confidence scores propagate through the chain — certainty degrades naturally at each causal hop.*

<table>
<tr><td>❌</td><td><b>Vector stores</b> — retrieve similar text, can't trace causality</td></tr>
<tr><td>❌</td><td><b>Simple graphs</b> — store relationships, don't model cause→effect</td></tr>
<tr><td>❌</td><td><b>Log aggregators</b> — show timelines, don't explain why</td></tr>
<tr><td>✅</td><td><b>polyg-mcp</b> — traces causal chains with confidence scores</td></tr>
</table>

### The polyg-mcp Solution

<p align="center">
  <img src="docs/assets/query-flow.svg" alt="Query Flow" width="100%"/>
</p>

---

## 🔬 How polyg-mcp Thinks

Under the hood, polyg-mcp uses adaptive intelligence to answer questions efficiently.

### Intent Classification

The LLM extracts intent type and dynamically adjusts traversal depth:

```
┌─────────────┬───────────────────────────────────────┐
│   Question  │           Depth Hints                 │
├─────────────┼───────────────────────────────────────┤
│  WHY        │  { causal: 3, temporal: 1, entity: 1 }│
│  WHEN       │  { temporal: 3, causal: 1, entity: 1 }│
│  WHO/WHAT   │  { entity: 2, causal: 1, temporal: 1 }│
│  EXPLORE    │  { semantic: 2, entity: 2, causal: 2 }│
└─────────────┴───────────────────────────────────────┘
```

### Linearization Strategies

Different intents use different ordering algorithms:

| Intent | Strategy | Why |
|--------|----------|-----|
| **WHY** | Topological sort | Causes appear before effects |
| **WHEN** | Chronological sort | Earliest events first |
| **WHO/WHAT** | Relevance-weighted | Most connected entities first |
| **EXPLORE** | Frequency-based | Most referenced nodes first |

### Multi-View Boosting

When a node appears in multiple graph views, it gets a relevance boost:

```
final_score = avg_score × 1.5^(view_count - 1)
```

| Views | Boost | Example |
|-------|-------|---------|
| 1 graph | 1.0× | Node only in semantic |
| 2 graphs | 1.5× | Found in semantic + entity |
| 3 graphs | 2.25× | Found in semantic + entity + causal |
| 4 graphs | 3.375× | Found in all four graphs |

### Pipeline Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                         MAGMA PIPELINE                               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────┐   ┌──────────┐   ┌──────────────────────────────────┐  │
│  │ Question│──▶│ Intent   │──▶│      Parallel Graph Expansion    │  │
│  │         │   │ Classify │   │  ┌────────┐ ┌────────┐ ┌───────┐ │  │
│  └─────────┘   └──────────┘   │  │Semantic│ │Temporal│ │Causal │ │  │
│                               │  │ Search │ │ Expand │ │Expand │ │  │
│                               │  └───┬────┘ └───┬────┘ └───┬───┘ │  │
│                               └─────┼───────────┼──────────┼─────┘  │
│                                     │           │          │        │
│                                     ▼           ▼          ▼        │
│                               ┌─────────────────────────────────┐   │
│                               │       Subgraph Merge            │   │
│                               │  (multi-view boost + dedup)     │   │
│                               └──────────────┬──────────────────┘   │
│                                              │                      │
│                                              ▼                      │
│                               ┌─────────────────────────────────┐   │
│                               │   Linearize for LLM Context     │   │
│                               │  (strategy based on intent)     │   │
│                               └──────────────┬──────────────────┘   │
│                                              │                      │
│                                              ▼                      │
│                               ┌─────────────────────────────────┐   │
│                               │      Synthesize Answer          │   │
│                               └─────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 🧠 The Four Memory Graphs

<p align="center">
  <img src="docs/assets/four-graphs-architecture.svg" alt="Four Graphs Architecture" width="100%"/>
</p>

| Graph | Purpose | Example Query |
|:------|:--------|:--------------|
| **🔵 Semantic** | Concepts, similarity, embeddings | *"What do we know about authentication?"* |
| **🟢 Temporal** | Events, timestamps, sequences | *"What happened last Tuesday?"* |
| **🟠 Causal** | Cause → effect relationships | *"Why did the deployment fail?"* |
| **🔴 Entity** | Persistent objects, ownership | *"Who owns the payment service?"* |

### Cross-Graph Linking

The secret sauce: **X_ relationships** connect nodes across graphs, enabling seamless multi-graph traversal.

```
                    ┌─────────────┐
                    │  S_Concept  │
                    │  (semantic) │
                    └──────┬──────┘
                           │ X_REPRESENTS
                           ▼
        ┌──────────────────────────────────────┐
        │              E_Entity                │
        │             (the hub)                │
        └───────┬─────────────┬────────────────┘
                │             │
           X_INVOLVES    X_AFFECTS
                │             │
                ▼             ▼
         ┌──────────┐   ┌──────────┐
         │ T_Event  │   │  C_Node  │
         │(temporal)│   │ (causal) │
         └────┬─────┘   └──────────┘
              │ X_REFERS_TO
              ▼
         ┌──────────┐
         │  C_Node  │
         └──────────┘
```

| Cross-Link | Purpose |
|------------|---------|
| `X_REPRESENTS` | Semantic concept → Entity it describes |
| `X_INVOLVES` | Event → Entities that participated |
| `X_AFFECTS` | Causal node → Entities impacted |
| `X_REFERS_TO` | Event → Causal node it triggered |

One question like *"Why did auth fail after Tuesday's deployment?"* traverses all four graphs seamlessly through these links.

---

## 🚀 Quick Start

### Install from npm (Recommended)

```bash
# Install globally
npm install -g polyg-mcp

# Or run directly with npx
npx polyg-mcp
```

### Prerequisites: FalkorDB

polyg-mcp requires a FalkorDB instance for graph storage:

```bash
# Quickest: run FalkorDB in Docker
docker run -d -p 6379:6379 falkordb/falkordb
```

### Connect to Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "polyg": {
      "command": "npx",
      "args": ["polyg-mcp"],
      "env": {
        "OPENAI_API_KEY": "your-key-here",
        "FALKORDB_HOST": "localhost",
        "FALKORDB_PORT": "6379"
      }
    }
  }
}
```

### Using Docker Compose (Full Stack)

For a complete setup with FalkorDB included:

```bash
git clone https://github.com/Captain-Jay29/polyg-mcp.git
cd polyg-mcp

# Configure environment
cp .env.example .env

# Start polyg-mcp + FalkorDB
docker-compose up -d
```

### From Source (Development)

```bash
# Clone and install
git clone https://github.com/Captain-Jay29/polyg-mcp.git
cd polyg-mcp
npm install

# Configure and run
cp .env.example .env
npm run dev
```

---

## 🔌 MCP Tools

### MAGMA Retrieval Tools (6 tools)

| Tool | Purpose |
|------|---------|
| `semantic_search` | Find seed concepts via vector similarity |
| `entity_lookup` | Expand entity relationships from seeds |
| `temporal_expand` | Query events involving seed entities |
| `causal_expand` | Traverse causal chains from seed entities |
| `subgraph_merge` | Combine and score graph views |
| `linearize_context` | Format merged subgraph for LLM |

### Write Tools (7 tools)

| Tool | Purpose |
|------|---------|
| `remember` | Store natural language memory |
| `add_entity` | Add entity to graph |
| `add_event` | Add temporal event |
| `add_fact` | Add time-bounded fact |
| `add_concept` | Add semantic concept |
| `add_causal_link` | Create cause → effect link |
| `link_entities` | Create entity relationship |

### Admin Tools (2 tools)

| Tool | Purpose |
|------|---------|
| `get_statistics` | Get graph statistics |
| `clear_graph` | Clear specific graph |

---

## 🎯 Live Example

**Query:**
```
Why did the auth service fail after the Tuesday deployment?
```

**MAGMA Pipeline:**

1. **Intent Classification** → Detects: `WHY` intent with depth hints (causal=3, temporal=1)
2. **Semantic Search** → Finds seed concepts matching "auth service", "deployment", "failure"
3. **Seed Extraction** → Uses X_REPRESENTS links to find entity IDs
4. **Parallel Expansion** → Causal chains (depth 3) + Temporal events (depth 1)
5. **Subgraph Merge** → Combine views, boost nodes found in multiple graphs
6. **Linearization** → Order nodes for causal reasoning (cause → effect)
7. **Synthesis** → LLM generates answer from structured context

**Answer:**
> "The auth service failed because the AUTH_SECRET environment variable was missing in the Tuesday deployment. The config was refactored on Monday, and the new deployment template didn't include the secret."

---

## 🎬 See It In Action

Real output from the polyg-mcp showcase CLI demonstrating multi-graph traversal:

### WHY Question — Causal Chain Traversal

```
Query: "What caused the auth service to fail?"

CAUSAL CHAIN (traversed automatically):
├─ JWT_SECRET accidentally removed in PR #1234
│   ↓ (100%)
├─ auth-service deployment missing JWT_SECRET
│   ↓ (100%)
├─ auth-service crashed on startup
│   ↓ (100%)
├─ auth-service pod entered CrashLoopBackOff
│   ↓ (95%)
├─ api-gateway returned 503 errors
│   ↓ (90%)
└─ user-dashboard login became unresponsive

Root cause identified with full confidence chain.
```

### WHEN Question — Timeline Reconstruction

```
Query: "What happened between 2pm and 3pm?"

TIMELINE (12 events):
14:00  ● Bob started deployment of auth-service v2.3.0
14:02  ● Kubernetes pulled new auth-service container image
14:03  ▲ auth-service pod entered CrashLoopBackOff
14:03  ▲ auth-service logs: "Error: JWT_SECRET not set"
14:04  ▲ api-gateway started returning 503 errors
14:05  ● PagerDuty alert triggered for auth-service downtime
14:08  ▲ Alice began investigating CrashLoopBackOff
14:15  ● Alice discovered JWT_SECRET missing from manifest
14:18  ● Bob confirmed JWT_SECRET removed in PR #1234
14:22  ● Alice redeployed with fix
14:24  ● auth-service pod became healthy
14:26  ● All services recovered, incident closed
```

### WHO Question — Entity Relationship Mapping

```
Query: "Who was involved in the incident response?"

ENTITIES DISCOVERED:
  [PER] alice  —  Role: SRE, Team: platform
  [PER] bob    —  Role: Developer, Team: platform

RELATIONSHIPS:
  alice  ─investigated─▶  auth-service
  alice  ─discovered─▶    JWT_SECRET (missing)
  alice  ─fixed─▶         deployment manifest
  bob    ─deployed─▶      auth-service (caused incident)
  bob    ─removed─▶       JWT_SECRET (in PR #1234)
```

### CASCADE Question — Blast Radius Analysis

```
Query: "What services were affected?"

SERVICE DEPENDENCIES:
  user-dashboard ──DEPENDS_ON──▶ api-gateway ──DEPENDS_ON──▶ auth-service
                                                                   ▲
                                                              (root cause)

BLAST RADIUS:
  auth-service  →  api-gateway  →  user-dashboard
       │               │                 │
    crashed        503 errors      login broken
```

---

## ⚡ Performance

| Metric | Value |
|:-------|:------|
| MAGMA pipeline steps | 7 (classify → search → seed → expand → merge → linearize → synthesize) |
| Parallel graph expansion | Entity, Temporal, Causal expanded simultaneously via `Promise.all` |
| LLM calls per query | 2 (intent classify + synthesize) |
| Intent-based depth | Adaptive (WHY=deep causal, WHEN=deep temporal, etc.) |
| Multi-view boosting | `score × 1.5^(views-1)` — nodes in multiple graphs rank higher |
| Graceful degradation | `Promise.allSettled` — one graph failure doesn't kill the query |
| Algorithm complexity | Semantic: O(n×d), Entity BFS: O(V+E), Causal paths: O(V+E) |

---

## 🛠 Configuration

```bash
# .env
OPENAI_API_KEY=sk-...          # Required for LLM calls
EMBEDDING_MODEL=text-embedding-3-small
LLM_MODEL=gpt-4o-mini

# Optional
POLYG_PORT=3000
POLYG_LOG_LEVEL=info
```

---

## 📦 Roadmap

- [x] Core multi-graph architecture (Entity, Temporal, Causal, Semantic)
- [x] MAGMA retrieval pipeline (intent → seed → expand → merge → linearize)
- [x] LLM intent classification (WHY/WHEN/WHO/WHAT/EXPLORE)
- [x] Cross-graph linking (X_REPRESENTS, X_INVOLVES)
- [x] MCP tool interface (15 tools: 6 MAGMA + 7 write + 2 admin)
- [x] FalkorDB persistent storage
- [ ] Semantic indexing in write tools (auto X_REPRESENTS creation)
- [ ] Graph visualization UI
- [ ] Streaming responses

---

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) first.

```bash
# Run tests
npm test

# Run linting
npm run lint

# Build
npm run build
```

---

## 📄 License

[MIT](LICENSE) © 2025

---

<p align="center">
  <b>If this resonates with you, consider giving it a ⭐</b><br/>
  <sub>Built for agents that need to answer <i>"why"</i> — not just <i>"what"</i></sub>
</p>

<p align="center">
  <a href="https://github.com/Captain-Jay29/polyg-mcp/issues">Report Bug</a> •
  <a href="https://github.com/Captain-Jay29/polyg-mcp/issues">Request Feature</a> •
  <a href="https://discord.gg/yourserver">Discord</a>
</p>
