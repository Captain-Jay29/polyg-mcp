# Testing Guide

## Current Status

**Total Tests: 509** | **Target Coverage: 80%**

| Package | Tests | Coverage |
|---------|-------|----------|
| `@polyg-mcp/core` | 354 | ~85% |
| `@polyg-mcp/server` | 134 | ~76% |
| `@polyg-mcp/shared` | 21 | ~90% |

## Test Summary by Component

### Core Package (354 tests)

| Component | Tests | PR |
|-----------|-------|-----|
| Entity Graph | 24 | #18 |
| Temporal Graph | 24 | #18 |
| Causal Graph | 27 | #18 |
| Semantic Graph | 30 | #18 |
| Cross-Linker | 42 | #21 |
| Parsers | 59 | #22 |
| Orchestrator | 18 | #19 |
| Parallel Executor | 19 | #19 |
| Result Aggregator | 13 | #19 |
| Intent Classifier | 8 | #4 |
| Synthesizer | 8 | #4 |
| LLM Provider (OpenAI) | 22 | #4 |
| Embeddings Provider | 22 | #4 |
| FalkorDB Adapter | 35 | #3 |

### Server Package (134 tests)

| Component | Tests | PR |
|-----------|-------|-----|
| MCP Server | 29 | #20 |
| HTTP Transport | 31 | #20, #24 |
| Tool Registration | 44 | #17 |
| Tool Handlers | 30 | #23 |

## Running Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run specific package
cd packages/core && pnpm vitest run

# Preserve test data for visualization
KEEP_TEST_DATA=1 pnpm test
```

## Test Data Visualization

Test data can be viewed in FalkorDB Browser:

1. Start FalkorDB: `docker run -p 6379:6379 -p 3000:3000 falkordb/falkordb:latest`
2. Run tests with: `KEEP_TEST_DATA=1 pnpm test`
3. Open http://localhost:3000
4. Query: `MATCH (n) RETURN n`

## Coverage Gaps

Areas needing additional tests:

| Area | Current | Target | Notes |
|------|---------|--------|-------|
| `src/tools/*.ts` stubs | 0% | N/A | Unused stubs (real impl in server.ts) |

**Recently achieved:**
- `http.ts`: 84% ✅ (PR #24)
- `server.ts`: 85% ✅ (PR #23)

---

## Future: Integration Tests

Integration tests exercise the full pipeline with real components.

### Planned Scenarios

| Scenario | Description |
|----------|-------------|
| Temporal Query | `recall("What happened yesterday?")` → Temporal graph |
| Causal Query | `recall("Why did X fail?")` → Causal traversal |
| Entity Query | `recall("Who owns auth service?")` → Entity graph |
| Semantic Query | `recall("What do we know about caching?")` → Vector search |
| Hybrid Query | `recall("Why did auth fail after deploy?")` → Multi-graph |
| Remember Flow | `remember("Deploy failed due to missing env var")` → Extraction |

### Test Structure

```typescript
describe('Recall Pipeline', () => {
  it('should handle temporal query end-to-end', async () => {
    // 1. Seed test data
    await seedTemporalEvents([...]);

    // 2. Execute recall
    const result = await recall({ query: 'What happened on January 7th?' });

    // 3. Assert
    expect(result.sources).toContain('temporal');
    expect(result.answer).toContain('Deployment');
  });
});
```

---

## Future: E2E Tests

End-to-end tests verify MCP protocol compliance.

| Test | Description |
|------|-------------|
| MCP Handshake | Client connects, lists tools |
| Tool Invocation | Call each tool, verify schema |
| Error Handling | Invalid params, DB failure, LLM timeout |
| Concurrent Requests | Multiple clients, simultaneous calls |
| Health Endpoint | `/health` returns correct status |

### Docker Tests

| Test | Description |
|------|-------------|
| Stack Startup | `docker-compose up` succeeds |
| Service Discovery | Server reaches FalkorDB |
| Persistence | Data survives restart |

---

## Test Datasets

### Synthetic (Recommended)

Generate controlled test data with known ground truth:

```typescript
interface TestScenario {
  name: string;
  entities: Entity[];
  events: TemporalEvent[];
  causalLinks: CausalLink[];
  expectedQueries: { query: string; expectedIntents: string[] }[];
}
```

**Scenarios:**
- Deployment Failure (causal chain testing)
- Project Timeline (temporal range queries)
- Team Structure (entity relationships)
- Incident Response (complex multi-graph)

### Academic Datasets

| Dataset | Use Case | Link |
|---------|----------|------|
| LoCoMo | Long-horizon memory | [Paper](https://arxiv.org/abs/2401.17476) |
| LongMemEval | Multi-session memory | [Paper](https://arxiv.org/abs/2402.16288) |
| ConvQuestions | Conversational QA | [Dataset](https://convex.mpi-inf.mpg.de/) |

---

## Test Utilities

```typescript
// Setup/teardown
setupTestGraph(): Promise<TestGraph>
teardownTestGraph(graph: TestGraph): Promise<void>

// Data seeding
seedScenario(scenario: TestScenario): Promise<void>
clearAllData(): Promise<void>

// Mocks
mockLLMProvider(responses: Map<string, string>): LLMProvider
mockEmbeddingProvider(dimensions: number): EmbeddingProvider
```

---

*Last updated: January 15, 2026 (PR #24)*
