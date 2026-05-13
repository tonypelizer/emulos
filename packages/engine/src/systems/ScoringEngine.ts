/**
 * ScoringEngine.ts — Score calculation and final score report generation.
 *
 * Score events are recorded incrementally throughout a session via the
 * add_score_event effect (handled in EffectProcessor).  The ScoringEngine
 * is responsible for:
 *
 *   1. Computing the final ComputedScore when the session reaches 'terminal'.
 *   2. Building the ScoreReport for the results screen.
 *   3. Identifying which critical actions were hit vs. missed.
 *
 * Score pipeline (applied in order):
 *   raw points → time bonuses → modifiers → clamp → grade
 */

import { produce } from "immer";
import type {
  GameState,
  ComputedScore,
  Grade,
  ScoreReport,
  IndexedCaseDocument,
} from "@emulos/types";

// ─── Final score computation ──────────────────────────────────────────────────

/**
 * Computes the final ComputedScore and embeds it into the returned GameState.
 * Should be called exactly once, when the session phase transitions to 'terminal'.
 */
export function computeFinalScore(
  state: GameState,
  caseDoc: IndexedCaseDocument,
): GameState {
  const computed = calculateScore(state, caseDoc);
  return produce(state, (draft) => {
    // Cast through unknown: Immer's WritableDraft doesn't handle `readonly` arrays
    // on deeply-nested types, but the value itself is structurally compatible.
    draft.score.computed = computed as unknown as typeof draft.score.computed;
  });
}

/**
 * Builds a ScoreReport from the current state for display on the results screen.
 * Can be called on a terminal state after computeFinalScore.
 */
export function buildScoreReport(
  state: GameState,
  caseDoc: IndexedCaseDocument,
): ScoreReport {
  const score = state.score.computed ?? calculateScore(state, caseDoc);

  return {
    score,
    breakdown: state.score.events.map((e) => ({
      gameTime: e.gameTime,
      points: e.points,
      reason: e.reason,
      category: e.category,
    })),
    modifiersApplied: state.score.modifiers.map((m) => ({
      description: m.description,
      type: m.type,
      value: m.value,
    })),
  };
}

// ─── Core calculation ─────────────────────────────────────────────────────────

function calculateScore(
  state: GameState,
  caseDoc: IndexedCaseDocument,
): ComputedScore {
  const { scoring } = caseDoc.caseData;

  // 1. Sum all raw score event points.
  const raw = state.score.events.reduce((sum, e) => sum + e.points, 0);

  // 2. Find the best applicable time bonus (only one awarded — the best match).
  //    Time bonuses are thresholds: if game-time <= threshold, bonus applies.
  //    Sort ascending so the smallest (tightest) qualifying threshold wins first.
  const sortedBonuses = [...(scoring.timeBonuses ?? [])].sort(
    (a, b) => a.gameTimeThreshold - b.gameTimeThreshold,
  );
  let timeBonusEarned = 0;
  for (const tb of sortedBonuses) {
    if (state.session.gameTime <= tb.gameTimeThreshold) {
      timeBonusEarned = tb.bonus;
      break;
    }
  }

  const withBonus = raw + timeBonusEarned;

  // 3. Apply score modifiers in the order they were applied.
  let afterModifiers = withBonus;
  for (const modifier of state.score.modifiers) {
    if (modifier.type === "multiplier") {
      afterModifiers *= modifier.value;
    } else {
      // flat-delta
      afterModifiers += modifier.value;
    }
  }

  // 4. Clamp to [0, maxScore] and round.
  const final = Math.max(
    0,
    Math.min(scoring.maxScore, Math.round(afterModifiers)),
  );

  // 5. Derive percentage and grade.
  const percentage =
    scoring.maxScore > 0 ? Math.round((final / scoring.maxScore) * 100) : 0;
  const grade = deriveGrade(final, scoring.gradeThresholds);
  const passed = final >= scoring.passingScore;

  // 6. Identify critical actions hit and missed.
  const hitActionIds = new Set(state.score.events.map((e) => e.actionId));
  const criticalActionsHit = scoring.criticalActions
    .filter((ca) => hitActionIds.has(ca.actionId))
    .map((ca) => ca.label);
  const criticalActionsMissed = scoring.criticalActions
    .filter((ca) => !hitActionIds.has(ca.actionId))
    .map((ca) => ca.label);

  return {
    raw,
    afterModifiers: Math.round(afterModifiers),
    final,
    maxPossible: scoring.maxScore,
    percentage,
    grade,
    passed,
    criticalActionsHit,
    criticalActionsMissed,
    timeBonusEarned,
  };
}

// ─── Grade derivation ─────────────────────────────────────────────────────────

function deriveGrade(
  score: number,
  thresholds: { S: number; A: number; B: number; C: number },
): Grade {
  if (score >= thresholds.S) return "S";
  if (score >= thresholds.A) return "A";
  if (score >= thresholds.B) return "B";
  if (score >= thresholds.C) return "C";
  return "F";
}
