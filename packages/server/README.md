# polyg-mcp

**The memory system that understands causality.**

Ask "why did auth fail?" and get a traced causal chain — not just similar documents.

[![npm version](https://img.shields.io/npm/v/polyg-mcp.svg)](https://www.npmjs.com/package/polyg-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## Quick Start

### 1. Start FalkorDB

```bash
docker run -p 6379:6379 falkordb/falkordb
```

### 2. Run polyg-mcp

```bash
npx polyg-mcp
```

That's it. The MCP server is now running.

---

## Connect to Claude Desktop

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

---

## What Makes polyg-mcp Different?

Most memory systems return similar documents. polyg-mcp traces **causal chains**:

```
"Why did the auth service fail?"

JWT_SECRET removed → deployment missing secret → CrashLoopBackOff → 503s → dashboard down
     ↓ 100%              ↓ 100%                      ↓ 95%           ↓ 90%
```

### Four Graphs Working Together

| Graph | What it answers |
|-------|-----------------|
| **Semantic** | "What do we know about X?" |
| **Entity** | "What depends on what?" |
| **Temporal** | "What happened when?" |
| **Causal** | "Why did X happen?" |

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | - | For embeddings and LLM calls |
| `FALKORDB_HOST` | No | `localhost` | FalkorDB host |
| `FALKORDB_PORT` | No | `6379` | FalkorDB port |
| `EMBEDDING_MODEL` | No | `text-embedding-3-small` | OpenAI embedding model |
| `LLM_MODEL` | No | `gpt-4o-mini` | OpenAI LLM model |

---

## MCP Tools

### Retrieval (6 tools)
`semantic_search` · `entity_lookup` · `temporal_expand` · `causal_expand` · `subgraph_merge` · `linearize_context`

### Write (7 tools)
`remember` · `add_entity` · `add_event` · `add_fact` · `add_concept` · `add_causal_link` · `link_entities`

### Admin (2 tools)
`get_statistics` · `clear_graph`

---

## Links

- [GitHub Repository](https://github.com/Captain-Jay29/polyg-mcp) — Full documentation, contributing guide, and source code
- [Report Issues](https://github.com/Captain-Jay29/polyg-mcp/issues)

---

## License

MIT © Captain-Jay29
