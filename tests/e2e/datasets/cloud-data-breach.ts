// Cloud Data Breach During Storage Migration
// Simulates a security incident caused by misconfigured cloud storage during migration

import { seedDataset } from './seed-utils.js';
import type {
  Dataset,
  DatasetModule,
  MCPClientLike,
  TestQuery,
} from './types.js';

export const CLOUD_DATA_BREACH: Dataset = {
  entities: [
    { name: 'NimbusCloud', type: 'organization' },
    {
      name: 'AtlasCRM',
      type: 'service',
      relationships: [{ target: 'NimbusCloud', type: 'DEPENDS_ON' }],
    },
    { name: 'S3-Archive-Bucket', type: 'storage' },
    { name: 'MigrationServiceV2', type: 'service' },
    { name: 'IAM-Role-Migrator', type: 'credential' },
    {
      name: 'SecurityTeam',
      type: 'team',
      relationships: [{ target: 'NimbusCloud', type: 'WORKS_AT' }],
    },
    {
      name: 'InfraTeam',
      type: 'team',
      relationships: [{ target: 'NimbusCloud', type: 'WORKS_AT' }],
    },
    {
      name: 'Priya Shah',
      type: 'person',
      properties: { role: 'security-lead' },
      relationships: [{ target: 'SecurityTeam', type: 'MANAGES' }],
    },
    {
      name: 'Daniel Wong',
      type: 'person',
      properties: { role: 'infra-lead' },
      relationships: [{ target: 'InfraTeam', type: 'MANAGES' }],
    },
    { name: 'AuditLogService', type: 'service' },
    { name: 'ThreatActor-X9', type: 'external_actor' },
    { name: 'CustomerPIIData', type: 'data_asset' },
    { name: 'EU-Region', type: 'location' },
    { name: 'US-Region', type: 'location' },
    { name: 'IncidentResponseRunbook', type: 'document' },
    { name: 'RegulatoryAuthority', type: 'organization' },
    { name: 'EncryptionKey-KMS1', type: 'security_artifact' },
  ],

  events: [
    {
      description:
        'InfraTeam begins migration of AtlasCRM backups to S3-Archive-Bucket',
      timestamp: '2025-02-01T09:00:00Z',
      entities: ['InfraTeam', 'AtlasCRM', 'MigrationServiceV2'],
    },
    {
      description:
        'IAM-Role-Migrator permissions expanded to speed up migration',
      timestamp: '2025-02-02T11:30:00Z',
      entities: ['IAM-Role-Migrator', 'MigrationServiceV2'],
    },
    {
      description: 'AuditLogService records disabled access warnings',
      timestamp: '2025-02-03T03:20:00Z',
      entities: ['AuditLogService'],
    },
    {
      description: 'S3-Archive-Bucket made temporarily public for testing',
      timestamp: '2025-02-03T04:00:00Z',
      entities: ['S3-Archive-Bucket'],
    },
    {
      description: 'ThreatActor-X9 scans exposed buckets',
      timestamp: '2025-02-03T06:15:00Z',
      entities: ['ThreatActor-X9'],
    },
    {
      description: 'CustomerPIIData accessed from EU-Region IP',
      timestamp: '2025-02-03T06:18:00Z',
      entities: ['CustomerPIIData', 'EU-Region'],
    },
    {
      description: 'SecurityTeam receives anomaly alert',
      timestamp: '2025-02-03T07:05:00Z',
      entities: ['SecurityTeam'],
    },
    {
      description: 'Priya Shah declares security incident',
      timestamp: '2025-02-03T07:20:00Z',
      entities: ['Priya Shah'],
    },
    {
      description: 'Bucket access revoked and encryption keys rotated',
      timestamp: '2025-02-03T08:10:00Z',
      entities: ['S3-Archive-Bucket', 'EncryptionKey-KMS1'],
    },
    {
      description: 'Forensic analysis begins using AuditLogService',
      timestamp: '2025-02-03T10:00:00Z',
      entities: ['AuditLogService', 'SecurityTeam'],
    },
    {
      description: 'InfraTeam halts migration jobs',
      timestamp: '2025-02-03T10:30:00Z',
      entities: ['InfraTeam', 'MigrationServiceV2'],
    },
    {
      description: 'RegulatoryAuthority notified of potential breach',
      timestamp: '2025-02-04T09:00:00Z',
      entities: ['RegulatoryAuthority'],
    },
    {
      description: 'IncidentResponseRunbook updated with new safeguards',
      timestamp: '2025-02-10T14:00:00Z',
      entities: ['IncidentResponseRunbook'],
    },
  ],

  causalLinks: [
    {
      cause: 'Expanded IAM-Role-Migrator permissions',
      effect: 'Unauthorized bucket access',
      confidence: 0.9,
      mechanism: 'Over-permissioned role allowed broader access than intended',
      entities: ['IAM-Role-Migrator', 'S3-Archive-Bucket'],
    },
    {
      cause: 'Temporary public bucket setting',
      effect: 'ThreatActor-X9 discovery',
      confidence: 0.95,
      mechanism: 'Public bucket visible to automated scanners',
      entities: ['S3-Archive-Bucket', 'ThreatActor-X9'],
    },
    {
      cause: 'ThreatActor-X9 discovery',
      effect: 'CustomerPIIData exposure',
      confidence: 0.92,
      mechanism: 'Threat actor downloaded exposed data',
      entities: ['ThreatActor-X9', 'CustomerPIIData'],
    },
    {
      cause: 'CustomerPIIData exposure',
      effect: 'Security anomaly alert',
      confidence: 0.85,
      mechanism: 'Unusual access patterns triggered monitoring',
      entities: ['CustomerPIIData', 'AuditLogService', 'SecurityTeam'],
    },
    {
      cause: 'Security anomaly alert',
      effect: 'Incident declaration',
      confidence: 0.9,
      mechanism: 'Alert escalated to security lead',
      entities: ['SecurityTeam', 'Priya Shah'],
    },
    {
      cause: 'Incident declaration',
      effect: 'Migration halted',
      confidence: 0.8,
      mechanism: 'All non-essential operations paused during incident',
      entities: ['MigrationServiceV2', 'InfraTeam'],
    },
    {
      cause: 'Incident declaration',
      effect: 'Regulatory notification',
      confidence: 0.88,
      mechanism: 'Data breach requires regulatory disclosure',
      entities: ['RegulatoryAuthority', 'NimbusCloud'],
    },
    {
      cause: 'Forensic findings',
      effect: 'Runbook update',
      confidence: 0.75,
      mechanism: 'Lessons learned incorporated into procedures',
      entities: ['IncidentResponseRunbook', 'SecurityTeam'],
    },
  ],

  facts: [
    {
      subject: 'S3-Archive-Bucket',
      predicate: 'access_level',
      object: 'public',
      validFrom: '2025-02-03T04:00:00Z',
      validTo: '2025-02-03T08:10:00Z',
    },
    {
      subject: 'S3-Archive-Bucket',
      predicate: 'access_level',
      object: 'private',
      validFrom: '2025-02-03T08:10:00Z',
    },
    {
      subject: 'MigrationServiceV2',
      predicate: 'status',
      object: 'running',
      validFrom: '2025-02-01T09:00:00Z',
      validTo: '2025-02-03T10:30:00Z',
    },
    {
      subject: 'MigrationServiceV2',
      predicate: 'status',
      object: 'paused',
      validFrom: '2025-02-03T10:30:00Z',
    },
    {
      subject: 'CustomerPIIData',
      predicate: 'encryption_key',
      object: 'EncryptionKey-KMS1-v1',
      validFrom: '2025-01-01T00:00:00Z',
      validTo: '2025-02-03T08:10:00Z',
    },
    {
      subject: 'CustomerPIIData',
      predicate: 'encryption_key',
      object: 'EncryptionKey-KMS1-v2',
      validFrom: '2025-02-03T08:10:00Z',
    },
    {
      subject: 'Incident-2025-02-03',
      predicate: 'severity',
      object: 'high',
      validFrom: '2025-02-03T07:20:00Z',
    },
  ],

  concepts: [
    {
      name: 'Cloud Storage Misconfiguration',
      description:
        'Cloud storage misconfiguration refers to improper access controls, such as public bucket exposure or overly permissive IAM roles. In the NimbusCloud incident, S3-Archive-Bucket and IAM-Role-Migrator were configured in ways that allowed unintended external access by ThreatActor-X9. This vulnerability exposed CustomerPIIData and required immediate remediation by SecurityTeam and Priya Shah. This concept is critical in cloud security, breach prevention, and compliance audits.',
      entities: [
        'NimbusCloud',
        'S3-Archive-Bucket',
        'IAM-Role-Migrator',
        'ThreatActor-X9',
        'CustomerPIIData',
        'SecurityTeam',
        'Priya Shah',
      ],
    },
    {
      name: 'Incident Response Lifecycle',
      description:
        'The incident response lifecycle includes detection, declaration, containment, eradication, recovery, and post-incident review. In this NimbusCloud scenario, SecurityTeam and Priya Shah followed the IncidentResponseRunbook after AuditLogService surfaced anomalies. Key steps included revoking bucket access, rotating EncryptionKey-KMS1, notifying RegulatoryAuthority, and updating procedures. This concept connects security alerts, forensic analysis, and infrastructure remediation.',
      entities: [
        'SecurityTeam',
        'Priya Shah',
        'IncidentResponseRunbook',
        'AuditLogService',
        'EncryptionKey-KMS1',
        'RegulatoryAuthority',
      ],
    },
    {
      name: 'Data Migration Security',
      description:
        'Data migration security involves protecting data during transfer between systems. The AtlasCRM migration to S3-Archive-Bucket by InfraTeam and Daniel Wong required MigrationServiceV2 to have elevated permissions via IAM-Role-Migrator. The temporary public bucket setting for testing created the vulnerability exploited by ThreatActor-X9. This concept emphasizes the need for security reviews during migration planning.',
      entities: [
        'AtlasCRM',
        'S3-Archive-Bucket',
        'InfraTeam',
        'Daniel Wong',
        'MigrationServiceV2',
        'IAM-Role-Migrator',
        'ThreatActor-X9',
      ],
    },
    {
      name: 'Threat Actor Discovery',
      description:
        'ThreatActor-X9 discovered the exposed S3-Archive-Bucket through automated scanning of public cloud resources. This external actor accessed CustomerPIIData from EU-Region before SecurityTeam detected the anomaly. Understanding threat actor behavior helps organizations implement better monitoring and faster incident response.',
      entities: [
        'ThreatActor-X9',
        'S3-Archive-Bucket',
        'CustomerPIIData',
        'EU-Region',
        'SecurityTeam',
      ],
    },
  ],
};

