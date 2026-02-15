// Entity type normalization — maps LLM-generated synonyms to canonical types
import type { ChunkExtraction } from './types.js';

const ENTITY_TYPE_MAP: Record<string, string> = {
  // person
  individual: 'person',
  human: 'person',
  character: 'person',
  participant: 'person',
  speaker: 'person',
  // organization
  company: 'organization',
  firm: 'organization',
  corporation: 'organization',
  institution: 'organization',
  agency: 'organization',
  // location
  place: 'location',
  city: 'location',
  country: 'location',
  region: 'location',
  venue: 'location',
  // event
  incident: 'event',
  occurrence: 'event',
  activity: 'event',
  // concept
  idea: 'concept',
  theme: 'concept',
  subject: 'concept',
};

/**
 * Normalize an entity type string to its canonical form.
 * Lowercases, trims, and maps known synonyms. Unknown types pass through.
 */
export function normalizeEntityType(type: string): string {
  const key = type.toLowerCase().trim();
  return ENTITY_TYPE_MAP[key] ?? key;
}

/**
 * Normalize all entity types in a chunk extraction result.
 * Mutates in place and returns the same object.
 */
export function normalizeExtraction(
  extraction: ChunkExtraction,
): ChunkExtraction {
  for (const entity of extraction.entities) {
    entity.entity_type = normalizeEntityType(entity.entity_type);
  }
  return extraction;
}
