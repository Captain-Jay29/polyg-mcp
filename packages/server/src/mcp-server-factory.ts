// MCP Server Factory - Creates configured McpServer instances with all tools registered
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  type CausalNode,
  ContextLinearizer,
  SubgraphMerger,
} from '@polyg-mcp/core';
import {
  AddCausalLinkSchema,
  AddConceptSchema,
  AddEntitySchema,
  AddEventSchema,
  AddFactSchema,
  CausalExpandSchema,
  ClearGraphSchema,
  EntityLookupSchema,
  type GraphView,
  LinearizeContextSchema,
  LinkEntitiesSchema,
  RememberInputSchema,
  SemanticSearchSchema,
  SubgraphMergeSchema,
  TemporalExpandSchema,
} from '@polyg-mcp/shared';
import { formatToolError, safeParseDate, validateToolInput } from './errors.js';
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

  // Register management tools (2)
  registerStatisticsTool(mcpServer, resources);
  registerClearGraphTool(mcpServer, resources);

  // Register write tools (7)
  registerRememberTool(mcpServer, resources);
  registerAddEntityTool(mcpServer, resources);
  registerLinkEntitiesTool(mcpServer, resources);
  registerAddEventTool(mcpServer, resources);
  registerAddFactTool(mcpServer, resources);
  registerAddCausalLinkTool(mcpServer, resources);
  registerAddConceptTool(mcpServer, resources);

  // Register MAGMA retrieval tools (6)
  registerSemanticSearchTool(mcpServer, resources);
  registerEntityLookupTool(mcpServer, resources);
  registerTemporalExpandTool(mcpServer, resources);
  registerCausalExpandTool(mcpServer, resources);
  registerSubgraphMergeTool(mcpServer, resources);
  registerLinearizeContextTool(mcpServer, resources);

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
// Write Tools
// ============================================================================

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

// ============================================================================
// MAGMA Retrieval Tools
// ============================================================================

function registerSemanticSearchTool(
  mcpServer: McpServer,
  resources: SharedResources,
): void {
  mcpServer.registerTool(
    'semantic_search',
    {
      description:
        'Find seed concepts via vector similarity search. Returns concept matches with scores that can be used for graph expansion.',
      inputSchema: SemanticSearchSchema,
    },
    async (args) => {
      // Validate input with Zod schema
      const validation = validateToolInput(
        args,
        SemanticSearchSchema,
        'semantic_search',
      );
      if (!validation.success) {
        return formatToolError(validation.error, 'semantic_search');
      }
      const { query, limit = 10, min_score = 0.5 } = validation.data;

      try {
        const graphs = resources.orchestrator.getGraphs();
        const results = await graphs.semantic.search(query, limit);

        // Filter by minimum score
        const filtered = results.filter((r) => r.score >= min_score);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(filtered, null, 2),
            },
          ],
          structuredContent: {
            matches: filtered,
            query,
            total: filtered.length,
          },
        };
      } catch (error) {
        return formatToolError(error, 'semantic_search');
      }
    },
  );
}

function registerEntityLookupTool(
  mcpServer: McpServer,
  resources: SharedResources,
): void {
  mcpServer.registerTool(
    'entity_lookup',
    {
      description:
        'Expand entity relationships from seed entity IDs. Returns entities and their relationships up to specified depth.',
      inputSchema: EntityLookupSchema,
    },
    async (args) => {
      // Validate input with Zod schema
      const validation = validateToolInput(
        args,
        EntityLookupSchema,
        'entity_lookup',
      );
      if (!validation.success) {
        return formatToolError(validation.error, 'entity_lookup');
      }
      const {
        entity_ids,
        depth = 2,
        include_properties = false,
      } = validation.data;

      try {
        const graphs = resources.orchestrator.getGraphs();
        const results: Array<{
          entity: unknown;
          relationships: unknown[];
        }> = [];

        for (const entityId of entity_ids) {
          // getEntity accepts both UUID and name
          const entity = await graphs.entity.getEntity(entityId);

          if (entity) {
            const relationships = await graphs.entity.getRelationships(
              entity.uuid,
            );

            // For depth > 1, recursively get related entities
            const allRelationships = [...relationships];
            if (depth > 1) {
              const seenIds = new Set([entity.uuid]);
              let currentLevel = relationships;

              for (let d = 1; d < depth && currentLevel.length > 0; d++) {
                const nextLevel: typeof relationships = [];
                for (const rel of currentLevel) {
                  for (const relatedId of [rel.source.uuid, rel.target.uuid]) {
                    if (!seenIds.has(relatedId)) {
                      seenIds.add(relatedId);
                      try {
                        const relatedRels =
                          await graphs.entity.getRelationships(relatedId);
                        nextLevel.push(...relatedRels);
                        allRelationships.push(...relatedRels);
                      } catch {
                        // Entity not found - skip
                      }
                    }
                  }
                }
                currentLevel = nextLevel;
              }
            }

            results.push({
              entity: include_properties
                ? entity
                : { uuid: entity.uuid, name: entity.name },
              relationships: allRelationships,
            });
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(results, null, 2),
            },
          ],
          structuredContent: {
            entities: results,
            depth,
            total: results.length,
          },
        };
      } catch (error) {
        return formatToolError(error, 'entity_lookup');
      }
    },
  );
}

