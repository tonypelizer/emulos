/**
 * EffectProcessor.ts — Applies Effect declarations to GameState immutably.
 *
 * This is the ONLY place where GameState is mutated.  Every state change in
 * the game — vital updates, knowledge additions, score events — flows through
 * applyEffects().  Immer's produce() ensures the original state is never
 * modified; callers always receive a new object.
 *
 * Invariants:
 *   - Input state is never mutated.
 *   - Each effect type is handled in a single switch branch.
 *   - Effects with a `condition` guard are only applied when that condition
 *     evaluates true against the state at the time of application.
 *   - Effects are applied in list order (important for interdependencies).
 */

import { produce } from "immer";
import type { Effect, IndexedCaseDocument, GameState } from "@emulos/types";
import { evaluateOptionalCondition } from "./RuleEngine.js";
import { generateId } from "../utils/id.js";

/**
 * Applies a list of effects to the state in order, returning the new state.
 * Each effect is applied to the result of the previous one.
 */
export function applyEffects(
  state: GameState,
  effects: readonly Effect[],
  caseDoc: IndexedCaseDocument,
): GameState {
  return effects.reduce<GameState>((current, effect) => {
    // Guard: skip effects whose condition is unmet.
    if (!evaluateOptionalCondition(effect.condition, current)) {
      return current;
    }
    return applySingleEffect(current, effect, caseDoc);
  }, state);
}

// ─── Single effect application ────────────────────────────────────────────────

