// Environmental Data Manipulation Investigation
// Simulates a journalistic investigation into corporate data suppression

import { seedDataset } from './seed-utils.js';
import type {
  Dataset,
  DatasetModule,
  MCPClientLike,
  TestQuery,
} from './types.js';

export const ENVIRONMENTAL_INVESTIGATION: Dataset = {
  entities: [
    {
      name: 'GreenWatch',
      type: 'organization',
      properties: { type: 'watchdog' },
    },
    { name: 'RiverSafe Initiative', type: 'ngo' },
    {
      name: 'DeltaChem Corp',
      type: 'company',
      properties: { industry: 'chemical' },
    },
    { name: 'WaterQualityReport-2024', type: 'document' },
    {
      name: 'Dr. Hannah Cole',
      type: 'person',
      properties: { role: 'environmental-scientist' },
      relationships: [{ target: 'RiverSafe Initiative', type: 'WORKS_AT' }],
    },
    {
      name: 'James Rivera',
      type: 'person',
      properties: { role: 'investigative-journalist' },
      relationships: [{ target: 'GreenWatch', type: 'WORKS_AT' }],
    },
    { name: 'River Delta', type: 'location' },
    { name: 'EPA', type: 'government_agency' },
    { name: 'SensorNetwork-RD', type: 'infrastructure' },
    { name: 'Internal-Memo-DC-2024', type: 'document' },
    {
      name: 'Tom Bradley',
      type: 'person',
      properties: { role: 'whistleblower' },
      relationships: [{ target: 'DeltaChem Corp', type: 'WORKS_AT' }],
    },
    { name: 'PublicRecordsRequest-2024-11', type: 'legal_document' },
    { name: 'CourtCase-2025-ENV-001', type: 'legal_case' },
  ],

  events: [
    {
      description: 'RiverSafe Initiative publishes WaterQualityReport-2024',
      timestamp: '2024-11-01T09:00:00Z',
      entities: [
        'RiverSafe Initiative',
        'WaterQualityReport-2024',
        'River Delta',
      ],
    },
    {
      description:
        'GreenWatch flags anomalies in pollutant data from River Delta',
      timestamp: '2024-11-10T14:30:00Z',
      entities: ['GreenWatch', 'River Delta'],
    },
    {
      description: 'James Rivera begins investigating data discrepancies',
      timestamp: '2024-11-12T10:00:00Z',
      entities: ['James Rivera', 'GreenWatch'],
    },
    {
      description:
        'Dr. Hannah Cole reviews raw sensor logs from SensorNetwork-RD',
      timestamp: '2024-11-15T11:00:00Z',
      entities: ['Dr. Hannah Cole', 'SensorNetwork-RD'],
    },
    {
      description:
        'Dr. Cole finds gaps in sensor data during high-pollution periods',
      timestamp: '2024-11-18T15:00:00Z',
      entities: ['Dr. Hannah Cole', 'SensorNetwork-RD'],
    },
    {
      description: 'PublicRecordsRequest-2024-11 filed with EPA',
      timestamp: '2024-11-20T08:00:00Z',
      entities: ['PublicRecordsRequest-2024-11', 'EPA', 'James Rivera'],
    },
    {
      description: 'Tom Bradley contacts GreenWatch with internal documents',
      timestamp: '2024-11-25T19:00:00Z',
      entities: ['Tom Bradley', 'GreenWatch', 'Internal-Memo-DC-2024'],
    },
    {
      description:
        'Internal-Memo-DC-2024 reveals directive to disable sensors during discharges',
      timestamp: '2024-11-26T10:00:00Z',
      entities: ['Internal-Memo-DC-2024', 'DeltaChem Corp', 'SensorNetwork-RD'],
    },
    {
      description: 'DeltaChem Corp linked to systematic data suppression',
      timestamp: '2024-12-05T16:45:00Z',
      entities: ['DeltaChem Corp', 'James Rivera', 'GreenWatch'],
    },
    {
      description: 'GreenWatch publishes investigation findings',
      timestamp: '2024-12-10T09:00:00Z',
      entities: ['GreenWatch', 'James Rivera'],
    },
    {
      description: 'EPA launches formal investigation into DeltaChem Corp',
      timestamp: '2024-12-15T11:00:00Z',
      entities: ['EPA', 'DeltaChem Corp'],
    },
    {
      description: 'CourtCase-2025-ENV-001 filed against DeltaChem Corp',
      timestamp: '2025-01-10T09:00:00Z',
      entities: ['CourtCase-2025-ENV-001', 'DeltaChem Corp', 'EPA'],
    },
  ],

  causalLinks: [
    {
      cause: 'Anomalous pollutant data flagged',
      effect: 'Journalistic investigation launched',
      confidence: 0.85,
      mechanism: 'Data discrepancies warranted deeper inquiry',
      entities: ['GreenWatch', 'James Rivera', 'River Delta'],
    },
    {
      cause: 'Raw sensor log review',
      effect: 'Data gaps discovered',
      confidence: 0.9,
      mechanism: 'Expert analysis revealed missing time periods',
      entities: ['Dr. Hannah Cole', 'SensorNetwork-RD'],
    },
    {
      cause: 'Whistleblower contact',
      effect: 'Internal documents obtained',
      confidence: 0.95,
      mechanism: 'Insider provided confidential memo',
      entities: ['Tom Bradley', 'GreenWatch', 'Internal-Memo-DC-2024'],
    },
    {
      cause: 'Internal memo revealed',
      effect: 'Corporate data suppression confirmed',
      confidence: 0.92,
      mechanism: 'Document showed deliberate sensor disabling',
      entities: ['Internal-Memo-DC-2024', 'DeltaChem Corp', 'SensorNetwork-RD'],
    },
    {
      cause: 'Investigation findings published',
      effect: 'EPA formal investigation',
      confidence: 0.88,
      mechanism: 'Public pressure forced regulatory action',
      entities: ['GreenWatch', 'EPA', 'DeltaChem Corp'],
    },
    {
      cause: 'EPA investigation',
      effect: 'Legal case filed',
      confidence: 0.9,
      mechanism: 'Evidence supported prosecution',
      entities: ['EPA', 'CourtCase-2025-ENV-001', 'DeltaChem Corp'],
    },
    {
      cause: 'Sensor disabling directive',
      effect: 'Pollution data gaps',
      confidence: 0.95,
      mechanism: 'Sensors offline during discharge events',
      entities: [
        'DeltaChem Corp',
        'SensorNetwork-RD',
        'WaterQualityReport-2024',
      ],
    },
  ],

  facts: [
    {
      subject: 'WaterQualityReport-2024',
      predicate: 'credibility',
      object: 'verified',
      validFrom: '2024-11-01T09:00:00Z',
      validTo: '2024-11-10T14:30:00Z',
    },
    {
      subject: 'WaterQualityReport-2024',
      predicate: 'credibility',
      object: 'questioned',
      validFrom: '2024-11-10T14:30:00Z',
    },
    {
      subject: 'DeltaChem Corp',
      predicate: 'investigation_status',
      object: 'none',
      validFrom: '2024-01-01T00:00:00Z',
      validTo: '2024-12-15T11:00:00Z',
    },
    {
      subject: 'DeltaChem Corp',
      predicate: 'investigation_status',
      object: 'under-epa-investigation',
      validFrom: '2024-12-15T11:00:00Z',
      validTo: '2025-01-10T09:00:00Z',
    },
    {
      subject: 'DeltaChem Corp',
      predicate: 'investigation_status',
      object: 'facing-prosecution',
      validFrom: '2025-01-10T09:00:00Z',
    },
    {
      subject: 'Tom Bradley',
      predicate: 'status',
      object: 'employee',
      validFrom: '2020-01-01T00:00:00Z',
      validTo: '2024-11-25T19:00:00Z',
    },
    {
      subject: 'Tom Bradley',
      predicate: 'status',
      object: 'whistleblower',
      validFrom: '2024-11-25T19:00:00Z',
    },
  ],

  concepts: [
    {
      name: 'Environmental Data Manipulation',
      description:
        'Environmental data manipulation involves altering, suppressing, or misrepresenting scientific measurements to hide regulatory violations. In the River Delta case, DeltaChem Corp deliberately disabled SensorNetwork-RD during discharge events, creating gaps in WaterQualityReport-2024. GreenWatch and James Rivera flagged anomalies, while Dr. Hannah Cole analyzed raw sensor logs. The Internal-Memo-DC-2024 obtained from whistleblower Tom Bradley proved the deliberate suppression. This concept spans environmental science, investigative journalism, corporate accountability, and data integrity.',
      entities: [
        'DeltaChem Corp',
        'SensorNetwork-RD',
        'WaterQualityReport-2024',
        'GreenWatch',
        'James Rivera',
        'Dr. Hannah Cole',
        'Internal-Memo-DC-2024',
        'Tom Bradley',
        'River Delta',
      ],
    },
    {
      name: 'Whistleblower Protection',
      description:
        'Whistleblower protection enables insiders to report wrongdoing without retaliation. Tom Bradley, a DeltaChem Corp employee, contacted GreenWatch with Internal-Memo-DC-2024 revealing the directive to disable sensors during chemical discharges. His information was crucial in confirming the data suppression and triggering the EPA investigation. This concept connects corporate governance, legal protections, and investigative journalism.',
      entities: [
        'Tom Bradley',
        'DeltaChem Corp',
        'GreenWatch',
        'Internal-Memo-DC-2024',
        'EPA',
      ],
    },
    {
      name: 'Investigative Journalism Process',
      description:
        'Investigative journalism involves systematic research to uncover hidden information. James Rivera of GreenWatch initiated the investigation after anomalies were flagged in River Delta pollution data. The process included reviewing WaterQualityReport-2024, filing PublicRecordsRequest-2024-11 with EPA, obtaining Internal-Memo-DC-2024 from Tom Bradley, and coordinating with expert Dr. Hannah Cole. Publication of findings led to EPA action and CourtCase-2025-ENV-001.',
      entities: [
        'James Rivera',
        'GreenWatch',
        'River Delta',
        'WaterQualityReport-2024',
        'PublicRecordsRequest-2024-11',
        'EPA',
        'Internal-Memo-DC-2024',
        'Tom Bradley',
        'Dr. Hannah Cole',
        'CourtCase-2025-ENV-001',
      ],
    },
    {
      name: 'Regulatory Enforcement',
      description:
        "Regulatory enforcement occurs when government agencies take action against violators. After GreenWatch published findings linking DeltaChem Corp to data suppression, the EPA launched a formal investigation using evidence from SensorNetwork-RD logs, Internal-Memo-DC-2024, and Dr. Hannah Cole's analysis. This led to CourtCase-2025-ENV-001 being filed, demonstrating how public pressure and documented evidence drive regulatory action.",
      entities: [
        'EPA',
        'GreenWatch',
        'DeltaChem Corp',
        'SensorNetwork-RD',
        'Internal-Memo-DC-2024',
        'Dr. Hannah Cole',
        'CourtCase-2025-ENV-001',
      ],
    },
  ],
};

