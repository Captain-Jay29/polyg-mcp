// Dataset exports and registry

// Cloud Data Breach
export {
  CLOUD_DATA_BREACH,
  CLOUD_DATA_BREACH_QUERIES,
  cloudDataBreachModule,
  seedCloudDataBreach,
} from './cloud-data-breach.js';
// Deployment Incident
export {
  DEPLOYMENT_INCIDENT,
  DEPLOYMENT_INCIDENT_QUERIES,
  type DeploymentIncidentData, // Legacy type alias
  deploymentIncidentModule,
  seedDeploymentIncident,
  TEST_QUERIES, // Legacy alias
} from './deployment-incident.js';
// Environmental Investigation
export {
  ENVIRONMENTAL_INVESTIGATION,
  ENVIRONMENTAL_INVESTIGATION_QUERIES,
  environmentalInvestigationModule,
  seedEnvironmentalInvestigation,
} from './environmental-investigation.js';
// Product Restructure
export {
  PRODUCT_RESTRUCTURE,
  PRODUCT_RESTRUCTURE_QUERIES,
  productRestructureModule,
  seedProductRestructure,
} from './product-restructure.js';
// Utilities
export { seedDataset } from './seed-utils.js';
// Types
export type {
  CausalLinkData,
  ConceptData,
  Dataset,
  DatasetModule,
  EntityData,
  EventData,
  FactData,
  MCPClientLike,
  TestQuery,
} from './types.js';

import { cloudDataBreachModule } from './cloud-data-breach.js';
// Import modules for registry
import { deploymentIncidentModule } from './deployment-incident.js';
import { environmentalInvestigationModule } from './environmental-investigation.js';
import { productRestructureModule } from './product-restructure.js';
import type { DatasetModule } from './types.js';

/**
 * Registry of all available datasets
 */
export const DATASET_REGISTRY: Record<string, DatasetModule> = {
  'deployment-incident': deploymentIncidentModule,
  'cloud-data-breach': cloudDataBreachModule,
  'product-restructure': productRestructureModule,
  'environmental-investigation': environmentalInvestigationModule,
};

/**
 * Get all available dataset names
 */
export function getAvailableDatasets(): string[] {
  return Object.keys(DATASET_REGISTRY);
}

/**
 * Get a dataset module by name
 */
export function getDataset(name: string): DatasetModule | undefined {
  return DATASET_REGISTRY[name];
}

/**
 * List all datasets with descriptions
 */
export function listDatasets(): Array<{ name: string; description: string }> {
  return Object.values(DATASET_REGISTRY).map((m) => ({
    name: m.name,
    description: m.description,
  }));
}
