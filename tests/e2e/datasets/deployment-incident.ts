// Deployment Incident Test Dataset
// Simulates a production incident caused by a missing environment variable

import { seedDataset } from './seed-utils.js';
import type {
  Dataset,
  DatasetModule,
  MCPClientLike,
  TestQuery,
} from './types.js';

export const DEPLOYMENT_INCIDENT: Dataset = {
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
      entities: ['JWT_SECRET', 'auth-service', 'bob'],
    },
    {
      cause: 'auth-service deployment missing JWT_SECRET',
      effect: 'auth-service crashed on startup',
      confidence: 1.0,
      mechanism: 'required environment variable validation failed',
      entities: ['auth-service', 'JWT_SECRET'],
    },
    {
      cause: 'auth-service crashed on startup',
      effect: 'auth-service pod entered CrashLoopBackOff',
      confidence: 1.0,
      mechanism: 'kubernetes restart policy',
      entities: ['auth-service', 'kubernetes-cluster'],
    },
    {
      cause: 'auth-service pod entered CrashLoopBackOff',
      effect: 'api-gateway returned 503 errors',
      confidence: 0.95,
      mechanism: 'upstream service unavailable',
      entities: ['auth-service', 'api-gateway'],
    },
    {
      cause: 'api-gateway returned 503 errors',
      effect: 'user-dashboard login became unresponsive',
      confidence: 0.9,
      mechanism: 'frontend depends on authentication API',
      entities: ['api-gateway', 'user-dashboard'],
    },
    {
      cause: 'Alice added JWT_SECRET back to manifest',
      effect: 'auth-service pod became healthy',
      confidence: 1.0,
      mechanism: 'environment variable now available',
      entities: ['alice', 'JWT_SECRET', 'auth-service'],
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
        'Authentication service handling JWT tokens and user login, a critical microservice in the platform. Owned by the platform team, written in TypeScript. Experienced a CrashLoopBackOff incident on January 15 2026 when JWT_SECRET environment variable was missing from deployment.',
      entities: ['auth-service', 'JWT_SECRET', 'kubernetes-cluster'],
    },
    {
      name: 'api-gateway',
      description:
        'API Gateway service that routes requests and depends on auth-service for authentication. Written in Go by the platform team. Started returning 503 errors when auth-service became unavailable during the January 2026 incident.',
      entities: ['api-gateway', 'auth-service'],
    },
    {
      name: 'user-dashboard',
      description:
        'User dashboard frontend application built in React that displays user information and depends on API gateway for backend calls. Became unresponsive during the cascading failure when auth-service crashed.',
      entities: ['user-dashboard', 'api-gateway'],
    },
    // Incident concepts
    {
      name: 'JWT_SECRET missing',
      description:
        'Missing JWT_SECRET environment variable that caused auth-service to crash during deployment on January 15 2026. The variable was accidentally removed in PR #1234 and the deletion was missed during code review. Alice discovered the issue and Bob confirmed it.',
      entities: ['JWT_SECRET', 'auth-service', 'alice', 'bob'],
    },
    {
      name: 'production incident',
      description:
        'Production incident on January 15 2026 caused by missing JWT_SECRET in auth-service deployment. The incident lasted approximately 26 minutes from 14:00 to 14:26 UTC. Triggered PagerDuty alerts and required Alice (SRE) and Bob (developer) to investigate and resolve.',
      entities: ['auth-service', 'JWT_SECRET', 'alice', 'bob'],
    },
    {
      name: 'CrashLoopBackOff',
      description:
        'Kubernetes pod state when a container repeatedly crashes and restarts. The auth-service entered CrashLoopBackOff at 14:03 UTC on January 15 2026 because it failed environment variable validation on startup without JWT_SECRET.',
      entities: ['auth-service', 'kubernetes-cluster', 'JWT_SECRET'],
    },
    {
      name: 'cascading failure',
      description:
        'Failure pattern where auth-service crash caused api-gateway 503 errors and user-dashboard unresponsiveness. The service dependency chain auth-service -> api-gateway -> user-dashboard propagated the failure through the system.',
      entities: ['auth-service', 'api-gateway', 'user-dashboard'],
    },
    // People concepts
    {
      name: 'Alice SRE engineer',
      description:
        'Alice is an SRE on the platform team who investigated and fixed the auth-service incident on January 15 2026. She received the PagerDuty alert, discovered the missing JWT_SECRET, and redeployed the service with the fix.',
      entities: ['alice', 'auth-service', 'JWT_SECRET'],
    },
    {
      name: 'Bob developer',
      description:
        'Bob is a developer on the platform team who deployed auth-service v2.3.0 on January 15 2026. He confirmed that the JWT_SECRET reference was accidentally removed in PR #1234 during the incident investigation.',
      entities: ['bob', 'auth-service', 'JWT_SECRET'],
    },
    // Infrastructure concepts
    {
      name: 'kubernetes deployment',
      description:
        'Kubernetes cluster deployment of auth-service v2.3.0 that triggered the incident. The cluster successfully pulled the container image but the pod entered CrashLoopBackOff due to missing environment variable.',
      entities: ['kubernetes-cluster', 'auth-service'],
    },
    {
      name: 'secrets management',
      description:
        'AWS Secrets Manager that stores the JWT_SECRET environment variable for auth-service. The secret existed in Secrets Manager but the reference to it was removed from the deployment manifest in PR #1234.',
      entities: ['secrets-manager', 'JWT_SECRET', 'auth-service'],
    },
  ],
};

// Test queries with expected behaviors - updated for MAGMA retrieval tools
export const DEPLOYMENT_INCIDENT_QUERIES: TestQuery[] = [
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

// Legacy export for backwards compatibility
export const TEST_QUERIES = DEPLOYMENT_INCIDENT_QUERIES;

export async function seedDeploymentIncident(
  client: MCPClientLike,
): Promise<void> {
  await seedDataset(client, DEPLOYMENT_INCIDENT, 'Deployment Incident');
}

export const deploymentIncidentModule: DatasetModule = {
  name: 'deployment-incident',
  description: 'Missing environment variable causes cascading service failure',
  data: DEPLOYMENT_INCIDENT,
  queries: DEPLOYMENT_INCIDENT_QUERIES,
  seed: seedDeploymentIncident,
};

// Legacy type exports for backwards compatibility
export type { Dataset as DeploymentIncidentData } from './types.js';
