// MCP Server Factory - Creates configured McpServer instances with all tools registered
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CausalNode } from '@polyg-mcp/core';
import {
  AddCausalLinkSchema,
  AddConceptSchema,
  AddEntitySchema,
  AddEventSchema,
  AddFactSchema,
  type CausalLink,
  ClearGraphSchema,
  ExplainWhySchema,
  GetCausalChainSchema,
  GetEntitySchema,
  LinkEntitiesSchema,
  QueryTimelineSchema,
  RecallInputSchema,
  RememberInputSchema,
  SearchSemanticSchema,
} from '@polyg-mcp/shared';
import { formatToolError, safeParseDate } from './errors.js';
import type { SharedResources } from './shared-resources.js';

const SERVER_VERSION = '0.1.0';

/**
 * Create a new McpServer instance with all tools registered.
 * Each session gets its own McpServer instance that shares the underlying resources.
 */
export function createMcpServer(resources: SharedResources): McpServer {
  const mcpServer = new McpServer(
    {
      name: 'polyg-mcp',
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        'Multi-graph memory server for storing and retrieving information across semantic, temporal, causal, and entity graphs.',
    },
  );

  // Register all tools
  registerStatisticsTool(mcpServer, resources);
  registerClearGraphTool(mcpServer, resources);
  registerRecallTool(mcpServer, resources);
  registerRememberTool(mcpServer, resources);
  registerGetEntityTool(mcpServer, resources);
  registerAddEntityTool(mcpServer, resources);
  registerLinkEntitiesTool(mcpServer, resources);
  registerQueryTimelineTool(mcpServer, resources);
  registerAddEventTool(mcpServer, resources);
  registerAddFactTool(mcpServer, resources);
  registerGetCausalChainTool(mcpServer, resources);
  registerAddCausalLinkTool(mcpServer, resources);
  registerExplainWhyTool(mcpServer, resources);
  registerSearchSemanticTool(mcpServer, resources);
  registerAddConceptTool(mcpServer, resources);

  return mcpServer;
}

// ============================================================================
// Management Tools
// ============================================================================

function registerStatisticsTool(
  mcpServer: McpServer,
  resources: SharedResources,
): void {
  mcpServer.registerTool(
    'get_statistics',
    {
      description: 'Get statistics about all graphs in the memory system',
    },
    async () => {
      try {
        const stats = await resources.db.getStatistics();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(stats, null, 2),
            },
          ],
          structuredContent: stats,
        };
      } catch (error) {
        return formatToolError(error, 'get_statistics');
      }
    },
  );
}

function registerClearGraphTool(
  mcpServer: McpServer,
  resources: SharedResources,
): void {
  mcpServer.registerTool(
    'clear_graph',
    {
      description: 'Clear all data from specified graph(s). Use with caution!',
      inputSchema: ClearGraphSchema,
    },
    async (args) => {
      try {
        const { graph } = args;

        if (graph === 'all') {
          await resources.db.clearGraph();
          return {
            content: [
              {
                type: 'text' as const,
                text: 'All graphs cleared successfully',
              },
            ],
          };
        }

        const prefixMap: Record<string, string> = {
          semantic: 'S_',
          temporal: 'T_',
          causal: 'C_',
          entity: 'E_',
        };

        const prefix = prefixMap[graph];
        if (prefix) {
          await resources.db.query(
            'MATCH (n) WHERE any(label IN labels(n) WHERE label STARTS WITH $prefix) DETACH DELETE n',
            { prefix },
          );
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: `${graph} graph cleared successfully`,
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, 'clear_graph');
      }
    },
  );
}

// ============================================================================
// High-Level LLM Tools
// ============================================================================

function registerRecallTool(
  mcpServer: McpServer,
  resources: SharedResources,
): void {
  mcpServer.registerTool(
    'recall',
    {
      description:
        'Query the memory system using natural language. Uses LLM to classify intent, query relevant graphs in parallel, and synthesize a coherent response.',
      inputSchema: RecallInputSchema,
    },
    async (args) => {
      try {
        const result = await resources.orchestrator.recall(args.query);
        return {
          content: [
            {
              type: 'text' as const,
              text: result.answer,
            },
          ],
          structuredContent: args.include_reasoning
            ? result
            : { answer: result.answer, confidence: result.confidence },
        };
      } catch (error) {
        return formatToolError(error, 'recall');
      }
    },
  );
}

function registerRememberTool(
  mcpServer: McpServer,
  resources: SharedResources,
): void {
  mcpServer.registerTool(
    'remember',
    {
      description:
        'Store new information in the memory system. Extracts entities, facts, and events from the content.',
      inputSchema: RememberInputSchema,
    },
    async (args) => {
      try {
        const result = await resources.orchestrator.remember(
          args.content,
          args.context,
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: `Stored: ${result.entities_created} entities, ${result.facts_added} facts, ${result.events_logged} events`,
            },
          ],
          structuredContent: result,
        };
      } catch (error) {
        return formatToolError(error, 'remember');
      }
    },
  );
}

