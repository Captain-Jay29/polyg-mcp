// Semantic Graph - conceptual similarity and topic clustering
import type {
  Concept,
  EmbeddingProvider,
  EnrichedSemanticMatch,
  SemanticMatch,
} from '@polyg-mcp/shared';
import type { FalkorDBAdapter } from '../storage/falkordb.js';
import {
  EmbeddingGenerationError,
  GraphParseError,
  RelationshipError,
  wrapGraphError,
} from './errors.js';
import { ParseError, parseConcept } from './parsers.js';

// Node label for semantic graph
const CONCEPT_LABEL = 'S_Concept';
const REPRESENTS_REL = 'X_REPRESENTS';

/**
 * Semantic Graph manages concepts with vector embeddings for similarity search.
 * - S_Concept: Named concepts with embeddings for vector similarity
 * - Uses vector search for semantic matching
 */
export class SemanticGraph {
  constructor(
    private db: FalkorDBAdapter,
    private embeddings: EmbeddingProvider,
  ) {}

  /**
   * Safely parse a concept node
   */
  private safeParseConcept(node: unknown): Concept {
    try {
      return parseConcept(node);
    } catch (error) {
      if (error instanceof ParseError) {
        throw new GraphParseError(error.message, error.nodeType, error);
      }
      throw error;
    }
  }

  /**
   * Add a new concept with auto-generated embedding
   */
  async addConcept(name: string, description?: string): Promise<Concept> {
    try {
      // Generate embedding for the concept
      const textToEmbed = description ? `${name}: ${description}` : name;
      let embedding: number[];

      try {
        embedding = await this.embeddings.embed(textToEmbed);
      } catch (error) {
        throw new EmbeddingGenerationError(
          `Failed to generate embedding for concept: ${name}`,
          textToEmbed,
          error instanceof Error ? error : undefined,
        );
      }

      const nodeProps: Record<string, unknown> = {
        name,
        embedding: JSON.stringify(embedding),
        created_at: new Date().toISOString(),
      };

      if (description) {
        nodeProps.description = description;
      }

      const uuid = await this.db.createNode(CONCEPT_LABEL, nodeProps);

      return {
        uuid,
        name,
        description,
        embedding,
      };
    } catch (error) {
      if (error instanceof EmbeddingGenerationError) {
        throw error;
      }
      throw wrapGraphError(
        error,
        `Failed to add concept: ${name}`,
        'Semantic',
        'addConcept',
      );
    }
  }

  /**
   * Search for concepts similar to a query string
   */
  async search(query: string, limit = 10): Promise<SemanticMatch[]> {
    try {
      // Generate embedding for the query
      let queryEmbedding: number[];

      try {
        queryEmbedding = await this.embeddings.embed(query);
      } catch (error) {
        throw new EmbeddingGenerationError(
          'Failed to generate embedding for search query',
          query,
          error instanceof Error ? error : undefined,
        );
      }

      // Get all concepts and compute similarity
      const result = await this.db.query(
        `MATCH (c:${CONCEPT_LABEL}) RETURN c`,
        {},
      );

      const matches: SemanticMatch[] = [];

      for (const record of result.records) {
        const concept = this.safeParseConcept(record.c);
        if (concept.embedding) {
          const score = this.cosineSimilarity(
            queryEmbedding,
            concept.embedding,
          );
          matches.push({ concept, score });
        }
      }

      // Sort by score descending and limit
      return matches.sort((a, b) => b.score - a.score).slice(0, limit);
    } catch (error) {
      if (
        error instanceof EmbeddingGenerationError ||
        error instanceof GraphParseError
      ) {
        throw error;
      }
      throw wrapGraphError(
        error,
        `Failed to search concepts: ${query}`,
        'Semantic',
        'search',
      );
    }
  }

  /**
   * Search for concepts and include linked entity IDs in a single query.
   * Returns EnrichedSemanticMatch with linkedEntityIds and linkedEntityNames.
   *
   * This eliminates the need for separate CrossLinker lookups by fetching
   * X_REPRESENTS links alongside the concept search.
   */
  async searchWithEntities(
    query: string,
    limit = 10,
  ): Promise<EnrichedSemanticMatch[]> {
    try {
      // Generate embedding for the query
      let queryEmbedding: number[];

      try {
        queryEmbedding = await this.embeddings.embed(query);
      } catch (error) {
        throw new EmbeddingGenerationError(
          'Failed to generate embedding for search query',
          query,
          error instanceof Error ? error : undefined,
        );
      }

      // Get all concepts with their linked entities in a single query
      const result = await this.db.query(
        `MATCH (c:${CONCEPT_LABEL})
         OPTIONAL MATCH (c)-[:${REPRESENTS_REL}]->(e:E_Entity)
         RETURN c, collect(e.uuid) AS entityIds, collect(e.name) AS entityNames`,
        {},
      );

      const matches: EnrichedSemanticMatch[] = [];

      for (const record of result.records) {
        const concept = this.safeParseConcept(record.c);
        if (concept.embedding) {
          const score = this.cosineSimilarity(
            queryEmbedding,
            concept.embedding,
          );

          // Filter out null values from collect() results
          const entityIds = (record.entityIds as (string | null)[]).filter(
            (id): id is string => id !== null,
          );
          const entityNames = (record.entityNames as (string | null)[]).filter(
            (name): name is string => name !== null,
          );

          matches.push({
            concept,
            score,
            linkedEntityIds: entityIds,
            linkedEntityNames: entityNames,
          });
        }
      }

      // Sort by score descending and limit
      return matches.sort((a, b) => b.score - a.score).slice(0, limit);
    } catch (error) {
      if (
        error instanceof EmbeddingGenerationError ||
        error instanceof GraphParseError
      ) {
        throw error;
      }
      throw wrapGraphError(
        error,
        `Failed to search concepts with entities: ${query}`,
        'Semantic',
        'searchWithEntities',
      );
    }
  }

