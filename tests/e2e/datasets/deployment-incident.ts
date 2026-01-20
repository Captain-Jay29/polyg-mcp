// Deployment Incident Test Dataset
// Simulates a production incident caused by a missing environment variable

import type { MCPClient } from '../agent/mcp-client.js';

export interface DeploymentIncidentData {
  entities: EntityData[];
  events: EventData[];
  causalLinks: CausalLinkData[];
  facts: FactData[];
  concepts: ConceptData[];
}

interface ConceptData {
  name: string;
  description: string;
}

interface EntityData {
  name: string;
  type: string;
  properties?: Record<string, string>;
  relationships?: { target: string; type: string }[];
}

interface EventData {
  description: string;
  timestamp: string;
  entities: string[];
}

interface CausalLinkData {
  cause: string;
  effect: string;
  confidence: number;
  mechanism?: string;
}

interface FactData {
  subject: string;
  predicate: string;
  object: string;
  validFrom: string;
  validTo?: string;
}

// The incident scenario data
export const DEPLOYMENT_INCIDENT: DeploymentIncidentData = {
  entities: [
    // Services
    {
      name: 'auth-service',
      type: 'service',
      properties: {
        team: 'platform',
        language: 'typescript',
        criticality: 'high',
      },
    },
    {
      name: 'api-gateway',
      type: 'service',
      properties: {
        team: 'platform',
        language: 'go',
        criticality: 'high',
      },
      relationships: [{ target: 'auth-service', type: 'DEPENDS_ON' }],
    },
    {
      name: 'user-dashboard',
      type: 'service',
      properties: {
        team: 'frontend',
        language: 'react',
        criticality: 'medium',
      },
      relationships: [{ target: 'api-gateway', type: 'DEPENDS_ON' }],
    },
    // Infrastructure
    {
      name: 'kubernetes-cluster',
      type: 'infrastructure',
      properties: { provider: 'aws', region: 'us-east-1' },
    },
    {
      name: 'secrets-manager',
      type: 'infrastructure',
      properties: { provider: 'aws' },
    },
    // People
    {
      name: 'alice',
      type: 'person',
      properties: { role: 'sre', team: 'platform' },
    },
    {
      name: 'bob',
      type: 'person',
      properties: { role: 'developer', team: 'platform' },
    },
    // Config
    {
      name: 'JWT_SECRET',
      type: 'environment_variable',
      properties: { source: 'secrets-manager', required: 'true' },
    },
  ],

  events: [
    // Timeline of the incident
    {
      description: 'Bob started deployment of auth-service v2.3.0',
      timestamp: '2026-01-15T14:00:00Z',
      entities: ['bob', 'auth-service'],
    },
    {
      description:
        'Kubernetes pulled new auth-service container image successfully',
      timestamp: '2026-01-15T14:02:00Z',
      entities: ['kubernetes-cluster', 'auth-service'],
    },
    {
      description: 'auth-service pod entered CrashLoopBackOff state',
      timestamp: '2026-01-15T14:03:00Z',
      entities: ['auth-service', 'kubernetes-cluster'],
    },
    {
      description:
        'auth-service logs showed: Error: JWT_SECRET environment variable not set',
      timestamp: '2026-01-15T14:03:15Z',
      entities: ['auth-service', 'JWT_SECRET'],
    },
    {
      description: 'api-gateway started returning 503 errors for /auth routes',
      timestamp: '2026-01-15T14:04:00Z',
      entities: ['api-gateway', 'auth-service'],
    },
    {
      description: 'user-dashboard login page became unresponsive',
      timestamp: '2026-01-15T14:05:00Z',
      entities: ['user-dashboard'],
    },
    {
      description: 'PagerDuty alert triggered for auth-service downtime',
      timestamp: '2026-01-15T14:05:30Z',
      entities: ['alice', 'auth-service'],
    },
    {
      description: 'Alice began investigating auth-service CrashLoopBackOff',
      timestamp: '2026-01-15T14:08:00Z',
      entities: ['alice', 'auth-service'],
    },
    {
      description:
        'Alice discovered JWT_SECRET was missing from new deployment manifest',
      timestamp: '2026-01-15T14:15:00Z',
      entities: ['alice', 'JWT_SECRET'],
    },
    {
      description:
        'Bob confirmed JWT_SECRET reference was accidentally removed in PR #1234',
      timestamp: '2026-01-15T14:18:00Z',
      entities: ['bob', 'JWT_SECRET'],
    },
    {
      description:
        'Alice added JWT_SECRET back to deployment manifest and redeployed',
      timestamp: '2026-01-15T14:22:00Z',
      entities: ['alice', 'auth-service', 'JWT_SECRET'],
    },
    {
      description: 'auth-service pod became healthy',
      timestamp: '2026-01-15T14:24:00Z',
      entities: ['auth-service'],
    },
    {
      description: 'All services recovered and incident closed',
      timestamp: '2026-01-15T14:26:00Z',
      entities: ['auth-service', 'api-gateway', 'user-dashboard'],
    },
  ],

  causalLinks: [
    {
      cause: 'JWT_SECRET accidentally removed in PR #1234',
      effect: 'auth-service deployment missing JWT_SECRET',
      confidence: 1.0,
      mechanism: 'code review missed the deletion',
    },
    {
      cause: 'auth-service deployment missing JWT_SECRET',
      effect: 'auth-service crashed on startup',
      confidence: 1.0,
      mechanism: 'required environment variable validation failed',
    },
    {
      cause: 'auth-service crashed on startup',
      effect: 'auth-service pod entered CrashLoopBackOff',
      confidence: 1.0,
      mechanism: 'kubernetes restart policy',
    },
    {
      cause: 'auth-service pod entered CrashLoopBackOff',
      effect: 'api-gateway returned 503 errors',
      confidence: 0.95,
      mechanism: 'upstream service unavailable',
    },
    {
      cause: 'api-gateway returned 503 errors',
      effect: 'user-dashboard login became unresponsive',
      confidence: 0.9,
      mechanism: 'frontend depends on authentication API',
    },
    {
      cause: 'Alice added JWT_SECRET back to manifest',
      effect: 'auth-service pod became healthy',
      confidence: 1.0,
      mechanism: 'environment variable now available',
    },
  ],

  facts: [
    {
      subject: 'auth-service',
      predicate: 'owned_by',
      object: 'platform-team',
      validFrom: '2024-01-01T00:00:00Z',
    },
    {
      subject: 'auth-service',
      predicate: 'version',
      object: 'v2.2.0',
      validFrom: '2025-12-01T00:00:00Z',
      validTo: '2026-01-15T14:00:00Z',
    },
    {
      subject: 'auth-service',
      predicate: 'version',
      object: 'v2.3.0',
      validFrom: '2026-01-15T14:00:00Z',
    },
    {
      subject: 'auth-service',
      predicate: 'status',
      object: 'healthy',
      validFrom: '2025-12-01T00:00:00Z',
      validTo: '2026-01-15T14:03:00Z',
    },
    {
      subject: 'auth-service',
      predicate: 'status',
      object: 'crashed',
      validFrom: '2026-01-15T14:03:00Z',
      validTo: '2026-01-15T14:24:00Z',
    },
    {
      subject: 'auth-service',
      predicate: 'status',
      object: 'healthy',
      validFrom: '2026-01-15T14:24:00Z',
    },
  ],

  // Semantic concepts for MAGMA retrieval - these enable semantic search entry points
  concepts: [
    // Service concepts
    {
      name: 'auth-service',
      description:
        'Authentication service handling JWT tokens and user login, a critical microservice in the platform',
    },
    {
      name: 'api-gateway',
      description:
        'API Gateway service that routes requests and depends on auth-service for authentication',
    },
    {
      name: 'user-dashboard',
      description:
        'User dashboard frontend application that displays user information and depends on API gateway',
    },
    // Incident concepts
    {
      name: 'JWT_SECRET missing',
      description:
        'Missing JWT_SECRET environment variable that caused auth-service to crash during deployment',
    },
    {
      name: 'production incident',
      description:
        'Production incident on January 15 2026 caused by missing JWT_SECRET in auth-service deployment',
    },
    {
      name: 'CrashLoopBackOff',
      description:
        'Kubernetes pod state when a container repeatedly crashes and restarts',
    },
    {
      name: 'cascading failure',
      description:
        'Failure pattern where auth-service crash caused api-gateway 503 errors and user-dashboard unresponsiveness',
    },
    // People concepts
    {
      name: 'Alice SRE engineer',
      description:
        'Alice is an SRE on the platform team who investigated and fixed the auth-service incident',
    },
    {
      name: 'Bob developer',
      description:
        'Bob is a developer on the platform team who deployed auth-service v2.3.0',
    },
    // Infrastructure concepts
    {
      name: 'kubernetes deployment',
      description:
        'Kubernetes cluster deployment of auth-service v2.3.0 that triggered the incident',
    },
    {
      name: 'secrets management',
      description:
        'AWS Secrets Manager that stores the JWT_SECRET environment variable for auth-service',
    },
  ],
};