// ============================================================================
// Entity Tools
// ============================================================================

function registerGetEntityTool(
  mcpServer: McpServer,
  resources: SharedResources,
): void {
  mcpServer.registerTool(
    'get_entity',
    {
      description:
        'Get an entity by name or UUID, optionally including its relationships',
      inputSchema: GetEntitySchema,
    },
    async (args) => {
      try {
        const graphs = resources.orchestrator.getGraphs();
        const entity = await graphs.entity.getEntity(args.name);

        if (!entity) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Entity not found: ${args.name}`,
              },
            ],
          };
        }

        let result: Record<string, unknown> = { entity };

        if (args.include_relationships) {
          try {
            const relationships = await graphs.entity.getRelationships(
              entity.uuid,
            );
            result = { entity, relationships };
          } catch (error) {
            throw new Error(
              `Failed to fetch relationships for entity '${entity.name}': ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          structuredContent: result,
        };
      } catch (error) {
        return formatToolError(error, 'get_entity');
      }
    },
  );
}

function registerAddEntityTool(
  mcpServer: McpServer,
  resources: SharedResources,
): void {
  mcpServer.registerTool(
    'add_entity',
    {
      description: 'Add a new entity to the entity graph',
      inputSchema: AddEntitySchema,
    },
    async (args) => {
      try {
        const graphs = resources.orchestrator.getGraphs();
        const entity = await graphs.entity.addEntity(
          args.name,
          args.entity_type,
          args.properties,
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: `Created entity: ${entity.name} (${entity.entity_type})`,
            },
          ],
          structuredContent: entity,
        };
      } catch (error) {
        return formatToolError(error, 'add_entity');
      }
    },
  );
}

function registerLinkEntitiesTool(
  mcpServer: McpServer,
  resources: SharedResources,
): void {
  mcpServer.registerTool(
    'link_entities',
    {
      description: 'Create a relationship between two entities',
      inputSchema: LinkEntitiesSchema,
    },
    async (args) => {
      try {
        const graphs = resources.orchestrator.getGraphs();
        await graphs.entity.linkEntities(
          args.source,
          args.target,
          args.relationship,
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: `Linked: ${args.source} -[${args.relationship}]-> ${args.target}`,
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, 'link_entities');
      }
    },
  );
}

// ============================================================================
// Temporal Tools
// ============================================================================

function registerQueryTimelineTool(
  mcpServer: McpServer,
  resources: SharedResources,
): void {
  mcpServer.registerTool(
    'query_timeline',
    {
      description: 'Query events and facts within a time range',
      inputSchema: QueryTimelineSchema,
    },
    async (args) => {
      try {
        const fromDate = safeParseDate(args.from, 'from');
        const toDate = safeParseDate(args.to, 'to');

        const graphs = resources.orchestrator.getGraphs();
        const results = await graphs.temporal.queryTimeline(fromDate, toDate);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(results, null, 2),
            },
          ],
          structuredContent: { events: results },
        };
      } catch (error) {
        return formatToolError(error, 'query_timeline');
      }
    },
  );
}

function registerAddEventTool(
  mcpServer: McpServer,
  resources: SharedResources,
): void {
  mcpServer.registerTool(
    'add_event',
    {
      description: 'Add an event to the temporal graph',
      inputSchema: AddEventSchema,
    },
    async (args) => {
      try {
        const occurredAt = safeParseDate(args.occurred_at, 'occurred_at');

        const graphs = resources.orchestrator.getGraphs();
        const event = await graphs.temporal.addEvent(
          args.description,
          occurredAt,
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: `Added event: ${event.description} at ${event.occurred_at.toISOString()}`,
            },
          ],
          structuredContent: event,
        };
      } catch (error) {
        return formatToolError(error, 'add_event');
      }
    },
  );
}

function registerAddFactTool(
  mcpServer: McpServer,
  resources: SharedResources,
): void {
  mcpServer.registerTool(
    'add_fact',
    {
      description: 'Add a temporal fact (valid within a time window)',
      inputSchema: AddFactSchema,
    },
    async (args) => {
      try {
        const validFrom = safeParseDate(args.valid_from, 'valid_from');
        const validTo = args.valid_to
          ? safeParseDate(args.valid_to, 'valid_to')
          : undefined;

        const graphs = resources.orchestrator.getGraphs();
        const fact = await graphs.temporal.addFact(
          args.subject,
          args.predicate,
          args.object,
          validFrom,
          validTo,
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: `Added fact: ${fact.subject} ${fact.predicate} ${fact.object}`,
            },
          ],
          structuredContent: fact,
        };
      } catch (error) {
        return formatToolError(error, 'add_fact');
      }
    },
  );
}

