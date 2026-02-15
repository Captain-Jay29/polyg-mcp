import { describe, expect, it } from 'vitest';
import {
  CONVERSATION_PROFILE,
  GENERIC_PROFILE,
  STRUCTURED_PROFILE,
  TEXT_PROFILE,
  getDefaultProfile,
} from './profiles.js';
import { DocumentProfileSchema } from './types.js';

describe('profiles', () => {
  describe('CONVERSATION_PROFILE', () => {
    it('should be a valid DocumentProfile', () => {
      const result = DocumentProfileSchema.safeParse(CONVERSATION_PROFILE);
      expect(result.success).toBe(true);
    });

    it('should have session_ordered temporal structure', () => {
      expect(CONVERSATION_PROFILE.temporal_structure).toBe('session_ordered');
    });

    it('should include person in entity types', () => {
      expect(CONVERSATION_PROFILE.entity_types_expected).toContain('person');
    });
  });

  describe('TEXT_PROFILE', () => {
    it('should be a valid DocumentProfile', () => {
      const result = DocumentProfileSchema.safeParse(TEXT_PROFILE);
      expect(result.success).toBe(true);
    });

    it('should have implicit temporal structure', () => {
      expect(TEXT_PROFILE.temporal_structure).toBe('implicit');
    });

    it('should have text_document document type', () => {
      expect(TEXT_PROFILE.document_type).toBe('text_document');
    });
  });

  describe('STRUCTURED_PROFILE', () => {
    it('should be a valid DocumentProfile', () => {
      const result = DocumentProfileSchema.safeParse(STRUCTURED_PROFILE);
      expect(result.success).toBe(true);
    });

    it('should have explicit_timestamps temporal structure', () => {
      expect(STRUCTURED_PROFILE.temporal_structure).toBe(
        'explicit_timestamps',
      );
    });

    it('should have structured_data document type', () => {
      expect(STRUCTURED_PROFILE.document_type).toBe('structured_data');
    });
  });

  describe('GENERIC_PROFILE', () => {
    it('should be a valid DocumentProfile', () => {
      const result = DocumentProfileSchema.safeParse(GENERIC_PROFILE);
      expect(result.success).toBe(true);
    });

    it('should have implicit temporal structure', () => {
      expect(GENERIC_PROFILE.temporal_structure).toBe('implicit');
    });
  });

  describe('getDefaultProfile', () => {
    it('should return CONVERSATION_PROFILE for conversation format', () => {
      expect(getDefaultProfile('conversation')).toBe(CONVERSATION_PROFILE);
    });

    it('should return TEXT_PROFILE for text format', () => {
      expect(getDefaultProfile('text')).toBe(TEXT_PROFILE);
    });

    it('should return STRUCTURED_PROFILE for structured format', () => {
      expect(getDefaultProfile('structured')).toBe(STRUCTURED_PROFILE);
    });

    it('should return GENERIC_PROFILE for auto format', () => {
      expect(getDefaultProfile('auto')).toBe(GENERIC_PROFILE);
    });
  });
});
