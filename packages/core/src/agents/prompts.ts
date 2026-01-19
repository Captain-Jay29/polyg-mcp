// Prompt templates for LLM agents

/**
 * MAGMA-style intent classifier prompt
 *
 * Question-centric classification:
 * - WHY → Deep causal traversal (why did X happen?)
 * - WHEN → Deep temporal traversal (what happened at time T?)
 * - WHO → Deep entity traversal (who is involved with X?)
 * - WHAT → Deep entity traversal (what is X?)
 * - EXPLORE → Balanced traversal (tell me about X)
 */
export const MAGMA_CLASSIFIER_PROMPT = `You are a query intent classifier for a MAGMA-style memory retrieval system.

Given a user query, classify the PRIMARY intent and extract supporting information.

INTENT TYPES:
- WHY: Questions about causation, reasons, explanations ("Why did X happen?", "What caused Y?")
- WHEN: Questions about timing, sequence, history ("When did X occur?", "What happened last week?")
- WHO: Questions about people, ownership, responsibility ("Who owns X?", "Who is involved?")
- WHAT: Questions about definitions, descriptions, properties ("What is X?", "Describe Y")
- EXPLORE: General queries, browsing, discovery ("Tell me about X", "Show me related items")

DEPTH HINTS (1-5, higher = deeper traversal):
Based on intent type, suggest traversal depths for each graph type:
- entity: How many hops to traverse entity relationships
- temporal: How many hops to traverse temporal relationships
- causal: How many hops to traverse causal chains

Intent-based defaults:
- WHY: entity=1, temporal=1, causal=3
- WHEN: entity=1, temporal=3, causal=1
- WHO/WHAT: entity=3, temporal=1, causal=1
- EXPLORE: entity=2, temporal=2, causal=2

Respond in JSON format:
{
  "type": "WHY" | "WHEN" | "WHO" | "WHAT" | "EXPLORE",
  "entities": ["entity1", "entity2"],
  "temporalHints": ["last week", "before deployment"],
  "depthHints": {
    "entity": 1-5,
    "temporal": 1-5,
    "causal": 1-5
  },
  "confidence": 0.0-1.0
}

Examples:
- "Why did the server crash after deployment?" → type: WHY, entities: ["server", "deployment"], depthHints: {entity: 1, temporal: 1, causal: 3}
- "What happened on Tuesday?" → type: WHEN, temporalHints: ["Tuesday"], depthHints: {entity: 1, temporal: 3, causal: 1}
- "Who owns the payment service?" → type: WHO, entities: ["payment service"], depthHints: {entity: 3, temporal: 1, causal: 1}
- "What is the authentication flow?" → type: WHAT, entities: ["authentication flow"], depthHints: {entity: 3, temporal: 1, causal: 1}
- "Tell me about the API" → type: EXPLORE, entities: ["API"], depthHints: {entity: 2, temporal: 2, causal: 2}

Context: {context}

User query: {query}`;

/**
 * Legacy classifier prompt (graph-centric)
 * @deprecated Use MAGMA_CLASSIFIER_PROMPT for new implementations
 */
export const CLASSIFIER_PROMPT = `You are a query intent classifier for a multi-graph memory system.

Given a user query, extract:
1. INTENTS: Which graphs to query (semantic, temporal, causal, entity)
2. ENTITIES: Named entities mentioned (people, systems, projects, etc.)
3. TIMEFRAME: Any time references (dates, durations, "last week", etc.)
4. CAUSAL_DIRECTION: If asking "why" → upstream, if asking "what happens if" → downstream

Respond in JSON format matching this schema:
{
  "intents": ["semantic" | "temporal" | "causal" | "entity"],
  "entities": [{ "mention": string, "type": string? }],
  "timeframe": { "type": "specific" | "range" | "relative", "value": string, "end": string? }?,
  "causal_direction": "upstream" | "downstream" | "both"?,
  "semantic_query": string?,
  "confidence": number
}

Examples:
- "What do we know about the auth system?" → intents: [semantic, entity]
- "What happened last Tuesday?" → intents: [temporal], timeframe: { type: "relative", value: "last Tuesday" }
- "Why did the build fail?" → intents: [causal], causal_direction: upstream
- "Who owns the payment service?" → intents: [entity]

Context: {context}

User query: {query}`;

export const SYNTHESIZER_PROMPT = `You are a response synthesizer for a multi-graph memory system.

Given raw results from multiple knowledge graphs, synthesize a coherent answer.

Guidelines:
1. Prioritize causal explanations when available
2. Include temporal context (when things happened)
3. Reference specific entities by name
4. Express confidence based on evidence strength
5. Suggest follow-up questions if relevant

Original Query: {query}

Graph Results:
{results}

Respond with a JSON object containing:
{
  "answer": string,           // Natural language response
  "confidence": number,       // 0-1 confidence score
  "reasoning": {              // Structured evidence
    "causal_chain": [{ "cause": string, "effect": string }]?,
    "temporal_context": object?,
    "entities_involved": [{ "name": string, "type": string }]?,
    "semantic_matches": [{ "concept": string, "score": number }]?
  },
  "sources": string[],        // Which graphs contributed
  "follow_ups": string[]?     // Optional follow-up questions
}`;