function applySingleEffect(
  state: GameState,
  effect: Effect,
  caseDoc: IndexedCaseDocument,
): GameState {
  return produce(state, (draft) => {
    switch (effect.type) {
      // ── Vital manipulation ───────────────────────────────────────────────

      case "set_vital": {
        const vitals = draft.patient.vitals as Record<string, unknown>;
        if (effect.vital === "bloodPressure") {
          // Blood pressure is a nested object — expect JSON string "120/80"
          // For a single numeric value use heartRate / etc.
          console.warn(
            "[EffectProcessor] Use set_vital with individual vital keys, not bloodPressure.",
          );
          return;
        }
        vitals[effect.vital] = effect.value;
        break;
      }

      case "adjust_vital": {
        const vitals = draft.patient.vitals as Record<string, unknown>;
        const current = vitals[effect.vital];
        if (typeof current === "number") {
          vitals[effect.vital] = current + effect.delta;
        } else {
          console.warn(
            `[EffectProcessor] Cannot adjust_vital "${effect.vital}": not a number`,
          );
        }
        break;
      }

      // ── Condition management ─────────────────────────────────────────────

      case "reveal_condition": {
        const hiddenIdx = draft.patient.conditions.hidden.findIndex(
          (c) => c.conditionId === effect.conditionId,
        );
        if (hiddenIdx !== -1) {
          const [removed] = draft.patient.conditions.hidden.splice(
            hiddenIdx,
            1,
          );
          if (removed) {
            removed.revealedAt = draft.session.gameTime;
            draft.patient.conditions.active.push(removed);
          }
        } else {
          console.warn(
            `[EffectProcessor] reveal_condition: "${effect.conditionId}" not in hidden list`,
          );
        }
        break;
      }

      case "add_condition": {
        // Idempotent: don't add a condition that is already active.
        const alreadyActive = draft.patient.conditions.active.some(
          (c) => c.conditionId === effect.conditionId,
        );
        if (!alreadyActive) {
          draft.patient.conditions.active.push({
            conditionId: effect.conditionId,
            severity: effect.severity,
            onsetGameTime: draft.session.gameTime,
            revealedAt: draft.session.gameTime,
          });
        }
        break;
      }

      case "resolve_condition": {
        const activeIdx = draft.patient.conditions.active.findIndex(
          (c) => c.conditionId === effect.conditionId,
        );
        if (activeIdx !== -1) {
          const [removed] = draft.patient.conditions.active.splice(
            activeIdx,
            1,
          );
          if (removed) draft.patient.conditions.resolved.push(removed);
        } else {
          // Also check hidden — a condition can be resolved before revealed.
          const hiddenIdx = draft.patient.conditions.hidden.findIndex(
            (c) => c.conditionId === effect.conditionId,
          );
          if (hiddenIdx !== -1) {
            const [removed] = draft.patient.conditions.hidden.splice(
              hiddenIdx,
              1,
            );
            if (removed) draft.patient.conditions.resolved.push(removed);
          }
        }
        break;
      }

      // ── Knowledge ────────────────────────────────────────────────────────

      case "add_knowledge": {
        if (!draft.player.knowledge.includes(effect.knowledgeId)) {
          draft.player.knowledge.push(effect.knowledgeId);
        }
        break;
      }

      // ── History & examination ─────────────────────────────────────────────

      case "add_history_item": {
        if (!draft.patient.collectedHistory.includes(effect.itemId)) {
          draft.patient.collectedHistory.push(effect.itemId);
        }
        break;
      }

      case "add_examination_finding": {
        if (!draft.patient.examinationFindings.includes(effect.findingId)) {
          draft.patient.examinationFindings.push(effect.findingId);
        }
        break;
      }

      // ── Test ordering ─────────────────────────────────────────────────────

      case "order_test": {
        const alreadyOrdered = draft.player.orderedTests.some(
          (t) => t.testId === effect.testId,
        );
        if (!alreadyOrdered) {
          draft.player.orderedTests.push({
            testId: effect.testId,
            orderedAt: draft.session.gameTime,
            resultedAt: null,
            result: null,
          });
        }
        break;
      }

      case "result_test": {
        const test = draft.player.orderedTests.find(
          (t) => t.testId === effect.testId,
        );
        if (test) {
          test.resultedAt = draft.session.gameTime;
          // Use the generic result from the tests registry if available.
          const testDef = caseDoc.testsById.get(effect.testId);
          test.result = testDef?.genericResult ?? {
            summary: "Results available",
            values: {},
            narrative:
              "The test has resulted. See the narrative for interpretation.",
          };
        } else {
          console.warn(
            `[EffectProcessor] result_test: test "${effect.testId}" was not ordered yet`,
          );
        }
        break;
      }

      // ── Time ─────────────────────────────────────────────────────────────

      case "advance_time": {
        draft.session.gameTime += effect.minutes;
        break;
      }

      // ── Scoring ──────────────────────────────────────────────────────────

      case "add_score_event": {
        // Deduplicate: a given actionId is only scored once.
        const alreadyScored = draft.score.events.some(
          (e) => e.actionId === effect.actionId,
        );
        if (!alreadyScored) {
          draft.score.events.push({
            id: generateId(),
            gameTime: draft.session.gameTime,
            actionId: effect.actionId,
            points: effect.points,
            reason: effect.reason,
            category: effect.category,
          });
        }
        break;
      }

      case "apply_score_modifier": {
        const modifierDef = caseDoc.caseData.scoring.modifiers?.find(
          (m) => m.id === effect.modifierId,
        );
        if (modifierDef) {
          // Idempotent: don't apply the same modifier twice.
          const alreadyApplied = draft.score.modifiers.some(
            (m) => m.id === effect.modifierId,
          );
          if (!alreadyApplied) {
            draft.score.modifiers.push({
              id: modifierDef.id,
              description: modifierDef.description,
              type: modifierDef.type,
              value: modifierDef.value,
              appliedAt: draft.session.gameTime,
            });
          }
        } else {
          console.warn(
            `[EffectProcessor] apply_score_modifier: modifier "${effect.modifierId}" not found in scoring definition`,
          );
        }
        break;
      }

      // ── Events ───────────────────────────────────────────────────────────

      case "trigger_event": {
        const triggerAt = draft.session.gameTime + effect.delayMinutes;
        // Idempotent: don't queue the same event twice at the same time.
        const alreadyQueued = draft.progress.pendingEvents.some(
          (e) => e.eventNodeId === effect.eventId && e.triggerAt === triggerAt,
        );
        if (!alreadyQueued) {
          draft.progress.pendingEvents.push({
            eventNodeId: effect.eventId,
            triggerAt,
          });
        }
        break;
      }

      // ── Session phase ─────────────────────────────────────────────────────

      case "set_game_phase": {
        draft.session.phase = effect.phase;
        break;
      }

      // ── Narrative ─────────────────────────────────────────────────────────

      case "append_narrative": {
        draft.progress.narrativeLog.push({
          id: generateId(),
          gameTime: draft.session.gameTime,
          type: effect.narrativeType,
          text: effect.text,
          isNew: true,
        });
        break;
      }

      // ── Free-action tracking (handled by GameEngine.performFreeAction) ───
      // These effect types are applied via applyEffects in the free-action
      // pipeline.  They are defined here so the exhaustive check remains valid.

      case "dispense_medication": {
        const alreadyDispensed = draft.player.dispensedMedications.some(
          (m) => m.medicationId === effect.medicationId,
        );
        if (!alreadyDispensed) {
          draft.player.dispensedMedications.push({
            medicationId: effect.medicationId,
            dispensedAt: draft.session.gameTime,
          });
        }
        break;
      }

      case "perform_procedure": {
        const alreadyPerformed = draft.player.performedProcedures.some(
          (p) => p.procedureId === effect.procedureId,
        );
        if (!alreadyPerformed) {
          draft.player.performedProcedures.push({
            procedureId: effect.procedureId,
            performedAt: draft.session.gameTime,
          });
        }
        break;
      }

      // ── Exhaustive safety ─────────────────────────────────────────────────

      default: {
        const exhaustiveCheck: never = effect;
        console.error(
          `[EffectProcessor] Unhandled effect type: ${(exhaustiveCheck as Effect).type}`,
        );
      }
    }
  });
}
