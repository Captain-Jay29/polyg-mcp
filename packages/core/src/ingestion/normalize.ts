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
 * Returns a shallow copy — the original extraction is not mutated.
 */
export function normalizeExtraction(
  extraction: ChunkExtraction,
): ChunkExtraction {
  return {
    ...extraction,
    entities: extraction.entities.map((e) => ({
      ...e,
      entity_type: normalizeEntityType(e.entity_type),
    })),
  };
}

/**
 * Strip markdown JSON code fences from LLM output before parsing.
 * Handles ```json ... ```, ``` ... ```, and bare JSON.
 */
export function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  // Match ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}
