// Stage 12 sandbox entry: only public HTTPS GET/HEAD checks are reachable.
// Previous-stage fixtures live unchanged in attack-check-legacy.mjs and must
// not be loaded by the official Stage 12 submission process.
import {runStage12PublicReadOnlyChecks} from './stage12-bundle-check.mjs';

export async function runAttackChecks(config) {
  if (config?.step !== 12) {
    throw new Error('Stages 1–11: use src/attack-check-legacy.mjs for historical self-checks');
  }
  return runStage12PublicReadOnlyChecks(config);
}
