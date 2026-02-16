// Default document profiles for known document types
import type { DocumentProfile, InputFormat } from './types.js';

export const CONVERSATION_PROFILE: DocumentProfile = {
  document_type: 'conversation',
  domain: 'general',
  entity_types_expected: ['person', 'place', 'organization', 'topic', 'event'],
  relationship_types_expected: [
    'knows',
    'works_at',
    'lives_in',
    'interested_in',
    'attended',
  ],
  causal_patterns: [
    'decision → action',
    'event → reaction',
    'preference → choice',
  ],
  temporal_structure: 'session_ordered',
  extraction_focus:
    'Focus on people, their relationships, preferences, activities, and life events discussed in conversation.',
  confidence_calibration: {
    explicit_causation: 1.0,
    strong_implication: 0.85,
    weak_inference: 0.65,
  },
};

export const TEXT_PROFILE: DocumentProfile = {
  document_type: 'text_document',
  domain: 'general',
  entity_types_expected: [
    'person',
    'organization',
    'location',
    'concept',
    'event',
  ],
  relationship_types_expected: [
    'related_to',
    'part_of',
    'located_in',
    'authored_by',
    'describes',
  ],
  causal_patterns: [
    'cause → effect',
    'action → outcome',
    'condition → consequence',
  ],
  temporal_structure: 'implicit',
  extraction_focus:
    'Extract entities, relationships, and facts from prose. Look for stated claims, descriptions, and narrative connections.',
  confidence_calibration: {
    explicit_causation: 1.0,
    strong_implication: 0.85,
    weak_inference: 0.65,
  },
};

export const STRUCTURED_PROFILE: DocumentProfile = {
  document_type: 'structured_data',
  domain: 'general',
  entity_types_expected: ['record', 'entity', 'category', 'metric', 'status'],
  relationship_types_expected: [
    'contains',
    'references',
    'categorized_as',
    'measured_by',
    'depends_on',
  ],
  causal_patterns: ['trigger → event', 'threshold → alert', 'input → output'],
  temporal_structure: 'explicit_timestamps',
  extraction_focus:
    'Extract structured records, their categories, metrics, and cross-references. Use field values as entity properties.',
  confidence_calibration: {
    explicit_causation: 1.0,
    strong_implication: 0.9,
    weak_inference: 0.7,
  },
};

export const GENERIC_PROFILE: DocumentProfile = {
  document_type: 'generic',
  domain: 'general',
  entity_types_expected: ['entity', 'concept', 'location', 'organization'],
  relationship_types_expected: [
    'related_to',
    'part_of',
    'causes',
    'depends_on',
  ],
  causal_patterns: ['cause → effect'],
  temporal_structure: 'implicit',
  extraction_focus:
    'Extract key entities, their relationships, and any causal or temporal patterns.',
  confidence_calibration: {
    explicit_causation: 1.0,
    strong_implication: 0.85,
    weak_inference: 0.65,
  },
};

/**
 * Map detected input format to a default profile.
 * Used as fallback when profiler is unavailable (Phase 1) or as cache seeds.
 */
export function getDefaultProfile(format: InputFormat): DocumentProfile {
  switch (format) {
    case 'conversation':
      return CONVERSATION_PROFILE;
    case 'text':
      return TEXT_PROFILE;
    case 'structured':
      return STRUCTURED_PROFILE;
    default:
      return GENERIC_PROFILE;
  }
}
