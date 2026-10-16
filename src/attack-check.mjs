// Stage 12 submission imports only its public read-only checker.
// Legacy stages are loaded on demand and NEVER imported during the step-12
// bundle. Keep their original direct runAttackChecks(config) contract intact.
import {runStage12PublicReadOnlyChecks} from './stage12-bundle-check.mjs';

export async function runAttackChecks(config) {
  if (config?.step === 12) return runStage12PublicReadOnlyChecks(config);
  // Historical Stage 1–11 entry remains available but out of the Stage 12 graph.
  const {runAttackChecks: runLegacyChecks} = await import('./attack-check-legacy.mjs');
  return runLegacyChecks(config);
}
