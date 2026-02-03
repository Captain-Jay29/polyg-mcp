// Tool Narration Templates - Business-friendly explanations for each tool

export interface ToolNarration {
  /** Short action name for step headers */
  actionName: string;
  /** Badge/tag shown in headers */
  badge: string;
  /** Business explanation of what the tool does */
  explanation: string;
  /** Technical description (verbose mode only) */
  technical: string;
}

/**
 * Narration templates for all 15 MCP tools
 */
export const TOOL_NARRATIONS: Record<string, ToolNarration> = {
  // ============================================================================
  // MAGMA Retrieval Tools (6)
  // ============================================================================

  semantic_search: {
    actionName: 'Semantic Search',
    badge: 'SEMANTIC GRAPH',
    explanation:
      'Finding relevant concepts by understanding MEANING, not just keywords.',
    technical:
      'Vector similarity search over concept embeddings in the semantic graph.',
  },

  entity_lookup: {
    actionName: 'Entity Lookup',
    badge: 'ENTITY GRAPH',
    explanation:
      'Looking up specific things (services, people, systems) and their connections.',
    technical: 'Entity graph traversal with relationship expansion.',
  },

  temporal_expand: {
    actionName: 'Timeline Expansion',
    badge: 'TEMPORAL GRAPH',
    explanation:
      'Finding events that happened within a time range.',
    technical: 'Temporal graph query with time-range filtering.',
  },

  causal_expand: {
    actionName: 'Causal Analysis',
    badge: 'CAUSAL GRAPH',
    explanation:
      'Tracing cause-and-effect chains to understand WHY something happened.',
    technical: 'Causal graph traversal with confidence propagation.',
  },

  subgraph_merge: {
    actionName: 'Subgraph Merge',
    badge: 'MERGE',
    explanation:
      'Combining information from multiple graph views into a unified picture.\n' +
      'This connects the dots across different types of knowledge.',
    technical: 'Multi-graph join with entity resolution and deduplication.',
  },

  linearize_context: {
    actionName: 'Context Linearization',
    badge: 'FORMAT',
    explanation:
      'Organizing the gathered information into a readable summary.\n' +
      'This prepares the knowledge for the final answer.',
    technical: 'Subgraph serialization with relevance ordering.',
  },

  // ============================================================================
  // Write Tools (7)
  // ============================================================================

  remember: {
    actionName: 'Remember',
    badge: 'WRITE',
    explanation:
      'Storing new information in the knowledge base.\n' +
      'This is the quickest way to add knowledge - the system auto-categorizes it.',
    technical:
      'Auto-routing to appropriate graph(s) based on content analysis.',
  },

  add_entity: {
    actionName: 'Add Entity',
    badge: 'ENTITY+',
    explanation:
      'Adding a new thing (service, person, concept) to track.\n' +
      'Entities are the building blocks of our knowledge graph.',
    technical: 'Entity graph node creation with property storage.',
  },

  link_entities: {
    actionName: 'Link Entities',
    badge: 'LINK',
    explanation:
      'Creating a connection between two things.\n' +
      'Relationships are how we model dependencies and interactions.',
    technical: 'Entity graph edge creation with typed relationships.',
  },

  add_event: {
    actionName: 'Add Event',
    badge: 'EVENT+',
    explanation:
      'Recording something that happened at a specific time.\n' +
      "Events build the timeline of your system's history.",
    technical: 'Temporal graph node creation with timestamp indexing.',
  },

  add_fact: {
    actionName: 'Add Fact',
    badge: 'FACT+',
    explanation:
      'Recording a piece of knowledge that may change over time.\n' +
      'Facts track historical states with validity periods.',
    technical: 'Temporal graph fact node with valid_from/valid_to.',
  },

  add_causal_link: {
    actionName: 'Add Causal Link',
    badge: 'CAUSAL+',
    explanation:
      'Recording that one thing caused another.\n' +
      'Causal links power "why" queries and root cause analysis.',
    technical: 'Causal graph edge with confidence and mechanism.',
  },

  add_concept: {
    actionName: 'Add Concept',
    badge: 'CONCEPT+',
    explanation:
      'Adding a semantic concept for search discovery.\n' +
      'Concepts are the entry points for finding relevant knowledge.',
    technical: 'Semantic graph node with embedding generation.',
  },

  // ============================================================================
  // Management Tools (2)
  // ============================================================================

  get_statistics: {
    actionName: 'Get Statistics',
    badge: 'STATS',
    explanation:
      'Checking the current state of all knowledge graphs.\n' +
      'This shows how much knowledge has accumulated.',
    technical: 'Aggregate counts across all graph types.',
  },

  clear_graph: {
    actionName: 'Clear Graph',
    badge: 'CLEAR',
    explanation:
      'Removing data from the knowledge base.\n' +
      'Use with caution - this permanently deletes information.',
    technical: 'Batch deletion by graph type or all graphs.',
  },
};

