// Scenario Registry - Available demo scenarios

export {
  type DemoScenario,
  type DemoStep,
  formatScenarioIntro,
  formatStepNarration,
  getScenarioSummary,
  INCIDENT_DEMO,
} from './incident-demo.js';

import { type DemoScenario, INCIDENT_DEMO } from './incident-demo.js';

/**
 * Registry of all available demo scenarios
 */
export const SCENARIOS: Record<string, DemoScenario> = {
  incident: INCIDENT_DEMO,
};

/**
 * Get a scenario by name
 */
export function getScenario(name: string): DemoScenario | undefined {
  return SCENARIOS[name];
}

/**
 * List all available scenarios
 */
export function listScenarios(): Array<{ name: string; description: string }> {
  return Object.values(SCENARIOS).map((s) => ({
    name: s.name,
    description: s.description,
  }));
}
