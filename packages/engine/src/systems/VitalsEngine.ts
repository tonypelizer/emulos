/**
 * VitalsEngine.ts — Patient vital sign dynamics.
 *
 * Recomputes patient vitals after each time advancement based on active
 * conditions and their progression tables.  Also detects when vital thresholds
 * are crossed and queues event nodes accordingly.
 *
 * Design:
 *   - Vitals are computed from the patient's BASELINE vitals (not current).
 *     Baseline never changes.  Each active condition contributes a DELTA.
 *   - Multiple conditions affecting the same vital use additive deltas.
 *   - Linear interpolation between defined progression points.
 *   - Threshold detection happens AFTER vitals are recalculated.
 *
 * "This is not real-time.  Vitals only update when time advances."
 */

import { produce } from "immer";
import type {
  GameState,
  PatientVitals,
  IndexedCaseDocument,
} from "@emulos/types";
import type { ConditionDefinition } from "@emulos/types";

// ─── Vital recalculation ──────────────────────────────────────────────────────

/**
 * Recomputes all patient vitals from baseline + condition progressions,
 * then checks for threshold-crossing events.
 * Returns a new GameState with updated vitals and any newly queued events.
 */
export function recalculateVitals(
  state: GameState,
  caseDoc: IndexedCaseDocument
): GameState {
  const updatedVitals = computeVitals(state, caseDoc);
  let nextState = produce(state, (draft) => {
    draft.patient.vitals = updatedVitals;
  });
  nextState = checkThresholds(nextState, caseDoc, state.patient.vitals);
  return nextState;
}

/**
 * Computes the new PatientVitals by starting from baseline and applying
 * additive deltas from all active conditions.
 */
function computeVitals(
  state: GameState,
  caseDoc: IndexedCaseDocument
): PatientVitals {
  // Start from the immutable baseline.
  const baseline = state.patient.baselineVitals;

  // Collect deltas per vital from every active condition.
  const deltas: Partial<Record<NumericVital, number>> = {};

  for (const conditionInstance of state.patient.conditions.active) {
    const def = caseDoc.conditionsById.get(conditionInstance.conditionId);
    if (!def?.vitalProgression) continue;

    const elapsed = state.session.gameTime - conditionInstance.onsetGameTime;

    for (const [vital, points] of Object.entries(def.vitalProgression)) {
      if (!isNumericVital(vital)) continue;
      // Progression values are deltas from baseline — apply directly.
      const delta = interpolate(points, elapsed);
      deltas[vital] = (deltas[vital] ?? 0) + delta;
    }
  }

  // Apply accumulated deltas to baseline.
  return {
    ...baseline,
    heartRate: Math.max(
      0,
      baseline.heartRate + (deltas.heartRate ?? 0)
    ),
    respiratoryRate: Math.max(
      0,
      baseline.respiratoryRate + (deltas.respiratoryRate ?? 0)
    ),
    temperature: baseline.temperature + (deltas.temperature ?? 0),
    oxygenSaturation: clamp(
      baseline.oxygenSaturation + (deltas.oxygenSaturation ?? 0),
      0,
      100
    ),
    painScore: clamp(
      baseline.painScore + (deltas.painScore ?? 0),
      0,
      10
    ),
  };
}

// ─── Threshold detection ──────────────────────────────────────────────────────

/**
 * After vitals are updated, check whether any condition's threshold events
 * have been crossed (comparing new vitals against previous vitals).
 * Queues event nodes for any crossings detected.
 */
function checkThresholds(
  state: GameState,
  caseDoc: IndexedCaseDocument,
  previousVitals: PatientVitals
): GameState {
  const newEvents: Array<{ eventNodeId: string; triggerAt: number }> = [];

  for (const conditionInstance of state.patient.conditions.active) {
    const def = caseDoc.conditionsById.get(conditionInstance.conditionId);
    if (!def?.thresholdEvents) continue;

    for (const threshold of def.thresholdEvents) {
      if (!isNumericVital(threshold.vital)) continue;

      const newValue = state.patient.vitals[threshold.vital];
      const oldValue = previousVitals[threshold.vital];

      // Only fire when crossing INTO the threshold (not already there).
      const wasTriggered = evaluateThreshold(
        threshold.operator,
        oldValue,
        threshold.value
      );
      const isTriggered = evaluateThreshold(
        threshold.operator,
        newValue,
        threshold.value
      );

      if (isTriggered && !wasTriggered) {
        // Check the event isn't already queued.
        const alreadyQueued = state.progress.pendingEvents.some(
          (e) => e.eventNodeId === threshold.eventNodeId
        );
        if (!alreadyQueued) {
          newEvents.push({
            eventNodeId: threshold.eventNodeId,
            triggerAt: state.session.gameTime,
          });
        }
      }
    }
  }

  if (newEvents.length === 0) return state;

  return produce(state, (draft) => {
    draft.progress.pendingEvents.push(...newEvents);
  });
}

function evaluateThreshold(
  operator: "lte" | "gte" | "lt" | "gt" | "eq",
  value: number,
  threshold: number
): boolean {
  switch (operator) {
    case "lte": return value <= threshold;
    case "gte": return value >= threshold;
    case "lt":  return value < threshold;
    case "gt":  return value > threshold;
    case "eq":  return value === threshold;
    default:    return false;
  }
}

// ─── Interpolation ────────────────────────────────────────────────────────────

/**
 * Linearly interpolates between { atMinute, value } points for a given
 * elapsed time.  Clamps to the first/last defined value outside the range.
 */
export function interpolate(
  points: Array<{ atMinute: number; value: number }>,
  elapsed: number
): number {
  if (points.length === 0) return 0;

  const sorted = [...points].sort((a, b) => a.atMinute - b.atMinute);

  // Before the first point: clamp to first value.
  if (elapsed <= (sorted[0]?.atMinute ?? 0)) return sorted[0]?.value ?? 0;

  // After the last point: clamp to last value.
  const last = sorted[sorted.length - 1];
  if (!last || elapsed >= last.atMinute) return last?.value ?? 0;

  // Find the surrounding pair and interpolate.
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    if (!from || !to) continue;
    if (elapsed >= from.atMinute && elapsed <= to.atMinute) {
      const t = (elapsed - from.atMinute) / (to.atMinute - from.atMinute);
      return from.value + t * (to.value - from.value);
    }
  }

  return last?.value ?? 0;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type NumericVital =
  | "heartRate"
  | "respiratoryRate"
  | "temperature"
  | "oxygenSaturation"
  | "painScore";

const NUMERIC_VITALS = new Set<string>([
  "heartRate",
  "respiratoryRate",
  "temperature",
  "oxygenSaturation",
  "painScore",
]);

function isNumericVital(key: string): key is NumericVital {
  return NUMERIC_VITALS.has(key);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
