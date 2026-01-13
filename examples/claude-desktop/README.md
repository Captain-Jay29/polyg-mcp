# Claude Desktop Integration

## Setup

1. Start polyg-mcp:
   ```bash
   docker-compose up -d
   ```

2. Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):
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

3. Restart Claude Desktop

## Available Tools

- `recall` - Query memory with natural language
- `remember` - Store new information
- `get_entity`, `add_entity`, `link_entities` - Entity operations
- `query_timeline`, `add_event`, `add_fact` - Temporal operations
- `get_causal_chain`, `add_causal_link`, `explain_why` - Causal operations
- `search_semantic`, `add_concept` - Semantic operations
- `get_statistics`, `clear_graph`, `export_graph` - Management
