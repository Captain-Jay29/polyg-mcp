# Getting Started with polyg-mcp

## Prerequisites

- Docker and Docker Compose
- Node.js 20+
- pnpm 9+
- OpenAI API key (or Anthropic/Ollama)

## Quick Start

```bash
# Clone the repo
git clone https://github.com/yourname/polyg-mcp.git
cd polyg-mcp

# Configure environment
cp .env.example .env
# Edit .env: Add OPENAI_API_KEY

# Start the stack
docker-compose up -d

# Verify it's running
curl http://localhost:3000/health
```

## Connect Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "polyg": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:3000/mcp"]
    }
  }
}
```

Restart Claude Desktop.

## First Queries

Try these in Claude:

- "Remember that the auth service was deployed on January 7th"
- "What do I know about the auth service?"
- "Why did the deployment fail?"

## Next Steps

- [Configuration](./configuration.md)
- [API Reference](./api-reference.md)
- [Deployment](./deployment.md)
