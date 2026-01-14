// MCP Server setup
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  type CausalNode,
  FalkorDBAdapter,
  Orchestrator,
  StorageConfigError,
  createEmbeddingProvider,
  createLLMProvider,
} from '@polyg-mcp/core';
import {
  AddCausalLinkSchema,
  AddConceptSchema,
  AddEntitySchema,
  AddEventSchema,
  AddFactSchema,
  type CausalLink,
  ClearGraphSchema,
  ConfigValidationError,
  type EmbeddingProvider,
  ExplainWhySchema,
  GetCausalChainSchema,
  GetEntitySchema,
  type LLMProvider,
  LinkEntitiesSchema,
  type PolygConfig,
  PolygConfigSchema,
  QueryTimelineSchema,
  RecallInputSchema,
  RememberInputSchema,
  SearchSemanticSchema,
} from '@polyg-mcp/shared';
import {
  ServerConfigError,
  ServerStartError,
  ServerStopError,
  ToolExecutionError,
  formatToolError,
  safeParseDate,
} from './errors.js';
import { HealthChecker, type HealthStatus } from './health.js';

/**
 * polyg-mcp MCP Server
 * Provides multi-graph memory tools via MCP protocol
 */
export class PolygMCPServer {
  private mcpServer: McpServer;
  private db: FalkorDBAdapter;
  private healthChecker: HealthChecker;
  private orchestrator: Orchestrator;
  private _isConnected = false;
  private readonly validatedConfig: PolygConfig;

