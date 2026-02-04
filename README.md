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
  <a href="#-the-four-memory-graphs">Architecture</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-mcp-tools">API</a> •
  <a href="#-why-polyg-mcp">Why polyg?</a>
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

## ⚡ Performance

| Metric | Value |
|:-------|:------|
| MAGMA pipeline steps | 7 (classify → search → seed → expand → merge → linearize → synthesize) |
| Parallel graph expansion | ✅ Entity, Temporal, Causal expanded simultaneously |
| LLM calls per query | 2 (intent classify + synthesize) |
| Intent-based depth | Adaptive (WHY=deep causal, WHEN=deep temporal, etc.) |

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
