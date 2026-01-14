# polyg-mcp Examples

This directory contains example configurations for running polyg-mcp in various environments.

## Claude Desktop Integration

To use polyg-mcp with Claude Desktop:

1. Build the project:
   ```bash
   pnpm install && pnpm build
   ```

2. Start FalkorDB (using Docker):
   ```bash
   docker run -d --name falkordb -p 6379:6379 falkordb/falkordb:latest
   ```

3. Copy `claude-desktop-config.json` to your Claude Desktop config location:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

4. Update the config:
   - Replace `/path/to/polyg-mcp` with your actual installation path
   - Set your OpenAI API key in the `POLYG_LLM_API_KEY` field

5. Restart Claude Desktop

## Docker Compose

To run polyg-mcp with FalkorDB using Docker Compose:

1. Set your OpenAI API key:
   ```bash
   export OPENAI_API_KEY=your-api-key-here
   ```

2. Start the services:
   ```bash
   docker compose -f examples/docker-compose.yml up -d
   ```

3. Check health:
   ```bash
   curl http://localhost:3000/health
   ```

4. Stop the services:
   ```bash
   docker compose -f examples/docker-compose.yml down
   ```

## Available MCP Tools

Once connected, the following tools are available:

### High-Level Tools
- `recall` - Query memory using natural language (LLM-powered)
- `remember` - Store new information (extracts entities, facts, events)

### Entity Graph
- `get_entity` - Get entity by name/UUID with relationships
- `add_entity` - Create a new entity
- `link_entities` - Create relationship between entities

### Temporal Graph
- `query_timeline` - Query events in a time range
- `add_event` - Add a new event
- `add_fact` - Add a time-bounded fact

### Causal Graph
- `get_causal_chain` - Get upstream causes or downstream effects
- `add_causal_link` - Create cause-effect relationship
- `explain_why` - Get causal explanation for an event

### Semantic Graph
- `search_semantic` - Semantic similarity search
- `add_concept` - Add concept with auto-generated embedding

### Management
- `get_statistics` - Get statistics about all graphs
- `clear_graph` - Clear specified graph(s)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `POLYG_FALKORDB_HOST` | FalkorDB host | `localhost` |
| `POLYG_FALKORDB_PORT` | FalkorDB port | `6379` |
| `POLYG_FALKORDB_GRAPH_NAME` | Graph name | `polyg_memory` |
| `POLYG_LLM_PROVIDER` | LLM provider | `openai` |
| `POLYG_LLM_MODEL` | LLM model | `gpt-4o-mini` |
| `POLYG_LLM_API_KEY` | API key for LLM | - |
| `POLYG_EMBEDDINGS_PROVIDER` | Embeddings provider | `openai` |
| `POLYG_EMBEDDINGS_MODEL` | Embeddings model | `text-embedding-3-small` |
| `POLYG_EMBEDDINGS_DIMENSIONS` | Embedding dimensions | `1536` |
| `POLYG_MODE` | Server mode (`stdio`/`http`) | `stdio` |
| `PORT` | HTTP port (when in http mode) | `3000` |
