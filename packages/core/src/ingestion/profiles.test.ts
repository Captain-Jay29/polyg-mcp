import { describe, expect, it } from 'vitest';
import {
  CONVERSATION_PROFILE,
  GENERIC_PROFILE,
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

    it('should return GENERIC_PROFILE for text format', () => {
      expect(getDefaultProfile('text')).toBe(GENERIC_PROFILE);
    });

    it('should return GENERIC_PROFILE for structured format', () => {
      expect(getDefaultProfile('structured')).toBe(GENERIC_PROFILE);
    });

    it('should return GENERIC_PROFILE for auto format', () => {
      expect(getDefaultProfile('auto')).toBe(GENERIC_PROFILE);
    });
  });
});
