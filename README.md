# polyg-mcp

> Multi-Graph Agent Memory via MCP — Self-hosted, Docker-deployable

**polyg-mcp** is a Model Context Protocol (MCP) server that provides LLM agents with intelligent, multi-graph memory. Unlike single-graph solutions, polyg-mcp uses four orthogonal graphs (Semantic, Temporal, Causal, Entity) with LLM-powered query routing.

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/polyg-mcp.git
cd polyg-mcp
cp .env.example .env
# Add your OPENAI_API_KEY to .env
docker-compose up -d
```

## Documentation

See [PROJECT_SPEC.md](../PROJECT_SPEC.md) for full specification.

## License

MIT
