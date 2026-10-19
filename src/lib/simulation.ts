import type { SimulationInput, SimulationResult } from '../types';
import { runIllustrativeMealSimulationCore } from './simulation-core.mjs';

/** UI placeholder only; this function is not a physiological or validated model. */
export function runIllustrativeMealSimulation(input: SimulationInput): SimulationResult {
  return runIllustrativeMealSimulationCore(input);
}
