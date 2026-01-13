<p align="center">
  <img src="docs/assets/polyg-hero-banner.svg" alt="polyg-mcp" width="100%"/>
</p>

<p align="center">
  <a href="#-quick-start"><img src="https://img.shields.io/badge/Quick_Start-5_min-brightgreen?style=for-the-badge" alt="Quick Start"/></a>
  <a href="https://github.com/yourname/polyg-mcp/stargazers"><img src="https://img.shields.io/github/stars/yourname/polyg-mcp?style=for-the-badge&logo=github&color=yellow" alt="Stars"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License"/></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/></a>
</p>

<p align="center">
  <b>Stop asking your agent to keyword-search a single graph.</b><br/>
  Let it <i>understand intent</i>, <i>query multiple memories in parallel</i>, and <i>reason like a human</i>.
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

### 🧠 LLM Intent Classification
Automatically understands *what* the user is asking — whether it's about concepts, events, causes, or entities.

### ⚡ Parallel Graph Queries  
Queries only the relevant memory graphs simultaneously, not sequentially through a single store.

</td>
<td width="50%">

### 🔗 Multi-Graph Synthesis
Combines results from multiple knowledge dimensions into a single, coherent, reasoned answer.

### 🔌 MCP Native
Built for the Model Context Protocol — works with Claude, Cursor, LangGraph, and any MCP-compatible agent.

</td>
</tr>
</table>

---

## 🧩 Why polyg-mcp?

### The Problem

Most MCP memory servers work like this:

```
User Query → Keyword Search → Single Graph → Raw Results
```

<table>
<tr><td>❌</td><td>No understanding of <i>intent</i></td></tr>
<tr><td>❌</td><td>No temporal or causal reasoning</td></tr>
<tr><td>❌</td><td>No synthesis across dimensions</td></tr>
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

### Using Docker (Recommended)

```bash
git clone https://github.com/yourname/polyg-mcp.git
cd polyg-mcp

# Configure environment
cp .env.example .env

# Start the server
docker-compose up -d
```

### From Source

```bash
# Clone and install
git clone https://github.com/yourname/polyg-mcp.git
cd polyg-mcp
npm install

# Configure and run
cp .env.example .env
npm run dev
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
        "OPENAI_API_KEY": "your-key-here"
      }
    }
  }
}
```

---

## 🔌 MCP Tools

### `recall` — Query Memory

```typescript
recall({ query: "Why did the auth service fail after the Tuesday deployment?" })
```

**Response:**
> "The auth service failed because the AUTH_SECRET environment variable was missing in the Tuesday deployment. This was caused by the config refactor merged on Monday."

### `remember` — Store Memory

```typescript
remember({ 
  content: "Deployment failed due to missing AUTH_SECRET",
  metadata: { type: "incident", service: "auth" }
})
```

### `forget` — Remove Memory

```typescript
forget({ id: "memory-uuid-here" })
```

---

## 🎯 Live Example

**Query:**
```
Why did the auth service fail after the Tuesday deployment?
```

**What happens internally:**

1. **Intent Classification** → Detects: `causal` + `temporal`
2. **Parallel Queries** → Queries Causal Graph + Temporal Graph simultaneously
3. **Synthesis** → LLM merges findings into coherent explanation

**Answer:**
> "The auth service failed because the AUTH_SECRET environment variable was missing in the Tuesday deployment. The config was refactored on Monday, and the new deployment template didn't include the secret. The service owner was notified at 2:34 PM."

---

## ⚡ Performance

| Metric | Value |
|:-------|:------|
| Parallel query execution | ✅ Up to 4 graphs simultaneously |
| LLM calls per query | 2 (classify + synthesize) |
| Average response time | ~800ms |
| Memory overhead | Minimal (graph indices in-memory) |

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

- [x] Core multi-graph architecture
- [x] LLM intent classification
- [x] Parallel query execution
- [x] MCP tool interface
- [ ] Persistent storage backends (PostgreSQL, Redis)
- [ ] Graph visualization UI
- [ ] Custom graph definitions
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
  <sub>Built with 🧠 for agents that need to <i>actually remember</i></sub>
</p>

<p align="center">
  <a href="https://github.com/yourname/polyg-mcp/issues">Report Bug</a> •
  <a href="https://github.com/yourname/polyg-mcp/issues">Request Feature</a> •
  <a href="https://discord.gg/yourserver">Discord</a>
</p>
