// Per-chunk LLM extraction prompt builder

import type { NeighborhoodContext } from './neighborhood.js';
import type { DocumentProfile, ParsedChunk } from './types.js';

/**
 * Build the LLM prompt for per-chunk knowledge extraction.
 *
 * The system prompt encodes the document profile (domain, entity types,
 * causal patterns, confidence calibration). The user prompt includes
 * the chunk text plus formatted neighborhood context for entity reuse.
 */
export function buildExtractionPrompt(
  chunk: ParsedChunk,
  profile: DocumentProfile,
  neighborhood: NeighborhoodContext,
): { system: string; user: string } {
  const system = buildSystemPrompt(profile);
  const user = buildUserPrompt(chunk, neighborhood);
  return { system, user };
}

function buildSystemPrompt(profile: DocumentProfile): string {
  const lines: string[] = [
    'You are a structured data extraction system. Given a chunk of a document, extract structured graph data as JSON.',
    '',
    `Document type: ${profile.document_type}`,
    `Domain: ${profile.domain}`,
    '',
    `Entity types to look for: ${profile.entity_types_expected.join(', ')}`,
    `Relationship types expected: ${profile.relationship_types_expected.join(', ')}`,
    '',
    `Causal patterns to detect: ${profile.causal_patterns.join('; ')}`,
    '',
    `Extraction focus: ${profile.extraction_focus}`,
    '',
    'Confidence calibration:',
    `- Explicit causation (stated directly): ${profile.confidence_calibration.explicit_causation}`,
    `- Strong implication (clearly implied): ${profile.confidence_calibration.strong_implication}`,
    `- Weak inference (loosely suggested): ${profile.confidence_calibration.weak_inference}`,
    '',
    'IMPORTANT: When you see entities that match known entity names listed below, REUSE the exact same name to maintain graph consistency.',
    '',
    'Output ONLY valid JSON matching this exact structure:',
    '{',
    '  "entities": [{ "name": string, "entity_type": string, "properties"?: { ... } }],',
    '  "relationships": [{ "source": entity_name, "target": entity_name, "relationship_type": string }],',
    '  "causal_links": [{ "cause": string, "effect": string, "confidence": 0.0-1.0, "evidence"?: string, "entities"?: [names] }],',
    '  "facts": [{ "subject": string, "predicate": string, "object": string, "valid_from": ISO8601, "valid_to"?: ISO8601, "subject_entity"?: entity_name }]',
    '}',
    '',
    'Be thorough but precise. Do not hallucinate information not present in the text.',
  ];

  return lines.join('\n');
}

function buildUserPrompt(
  chunk: ParsedChunk,
  neighborhood: NeighborhoodContext,
): string {
  const sections: string[] = [];

  // Neighborhood context
  if (neighborhood.knownEntities.length > 0) {
    const entityList = neighborhood.knownEntities
      .map((e) => `${e.name} (${e.type})`)
      .join(', ');
    sections.push(`Known entities: ${entityList}`);
  }

  if (neighborhood.recentEvents.length > 0) {
    const eventList = neighborhood.recentEvents
      .map((e) => e.description)
      .join('; ');
    sections.push(`Recent events: ${eventList}`);
  }

  if (neighborhood.activeCausalChains.length > 0) {
    const chainList = neighborhood.activeCausalChains
      .map((c) => `${c.cause} → ${c.effect} (${c.confidence})`)
      .join('; ');
    sections.push(`Active causal chains: ${chainList}`);
  }

  if (neighborhood.similarConcepts.length > 0) {
    const conceptList = neighborhood.similarConcepts
      .map((c) => c.name)
      .join(', ');
    sections.push(`Related concepts: ${conceptList}`);
  }

  // Build user prompt
  const parts: string[] = [];

  if (sections.length > 0) {
    parts.push('Context from existing graph:');
    parts.push(...sections);
    parts.push('');
  }

  parts.push('Extract structured data from this text:');
  parts.push('');
  parts.push(chunk.content);

  return parts.join('\n');
}

/**
 * Format neighborhood context as a plain string summary.
 * Useful for debugging or logging.
 */
export function formatNeighborhoodSummary(
  neighborhood: NeighborhoodContext,
): string {
  const parts: string[] = [];

  if (neighborhood.knownEntities.length > 0) {
    parts.push(
      `Entities(${neighborhood.knownEntities.length}): ${neighborhood.knownEntities.map((e) => e.name).join(', ')}`,
    );
  }
  if (neighborhood.recentEvents.length > 0) {
    parts.push(`Events(${neighborhood.recentEvents.length})`);
  }
  if (neighborhood.activeCausalChains.length > 0) {
    parts.push(`Causal(${neighborhood.activeCausalChains.length})`);
  }
  if (neighborhood.similarConcepts.length > 0) {
    parts.push(`Concepts(${neighborhood.similarConcepts.length})`);
  }

  return parts.length > 0 ? parts.join(' | ') : '(empty neighborhood)';
}
