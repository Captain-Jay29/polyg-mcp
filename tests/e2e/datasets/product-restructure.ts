// Product Launch Delayed by Compliance Audit
// Simulates a business scenario where SOC2 audit findings cause organizational restructure

import { seedDataset } from './seed-utils.js';
import type {
  Dataset,
  DatasetModule,
  MCPClientLike,
  TestQuery,
} from './types.js';

export const PRODUCT_RESTRUCTURE: Dataset = {
  entities: [
    { name: 'NovaPay', type: 'organization' },
    {
      name: 'NovaPay Wallet',
      type: 'product',
      relationships: [{ target: 'NovaPay', type: 'OWNED_BY' }],
    },
    {
      name: 'ComplianceTeam',
      type: 'team',
      relationships: [{ target: 'NovaPay', type: 'WORKS_AT' }],
    },
    {
      name: 'GrowthTeam',
      type: 'team',
      relationships: [{ target: 'NovaPay', type: 'WORKS_AT' }],
    },
    {
      name: 'EngineeringTeam',
      type: 'team',
      relationships: [{ target: 'NovaPay', type: 'WORKS_AT' }],
    },
    {
      name: 'Elena Ruiz',
      type: 'person',
      properties: { role: 'compliance-lead' },
      relationships: [{ target: 'ComplianceTeam', type: 'MANAGES' }],
    },
    {
      name: 'Marcus Lee',
      type: 'person',
      properties: { role: 'growth-lead' },
      relationships: [{ target: 'GrowthTeam', type: 'MANAGES' }],
    },
    {
      name: 'Sarah Chen',
      type: 'person',
      properties: { role: 'engineering-lead' },
      relationships: [{ target: 'EngineeringTeam', type: 'MANAGES' }],
    },
    { name: 'SOC2-Audit', type: 'process' },
    { name: 'LaunchDeadline-Q2', type: 'milestone' },
    { name: 'RegulatoryAuthority', type: 'organization' },
    { name: 'PaymentLoggingSystem', type: 'service' },
    { name: 'AuditFirm-External', type: 'organization' },
  ],

  events: [
    {
      description: 'NovaPay announces NovaPay Wallet launch for Q2 2025',
      timestamp: '2025-03-01T10:00:00Z',
      entities: ['NovaPay', 'NovaPay Wallet', 'LaunchDeadline-Q2'],
    },
    {
      description: 'SOC2 audit initiated by AuditFirm-External',
      timestamp: '2025-03-05T09:00:00Z',
      entities: ['SOC2-Audit', 'AuditFirm-External', 'ComplianceTeam'],
    },
    {
      description: 'Elena Ruiz begins coordinating audit evidence collection',
      timestamp: '2025-03-07T11:00:00Z',
      entities: ['Elena Ruiz', 'ComplianceTeam'],
    },
    {
      description: 'Compliance gaps discovered in PaymentLoggingSystem',
      timestamp: '2025-03-15T12:00:00Z',
      entities: ['ComplianceTeam', 'PaymentLoggingSystem', 'SOC2-Audit'],
    },
    {
      description: 'Sarah Chen assesses engineering effort to fix logging gaps',
      timestamp: '2025-03-16T14:00:00Z',
      entities: ['Sarah Chen', 'EngineeringTeam', 'PaymentLoggingSystem'],
    },
    {
      description: 'GrowthTeam paused feature rollout pending compliance fix',
      timestamp: '2025-03-18T08:30:00Z',
      entities: ['GrowthTeam', 'Marcus Lee'],
    },
    {
      description:
        'Executive team restructure announced to prioritize compliance',
      timestamp: '2025-03-20T14:00:00Z',
      entities: ['NovaPay', 'ComplianceTeam', 'EngineeringTeam'],
    },
    {
      description: 'Engineering sprint dedicated to PaymentLoggingSystem fixes',
      timestamp: '2025-03-22T09:00:00Z',
      entities: ['EngineeringTeam', 'Sarah Chen', 'PaymentLoggingSystem'],
    },
    {
      description: 'Launch deadline officially delayed to Q3',
      timestamp: '2025-03-25T16:00:00Z',
      entities: ['LaunchDeadline-Q2', 'NovaPay Wallet'],
    },
    {
      description: 'Compliance fixes validated by AuditFirm-External',
      timestamp: '2025-04-10T11:00:00Z',
      entities: ['AuditFirm-External', 'SOC2-Audit', 'PaymentLoggingSystem'],
    },
    {
      description: 'SOC2 certification achieved',
      timestamp: '2025-04-20T15:00:00Z',
      entities: ['SOC2-Audit', 'NovaPay', 'ComplianceTeam'],
    },
  ],

  causalLinks: [
    {
      cause: 'SOC2 audit initiated',
      effect: 'Compliance gaps discovered',
      confidence: 0.9,
      mechanism: 'Audit process revealed undocumented logging requirements',
      entities: [
        'SOC2-Audit',
        'AuditFirm-External',
        'ComplianceTeam',
        'PaymentLoggingSystem',
      ],
    },
    {
      cause: 'Compliance gaps discovered',
      effect: 'Feature rollout paused',
      confidence: 0.85,
      mechanism: 'Cannot launch with known compliance violations',
      entities: [
        'ComplianceTeam',
        'GrowthTeam',
        'Marcus Lee',
        'NovaPay Wallet',
      ],
    },
    {
      cause: 'Feature rollout paused',
      effect: 'Launch deadline delayed',
      confidence: 0.9,
      mechanism: 'Product launch depends on feature completion',
      entities: ['GrowthTeam', 'NovaPay Wallet', 'LaunchDeadline-Q2'],
    },
    {
      cause: 'Compliance gaps discovered',
      effect: 'Team restructure announced',
      confidence: 0.7,
      mechanism: 'Organization prioritized compliance resources',
      entities: ['ComplianceTeam', 'NovaPay', 'EngineeringTeam'],
    },
    {
      cause: 'Engineering sprint for fixes',
      effect: 'Compliance fixes validated',
      confidence: 0.85,
      mechanism: 'Dedicated engineering effort resolved issues',
      entities: [
        'EngineeringTeam',
        'Sarah Chen',
        'PaymentLoggingSystem',
        'AuditFirm-External',
      ],
    },
    {
      cause: 'Compliance fixes validated',
      effect: 'SOC2 certification achieved',
      confidence: 0.95,
      mechanism: 'All audit requirements satisfied',
      entities: ['AuditFirm-External', 'SOC2-Audit', 'NovaPay'],
    },
  ],

  facts: [
    {
      subject: 'NovaPay Wallet',
      predicate: 'launch_target',
      object: 'Q2-2025',
      validFrom: '2025-03-01T10:00:00Z',
      validTo: '2025-03-25T16:00:00Z',
    },
    {
      subject: 'NovaPay Wallet',
      predicate: 'launch_target',
      object: 'Q3-2025',
      validFrom: '2025-03-25T16:00:00Z',
    },
    {
      subject: 'NovaPay Wallet',
      predicate: 'launch_status',
      object: 'on-track',
      validFrom: '2025-03-01T10:00:00Z',
      validTo: '2025-03-15T12:00:00Z',
    },
    {
      subject: 'NovaPay Wallet',
      predicate: 'launch_status',
      object: 'delayed',
      validFrom: '2025-03-25T16:00:00Z',
    },
    {
      subject: 'PaymentLoggingSystem',
      predicate: 'compliance_status',
      object: 'non-compliant',
      validFrom: '2025-03-15T12:00:00Z',
      validTo: '2025-04-10T11:00:00Z',
    },
    {
      subject: 'PaymentLoggingSystem',
      predicate: 'compliance_status',
      object: 'compliant',
      validFrom: '2025-04-10T11:00:00Z',
    },
    {
      subject: 'NovaPay',
      predicate: 'soc2_status',
      object: 'in-audit',
      validFrom: '2025-03-05T09:00:00Z',
      validTo: '2025-04-20T15:00:00Z',
    },
    {
      subject: 'NovaPay',
      predicate: 'soc2_status',
      object: 'certified',
      validFrom: '2025-04-20T15:00:00Z',
    },
  ],

  concepts: [
    {
      name: 'Compliance-Driven Product Delay',
      description:
        "Compliance-driven product delays occur when regulatory or audit requirements block feature releases or launches. In NovaPay Wallet's case, the SOC2-Audit by AuditFirm-External uncovered logging gaps in PaymentLoggingSystem that forced GrowthTeam and Marcus Lee to pause rollouts. Elena Ruiz led the ComplianceTeam effort to remediate issues while Sarah Chen's EngineeringTeam implemented fixes. This concept ties together compliance teams, audits, organizational restructuring, and launch timelines.",
      entities: [
        'NovaPay Wallet',
        'SOC2-Audit',
        'AuditFirm-External',
        'PaymentLoggingSystem',
        'GrowthTeam',
        'Marcus Lee',
        'Elena Ruiz',
        'ComplianceTeam',
        'Sarah Chen',
        'EngineeringTeam',
      ],
    },
    {
      name: 'SOC2 Certification Process',
      description:
        'SOC2 certification validates that an organization meets security, availability, and confidentiality standards. NovaPay underwent this audit with AuditFirm-External, which discovered that PaymentLoggingSystem did not meet logging requirements. The ComplianceTeam coordinated evidence collection while EngineeringTeam fixed the gaps. Certification was achieved after validation of the compliance fixes.',
      entities: [
        'NovaPay',
        'AuditFirm-External',
        'PaymentLoggingSystem',
        'ComplianceTeam',
        'EngineeringTeam',
        'SOC2-Audit',
      ],
    },
    {
      name: 'Cross-Team Coordination',
      description:
        'Cross-team coordination is essential when compliance issues affect product launches. At NovaPay, Elena Ruiz (ComplianceTeam), Marcus Lee (GrowthTeam), and Sarah Chen (EngineeringTeam) had to align on priorities after the SOC2-Audit revealed gaps. The executive restructure prioritized compliance resources, demonstrating how organizational changes follow from audit findings.',
      entities: [
        'NovaPay',
        'Elena Ruiz',
        'ComplianceTeam',
        'Marcus Lee',
        'GrowthTeam',
        'Sarah Chen',
        'EngineeringTeam',
        'SOC2-Audit',
      ],
    },
  ],
};

