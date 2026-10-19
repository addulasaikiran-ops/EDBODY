import test from 'node:test';
import assert from 'node:assert/strict';
import { runIllustrativeMealSimulationCore } from '../src/lib/simulation-core.mjs';

const standardInput = {
  carbsGrams: 55,
  mealGi: 0.62,
  baselineGlucose: 94,
  activityLevel: 0.25,
  durationMinutes: 120,
};

function assertFiniteSeries(result) {
  assert.ok(result.points.length > 0, 'series should not be empty');
  for (const [index, point] of result.points.entries()) {
    assert.ok(Number.isFinite(point.minute), 'minute should be finite');
    assert.ok(Number.isFinite(point.glucose), 'glucose value should be finite');
    if (index > 0) {
      assert.ok(point.minute > result.points[index - 1].minute, 'minutes should increase');
    }
  }
  assert.ok(Number.isFinite(result.peakGlucose));
  assert.ok(Number.isFinite(result.peakMinute));
  assert.ok(Number.isFinite(result.endGlucose));
}

test('returns an ordered, finite demo series at five-minute intervals', () => {
  const result = runIllustrativeMealSimulationCore(standardInput);

  assert.equal(result.points[0].minute, 0);
  assert.equal(result.points[0].glucose, result.baselineGlucose);
  assert.equal(result.points.at(-1).minute, 120);
  assert.equal(result.points.length, 25);
  assertFiniteSeries(result);
});

test('rounds the time horizon to a five-minute step', () => {
  const result = runIllustrativeMealSimulationCore({
    ...standardInput,
    durationMinutes: 67,
  });

  assert.equal(result.points.at(-1).minute, 65);
  assert.equal(result.points.length, 14);
  assertFiniteSeries(result);
});

test('keeps inputs and duration within the demo function bounds', () => {
  const lower = runIllustrativeMealSimulationCore({
    ...standardInput,
    baselineGlucose: -100,
    carbsGrams: -10,
    mealGi: -3,
    activityLevel: -4,
    durationMinutes: -90,
  });
  assert.equal(lower.baselineGlucose, 50);
  assert.equal(lower.points[0].glucose, 50);
  assert.equal(lower.points.at(-1).minute, 30);
  assertFiniteSeries(lower);

  const upper = runIllustrativeMealSimulationCore({
    ...standardInput,
    baselineGlucose: 999,
    carbsGrams: 1000,
    mealGi: 7,
    activityLevel: 4,
    durationMinutes: 900,
  });
  assert.equal(upper.baselineGlucose, 250);
  assert.equal(upper.points[0].glucose, 250);
  assert.equal(upper.points.at(-1).minute, 240);
  assertFiniteSeries(upper);
});

test('uses safe fallbacks for non-finite input values', () => {
  const result = runIllustrativeMealSimulationCore({
    ...standardInput,
    baselineGlucose: Number.NaN,
    carbsGrams: Number.NaN,
    mealGi: Number.NaN,
    activityLevel: Number.NaN,
    durationMinutes: Number.NaN,
  });

  assert.equal(result.baselineGlucose, 94);
  assert.equal(result.points.at(-1).minute, 120);
  assertFiniteSeries(result);
});

test('is deterministic for identical demo inputs', () => {
  assert.deepEqual(
    runIllustrativeMealSimulationCore(standardInput),
    runIllustrativeMealSimulationCore(standardInput),
  );
});

test('always labels this curve as an unvalidated placeholder', () => {
  const result = runIllustrativeMealSimulationCore(standardInput);
  assert.match(result.disclaimer, /Illustrative software placeholder/i);
  assert.match(result.disclaimer, /Not a physiological prediction/i);
  assert.match(result.disclaimer, /not validated/i);
});
