# Configuration

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes* | - | OpenAI API key |
| `ANTHROPIC_API_KEY` | Yes* | - | Anthropic API key |
| `LLM_PROVIDER` | No | `openai` | LLM provider: openai, anthropic, ollama |
| `LLM_MODEL` | No | `gpt-4o-mini` | Model for classification/synthesis |
| `EMBEDDING_MODEL` | No | `text-embedding-3-small` | Embedding model |
| `FALKORDB_HOST` | No | `falkordb` | FalkorDB host |
| `FALKORDB_PORT` | No | `6379` | FalkorDB port |
| `PORT` | No | `3000` | Server port |
| `LOG_LEVEL` | No | `info` | Log level |

*At least one LLM API key required unless using Ollama.

## Using Ollama (Local LLM)

```bash
# .env
LLM_PROVIDER=ollama
LLM_MODEL=llama3
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

## Custom Configuration

```typescript
import { loadConfig } from '@polyg-mcp/shared';

const config = loadConfig({
  llm: {
    provider: 'openai',
    model: 'gpt-4o',
    classifierMaxTokens: 800,
  },
  execution: {
    parallelTimeout: 10000,
  },
});
```
