import { z } from 'zod';
import type { LoCoMoConversation } from './types.js';

export const ExtractionResultSchema = z.object({
  entities: z.array(
    z.object({
      name: z.string(),
      entity_type: z.string(),
      properties: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
  events: z.array(
    z.object({
      description: z.string(),
      occurred_at: z.string(),
      duration: z.number().optional(),
      entities: z.array(z.string()).optional(),
    }),
  ),
  facts: z.array(
    z.object({
      subject: z.string(),
      predicate: z.string(),
      object: z.string(),
      valid_from: z.string(),
      valid_to: z.string().optional(),
      subject_entity: z.string().optional(),
    }),
  ),
  causal_links: z.array(
    z.object({
      cause: z.string(),
      effect: z.string(),
      confidence: z.number().min(0).max(1).optional(),
      entities: z.array(z.string()).optional(),
    }),
  ),
  concepts: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      entities: z.array(z.string()).optional(),
    }),
  ),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

const SYSTEM_PROMPT = `You are a structured data extraction system. Given a multi-session conversation between two people, extract the following graph data as JSON:

1. **entities** — People, organizations, services, and locations mentioned.
   Each entity: { "name": string, "entity_type": "person" | "organization" | "service" | "location", "properties": { ... } }
   - Use the person's actual name, not pronouns.
   - Include relevant properties (e.g., occupation, age, interests).

2. **events** — Significant things that happened, with timestamps.
   Each event: { "description": string, "occurred_at": ISO8601, "entities": [entity names involved] }
   - Infer timestamps from session dates and conversational context.
   - Include activities, meetings, milestones, and life changes.

3. **facts** — Statements about preferences, states, or properties that may change over time.
   Each fact: { "subject": entity name, "predicate": string, "object": string, "valid_from": ISO8601, "valid_to": ISO8601 or omit if still valid, "subject_entity": entity name }
   - Track preference changes: if someone used to like X but now prefers Y, create two facts with appropriate validity windows.
   - Include job status, relationship status, interests, plans.

4. **causal_links** — Cause-effect relationships discussed or implied.
   Each link: { "cause": description, "effect": description, "confidence": 0.0-1.0, "entities": [entity names involved] }
   - Degrade confidence along chain length (direct cause: 0.9+, indirect: 0.6-0.8).
   - Include decisions that led to outcomes, problems that caused reactions.

5. **concepts** — Key topics, themes, or abstract ideas discussed.
   Each concept: { "name": string, "description": brief summary, "entities": [entity names related] }
   - Include recurring themes, professional topics, hobbies, shared interests.

Output ONLY valid JSON matching this exact structure:
{
  "entities": [...],
  "events": [...],
  "facts": [...],
  "causal_links": [...],
  "concepts": [...]
}

Be thorough but precise. Extract all meaningful information. Do not hallucinate information not present in the conversation.`;

export function buildExtractionPrompt(conversation: LoCoMoConversation): {
  system: string;
  user: string;
} {
  const lines: string[] = [];

  for (const session of conversation.sessions) {
    if (session.date_time) {
      lines.push(`\n--- Session (${session.date_time}) ---`);
    } else {
      lines.push('\n--- Session ---');
    }

    for (const turn of session.turns) {
      lines.push(`${turn.speaker}: ${turn.text}`);
    }
  }

  const user = `Extract structured graph data from this conversation:\n${lines.join('\n')}`;

  return { system: SYSTEM_PROMPT, user };
}