// ============================================================================
// Causal Tools
// ============================================================================

function registerGetCausalChainTool(
  mcpServer: McpServer,
  resources: SharedResources,
): void {
  mcpServer.registerTool(
    'get_causal_chain',
    {
      description:
        'Get the causal chain for an event (upstream causes or downstream effects)',
      inputSchema: GetCausalChainSchema,
    },
    async (args) => {
      try {
        const graphs = resources.orchestrator.getGraphs();

        let result: CausalLink[];
        if (args.direction === 'upstream') {
          result = await graphs.causal.getUpstreamCauses(args.event);
        } else {
          result = await graphs.causal.getDownstreamEffects(args.event);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          structuredContent: { chain: result, direction: args.direction },
        };
      } catch (error) {
        return formatToolError(error, 'get_causal_chain');
      }
    },
  );
}

function registerAddCausalLinkTool(
  mcpServer: McpServer,
  resources: SharedResources,
): void {
  mcpServer.registerTool(
    'add_causal_link',
    {
      description: 'Add a cause-effect relationship between two nodes',
      inputSchema: AddCausalLinkSchema,
    },
    async (args) => {
      try {
        const graphs = resources.orchestrator.getGraphs();

        // Get or create cause node
        let causeNode: CausalNode | null;
        try {
          causeNode = await graphs.causal.getNode(args.cause);
          if (!causeNode) {
            causeNode = await graphs.causal.addNode(args.cause, 'cause');
          }
        } catch (error) {
          throw new Error(
            `Failed to get/create cause node '${args.cause}': ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        // Get or create effect node
        let effectNode: CausalNode | null;
        try {
          effectNode = await graphs.causal.getNode(args.effect);
          if (!effectNode) {
            effectNode = await graphs.causal.addNode(args.effect, 'effect');
          }
        } catch (error) {
          throw new Error(
            `Failed to get/create effect node '${args.effect}': ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        // Create the causal link
        try {
          await graphs.causal.addLink(
            causeNode.uuid,
            effectNode.uuid,
            args.confidence,
          );
        } catch (error) {
          throw new Error(
            `Failed to create link between '${args.cause}' and '${args.effect}': ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: `Added causal link: ${args.cause} -> ${args.effect}${args.confidence ? ` (confidence: ${args.confidence})` : ''}`,
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, 'add_causal_link');
      }
    },
  );
}

function registerExplainWhyTool(
  mcpServer: McpServer,
  resources: SharedResources,
): void {
  mcpServer.registerTool(
    'explain_why',
    {
      description: 'Get a causal explanation for why something happened',
      inputSchema: ExplainWhySchema,
    },
    async (args) => {
      try {
        const graphs = resources.orchestrator.getGraphs();
        const explanation = await graphs.causal.explainWhy(args.event);

        if (explanation.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `No causal explanation found for: ${args.event}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(explanation, null, 2),
            },
          ],
          structuredContent: { explanation, event: args.event },
        };
      } catch (error) {
        return formatToolError(error, 'explain_why');
      }
    },
  );
}

// ============================================================================
// Semantic Tools
// ============================================================================

function registerSearchSemanticTool(
  mcpServer: McpServer,
  resources: SharedResources,
): void {
  mcpServer.registerTool(
    'search_semantic',
    {
      description: 'Search for concepts using semantic similarity',
      inputSchema: SearchSemanticSchema,
    },
    async (args) => {
      try {
        const graphs = resources.orchestrator.getGraphs();
        const results = await graphs.semantic.search(args.query, args.limit);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(results, null, 2),
            },
          ],
          structuredContent: { matches: results, query: args.query },
        };
      } catch (error) {
        return formatToolError(error, 'search_semantic');
      }
    },
  );
}

function registerAddConceptTool(
  mcpServer: McpServer,
  resources: SharedResources,
): void {
  mcpServer.registerTool(
    'add_concept',
    {
      description:
        'Add a concept to the semantic graph (will auto-generate embedding)',
      inputSchema: AddConceptSchema,
    },
    async (args) => {
      try {
        const graphs = resources.orchestrator.getGraphs();
        const concept = await graphs.semantic.addConcept(
          args.name,
          args.description,
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: `Added concept: ${concept.name}${concept.description ? ` - ${concept.description}` : ''}`,
            },
          ],
          structuredContent: {
            uuid: concept.uuid,
            name: concept.name,
            description: concept.description,
          },
        };
      } catch (error) {
        return formatToolError(error, 'add_concept');
      }
    },
  );
}
