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
   cd packages/server && pnpm dev
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
- `-s, --server <url>` - MCP server URL (default: http://localhost:3000)
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
| `POLYG_SERVER_URL` | MCP server URL | `http://localhost:3000` |
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

The ReAct agent follows this loop:

1. **Thought**: LLM reasons about what information is needed
2. **Action**: LLM selects and calls MCP tools
3. **Observation**: Agent executes tools and returns results
4. **Repeat** until LLM has enough info to answer
5. **Answer**: LLM synthesizes final response

This validates that:
- Tool descriptions are clear enough for LLMs
- Tool schemas are correct
- Multi-step reasoning works
- The memory system returns useful data
