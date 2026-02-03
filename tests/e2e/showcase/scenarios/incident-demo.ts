// Incident Investigation Demo Scenario
// Primary demo showcasing causal reasoning, timeline reconstruction, and cross-graph linking

export interface DemoStep {
  narration: string;
  query: string;
  pause?: boolean;
  expectedTools?: string[];
}

export interface DemoScenario {
  name: string;
  title: string;
  description: string;
  businessContext: string;
  dataset: string;
  steps: DemoStep[];
}

export const INCIDENT_DEMO: DemoScenario = {
  name: 'incident',
  title: 'Production Incident Investigation',
  description:
    'Investigate why the auth service went down and trace the root cause',
  businessContext: `
  ═══════════════════════════════════════════════════════════════════
    SCENARIO: Production Incident Investigation
  ═══════════════════════════════════════════════════════════════════
    Your authentication service went down, affecting user logins.

    This demo shows how polyg-mcp's multi-graph system can:
    • Find root causes automatically (CAUSAL GRAPH)
    • Reconstruct what happened (TEMPORAL GRAPH)
    • Map service dependencies (ENTITY GRAPH)
    • Connect concepts semantically (SEMANTIC GRAPH)

    Traditional databases require manual queries for each piece.
    Our system traces through all graphs in one question.
  ═══════════════════════════════════════════════════════════════════
  `,
  dataset: 'deployment-incident',
  steps: [
    {
      narration: `
  ┌─────────────────────────────────────────────────────────────────┐
  │  STEP 1: The WHY Question                                       │
  │                                                                 │
  │  We'll start by asking the most important question:             │
  │  "What caused the auth service to fail?"                        │
  │                                                                 │
  │  Watch how the system:                                          │
  │  1. Searches semantically for relevant concepts                 │
  │  2. Expands causal chains to find root causes                   │
  │  3. Returns a complete explanation                              │
  └─────────────────────────────────────────────────────────────────┘`,
      query: 'What caused the auth service to fail?',
      pause: true,
      expectedTools: ['semantic_search', 'causal_expand'],
    },
    {
      narration: `
  ┌─────────────────────────────────────────────────────────────────┐
  │  STEP 2: The WHEN Question                                      │
  │                                                                 │
  │  Now let's reconstruct the timeline of events.                  │
  │  "What happened between 2pm and 3pm on January 15th?"           │
  │                                                                 │
  │  Watch how the system:                                          │
  │  1. Queries the temporal graph for events in range              │
  │  2. Orders events chronologically                               │
  │  3. Shows the incident progression                              │
  └─────────────────────────────────────────────────────────────────┘`,
      query: 'What happened between 2pm and 3pm on January 15th 2026?',
      pause: true,
      expectedTools: ['semantic_search', 'temporal_expand'],
    },
    {
      narration: `
  ┌─────────────────────────────────────────────────────────────────┐
  │  STEP 3: The WHO Question                                       │
  │                                                                 │
  │  Let's find out who was involved in the incident response.      │
  │  "Who was involved in the incident response?"                   │
  │                                                                 │
  │  Watch how the system:                                          │
  │  1. Finds people entities connected to the incident             │
  │  2. Shows their roles and actions                               │
  │  3. Maps the human side of incident response                    │
  └─────────────────────────────────────────────────────────────────┘`,
      query: 'Who was involved in the incident response?',
      pause: true,
      expectedTools: ['semantic_search', 'entity_lookup'],
    },
    {
      narration: `
  ┌─────────────────────────────────────────────────────────────────┐
  │  STEP 4: The Cascade Question                                   │
  │                                                                 │
  │  Finally, let's trace how the failure cascaded through systems. │
  │  "What services were affected by the auth service failure?"     │
  │                                                                 │
  │  Watch how the system:                                          │
  │  1. Explores entity relationships (DEPENDS_ON)                  │
  │  2. Traces causal effects downstream                            │
  │  3. Shows the blast radius of the incident                      │
  └─────────────────────────────────────────────────────────────────┘`,
      query: 'What services were affected by the auth service failure?',
      pause: true,
      expectedTools: ['semantic_search', 'entity_lookup', 'causal_expand'],
    },
  ],
};

/**
 * Format the scenario introduction
 */
export function formatScenarioIntro(scenario: DemoScenario): string {
  return scenario.businessContext;
}

/**
 * Format a demo step's narration
 */
export function formatStepNarration(step: DemoStep): string {
  return step.narration;
}

/**
 * Get a brief description of the demo
 */
export function getScenarioSummary(scenario: DemoScenario): string {
  return `${scenario.title}: ${scenario.description} (${scenario.steps.length} steps)`;
}
