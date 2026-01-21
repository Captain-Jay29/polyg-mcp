# polyg-mcp E2E Tests

End-to-end tests using a ReAct agent to validate the MCP server and multi-graph memory system.

## Architecture

```
tests/e2e/
├── agent/                 # ReAct agent implementation
│   ├── cli.ts            # CLI interface
│   ├── mcp-client.ts     # MCP client wrapper
│   ├── react-agent.ts    # ReAct agent core
│   └── types.ts          # Type definitions
├── datasets/             # Test data scenarios
│   └── deployment-incident.ts
├── scenarios/            # Test files
│   └── deployment-incident.test.ts
├── seed.ts               # Data seeding script
└── vitest.config.ts      # Test configuration
```

## Prerequisites

1. FalkorDB running:
   ```bash
   docker run -d -p 6379:6379 -p 3000:3000 falkordb/falkordb:latest
   ```

2. polyg-mcp server running:
   ```bash
   cd packages/server && PORT=4000 POLYG_MODE=http pnpm dev
   ```

3. OpenAI API key set:
   ```bash
   export OPENAI_API_KEY=your-key
   ```

## Usage

### Interactive Agent CLI

Chat with the agent interactively:

```bash
# From monorepo root
pnpm --filter @polyg-mcp/e2e agent:interactive

# Or from tests/e2e directory
pnpm agent:interactive
```

CLI options:
- `-i, --interactive` - Interactive REPL mode
- `-v, --verbose` - Show reasoning steps
- `-q, --query <query>` - Run single query
- `-s, --server <url>` - MCP server URL (default: http://localhost:4000)
- `-m, --model <model>` - OpenAI model (default: gpt-4o-mini)

### Seed Test Data

```bash
# Seed deployment incident dataset
pnpm --filter @polyg-mcp/e2e seed:deployment
```

### Run E2E Tests

```bash
# Run all e2e tests
pnpm --filter @polyg-mcp/e2e test

# With verbose output
VERBOSE=true pnpm --filter @polyg-mcp/e2e test
```

## Test Datasets

### Deployment Incident

Simulates a production incident caused by a missing environment variable:

**Scenario:**
1. Developer deploys auth-service v2.3.0
2. JWT_SECRET environment variable is missing (accidentally removed in PR)
3. auth-service crashes in CrashLoopBackOff
4. Cascading failures affect api-gateway and user-dashboard
5. SRE investigates, finds root cause, and fixes

**Tests:**
- Causal reasoning: "What caused the auth service to fail?"
- Temporal queries: "What happened between 2pm and 3pm?"
- Entity relationships: "What services depend on auth-service?"
- Multi-graph synthesis: "Give me a complete incident timeline"

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | (required) |
| `POLYG_SERVER_URL` | MCP server URL | `http://localhost:4000` |
| `POLYG_AGENT_MODEL` | LLM model | `gpt-4o-mini` |
| `VERBOSE` | Show reasoning | `false` |

## Adding New Datasets

1. Create a new file in `datasets/`:
   ```typescript
   // datasets/my-scenario.ts
   export const MY_SCENARIO_DATA = { ... };
   export const TEST_QUERIES = [ ... ];
   export async function seedMyScenario(client: MCPClient) { ... }
   ```

2. Add test scenarios in `scenarios/`:
   ```typescript
   // scenarios/my-scenario.test.ts
   import { seedMyScenario } from '../datasets/my-scenario.js';
   ```

3. Update `seed.ts` to handle the new dataset.

## How the Agent Works

The ReAct agent follows the MAGMA retrieval pattern:

1. **Thought**: LLM reasons about which graphs to query
2. **semantic_search**: Always start by finding seed concepts via vector similarity
3. **Expand from seeds**: Based on query type:
   - **causal_expand** for WHY questions (cause-effect chains)
   - **entity_lookup** for WHO/WHAT questions (relationships)
   - **temporal_expand** for WHEN questions (events in time)
4. **Optionally merge**: Use `subgraph_merge` + `linearize_context` for complex queries
5. **Answer**: LLM synthesizes final response from graph data

### Available Tools (15 total)

**Management (2):**
- `get_statistics` - Graph metrics
- `clear_graph` - Reset data

**Write (7):**
- `remember` - Store structured info
- `add_entity`, `link_entities` - Entity graph
- `add_event`, `add_fact` - Temporal graph
- `add_causal_link` - Causal graph
- `add_concept` - Semantic graph

**MAGMA Retrieval (6):**
- `semantic_search` - Find concepts by similarity
- `entity_lookup` - Expand entity relationships
- `temporal_expand` - Query events in time range
- `causal_expand` - Traverse cause-effect chains
- `subgraph_merge` - Combine graph views
- `linearize_context` - Format for LLM

This validates that:
- MAGMA retrieval flow works correctly
- Tool descriptions guide LLMs to proper usage
- Multi-graph queries return coherent results
- Semantic concepts enable effective graph entry