function registerTemporalExpandTool(
  mcpServer: McpServer,
  resources: SharedResources,
): void {
  mcpServer.registerTool(
    'temporal_expand',
    {
      description:
        'Query events involving seed entities within a time range. Returns temporal events linked to the specified entities.',
      inputSchema: TemporalExpandSchema,
    },
    async (args) => {
      // Validate input with Zod schema
      const validation = validateToolInput(
        args,
        TemporalExpandSchema,
        'temporal_expand',
      );
      if (!validation.success) {
        return formatToolError(validation.error, 'temporal_expand');
      }
      const { entity_ids, from, to } = validation.data;

      try {
        const graphs = resources.orchestrator.getGraphs();

        // Parse dates or use wide default range
        const now = new Date();
        const fromDate = from
          ? safeParseDate(from, 'from')
          : new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        const toDate = to
          ? safeParseDate(to, 'to')
          : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

        const allEvents: unknown[] = [];

        for (const entityId of entity_ids) {
          const events = await graphs.temporal.queryTimeline(
            fromDate,
            toDate,
            entityId,
          );
          allEvents.push(...events);
        }

        // Deduplicate by UUID
        const seen = new Set<string>();
        const uniqueEvents = allEvents.filter((e) => {
          const event = e as { uuid: string };
          if (seen.has(event.uuid)) return false;
          seen.add(event.uuid);
          return true;
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(uniqueEvents, null, 2),
            },
          ],
          structuredContent: {
            events: uniqueEvents,
            from: fromDate.toISOString(),
            to: toDate.toISOString(),
            total: uniqueEvents.length,
          },
        };
      } catch (error) {
        return formatToolError(error, 'temporal_expand');
      }
    },
  );
}

function registerCausalExpandTool(
  mcpServer: McpServer,
  resources: SharedResources,
): void {
  mcpServer.registerTool(
    'causal_expand',
    {
      description:
        'Traverse causal chains from seed entities. Returns causal links (cause-effect relationships) in the specified direction.',
      inputSchema: CausalExpandSchema,
    },
    async (args) => {
      // Validate input with Zod schema
      const validation = validateToolInput(
        args,
        CausalExpandSchema,
        'causal_expand',
      );
      if (!validation.success) {
        return formatToolError(validation.error, 'causal_expand');
      }
      const { entity_ids, direction = 'both', depth = 3 } = validation.data;

      try {
        const graphs = resources.orchestrator.getGraphs();

        // Create entity mentions for causal traversal
        const entityMentions = entity_ids.map((id) => ({
          mention: id,
          type: undefined,
        }));

        const causalLinks = await graphs.causal.traverse(
          entityMentions,
          direction,
          depth,
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(causalLinks, null, 2),
            },
          ],
          structuredContent: {
            links: causalLinks,
            direction,
            depth,
            total: causalLinks.length,
          },
        };
      } catch (error) {
        return formatToolError(error, 'causal_expand');
      }
    },
  );
}

function registerSubgraphMergeTool(
  mcpServer: McpServer,
  _resources: SharedResources,
): void {
  mcpServer.registerTool(
    'subgraph_merge',
    {
      description:
        'Combine and score multiple graph views. Nodes found in multiple views get boosted scores. Returns a merged subgraph.',
      inputSchema: SubgraphMergeSchema,
    },
    async (args) => {
      // Validate input with Zod schema
      const validation = validateToolInput(
        args,
        SubgraphMergeSchema,
        'subgraph_merge',
      );
      if (!validation.success) {
        return formatToolError(validation.error, 'subgraph_merge');
      }
      const { views, multi_view_boost = 1.5, min_score } = validation.data;

      try {
        const merger = new SubgraphMerger({
          multiViewBoost: multi_view_boost,
        });

        const merged = merger.merge(views as GraphView[]);

        // Apply min_score filtering if specified
        let result = merged;
        if (min_score !== undefined) {
          result = {
            ...merged,
            nodes: merged.nodes.filter((n) => n.finalScore >= min_score),
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          structuredContent: {
            merged: result,
            nodeCount: result.nodes.length,
            viewContributions: result.viewContributions,
          },
        };
      } catch (error) {
        return formatToolError(error, 'subgraph_merge');
      }
    },
  );
}

function registerLinearizeContextTool(
  mcpServer: McpServer,
  _resources: SharedResources,
): void {
  mcpServer.registerTool(
    'linearize_context',
    {
      description:
        'Format a merged subgraph into ordered text context for LLM consumption. Uses intent-based ordering strategy.',
      inputSchema: LinearizeContextSchema,
    },
    async (args) => {
      // Validate input with Zod schema
      const validation = validateToolInput(
        args,
        LinearizeContextSchema,
        'linearize_context',
      );
      if (!validation.success) {
        return formatToolError(validation.error, 'linearize_context');
      }
      const { subgraph, intent, max_tokens = 4000 } = validation.data;

      try {
        const linearizer = new ContextLinearizer(max_tokens);
        const linearized = linearizer.linearize(subgraph, intent);

        return {
          content: [
            {
              type: 'text' as const,
              text: linearized.text,
            },
          ],
          structuredContent: {
            text: linearized.text,
            nodeCount: linearized.nodeCount,
            strategy: linearized.strategy,
            estimatedTokens: linearized.estimatedTokens,
          },
        };
      } catch (error) {
        return formatToolError(error, 'linearize_context');
      }
    },
  );
}