export const PRODUCT_RESTRUCTURE_QUERIES: TestQuery[] = [
  {
    query: 'Why was the NovaPay Wallet launch delayed?',
    expectedTools: ['semantic_search', 'causal_expand'],
    expectedInAnswer: ['SOC2', 'compliance gaps', 'audit'],
  },
  {
    query: 'Who led the compliance effort?',
    expectedTools: ['semantic_search', 'entity_lookup'],
    expectedInAnswer: ['Elena Ruiz', 'ComplianceTeam'],
  },
  {
    query: 'What was wrong with the PaymentLoggingSystem?',
    expectedTools: ['semantic_search', 'causal_expand'],
    expectedInAnswer: ['compliance gaps', 'logging', 'non-compliant'],
  },
  {
    query: 'When did NovaPay achieve SOC2 certification?',
    expectedTools: ['semantic_search', 'temporal_expand'],
    expectedInAnswer: ['2025-04-20', 'certification'],
  },
  {
    query: 'Which teams were affected by the delay?',
    expectedTools: ['semantic_search', 'entity_lookup'],
    expectedInAnswer: ['GrowthTeam', 'EngineeringTeam', 'ComplianceTeam'],
  },
  {
    query: 'What caused the organizational restructure?',
    expectedTools: ['semantic_search', 'causal_expand'],
    expectedInAnswer: ['compliance gaps', 'SOC2', 'prioritize'],
  },
];

export async function seedProductRestructure(
  client: MCPClientLike,
): Promise<void> {
  await seedDataset(client, PRODUCT_RESTRUCTURE, 'Product Restructure');
}

export const productRestructureModule: DatasetModule = {
  name: 'product-restructure',
  description:
    'SOC2 audit findings cause product launch delay and team restructure',
  data: PRODUCT_RESTRUCTURE,
  queries: PRODUCT_RESTRUCTURE_QUERIES,
  seed: seedProductRestructure,
};
