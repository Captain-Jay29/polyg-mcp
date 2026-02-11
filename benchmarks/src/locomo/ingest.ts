import type { MAGMAGraphRegistry } from '@polyg-mcp/core';
import type { Entity, LLMProvider, StorageStatistics } from '@polyg-mcp/shared';
import type { ValidationResult } from '../utils/index.js';
import { validateExtractionQuality } from '../utils/index.js';
import {
  buildExtractionPrompt,
  type ExtractionResult,
  ExtractionResultSchema,
} from './extraction-prompt.js';
import type { LoCoMoConversation } from './types.js';

export interface IngestionResult {
  conversationId: string;
  entities: number;
  events: number;
  facts: number;
  causalLinks: number;
  concepts: number;
  validation: ValidationResult;
}

export interface IngestionOptions {
  /** If true, only run extraction + validation without writing to graphs */
  validateOnly?: boolean;
  /** Maximum tokens for the LLM extraction call */
  maxTokens?: number;
}

/**
 * Ingest a single LoCoMo conversation into polyg-mcp's four graphs.
 *
 * Pipeline:
 * 1. Build extraction prompt from conversation text
 * 2. Call LLM with JSON mode
 * 3. Parse + validate response with ExtractionResultSchema
 * 4. Write to graphs: entities → events → facts → causal links → concepts
 * 5. Create cross-links (X_INVOLVES, X_AFFECTS, X_REPRESENTS)
 * 6. Run extraction quality gate
 */
export async function ingestConversation(
  conversation: LoCoMoConversation,
  graphs: MAGMAGraphRegistry,
  llm: LLMProvider,
  getStatistics: () => Promise<StorageStatistics>,
  options?: IngestionOptions,
): Promise<IngestionResult> {
  // 1. Build extraction prompt
  const { system, user } = buildExtractionPrompt(conversation);

  // 2. Call LLM
  const rawJson = await llm.complete({
    prompt: `${system}\n\n${user}`,
    responseFormat: 'json',
    maxTokens: options?.maxTokens ?? 4000,
  });

  // 3. Parse + validate
  const extraction = parseExtractionResponse(rawJson);

  // 4-5. Write to graphs (unless validateOnly)
  if (!options?.validateOnly) {
    await writeToGraphs(extraction, graphs);
  }

  // 6. Quality gate
  const stats = await getStatistics();
  const validation = validateExtractionQuality(stats);

  return {
    conversationId: conversation.conversation_id,
    entities: extraction.entities.length,
    events: extraction.events.length,
    facts: extraction.facts.length,
    causalLinks: extraction.causal_links.length,
    concepts: extraction.concepts.length,
    validation,
  };
}

function parseExtractionResponse(rawJson: string): ExtractionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error(`LLM returned invalid JSON: ${rawJson.slice(0, 200)}...`);
  }

  const result = ExtractionResultSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Extraction schema validation failed: ${issues}`);
  }

  return result.data;
}

async function writeToGraphs(
  extraction: ExtractionResult,
  graphs: MAGMAGraphRegistry,
): Promise<void> {
  // Track created entities by name for cross-referencing
  const entityMap = new Map<string, Entity>();

  // Step 1: Entities
  for (const e of extraction.entities) {
    const entity = await graphs.entity.addEntity(
      e.name,
      e.entity_type,
      e.properties,
    );
    entityMap.set(e.name, entity);
  }

  // Step 2: Events + X_INVOLVES cross-links
  for (const ev of extraction.events) {
    const event = await graphs.temporal.addEvent(
      ev.description,
      new Date(ev.occurred_at),
      ev.duration,
    );

    // Cross-link to entities
    if (ev.entities) {
      for (const entityName of ev.entities) {
        const entity = entityMap.get(entityName);
        if (entity) {
          await graphs.temporal.linkEventToEntity(event.uuid, entity.uuid);
        }
      }
    }
  }

  // Step 3: Facts + X_INVOLVES cross-links
  for (const f of extraction.facts) {
    const fact = await graphs.temporal.addFact(
      f.subject,
      f.predicate,
      f.object,
      new Date(f.valid_from),
      f.valid_to ? new Date(f.valid_to) : undefined,
    );

    // Cross-link to subject entity
    const subjectEntityName = f.subject_entity ?? f.subject;
    const entity = entityMap.get(subjectEntityName);
    if (entity) {
      await graphs.temporal.linkFactToEntity(fact.uuid, entity.uuid);
    }
  }

  // Step 4: Causal links + X_AFFECTS cross-links
  for (const cl of extraction.causal_links) {
    // Create or find causal nodes
    const causeNode = await graphs.causal.findOrCreate(cl.cause, 'cause');
    const effectNode = await graphs.causal.findOrCreate(cl.effect, 'effect');

    // Create the link
    await graphs.causal.addLink(causeNode.uuid, effectNode.uuid, cl.confidence);

    // Cross-link causal nodes to entities (X_AFFECTS)
    if (cl.entities) {
      for (const entityName of cl.entities) {
        const entity = entityMap.get(entityName);
        if (entity) {
          await graphs.causal.linkToEntity(causeNode.uuid, entity.uuid);
          await graphs.causal.linkToEntity(effectNode.uuid, entity.uuid);
        }
      }
    }
  }

  // Step 5: Concepts + X_REPRESENTS cross-links
  for (const c of extraction.concepts) {
    const concept = await graphs.semantic.addConcept(c.name, c.description);

    // Cross-link to entities (X_REPRESENTS)
    if (c.entities) {
      for (const entityName of c.entities) {
        const entity = entityMap.get(entityName);
        if (entity) {
          await graphs.semantic.linkToEntity(concept.uuid, entity.uuid);
        }
      }
    }
  }
}
