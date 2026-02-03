# Showcase Agent for polyg-mcp

A CLI-based demonstration agent that transparently showcases all polyg-mcp capabilities for stakeholders.

## Goal

Create a **narrated showcase agent** that:
1. Explains what it's doing in business terms (not just technical jargon)
2. Visualizes graph state changes with ASCII dashboards
3. Demonstrates all 15 MCP tools through guided scenarios
4. Shows knowledge accumulating across multiple interactions

## Why This Matters

Traditional demos show tool outputs. This showcase explains **why** each tool matters:
- "Traditional databases can't answer 'why' questions automatically"
- "Our multi-graph system finds root causes in seconds"
- "Watch as knowledge accumulates across your questions"

---

## Expected Outputs

### 1. Business Value Narration
```
═══════════════════════════════════════════════════════════════════
  ANALYZING YOUR QUESTION
═══════════════════════════════════════════════════════════════════
  You asked: "What caused the auth service to fail?"

  This requires CAUSAL REASONING - tracing cause-effect chains.
  Traditional databases can't answer "why" questions automatically.
  Our multi-graph system can find root causes in seconds.
═══════════════════════════════════════════════════════════════════
```

### 2. Step-by-Step Action Explanation
```
  STEP 1: Semantic Search                                   [SEARCH]
  ─────────────────────────────────────────────────────────────────
  Finding relevant concepts by understanding MEANING, not keywords.

    Query: "auth service failure cause"
    Found: 3 concepts → 5 connected entities
```

### 3. Graph State Dashboard
```
  GRAPH STATE                                        Updated: 14:03:15
  ╔═════════════════════════════════════════════════════════════════╗
  ║  SEMANTIC     ENTITY       TEMPORAL     CAUSAL      CROSS-LINKS ║
  ║  ●●●●●○○○○○   ●●●●●●●○○○   ●●●●●●●●○○   ●●●●●○○○○   X_REP: 11   ║
  ║  11 concepts  8 entities   13 events    6 links     X_INV: 19   ║
  ╚═════════════════════════════════════════════════════════════════╝
```

### 4. Timeline Visualization
```
  TIMELINE: January 15, 2026
  ────────────────────────────────────────────────────────────────
  14:00 │ ● Deployment started
  14:03 │ ▲ CrashLoopBackOff          ◄── INCIDENT
  14:04 │ ● api-gateway 503 errors
  14:24 │ ✓ Services recovered
```

### 5. Causal Chain Visualization
```
  ROOT CAUSE                                    Confidence
  ─────────────────────────────────────────────────────────
  JWT_SECRET removed in PR #1234                   100%
       │
       ▼
  auth-service missing secret                      100%
       │
       ├───────────────────┐
       ▼                   ▼
  api-gateway 503s    dashboard down
  (95%)               (90%)
```

### 6. Knowledge Accumulation Display
```
  KNOWLEDGE ACCUMULATED                              Session: 12 min
  ═══════════════════════════════════════════════════════════════════

  ENTITIES: 8          EVENTS: 13         CAUSAL LINKS: 6
  auth-service         14:00 Deployment   Root: PR #1234
  api-gateway          14:03 Crash        Chain depth: 4
  JWT_SECRET           14:24 Recovery     Confidence: 95%+

  QUESTIONS ANSWERED: 3  │  TOOLS USED: 8  │  INSIGHTS: 5
```

---

## CLI Interface

```
polyg-mcp Showcase Agent

Usage: tsx tests/e2e/showcase/showcase-cli.ts [options]

Options:
  --demo <name>              Run guided demo (incident, knowledge)
  --walkthrough              Step-by-step with pauses
  --narration <full|brief>   Narration level (default: full)
  -d, --dataset <name>       Pre-seed dataset
  -i, --interactive          Free-form Q&A mode
  -v, --verbose              Show technical details
  -h, --help                 Show help

Interactive Commands:
  stats      Show graph statistics dashboard
  timeline   Show temporal events
  causal     Show causal chains
  entities   Show entity relationships
```

---

## Demo Scenarios

### Primary: Incident Investigation
- **Business story**: "Auth service went down. Find out why."
- **Tools showcased**: `semantic_search`, `causal_expand`, `temporal_expand`, `entity_lookup`
- **Shows**: Causal reasoning, timeline reconstruction, cross-graph linking

### Secondary: Knowledge Building
- **Business story**: "Build knowledge about a project from scratch"
- **Tools showcased**: `add_entity`, `link_entities`, `add_event`, `add_fact`, `add_causal_link`
- **Shows**: All write tools, accumulating knowledge visually

---

## File Structure

```
tests/e2e/showcase/
├── showcase-agent.ts        # Main agent wrapping ReActAgent
├── showcase-cli.ts          # CLI entry point
├── visualization/
│   ├── index.ts             # Exports
│   ├── dashboard.ts         # Graph state dashboard
│   ├── timeline.ts          # Temporal event timeline
│   ├── causal-chain.ts      # Cause-effect visualization
│   └── entity-tree.ts       # Relationship tree
├── narration/
│   ├── index.ts             # Exports
│   ├── templates.ts         # Tool explanations
│   └── business-context.ts  # Intent-based value explanations
└── scenarios/
    ├── index.ts             # Scenario registry
    └── incident-demo.ts     # Primary demo scenario
```

---

## Implementation Plan

### Phase 1: Visualization Utilities
1. `visualization/dashboard.ts` - Graph state renderer using `get_statistics`
2. `visualization/timeline.ts` - Temporal ASCII renderer from event data
3. `visualization/causal-chain.ts` - Cause-effect tree renderer
4. `visualization/entity-tree.ts` - Relationship tree renderer

### Phase 2: Narration System
1. `narration/templates.ts` - Business explanations per tool (all 15 tools)
2. `narration/business-context.ts` - Query intent detection and value explanations

### Phase 3: Showcase Agent
1. Create `ShowcaseAgent` class wrapping `ReActAgent`
2. Add pre/post tool hooks for narration and visualization
3. Add stats tracking and accumulation display

### Phase 4: CLI and Scenarios
1. Create `showcase-cli.ts` with demo options
2. Create `incident-demo.ts` guided scenario
3. End-to-end testing

---

## Key Reference Files

| File | Purpose |
|------|---------|
| `tests/e2e/agent/react-agent.ts` | Base agent to wrap |
| `tests/e2e/agent/cli.ts` | CLI pattern to follow |
| `tests/e2e/datasets/deployment-incident.ts` | Primary demo data |
| `packages/server/src/mcp-server-factory.ts` | Tool definitions |

---

## Verification

```bash
# Run showcase with incident demo
tsx tests/e2e/showcase/showcase-cli.ts --demo incident --walkthrough

# Interactive mode
tsx tests/e2e/showcase/showcase-cli.ts -i -d deployment-incident

# Brief narration mode
tsx tests/e2e/showcase/showcase-cli.ts --demo incident --narration brief
```

### Success Criteria
1. Each step understandable without technical background
2. All 15 tools reachable through demo scenarios
3. ASCII visualizations render correctly in terminal
4. Knowledge accumulation visible across 3+ queries
