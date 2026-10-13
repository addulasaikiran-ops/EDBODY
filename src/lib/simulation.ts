import type { SimulationInput, SimulationResult } from '../types';
/** Demo-only UI placeholder. Not physiological, validated, or suitable for health decisions. */
export function runIllustrativeMealSimulation(input: SimulationInput): SimulationResult {
  const duration = Math.max(30, Math.min(240, Math.round(input.durationMinutes / 5) * 5));
  const baseline = Math.max(50, Math.min(250, input.baselineGlucose));
  const carbs = Math.max(0, Math.min(180, input.carbsGrams));
  const gi = Math.max(.2, Math.min(1, input.mealGi));
  const activity = Math.max(0, Math.min(1, input.activityLevel));
  const lift = carbs * .27 * gi * (1 - activity * .3);
  const peakTime = 35 + (1 - gi) * 30;
  const points = [];
  for (let minute = 0; minute <= duration; minute += 5) {
    const x = Math.max(.001, minute / peakTime);
    const bump = lift * x * Math.exp(1 - x);
    const tail = minute > peakTime ? (minute - peakTime) * .012 * gi : 0;
    points.push({ minute, glucose: Number(Math.max(40, baseline + bump - tail).toFixed(1)) });
  }
  const peak = points.reduce((a, b) => b.glucose > a.glucose ? b : a, points[0]);
  return { points, peakGlucose: peak.glucose, peakMinute: peak.minute, endGlucose: points[points.length - 1].glucose, baselineGlucose: baseline, disclaimer: 'Illustrative software placeholder only. Not a physiological prediction and not validated for health decisions.' };
}