export const ENVIRONMENTAL_INVESTIGATION_QUERIES: TestQuery[] = [
  {
    query: 'Why was DeltaChem Corp investigated?',
    expectedTools: ['semantic_search', 'causal_expand'],
    expectedInAnswer: ['data suppression', 'pollutant', 'sensor'],
  },
  {
    query: 'Who validated the data inconsistencies?',
    expectedTools: ['semantic_search', 'entity_lookup'],
    expectedInAnswer: ['Dr. Hannah Cole', 'sensor logs'],
  },
  {
    query: 'How did the investigation obtain internal documents?',
    expectedTools: ['semantic_search', 'causal_expand'],
    expectedInAnswer: ['Tom Bradley', 'whistleblower', 'Internal-Memo'],
  },
  {
    query: 'What happened after GreenWatch published findings?',
    expectedTools: ['semantic_search', 'temporal_expand'],
    expectedInAnswer: ['EPA', 'investigation', 'court case'],
  },
  {
    query: 'When did the EPA launch its investigation?',
    expectedTools: ['semantic_search', 'temporal_expand'],
    expectedInAnswer: ['2024-12-15', 'EPA'],
  },
  {
    query: 'What evidence proved the data manipulation?',
    expectedTools: ['semantic_search', 'entity_lookup'],
    expectedInAnswer: ['Internal-Memo-DC-2024', 'sensor', 'directive'],
  },
  {
    query: 'Who were the key people in the investigation?',
    expectedTools: ['semantic_search', 'entity_lookup'],
    expectedInAnswer: ['James Rivera', 'Dr. Hannah Cole', 'Tom Bradley'],
  },
];

export async function seedEnvironmentalInvestigation(
  client: MCPClientLike,
): Promise<void> {
  await seedDataset(
    client,
    ENVIRONMENTAL_INVESTIGATION,
    'Environmental Investigation',
  );
}

export const environmentalInvestigationModule: DatasetModule = {
  name: 'environmental-investigation',
  description:
    'Journalistic investigation into corporate environmental data manipulation',
  data: ENVIRONMENTAL_INVESTIGATION,
  queries: ENVIRONMENTAL_INVESTIGATION_QUERIES,
  seed: seedEnvironmentalInvestigation,
};