  /**
   * Create a new polyg MCP server
   * @throws {ServerConfigError} if configuration is invalid
   */
  constructor(config: PolygConfig) {
    // Validate configuration using Zod
    const configResult = PolygConfigSchema.safeParse(config);
    if (!configResult.success) {
      throw new ServerConfigError(
        `Invalid server configuration:\n${configResult.error.issues.map((e: { path: PropertyKey[]; message: string }) => `  - ${e.path.join('.')}: ${e.message}`).join('\n')}`,
        undefined,
      );
    }
    this.validatedConfig = configResult.data;

    // Initialize FalkorDB adapter (it will validate its own config)
    try {
      this.db = new FalkorDBAdapter(this.validatedConfig.falkordb);
    } catch (error) {
      if (error instanceof StorageConfigError) {
        throw new ServerConfigError(
          `FalkorDB configuration error: ${error.message}`,
          'falkordb',
          error,
        );
      }
      throw new ServerConfigError(
        `Failed to initialize FalkorDB adapter: ${error instanceof Error ? error.message : String(error)}`,
        'falkordb',
        error instanceof Error ? error : undefined,
      );
    }

    // Initialize LLM provider
    let llmProvider: LLMProvider;
    try {
      llmProvider = createLLMProvider({
        provider: this.validatedConfig.llm.provider,
        model: this.validatedConfig.llm.model,
        apiKey: this.validatedConfig.llm.apiKey,
        classifierMaxTokens: this.validatedConfig.llm.classifierMaxTokens,
        synthesizerMaxTokens: this.validatedConfig.llm.synthesizerMaxTokens,
      });
    } catch (error) {
      throw new ServerConfigError(
        `LLM provider initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        'llm',
        error instanceof Error ? error : undefined,
      );
    }

    // Initialize Embedding provider
    let embeddingProvider: EmbeddingProvider;
    try {
      embeddingProvider = createEmbeddingProvider(
        {
          provider: this.validatedConfig.embeddings.provider,
          model: this.validatedConfig.embeddings.model,
          dimensions: this.validatedConfig.embeddings.dimensions,
        },
        this.validatedConfig.llm.apiKey, // Use same API key for embeddings
      );
    } catch (error) {
      throw new ServerConfigError(
        `Embedding provider initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        'embeddings',
        error instanceof Error ? error : undefined,
      );
    }

    // Initialize Orchestrator with all components
    this.orchestrator = new Orchestrator(
      this.db,
      llmProvider,
      embeddingProvider,
      {
        timeout: this.validatedConfig.execution.parallelTimeout,
      },
    );

    // Initialize health checker
    this.healthChecker = new HealthChecker(this.db);

    // Initialize MCP server
    this.mcpServer = new McpServer(
      {
        name: 'polyg-mcp',
        version: '0.1.0',
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
    this.registerTools();
  }

  /**
   * Get the underlying MCP server instance
   */
  getMcpServer(): McpServer {
    return this.mcpServer;
  }

  /**
   * Get the FalkorDB adapter instance
   */
  getDatabase(): FalkorDBAdapter {
    return this.db;
  }

  /**
   * Get the Orchestrator instance
   */
  getOrchestrator(): Orchestrator {
    return this.orchestrator;
  }

  /**
   * Get the health checker instance
   */
  getHealthChecker(): HealthChecker {
    return this.healthChecker;
  }

  /**
   * Check if the server is connected
   */
  isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Get the validated configuration
   */
  getConfig(): PolygConfig {
    return this.validatedConfig;
  }

  /**
   * Initialize the server and connect to database
   * @throws {ServerStartError} if connection fails
   */
  async start(): Promise<void> {
    if (this._isConnected) {
      return; // Already connected
    }

    try {
      await this.db.connect();
      this._isConnected = true;
    } catch (error) {
      throw new ServerStartError(
        `Failed to connect to FalkorDB: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Graceful shutdown
   * @throws {ServerStopError} if shutdown fails
   */
  async stop(): Promise<void> {
    const errors: Error[] = [];

    // Close MCP server if connected
    if (this.mcpServer.isConnected()) {
      try {
        await this.mcpServer.close();
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Disconnect from database
    try {
      await this.db.disconnect();
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    this._isConnected = false;

    // Report any errors during shutdown
    if (errors.length > 0) {
      throw new ServerStopError(
        `Errors during shutdown: ${errors.map((e) => e.message).join('; ')}`,
        errors[0],
      );
    }
  }

  /**
   * Get health status
   */
  async getHealth(): Promise<HealthStatus> {
    return this.healthChecker.check();
  }

  /**
   * Register all MCP tools
   */
  registerTools(): void {
    // Management tools
    this.registerStatisticsTool();
    this.registerClearGraphTool();

    // High-level LLM tools
    this.registerRecallTool();
    this.registerRememberTool();

    // Entity tools
    this.registerGetEntityTool();
    this.registerAddEntityTool();
    this.registerLinkEntitiesTool();

    // Temporal tools
    this.registerQueryTimelineTool();
    this.registerAddEventTool();
    this.registerAddFactTool();

    // Causal tools
    this.registerGetCausalChainTool();
    this.registerAddCausalLinkTool();
    this.registerExplainWhyTool();

    // Semantic tools
    this.registerSearchSemanticTool();
    this.registerAddConceptTool();
  }

  // ============================================================================
  // Management Tools
  // ============================================================================

  private registerStatisticsTool(): void {
    this.mcpServer.registerTool(
      'get_statistics',
      {
        description: 'Get statistics about all graphs in the memory system',
      },
      async () => {
        try {
          const stats = await this.db.getStatistics();
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

  private registerClearGraphTool(): void {
    this.mcpServer.registerTool(
      'clear_graph',
      {
        description:
          'Clear all data from specified graph(s). Use with caution!',
        inputSchema: ClearGraphSchema,
      },
      async (args) => {
        try {
          const { graph } = args;

          if (graph === 'all') {
            await this.db.clearGraph();
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
            await this.db.query(
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

  private registerRecallTool(): void {
    this.mcpServer.registerTool(
      'recall',
      {
        description:
          'Query the memory system using natural language. Uses LLM to classify intent, query relevant graphs in parallel, and synthesize a coherent response.',
        inputSchema: RecallInputSchema,
      },
      async (args) => {
        try {
          const result = await this.orchestrator.recall(args.query);
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

  private registerRememberTool(): void {
    this.mcpServer.registerTool(
      'remember',
      {
        description:
          'Store new information in the memory system. Extracts entities, facts, and events from the content.',
        inputSchema: RememberInputSchema,
      },
      async (args) => {
        try {
          const result = await this.orchestrator.remember(
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

  private registerGetEntityTool(): void {
    this.mcpServer.registerTool(
      'get_entity',
      {
        description:
          'Get an entity by name or UUID, optionally including its relationships',
        inputSchema: GetEntitySchema,
      },
      async (args) => {
        try {
          const graphs = this.orchestrator.getGraphs();
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

  private registerAddEntityTool(): void {
    this.mcpServer.registerTool(
      'add_entity',
      {
        description: 'Add a new entity to the entity graph',
        inputSchema: AddEntitySchema,
      },
      async (args) => {
        try {
          const graphs = this.orchestrator.getGraphs();
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

  private registerLinkEntitiesTool(): void {
    this.mcpServer.registerTool(
      'link_entities',
      {
        description: 'Create a relationship between two entities',
        inputSchema: LinkEntitiesSchema,
      },
      async (args) => {
        try {
          const graphs = this.orchestrator.getGraphs();
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

  private registerQueryTimelineTool(): void {
    this.mcpServer.registerTool(
      'query_timeline',
      {
        description: 'Query events and facts within a time range',
        inputSchema: QueryTimelineSchema,
      },
      async (args) => {
        try {
          const fromDate = safeParseDate(args.from, 'from');
          const toDate = safeParseDate(args.to, 'to');

          const graphs = this.orchestrator.getGraphs();
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

  private registerAddEventTool(): void {
    this.mcpServer.registerTool(
      'add_event',
      {
        description: 'Add an event to the temporal graph',
        inputSchema: AddEventSchema,
      },
      async (args) => {
        try {
          const occurredAt = safeParseDate(args.occurred_at, 'occurred_at');

          const graphs = this.orchestrator.getGraphs();
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

  private registerAddFactTool(): void {
    this.mcpServer.registerTool(
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

          const graphs = this.orchestrator.getGraphs();
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

  private registerGetCausalChainTool(): void {
    this.mcpServer.registerTool(
      'get_causal_chain',
      {
        description:
          'Get the causal chain for an event (upstream causes or downstream effects)',
        inputSchema: GetCausalChainSchema,
      },
      async (args) => {
        try {
          const graphs = this.orchestrator.getGraphs();

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

  private registerAddCausalLinkTool(): void {
    this.mcpServer.registerTool(
      'add_causal_link',
      {
        description: 'Add a cause-effect relationship between two nodes',
        inputSchema: AddCausalLinkSchema,
      },
      async (args) => {
        try {
          const graphs = this.orchestrator.getGraphs();

          // Get or create cause node with specific error context
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

          // Get or create effect node with specific error context
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

          // Create the causal link with specific error context
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

  private registerExplainWhyTool(): void {
    this.mcpServer.registerTool(
      'explain_why',
      {
        description: 'Get a causal explanation for why something happened',
        inputSchema: ExplainWhySchema,
      },
      async (args) => {
        try {
          const graphs = this.orchestrator.getGraphs();
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

  private registerSearchSemanticTool(): void {
    this.mcpServer.registerTool(
      'search_semantic',
      {
        description: 'Search for concepts using semantic similarity',
        inputSchema: SearchSemanticSchema,
      },
      async (args) => {
        try {
          const graphs = this.orchestrator.getGraphs();
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

  private registerAddConceptTool(): void {
    this.mcpServer.registerTool(
      'add_concept',
      {
        description:
          'Add a concept to the semantic graph (will auto-generate embedding)',
        inputSchema: AddConceptSchema,
      },
      async (args) => {
        try {
          const graphs = this.orchestrator.getGraphs();
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
}
