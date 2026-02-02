// Business Context Narration - Intent detection and value explanations

export type QueryIntent =
  | 'causal' // WHY questions - root cause analysis
  | 'temporal' // WHEN questions - timeline queries
  | 'entity' // WHO/WHAT questions - entity relationships
  | 'discovery' // General exploration - semantic search
  | 'building' // Knowledge construction - write operations
  | 'status'; // System status - statistics/admin

export interface IntentAnalysis {
  intent: QueryIntent;
  confidence: number;
  keywords: string[];
}

/**
 * Detect the primary intent of a user query
 */
export function detectQueryIntent(query: string): IntentAnalysis {
  const lower = query.toLowerCase();

  // WHY questions - causal reasoning
  const causalKeywords = [
    'why',
    'cause',
    'reason',
    'root cause',
    'led to',
    'resulted in',
    'because',
    'fault',
    'blame',
    'responsible',
    'triggered',
  ];
  const causalScore = causalKeywords.filter((k) => lower.includes(k)).length;

  // WHEN questions - temporal queries
  const temporalKeywords = [
    'when',
    'timeline',
    'happened',
    'occurred',
    'between',
    'during',
    'before',
    'after',
    'history',
    'sequence',
    'order',
    'time',
  ];
  const temporalScore = temporalKeywords.filter((k) =>
    lower.includes(k),
  ).length;

  // WHO/WHAT questions - entity relationships
  const entityKeywords = [
    'who',
    'what',
    'which',
    'depends',
    'relationship',
    'connected',
    'related',
    'involves',
    'owns',
    'manages',
    'team',
    'service',
  ];
  const entityScore = entityKeywords.filter((k) => lower.includes(k)).length;

  // Status queries
  const statusKeywords = [
    'statistics',
    'stats',
    'status',
    'count',
    'how many',
    'total',
  ];
  const statusScore = statusKeywords.filter((k) => lower.includes(k)).length;

  // Building queries
  const buildingKeywords = [
    'add',
    'create',
    'record',
    'remember',
    'store',
    'save',
    'link',
  ];
  const buildingScore = buildingKeywords.filter((k) =>
    lower.includes(k),
  ).length;

  // Determine winner
  const scores = [
    {
      intent: 'causal' as QueryIntent,
      score: causalScore,
      keywords: causalKeywords,
    },
    {
      intent: 'temporal' as QueryIntent,
      score: temporalScore,
      keywords: temporalKeywords,
    },
    {
      intent: 'entity' as QueryIntent,
      score: entityScore,
      keywords: entityKeywords,
    },
    {
      intent: 'status' as QueryIntent,
      score: statusScore,
      keywords: statusKeywords,
    },
    {
      intent: 'building' as QueryIntent,
      score: buildingScore,
      keywords: buildingKeywords,
    },
  ];

  const sorted = scores.sort((a, b) => b.score - a.score);
  const winner = sorted[0];

  // Default to discovery if no strong signal
  if (winner.score === 0) {
    return {
      intent: 'discovery',
      confidence: 0.5,
      keywords: [],
    };
  }

  const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
  const confidence = Math.min(winner.score / Math.max(totalScore, 1), 1);

  return {
    intent: winner.intent,
    confidence,
    keywords: winner.keywords.filter((k) => lower.includes(k)),
  };
}

/**
 * Business value explanation for each query intent
 */
export const INTENT_VALUE_EXPLANATIONS: Record<QueryIntent, string> = {
  causal: `This requires CAUSAL REASONING - tracing cause-effect chains.
  Traditional databases can't answer "why" questions automatically.
  Our multi-graph system can find root causes in seconds.`,

  temporal: `This requires TIMELINE RECONSTRUCTION - ordering events in time.
  The temporal graph preserves the sequence of what happened.
  We'll find relevant events and show them chronologically.`,

  entity: `This requires RELATIONSHIP MAPPING - understanding connections.
  The entity graph models how things depend on each other.
  We'll explore the web of relationships to answer your question.`,

  discovery: `This requires SEMANTIC DISCOVERY - finding relevant concepts.
  AI embeddings let us find information even with different wording.
  We'll search for concepts related to your query.`,

  building: `This will ADD KNOWLEDGE to the system.
  Your information will be stored and indexed for future queries.
  The knowledge base grows smarter with each addition.`,

  status: `This will SHOW SYSTEM STATUS.
  We'll display the current state of all knowledge graphs.
  This helps understand how much knowledge has accumulated.`,
};

/**
 * Format the query analysis box
 */
export function formatQueryAnalysis(
  query: string,
  intent: IntentAnalysis,
): string {
  const explanation = INTENT_VALUE_EXPLANATIONS[intent.intent];

  return [
    '',
    '═'.repeat(67),
    '  ANALYZING YOUR QUESTION',
    '═'.repeat(67),
    `  You asked: "${truncateQuery(query, 50)}"`,
    '',
    `  ${explanation
      .split('\n')
      .map((l) => l.trim())
      .join('\n  ')}`,
    '═'.repeat(67),
    '',
  ].join('\n');
}

/**
 * Truncate query for display
 */
function truncateQuery(query: string, maxLen: number): string {
  if (query.length <= maxLen) return query;
  return query.slice(0, maxLen - 3) + '...';
}

/**
 * Format completion summary
 */
export function formatCompletionSummary(
  toolsUsed: string[],
  totalSteps: number,
  startTime: Date,
): string {
  const elapsed = Math.round((Date.now() - startTime.getTime()) / 1000);

  // Categorize tools
  const retrieval = toolsUsed.filter((t) =>
    [
      'semantic_search',
      'entity_lookup',
      'temporal_expand',
      'causal_expand',
      'subgraph_merge',
      'linearize_context',
    ].includes(t),
  );
  const write = toolsUsed.filter((t) =>
    [
      'remember',
      'add_entity',
      'link_entities',
      'add_event',
      'add_fact',
      'add_causal_link',
      'add_concept',
    ].includes(t),
  );
  const admin = toolsUsed.filter((t) =>
    ['get_statistics', 'clear_graph'].includes(t),
  );

  const lines = [
    '',
    '─'.repeat(67),
    `  Completed in ${elapsed}s | ${totalSteps} steps | ${toolsUsed.length} tool calls`,
  ];

  if (retrieval.length > 0) {
    lines.push(`  Retrieval: ${retrieval.join(', ')}`);
  }
  if (write.length > 0) {
    lines.push(`  Writes: ${write.join(', ')}`);
  }
  if (admin.length > 0) {
    lines.push(`  Admin: ${admin.join(', ')}`);
  }

  lines.push('─'.repeat(67));
  lines.push('');

  return lines.join('\n');
}