// Test queries with expected behaviors - updated for MAGMA retrieval tools
export const TEST_QUERIES = [
  {
    query: 'What caused the auth service to fail?',
    expectedTools: ['semantic_search', 'causal_expand'],
    expectedInAnswer: ['JWT_SECRET', 'environment variable', 'missing'],
  },
  {
    query: 'What happened between 2pm and 3pm on January 15th?',
    expectedTools: ['semantic_search', 'temporal_expand'],
    expectedInAnswer: ['deployment', 'CrashLoopBackOff', 'recovered'],
  },
  {
    query: 'Who was involved in the incident response?',
    expectedTools: ['semantic_search', 'entity_lookup'],
    expectedInAnswer: ['alice', 'bob'],
  },
  {
    query: 'What services depend on auth-service?',
    expectedTools: ['semantic_search', 'entity_lookup'],
    expectedInAnswer: ['api-gateway'],
  },
  {
    query:
      'What was the root cause of the user dashboard becoming unresponsive?',
    expectedTools: ['semantic_search', 'causal_expand'],
    expectedInAnswer: ['JWT_SECRET', 'auth-service', 'api-gateway'],
  },
];

// Seed the dataset into the MCP server
export async function seedDeploymentIncident(client: MCPClient): Promise<void> {
  console.log('Seeding deployment incident data...');

  let errors = 0;

  // Add entities
  for (const entity of DEPLOYMENT_INCIDENT.entities) {
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
  for (const entity of DEPLOYMENT_INCIDENT.entities) {
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

  // Add events
  for (const event of DEPLOYMENT_INCIDENT.events) {
    try {
      await client.callTool('add_event', {
        description: event.description,
        occurred_at: event.timestamp,
      });
      console.log(`  ✓ Added event: ${event.description.slice(0, 50)}...`);
    } catch (error) {
      errors++;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ ERROR adding event: ${msg}`);
    }
  }

  // Add causal links
  for (const link of DEPLOYMENT_INCIDENT.causalLinks) {
    try {
      await client.callTool('add_causal_link', {
        cause: link.cause,
        effect: link.effect,
        confidence: link.confidence,
      });
      console.log(
        `  ✓ Added causal link: ${link.cause.slice(0, 30)}... -> ${link.effect.slice(0, 30)}...`,
      );
    } catch (error) {
      errors++;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ ERROR adding causal link: ${msg}`);
    }
  }

  // Add facts
  for (const fact of DEPLOYMENT_INCIDENT.facts) {
    try {
      await client.callTool('add_fact', {
        subject: fact.subject,
        predicate: fact.predicate,
        object: fact.object,
        valid_from: fact.validFrom,
        valid_to: fact.validTo,
      });
      console.log(
        `  ✓ Added fact: ${fact.subject} ${fact.predicate} ${fact.object}`,
      );
    } catch (error) {
      errors++;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ ERROR adding fact: ${msg}`);
    }
  }

  // Add semantic concepts (required for MAGMA retrieval via semantic_search)
  for (const concept of DEPLOYMENT_INCIDENT.concepts) {
    try {
      await client.callTool('add_concept', {
        name: concept.name,
        description: concept.description,
      });
      console.log(`  ✓ Added concept: ${concept.name}`);
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