/**
 * Get narration for a tool, with fallback for unknown tools
 */
export function getToolNarration(toolName: string): ToolNarration {
  return (
    TOOL_NARRATIONS[toolName] ?? {
      actionName: toolName,
      badge: 'TOOL',
      explanation: `Executing ${toolName} operation.`,
      technical: `MCP tool: ${toolName}`,
    }
  );
}

/**
 * Format a step header with narration
 */
export function formatStepHeader(stepNumber: number, toolName: string): string {
  const narration = getToolNarration(toolName);
  const badge = `[${narration.badge}]`;
  const header = `STEP ${stepNumber}: ${narration.actionName}`;

  return ['', `  ${header.padEnd(55)}${badge}`, '  ' + '─'.repeat(65)].join(
    '\n',
  );
}

/**
 * Format the explanation for a step
 */
export function formatStepExplanation(
  toolName: string,
  args: Record<string, unknown>,
  verbose: boolean,
): string {
  const narration = getToolNarration(toolName);
  const lines = [`  ${narration.explanation}`];

  // Add relevant arguments in a readable way
  const argSummary = formatArgumentsSummary(toolName, args);
  if (argSummary) {
    lines.push('');
    lines.push(argSummary);
  }

  // Add technical details in verbose mode
  if (verbose) {
    lines.push('');
    lines.push(`    Tool: ${toolName}`);
    lines.push(`    Args: ${JSON.stringify(args)}`);
  }

  return lines.join('\n');
}

/**
 * Format tool arguments as a readable summary
 */
function formatArgumentsSummary(
  toolName: string,
  args: Record<string, unknown>,
): string {
  const lines: string[] = [];

  switch (toolName) {
    case 'semantic_search':
      if (args.query) lines.push(`    Query: "${args.query}"`);
      if (args.limit) lines.push(`    Limit: ${args.limit} results`);
      break;

    case 'entity_lookup': {
      const entityIds = args.entity_ids as string[] | undefined;
      if (Array.isArray(entityIds) && entityIds.length > 0) {
        const display = entityIds.length <= 2
          ? entityIds.join(', ')
          : `${entityIds.length} entities`;
        lines.push(`    Entities: ${display}`);
      } else if (args.name) {
        lines.push(`    Entity: "${args.name}"`);
      }
      if (args.depth) lines.push(`    Depth: ${args.depth} hops`);
      break;
    }

    case 'temporal_expand':
      if (args.start) lines.push(`    From: ${args.start}`);
      if (args.end) lines.push(`    To: ${args.end}`);
      break;

    case 'causal_expand': {
      const entityIds = args.entity_ids as string[] | undefined;
      if (Array.isArray(entityIds) && entityIds.length > 0) {
        const display = entityIds.length <= 2
          ? entityIds.join(', ')
          : `${entityIds.length} entities`;
        lines.push(`    Starting from: ${display}`);
      } else if (args.entity || args.name) {
        lines.push(`    Starting from: "${args.entity || args.name}"`);
      }
      if (args.direction) lines.push(`    Direction: ${args.direction}`);
      break;
    }

    case 'add_entity':
      if (args.name) lines.push(`    Name: "${args.name}"`);
      if (args.type) lines.push(`    Type: ${args.type}`);
      break;

    case 'add_event':
      if (args.description) lines.push(`    Event: "${args.description}"`);
      if (args.timestamp) lines.push(`    When: ${args.timestamp}`);
      break;

    case 'add_causal_link':
      if (args.cause) lines.push(`    Cause: "${args.cause}"`);
      if (args.effect) lines.push(`    Effect: "${args.effect}"`);
      break;

    case 'clear_graph':
      if (args.graph) lines.push(`    Target: ${args.graph}`);
      break;
  }

  return lines.join('\n');
}