  /**
   * Find concepts similar to an existing concept
   */
  async getSimilar(conceptId: string, limit = 10): Promise<SemanticMatch[]> {
    try {
      const concept = await this.getConcept(conceptId);
      if (!concept || !concept.embedding) {
        return [];
      }

      // Get all other concepts
      const result = await this.db.query(
        `MATCH (c:${CONCEPT_LABEL}) WHERE c.uuid <> $uuid RETURN c`,
        { uuid: conceptId },
      );

      const matches: SemanticMatch[] = [];

      for (const record of result.records) {
        const other = this.safeParseConcept(record.c);
        if (other.embedding) {
          const score = this.cosineSimilarity(
            concept.embedding,
            other.embedding,
          );
          matches.push({ concept: other, score });
        }
      }

      return matches.sort((a, b) => b.score - a.score).slice(0, limit);
    } catch (error) {
      if (error instanceof GraphParseError) {
        throw error;
      }
      throw wrapGraphError(
        error,
        `Failed to get similar concepts for: ${conceptId}`,
        'Semantic',
        'getSimilar',
      );
    }
  }

  /**
   * Get a concept by UUID
   */
  async getConcept(uuid: string): Promise<Concept | null> {
    try {
      const result = await this.db.query(
        `MATCH (c:${CONCEPT_LABEL} {uuid: $uuid}) RETURN c`,
        { uuid },
      );

      if (result.records.length === 0) {
        return null;
      }

      return this.safeParseConcept(result.records[0].c);
    } catch (error) {
      if (error instanceof GraphParseError) {
        throw error;
      }
      throw wrapGraphError(
        error,
        `Failed to get concept: ${uuid}`,
        'Semantic',
        'getConcept',
      );
    }
  }

  /**
   * Get a concept by name
   */
  async getConceptByName(name: string): Promise<Concept | null> {
    try {
      const result = await this.db.query(
        `MATCH (c:${CONCEPT_LABEL}) WHERE toLower(c.name) = toLower($name) RETURN c LIMIT 1`,
        { name },
      );

      if (result.records.length === 0) {
        return null;
      }

      return this.safeParseConcept(result.records[0].c);
    } catch (error) {
      if (error instanceof GraphParseError) {
        throw error;
      }
      throw wrapGraphError(
        error,
        `Failed to get concept by name: ${name}`,
        'Semantic',
        'getConceptByName',
      );
    }
  }

  /**
   * Link a concept to an entity (cross-graph)
   */
  async linkToEntity(conceptId: string, entityId: string): Promise<void> {
    try {
      await this.db.query(
        `MATCH (c:${CONCEPT_LABEL} {uuid: $conceptId}), (e {uuid: $entityId})
         CREATE (c)-[:${REPRESENTS_REL} {created_at: $createdAt}]->(e)`,
        {
          conceptId,
          entityId,
          createdAt: new Date().toISOString(),
        },
      );
    } catch (error) {
      throw new RelationshipError(
        'Failed to link concept to entity',
        conceptId,
        entityId,
        REPRESENTS_REL,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update a concept's embedding (useful for re-indexing)
   */
  async updateEmbedding(uuid: string): Promise<Concept | null> {
    try {
      const concept = await this.getConcept(uuid);
      if (!concept) {
        return null;
      }

      const textToEmbed = concept.description
        ? `${concept.name}: ${concept.description}`
        : concept.name;

      let embedding: number[];

      try {
        embedding = await this.embeddings.embed(textToEmbed);
      } catch (error) {
        throw new EmbeddingGenerationError(
          `Failed to generate embedding for concept: ${concept.name}`,
          textToEmbed,
          error instanceof Error ? error : undefined,
        );
      }

      await this.db.query(
        `MATCH (c:${CONCEPT_LABEL} {uuid: $uuid}) SET c.embedding = $embedding`,
        { uuid, embedding: JSON.stringify(embedding) },
      );

      return {
        ...concept,
        embedding,
      };
    } catch (error) {
      if (
        error instanceof EmbeddingGenerationError ||
        error instanceof GraphParseError
      ) {
        throw error;
      }
      throw wrapGraphError(
        error,
        `Failed to update embedding for concept: ${uuid}`,
        'Semantic',
        'updateEmbedding',
      );
    }
  }

  /**
   * Find or create a concept by name
   */
  async findOrCreate(name: string, description?: string): Promise<Concept> {
    try {
      const existing = await this.getConceptByName(name);
      if (existing) {
        return existing;
      }
      return this.addConcept(name, description);
    } catch (error) {
      if (
        error instanceof EmbeddingGenerationError ||
        error instanceof GraphParseError
      ) {
        throw error;
      }
      throw wrapGraphError(
        error,
        `Failed to find or create concept: ${name}`,
        'Semantic',
        'findOrCreate',
      );
    }
  }

  /**
   * Delete a concept
   */
  async deleteConcept(uuid: string): Promise<void> {
    try {
      await this.db.query(
        `MATCH (c:${CONCEPT_LABEL} {uuid: $uuid}) DETACH DELETE c`,
        { uuid },
      );
    } catch (error) {
      throw wrapGraphError(
        error,
        `Failed to delete concept: ${uuid}`,
        'Semantic',
        'deleteConcept',
      );
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }
}
