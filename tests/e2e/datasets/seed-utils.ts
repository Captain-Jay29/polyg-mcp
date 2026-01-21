// Generic seeding utilities for datasets

import type { Dataset, MCPClientLike } from './types.js';

/**
 * Generic seed function that works with any Dataset
 */
export async function seedDataset(
  client: MCPClientLike,
  dataset: Dataset,
  name: string,
): Promise<void> {
  console.log(`Seeding ${name} data...`);

  let errors = 0;

  // Add entities
  for (const entity of dataset.entities) {
    try {
      await client.callTool('add_entity', {
        name: entity.name,
        entity_type: entity.type,
        properties: entity.properties ?? {},
      });
      console.log(`  ✓ Added entity: ${entity.name}`);
    } catch (error) {
      errors++;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ ERROR adding entity ${entity.name}: ${msg}`);
    }
  }

  // Add relationships
  for (const entity of dataset.entities) {
    if (entity.relationships) {
      for (const rel of entity.relationships) {
        try {
          await client.callTool('link_entities', {
            source: entity.name,
            target: rel.target,
            relationship: rel.type,
          });
          console.log(
            `  ✓ Added relationship: ${entity.name} -[${rel.type}]-> ${rel.target}`,
          );
        } catch (error) {
          errors++;
          const msg = error instanceof Error ? error.message : String(error);
          console.error(`  ✗ ERROR adding relationship: ${msg}`);
        }
      }
    }
  }

  // Add events (with entity links)
  for (const event of dataset.events) {
    try {
      await client.callTool('add_event', {
        description: event.description,
        occurred_at: event.timestamp,
        entities: event.entities, // Link to entities involved in this event
      });
      const entitiesText =
        event.entities?.length > 0
          ? ` [linked to: ${event.entities.join(', ')}]`
          : '';
      console.log(
        `  ✓ Added event: ${event.description.slice(0, 50)}...${entitiesText}`,
      );
    } catch (error) {
      errors++;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ ERROR adding event: ${msg}`);
    }
  }

  // Add causal links (with entity and event links)
  for (const link of dataset.causalLinks) {
    try {
      await client.callTool('add_causal_link', {
        cause: link.cause,
        effect: link.effect,
        confidence: link.confidence,
        entities: link.entities, // Link to entities affected by this causal relationship
        events: link.events, // Link to events this causal relationship refers to
      });
      const entitiesText =
        link.entities && link.entities.length > 0
          ? ` [affects: ${link.entities.join(', ')}]`
          : '';
      const eventsText =
        link.events && link.events.length > 0
          ? ` [refers to: ${link.events.length} event(s)]`
          : '';
      console.log(
        `  ✓ Added causal link: ${link.cause.slice(0, 30)}... -> ${link.effect.slice(0, 30)}...${entitiesText}${eventsText}`,
      );
    } catch (error) {
      errors++;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ ERROR adding causal link: ${msg}`);
    }
  }

  // Add facts (with optional entity links)
  for (const fact of dataset.facts) {
    try {
      await client.callTool('add_fact', {
        subject: fact.subject,
        predicate: fact.predicate,
        object: fact.object,
        valid_from: fact.validFrom,
        valid_to: fact.validTo,
        subject_entity: fact.subjectEntity, // Link to entity the fact is about
      });
      const entityText = fact.subjectEntity
        ? ` [about: ${fact.subjectEntity}]`
        : '';
      console.log(
        `  ✓ Added fact: ${fact.subject} ${fact.predicate} ${fact.object}${entityText}`,
      );
    } catch (error) {
      errors++;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ ERROR adding fact: ${msg}`);
    }
  }

  // Add semantic concepts (required for MAGMA retrieval via semantic_search)
  for (const concept of dataset.concepts) {
    try {
      await client.callTool('add_concept', {
        name: concept.name,
        description: concept.description,
        entities: concept.entities, // Link to entities this concept represents
      });
      const entitiesText =
        concept.entities && concept.entities.length > 0
          ? ` [linked to: ${concept.entities.join(', ')}]`
          : '';
      console.log(`  ✓ Added concept: ${concept.name}${entitiesText}`);
    } catch (error) {
      errors++;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ ERROR adding concept ${concept.name}: ${msg}`);
    }
  }

  console.log('');
  if (errors > 0) {
    console.error(`Dataset seeding completed with ${errors} error(s)!`);
  } else {
    console.log('Dataset seeding complete! All items added successfully.');
  }
}