export const CLOUD_DATA_BREACH_QUERIES: TestQuery[] = [
  {
    query: 'Why was customer PII exposed during the migration?',
    expectedTools: ['semantic_search', 'causal_expand'],
    expectedInAnswer: ['IAM-Role-Migrator', 'public bucket', 'ThreatActor-X9'],
  },
  {
    query: 'When was the security incident declared?',
    expectedTools: ['semantic_search', 'temporal_expand'],
    expectedInAnswer: ['2025-02-03', 'Priya Shah'],
  },
  {
    query: 'Who managed the response to the breach?',
    expectedTools: ['semantic_search', 'entity_lookup'],
    expectedInAnswer: ['Priya Shah', 'SecurityTeam'],
  },
  {
    query: 'What actions were taken to contain the breach?',
    expectedTools: ['semantic_search', 'temporal_expand'],
    expectedInAnswer: [
      'bucket access revoked',
      'encryption keys rotated',
      'migration halted',
    ],
  },
  {
    query: 'What was the root cause of the data breach?',
    expectedTools: ['semantic_search', 'causal_expand'],
    expectedInAnswer: ['public bucket', 'IAM', 'permissions'],
  },
  {
    query: 'Which teams were involved in the incident?',
    expectedTools: ['semantic_search', 'entity_lookup'],
    expectedInAnswer: ['SecurityTeam', 'InfraTeam'],
  },
];

export async function seedCloudDataBreach(
  client: MCPClientLike,
): Promise<void> {
  await seedDataset(client, CLOUD_DATA_BREACH, 'Cloud Data Breach');
}

export const cloudDataBreachModule: DatasetModule = {
  name: 'cloud-data-breach',
  description:
    'Cloud storage misconfiguration during migration leads to data breach',
  data: CLOUD_DATA_BREACH,
  queries: CLOUD_DATA_BREACH_QUERIES,
  seed: seedCloudDataBreach,
};
