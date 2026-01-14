// Semantic Graph - conceptual similarity and topic clustering
import type {
  Concept,
  EmbeddingProvider,
  SemanticMatch,
} from '@polyg-mcp/shared';
import type { FalkorDBAdapter } from '../storage/falkordb.js';

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
   * Add a new concept with auto-generated embedding
   */
  async addConcept(name: string, description?: string): Promise<Concept> {
    // Generate embedding for the concept
    const textToEmbed = description ? `${name}: ${description}` : name;
    const embedding = await this.embeddings.embed(textToEmbed);

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
  }

  /**
   * Search for concepts similar to a query string
   */
  async search(query: string, limit = 10): Promise<SemanticMatch[]> {
    // Generate embedding for the query
    const queryEmbedding = await this.embeddings.embed(query);

    // Get all concepts and compute similarity
    const result = await this.db.query(
      `MATCH (c:${CONCEPT_LABEL}) RETURN c`,
      {},
    );

    const matches: SemanticMatch[] = [];

    for (const record of result.records) {
      const concept = this.parseConcept(record.c);
      if (concept.embedding) {
        const score = this.cosineSimilarity(queryEmbedding, concept.embedding);
        matches.push({ concept, score });
      }
    }

    // Sort by score descending and limit
    return matches.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Find concepts similar to an existing concept
   */
  async getSimilar(conceptId: string, limit = 10): Promise<SemanticMatch[]> {
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
      const other = this.parseConcept(record.c);
      if (other.embedding) {
        const score = this.cosineSimilarity(concept.embedding, other.embedding);
        matches.push({ concept: other, score });
      }
    }

    return matches.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Get a concept by UUID
   */
  async getConcept(uuid: string): Promise<Concept | null> {
    const result = await this.db.query(
      `MATCH (c:${CONCEPT_LABEL} {uuid: $uuid}) RETURN c`,
      { uuid },
    );

    if (result.records.length === 0) {
      return null;
    }

    return this.parseConcept(result.records[0].c);
  }

  /**
   * Get a concept by name
   */
  async getConceptByName(name: string): Promise<Concept | null> {
    const result = await this.db.query(
      `MATCH (c:${CONCEPT_LABEL}) WHERE toLower(c.name) = toLower($name) RETURN c LIMIT 1`,
      { name },
    );

    if (result.records.length === 0) {
      return null;
    }

    return this.parseConcept(result.records[0].c);
  }

  /**
   * Link a concept to an entity (cross-graph)
   */
  async linkToEntity(conceptId: string, entityId: string): Promise<void> {
    await this.db.query(
      `MATCH (c:${CONCEPT_LABEL} {uuid: $conceptId}), (e {uuid: $entityId})
       CREATE (c)-[:${REPRESENTS_REL} {created_at: $createdAt}]->(e)`,
      {
        conceptId,
        entityId,
        createdAt: new Date().toISOString(),
      },
    );
  }

  /**
   * Update a concept's embedding (useful for re-indexing)
   */
  async updateEmbedding(uuid: string): Promise<Concept | null> {
    const concept = await this.getConcept(uuid);
    if (!concept) {
      return null;
    }

    const textToEmbed = concept.description
      ? `${concept.name}: ${concept.description}`
      : concept.name;
    const embedding = await this.embeddings.embed(textToEmbed);

    await this.db.query(
      `MATCH (c:${CONCEPT_LABEL} {uuid: $uuid}) SET c.embedding = $embedding`,
      { uuid, embedding: JSON.stringify(embedding) },
    );

    return {
      ...concept,
      embedding,
    };
  }

  /**
   * Find or create a concept by name
   */
  async findOrCreate(name: string, description?: string): Promise<Concept> {
    const existing = await this.getConceptByName(name);
    if (existing) {
      return existing;
    }
    return this.addConcept(name, description);
  }

  /**
   * Delete a concept
   */
  async deleteConcept(uuid: string): Promise<void> {
    await this.db.query(
      `MATCH (c:${CONCEPT_LABEL} {uuid: $uuid}) DETACH DELETE c`,
      { uuid },
    );
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

  /**
   * Parse a FalkorDB node into a Concept
   */
  private parseConcept(node: unknown): Concept {
    const n = node as Record<string, unknown>;
    const props = n.properties as Record<string, unknown>;

    let embedding: number[] | undefined;
    if (typeof props.embedding === 'string') {
      try {
        embedding = JSON.parse(props.embedding);
      } catch {
        embedding = undefined;
      }
    }

    return {
      uuid: props.uuid as string,
      name: props.name as string,
      description: props.description as string | undefined,
      embedding,
    };
  }
}
