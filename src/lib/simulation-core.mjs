/**
 * Shared calculation for the EDBODY meal-response UI demonstration.
 *
 * This is a software placeholder, not a physiological model. Passing tests
 * verifies only basic software invariants, not biological accuracy.
 */
const finiteOr = (value, fallback) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function runIllustrativeMealSimulationCore(input) {
  const values = input && typeof input === 'object' ? input : {};
  const durationInput = finiteOr(values.durationMinutes, 120);
  const baselineInput = finiteOr(values.baselineGlucose, 94);
  const carbsInput = finiteOr(values.carbsGrams, 0);
  const giInput = finiteOr(values.mealGi, 0.62);
  const activityInput = finiteOr(values.activityLevel, 0.25);

  const duration = clamp(Math.round(durationInput / 5) * 5, 30, 240);
  const baseline = clamp(baselineInput, 50, 250);
  const carbs = clamp(carbsInput, 0, 180);
  const gi = clamp(giInput, 0.2, 1);
  const activity = clamp(activityInput, 0, 1);
  const lift = carbs * 0.27 * gi * (1 - activity * 0.3);
  const peakTime = 35 + (1 - gi) * 30;
  const points = [];

  for (let minute = 0; minute <= duration; minute += 5) {
    const x = minute / peakTime;
    const bump = lift * x * Math.exp(1 - x);
    const tail = minute > peakTime ? (minute - peakTime) * 0.012 * gi : 0;
    points.push({
      minute,
      glucose: Number(Math.max(40, baseline + bump - tail).toFixed(1)),
    });
  }

  const peak = points.reduce((best, point) =>
    point.glucose > best.glucose ? point : best, points[0]);

  return {
    points,
    peakGlucose: peak.glucose,
    peakMinute: peak.minute,
    endGlucose: points[points.length - 1].glucose,
    baselineGlucose: baseline,
    disclaimer: 'Illustrative software placeholder only. Not a physiological prediction and not validated for health decisions.',
  };
}
