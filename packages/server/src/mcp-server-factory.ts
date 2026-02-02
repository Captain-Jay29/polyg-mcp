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
  loggers,
  RememberInputSchema,
  SemanticSearchSchema,
  SubgraphMergeSchema,
  TemporalExpandSchema,
} from '@polyg-mcp/shared';
// Import version from package.json to avoid hardcoding
import packageJson from '../package.json' with { type: 'json' };
import { formatToolError, safeParseDate, validateToolInput } from './errors.js';
import type { SharedResources } from './shared-resources.js';

const SERVER_VERSION = packageJson.version;

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
          const stats = await resources.db.getStatistics();
          return {
            content: [
              {
                type: 'text' as const,
                text: 'All graphs cleared successfully',
              },
            ],
            structuredContent: {
              cleared: 'all',
              remainingNodes:
                stats.semantic_nodes +
                stats.temporal_nodes +
                stats.causal_nodes +
                stats.entity_nodes,
            },
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

          // When clearing entity graph, clean up orphaned cross-links
          // Entity nodes are TARGETS of X_REPRESENTS, X_INVOLVES, X_AFFECTS from other graphs
          // DETACH DELETE only removes relationships attached to deleted nodes, not incoming links
          // that now point to nothing
          if (graph === 'entity') {
            const orphanCleanupQueries = [
              // Clean up X_REPRESENTS links from S_Concept nodes pointing to deleted E_Entity
              'MATCH (s:S_Concept)-[r:X_REPRESENTS]->() WHERE NOT (r)-->(:E_Entity) DELETE r',
              // Clean up X_INVOLVES links from T_Event/T_Fact nodes pointing to deleted E_Entity
              'MATCH ()-[r:X_INVOLVES]->() WHERE NOT (r)-->(:E_Entity) DELETE r',
              // Clean up X_AFFECTS links from C_Node nodes pointing to deleted E_Entity
              'MATCH ()-[r:X_AFFECTS]->() WHERE NOT (r)-->(:E_Entity) DELETE r',
            ];

            for (const cleanupQuery of orphanCleanupQueries) {
              try {
                await resources.db.query(cleanupQuery);
              } catch (cleanupError) {
                // Log but don't fail the clear operation
                loggers.tools.warn(
                  '[clear_graph] Cross-link cleanup query failed',
                  {
                    error:
                      cleanupError instanceof Error
                        ? cleanupError.message
                        : String(cleanupError),
                  },
                );
              }
            }
          }
        }

        // Get stats to verify clear and return remaining count
        const stats = await resources.db.getStatistics();
        const nodeCountKey = `${graph}_nodes` as keyof typeof stats;
        const remainingNodes =
          typeof stats[nodeCountKey] === 'number' ? stats[nodeCountKey] : 0;

        return {
          content: [
            {
              type: 'text' as const,
              text: `${graph} graph cleared successfully`,
            },
          ],
          structuredContent: {
            cleared: graph,
            remainingNodes,
          },
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
        'Store new information as a timestamped event in the temporal graph. For structured data, use add_entity, add_fact, or add_concept instead.',
      inputSchema: RememberInputSchema,
    },
    async (args) => {
      // Validate input with Zod schema
      const validation = validateToolInput(
        args,
        RememberInputSchema,
        'remember',
      );
      if (!validation.success) {
        return formatToolError(validation.error, 'remember');
      }
      const { content, context } = validation.data;

      try {
        const result = await resources.orchestrator.remember(content, context);
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
      // Validate input with Zod schema
      const validation = validateToolInput(args, AddEntitySchema, 'add_entity');
      if (!validation.success) {
        return formatToolError(validation.error, 'add_entity');
      }
      const { name, entity_type, properties } = validation.data;

      try {
        const graphs = resources.orchestrator.getGraphs();
        const entity = await graphs.entity.addEntity(
          name,
          entity_type,
          properties,
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
      // Validate input with Zod schema
      const validation = validateToolInput(
        args,
        LinkEntitiesSchema,
        'link_entities',
      );
      if (!validation.success) {
        return formatToolError(validation.error, 'link_entities');
      }
      const { source, target, relationship } = validation.data;

      try {
        const graphs = resources.orchestrator.getGraphs();
        await graphs.entity.linkEntities(source, target, relationship);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Linked: ${source} -[${relationship}]-> ${target}`,
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
      // Validate input with Zod schema
      const validation = validateToolInput(args, AddEventSchema, 'add_event');
      if (!validation.success) {
        return formatToolError(validation.error, 'add_event');
      }
      const { description, occurred_at, entities } = validation.data;

      try {
        const occurredAt = safeParseDate(occurred_at, 'occurred_at');

        const graphs = resources.orchestrator.getGraphs();
        const event = await graphs.temporal.addEvent(description, occurredAt);

        // Link event to entities if specified
        const linkedEntities: string[] = [];
        const failedLinks: Array<{ entity: string; reason: string }> = [];
        if (entities && Array.isArray(entities)) {
          for (const entityRef of entities) {
            try {
              const entity = await graphs.entity.getEntity(entityRef);
              if (entity) {
                await graphs.temporal.linkEventToEntity(
                  event.uuid,
                  entity.uuid,
                );
                linkedEntities.push(entity.name);
              } else {
                failedLinks.push({ entity: entityRef, reason: 'not found' });
              }
            } catch (err) {
              const reason =
                err instanceof Error ? err.message : 'unknown error';
              failedLinks.push({ entity: entityRef, reason });
              loggers.tools.warn(`[add_event] Failed to link entity`, {
                entity: entityRef,
                reason,
              });
            }
          }
        }

        const linkedText =
          linkedEntities.length > 0
            ? ` (linked to: ${linkedEntities.join(', ')})`
            : '';
        const failedText =
          failedLinks.length > 0
            ? ` (failed to link: ${failedLinks.map((f) => f.entity).join(', ')})`
            : '';

        return {
          content: [
            {
              type: 'text' as const,
              text: `Added event: ${event.description} at ${event.occurred_at.toISOString()}${linkedText}${failedText}`,
            },
          ],
          structuredContent: { ...event, linkedEntities, failedLinks },
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
      // Validate input with Zod schema
      const validation = validateToolInput(args, AddFactSchema, 'add_fact');
      if (!validation.success) {
        return formatToolError(validation.error, 'add_fact');
      }
      const {
        subject,
        predicate,
        object,
        valid_from,
        valid_to,
        subject_entity,
      } = validation.data;

      try {
        const validFrom = safeParseDate(valid_from, 'valid_from');
        const validTo = valid_to
          ? safeParseDate(valid_to, 'valid_to')
          : undefined;

        // Validate date range
        if (validTo && validTo < validFrom) {
          throw new Error(
            `Invalid date range: valid_to (${validTo.toISOString()}) must be >= valid_from (${validFrom.toISOString()})`,
          );
        }

        const graphs = resources.orchestrator.getGraphs();
        const fact = await graphs.temporal.addFact(
          subject,
          predicate,
          object,
          validFrom,
          validTo,
        );

        // Link fact to subject entity if specified (creates X_INVOLVES relationship)
        let linkedEntity: string | undefined;
        let linkError: string | undefined;
        if (subject_entity) {
          try {
            const entity = await graphs.entity.getEntity(subject_entity);
            if (entity) {
              await graphs.temporal.linkFactToEntity(fact.uuid, entity.uuid);
              linkedEntity = entity.name;
            } else {
              linkError = 'not found';
            }
          } catch (err) {
            linkError = err instanceof Error ? err.message : 'unknown error';
            loggers.tools.warn(`[add_fact] Failed to link entity`, {
              entity: subject_entity,
              error: linkError,
            });
          }
        }

        const linkedText = linkedEntity ? ` (about: ${linkedEntity})` : '';
        const failedText =
          linkError && subject_entity
            ? ` (failed to link ${subject_entity}: ${linkError})`
            : '';

        return {
          content: [
            {
              type: 'text' as const,
              text: `Added fact: ${fact.subject} ${fact.predicate} ${fact.object}${linkedText}${failedText}`,
            },
          ],
          structuredContent: { ...fact, linkedEntity, linkError },
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
      // Validate input with Zod schema
      const validation = validateToolInput(
        args,
        AddCausalLinkSchema,
        'add_causal_link',
      );
      if (!validation.success) {
        return formatToolError(validation.error, 'add_causal_link');
      }
      const { cause, effect, confidence, entities, events } = validation.data;

      try {
        // Prevent self-referencing causal links
        if (cause === effect) {
          throw new Error('Cannot create a causal link from a node to itself');
        }

        const graphs = resources.orchestrator.getGraphs();

        // Get or create cause node
        let causeNode: CausalNode | null;
        try {
          causeNode = await graphs.causal.getNode(cause);
          if (!causeNode) {
            causeNode = await graphs.causal.addNode(cause, 'cause');
          }
        } catch (error) {
          throw new Error(
            `Failed to get/create cause node '${cause}': ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        // Get or create effect node
        let effectNode: CausalNode | null;
        try {
          effectNode = await graphs.causal.getNode(effect);
          if (!effectNode) {
            effectNode = await graphs.causal.addNode(effect, 'effect');
          }
        } catch (error) {
          throw new Error(
            `Failed to get/create effect node '${effect}': ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        // Create the causal link
        try {
          await graphs.causal.addLink(
            causeNode.uuid,
            effectNode.uuid,
            confidence,
          );
        } catch (error) {
          throw new Error(
            `Failed to create link between '${cause}' and '${effect}': ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        // Link causal nodes to entities if specified (creates X_AFFECTS relationships)
        const linkedEntities: string[] = [];
        const failedEntityLinks: Array<{ entity: string; reason: string }> = [];
        if (entities && Array.isArray(entities)) {
          for (const entityRef of entities) {
            try {
              const entity = await graphs.entity.getEntity(entityRef);
              if (entity) {
                // Link both cause and effect nodes to the entity
                await graphs.causal.linkToEntity(causeNode.uuid, entity.uuid);
                await graphs.causal.linkToEntity(effectNode.uuid, entity.uuid);
                linkedEntities.push(entity.name);
              } else {
                failedEntityLinks.push({
                  entity: entityRef,
                  reason: 'not found',
                });
              }
            } catch (err) {
              const reason =
                err instanceof Error ? err.message : 'unknown error';
              failedEntityLinks.push({ entity: entityRef, reason });
              loggers.tools.warn(`[add_causal_link] Failed to link entity`, {
                entity: entityRef,
                reason,
              });
            }
          }
        }

        // Link causal nodes to events if specified (creates X_REFERS_TO relationships)
        const linkedEvents: string[] = [];
        const failedEventLinks: Array<{ event: string; reason: string }> = [];
        if (events && Array.isArray(events)) {
          for (const eventRef of events) {
            try {
              const event = await graphs.temporal.getEvent(eventRef);
              if (event) {
                // Link both cause and effect nodes to the event
                await graphs.causal.linkToEvent(causeNode.uuid, event.uuid);
                await graphs.causal.linkToEvent(effectNode.uuid, event.uuid);
                linkedEvents.push(
                  event.description.length > 40
                    ? `${event.description.slice(0, 40)}...`
                    : event.description,
                );
              } else {
                failedEventLinks.push({ event: eventRef, reason: 'not found' });
              }
            } catch (err) {
              const reason =
                err instanceof Error ? err.message : 'unknown error';
              failedEventLinks.push({ event: eventRef, reason });
              loggers.tools.warn(`[add_causal_link] Failed to link event`, {
                event: eventRef,
                reason,
              });
            }
          }
        }

        const linkedEntityText =
          linkedEntities.length > 0
            ? ` (affects: ${linkedEntities.join(', ')})`
            : '';
        const linkedEventText =
          linkedEvents.length > 0
            ? ` (refers to: ${linkedEvents.join(', ')})`
            : '';
        const failedEntityText =
          failedEntityLinks.length > 0
            ? ` (failed entities: ${failedEntityLinks.map((f) => f.entity).join(', ')})`
            : '';
        const failedEventText =
          failedEventLinks.length > 0
            ? ` (failed events: ${failedEventLinks.map((f) => f.event).join(', ')})`
            : '';

        return {
          content: [
            {
              type: 'text' as const,
              text: `Added causal link: ${cause} -> ${effect}${confidence ? ` (confidence: ${confidence})` : ''}${linkedEntityText}${linkedEventText}${failedEntityText}${failedEventText}`,
            },
          ],
          structuredContent: {
            cause,
            effect,
            confidence,
            linkedEntities,
            linkedEvents,
            failedEntityLinks,
            failedEventLinks,
          },
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
      // Validate input with Zod schema
      const validation = validateToolInput(
        args,
        AddConceptSchema,
        'add_concept',
      );
      if (!validation.success) {
        return formatToolError(validation.error, 'add_concept');
      }
      const { name, description, entities } = validation.data;

      try {
        const graphs = resources.orchestrator.getGraphs();
        const concept = await graphs.semantic.addConcept(name, description);

        // Link concept to entities if specified (creates X_REPRESENTS relationships)
        const linkedEntities: string[] = [];
        const failedLinks: Array<{ entity: string; reason: string }> = [];
        if (entities && Array.isArray(entities)) {
          for (const entityRef of entities) {
            try {
              const entity = await graphs.entity.getEntity(entityRef);
              if (entity) {
                await graphs.semantic.linkToEntity(concept.uuid, entity.uuid);
                linkedEntities.push(entity.name);
              } else {
                failedLinks.push({ entity: entityRef, reason: 'not found' });
              }
            } catch (err) {
              const reason =
                err instanceof Error ? err.message : 'unknown error';
              failedLinks.push({ entity: entityRef, reason });
              loggers.tools.warn(`[add_concept] Failed to link entity`, {
                entity: entityRef,
                reason,
              });
            }
          }
        }

        const linkedText =
          linkedEntities.length > 0
            ? ` (linked to: ${linkedEntities.join(', ')})`
            : '';
        const failedText =
          failedLinks.length > 0
            ? ` (failed to link: ${failedLinks.map((f) => f.entity).join(', ')})`
            : '';

        return {
          content: [
            {
              type: 'text' as const,
              text: `Added concept: ${concept.name}${concept.description ? ` - ${concept.description}` : ''}${linkedText}${failedText}`,
            },
          ],
          structuredContent: {
            uuid: concept.uuid,
            name: concept.name,
            description: concept.description,
            linkedEntities,
            failedLinks,
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
        'Find seed concepts via vector similarity search. Returns concept matches with scores and linked entity IDs (via X_REPRESENTS) that can be used for graph expansion tools like entity_lookup, temporal_expand, and causal_expand.',
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
      const { query, limit = 10, min_score = 0.3 } = validation.data;

      try {
        const graphs = resources.orchestrator.getGraphs();
        const db = resources.db;
        const results = await graphs.semantic.search(query, limit);

        // Filter by minimum score
        const filtered = results.filter((r) => r.score >= min_score);

        // For each concept, fetch linked entity IDs via X_REPRESENTS
        // Use Promise.allSettled for graceful degradation - one failure shouldn't kill all results
        const settledResults = await Promise.allSettled(
          filtered.map(async (match) => {
            const linkedEntities = await db.query(
              `MATCH (c:S_Concept {uuid: $conceptId})-[:X_REPRESENTS]->(e:E_Entity)
               RETURN e.uuid AS entityId, e.name AS entityName`,
              { conceptId: match.concept.uuid },
            );
            const entityIds = linkedEntities.records.map(
              (r) => r.entityId as string,
            );
            const entityNames = linkedEntities.records.map(
              (r) => r.entityName as string,
            );
            return {
              ...match,
              linkedEntityIds: entityIds,
              linkedEntityNames: entityNames,
            };
          }),
        );

        // Extract successful results, log failures
        const matchesWithEntities = settledResults
          .filter(
            (
              result,
            ): result is PromiseFulfilledResult<{
              concept: { uuid: string; name: string; description?: string };
              score: number;
              linkedEntityIds: string[];
              linkedEntityNames: string[];
            }> => {
              if (result.status === 'rejected') {
                loggers.tools.warn(
                  '[semantic_search] Failed to fetch entity links for concept',
                  {
                    error:
                      result.reason instanceof Error
                        ? result.reason.message
                        : String(result.reason),
                  },
                );
                return false;
              }
              return true;
            },
          )
          .map((result) => result.value);

        // Collect all unique entity IDs for convenience
        const allEntityIds = [
          ...new Set(matchesWithEntities.flatMap((m) => m.linkedEntityIds)),
        ];

        // Format response with entity IDs prominently at the top for the agent
        const responseObj = {
          // PUT ENTITY IDS FIRST so agent sees them even if response is truncated
          seedEntityIds: allEntityIds,
          seedEntityCount: allEntityIds.length,
          instruction:
            'Use seedEntityIds (not concept UUIDs) for entity_lookup, temporal_expand, and causal_expand tools',
          matches: matchesWithEntities.map((m) => ({
            conceptName: m.concept.name,
            conceptUuid: m.concept.uuid,
            score: m.score,
            linkedEntityIds: m.linkedEntityIds,
            linkedEntityNames: m.linkedEntityNames,
          })),
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(responseObj, null, 2),
            },
          ],
          structuredContent: {
            matches: matchesWithEntities,
            allEntityIds,
            query,
            total: matchesWithEntities.length,
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

        // Resolve entity IDs (could be UUIDs or names)
        const resolvedEntities: Array<{ uuid: string; name: string }> = [];
        for (const entityId of entity_ids) {
          const entity = await graphs.entity.getEntity(entityId);
          if (entity) {
            resolvedEntities.push({ uuid: entity.uuid, name: entity.name });
          }
        }

        if (resolvedEntities.length === 0) {
          const emptyResponse = {
            entities: [],
            depth,
            total: 0,
            hint: 'No entities found matching the provided IDs. Verify entity IDs are correct UUIDs or exact entity names.',
            instruction:
              'Use entity IDs from semantic_search seedEntityIds, or add entities first with add_entity tool.',
          };
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(emptyResponse, null, 2),
              },
            ],
            structuredContent: emptyResponse,
          };
        }

        // Use batch method for efficient relationship fetching
        const seenIds = new Set<string>();
        let currentLevelIds = resolvedEntities.map((e) => e.uuid);
        const allRelationshipsByEntity = new Map<
          string,
          Array<{ source: unknown; target: unknown; relationshipType: string }>
        >();

        // Initialize with empty arrays
        for (const entity of resolvedEntities) {
          allRelationshipsByEntity.set(entity.uuid, []);
        }

        // BFS expansion up to depth using batch queries
        for (let d = 0; d < depth && currentLevelIds.length > 0; d++) {
          const relationshipMap =
            await graphs.entity.getRelationshipsBatch(currentLevelIds);
          const nextLevelIds: string[] = [];

          for (const entityId of currentLevelIds) {
            if (seenIds.has(entityId)) continue;
            seenIds.add(entityId);

            const relationships = relationshipMap.get(entityId) || [];

            // Add to primary entity's relationships if it's one of our seeds
            if (allRelationshipsByEntity.has(entityId)) {
              const existing = allRelationshipsByEntity.get(entityId) || [];
              existing.push(...relationships);
              allRelationshipsByEntity.set(entityId, existing);
            }

            // Collect next level IDs
            for (const rel of relationships) {
              if (!seenIds.has(rel.source.uuid)) {
                nextLevelIds.push(rel.source.uuid);
              }
              if (!seenIds.has(rel.target.uuid)) {
                nextLevelIds.push(rel.target.uuid);
              }
            }
          }

          currentLevelIds = [...new Set(nextLevelIds)];
        }

        // Build results
        for (const entity of resolvedEntities) {
          const fullEntity = await graphs.entity.getEntity(entity.uuid);
          if (fullEntity) {
            results.push({
              entity: include_properties
                ? fullEntity
                : { uuid: fullEntity.uuid, name: fullEntity.name },
              relationships: allRelationshipsByEntity.get(entity.uuid) || [],
            });
          }
        }

        const responseObj = {
          instruction:
            'Use entity UUIDs from these results for temporal_expand and causal_expand tools.',
          entities: results,
          depth,
          total: results.length,
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(responseObj, null, 2),
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

        // Use batch method for efficient event fetching
        const eventMap = await graphs.temporal.queryTimelineForEntities(
          entity_ids,
          fromDate,
          toDate,
        );

        // Deduplicate events across all entities
        const seen = new Set<string>();
        const uniqueEvents: unknown[] = [];

        for (const events of eventMap.values()) {
          for (const event of events) {
            if (!seen.has(event.uuid)) {
              seen.add(event.uuid);
              uniqueEvents.push(event);
            }
          }
        }

        // Build response with instruction and hint for empty results
        const responseObj =
          uniqueEvents.length === 0
            ? {
                events: [],
                from: fromDate.toISOString(),
                to: toDate.toISOString(),
                total: 0,
                hint: 'No temporal events found for the specified entities in this time range. The entities may not have linked events, or try expanding the date range.',
                instruction:
                  'Use add_event tool to create events and link them to entities, or try different entity IDs.',
              }
            : {
                instruction:
                  'These events are linked to the queried entities. Use event UUIDs for detailed lookups or causal linking.',
                events: uniqueEvents,
                from: fromDate.toISOString(),
                to: toDate.toISOString(),
                total: uniqueEvents.length,
              };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(responseObj, null, 2),
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

        // Use batch method to find C_Node nodes linked to entities via X_AFFECTS
        const nodeMap = await graphs.causal.getNodesForEntities(entity_ids);

        // Collect unique causal node IDs
        const causalNodeIds: string[] = [];
        const seenNodeIds = new Set<string>();

        for (const nodes of nodeMap.values()) {
          for (const node of nodes) {
            if (!seenNodeIds.has(node.uuid)) {
              seenNodeIds.add(node.uuid);
              causalNodeIds.push(node.uuid);
            }
          }
        }

        if (causalNodeIds.length === 0) {
          const emptyResponse = {
            links: [],
            direction,
            depth,
            total: 0,
            hint: 'No causal nodes found linked to the specified entities. The entities may not have causal relationships defined.',
            instruction:
              'Use add_causal_link tool to create causal relationships and link them to entities via the entities parameter.',
          };
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(emptyResponse, null, 2),
              },
            ],
            structuredContent: emptyResponse,
          };
        }

        // Use traverseFromNodeIds for efficient traversal
        const uniqueLinks = await graphs.causal.traverseFromNodeIds(
          causalNodeIds,
          direction,
          depth,
        );

        const responseObj = {
          instruction:
            'These causal links show cause-effect relationships. Use for reasoning about why things happened.',
          links: uniqueLinks,
          direction,
          depth,
          total: uniqueLinks.length,
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(responseObj, null, 2),
            },
          ],
          structuredContent: {
            links: uniqueLinks,
            direction,
            depth,
            total: uniqueLinks.length,
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
