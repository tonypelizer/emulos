/**
 * GameEngine.ts — Orchestrator: the single public entry point to the engine.
 *
 * GameEngine coordinates all subsystems in a fixed, deterministic pipeline
 * for every player action.  It is instantiated once per loaded case and the
 * same instance processes all actions within that session.
 *
 * The engine is a pure function box:
 *
 *   (GameState, choiceId) → GameState
 *
 * The caller (GameService in apps/web) holds the state and passes it in.
 * GameEngine never stores mutable state.
 *
 * Processing pipeline per action:
 *   1. Validate choice is available and not disabled.
 *   2. Record action in history.
 *   3. Apply choice effects (via EffectProcessor).
 *   4. Advance game time (via TimeEngine).
 *   5. Recalculate vitals + check thresholds (via VitalsEngine).
 *   6. Navigate to next node, enter it, apply entry effects (NarrativeGraph).
 *   7. Process pending events (NarrativeGraph).
 *   8. Resolve available choices for the new node (NarrativeGraph).
 *   9. If terminal: compute final score (ScoringEngine).
 */

import { produce } from "immer";
import type {
  GameState,
  IndexedCaseDocument,
  SessionOptions,
  ScoreReport,
  ValidationResult,
  FreeActionRequest,
  HintResult,
} from "@emulos/types";
import { EngineError } from "@emulos/types";
import { loadCase, validateCase } from "./CaseLoader.js";
import {
  createInitialState,
  serializeState,
  deserializeState,
} from "./SessionManager.js";
import { applyEffects } from "./systems/EffectProcessor.js";
import { advanceTime } from "./systems/TimeEngine.js";
import { recalculateVitals } from "./systems/VitalsEngine.js";
import { enterNode, resolveChoices } from "./systems/NarrativeGraph.js";
import { evaluateOptionalCondition } from "./systems/RuleEngine.js";
import {
  computeFinalScore,
  buildScoreReport,
} from "./systems/ScoringEngine.js";
import { generateId } from "./utils/id.js";

// ─── GameEngine ───────────────────────────────────────────────────────────────

export class GameEngine {
  private constructor(private readonly caseDoc: IndexedCaseDocument) {}

  // ── Factory methods ─────────────────────────────────────────────────────────

  /**
   * Creates a GameEngine from pre-loaded raw JSON objects.
   * This is the primary constructor — all five JSON sources must be provided.
   * rawMedications and rawProcedures default to empty objects for back-compat.
   *
   * @param rawCase - Parsed content from a case JSON file.
   * @param rawConditions - Parsed content from conditions-registry.json.
   * @param rawTests - Parsed content from tests-registry.json.
   * @param rawMedications - Parsed content from medications-registry.json.
   * @param rawProcedures - Parsed content from procedures-registry.json.
   */
  static fromRawJson(
    rawCase: unknown,
    rawConditions: unknown,
    rawTests: unknown,
    rawMedications: unknown = {},
    rawProcedures: unknown = {},
  ): GameEngine {
    const caseDoc = loadCase(
      rawCase,
      rawConditions,
      rawTests,
      rawMedications,
      rawProcedures,
    );
    return new GameEngine(caseDoc);
  }

  /**
   * Creates a GameEngine from an already-validated IndexedCaseDocument.
   * Use this when you want to construct the document yourself (e.g., tests).
   */
  static fromIndexedDoc(caseDoc: IndexedCaseDocument): GameEngine {
    return new GameEngine(caseDoc);
  }

  // ── Session lifecycle ───────────────────────────────────────────────────────

  /**
   * Creates a new session and returns the initial GameState with the start
   * node already entered (narrative log populated, choices resolved).
   */
  createSession(options: SessionOptions = {}): GameState {
    const initialState = createInitialState(this.caseDoc, options);
    // Enter the start node — this populates narrativeLog and activeChoices.
    const stateWithPhase = produce(initialState, (draft) => {
      draft.session.phase = "active";
    });
    return enterNode(stateWithPhase, "start", this.caseDoc);
  }

  // ── Core action processing ──────────────────────────────────────────────────

  /**
   * Processes a player choice and returns the resulting GameState.
   *
   * This is the heart of the engine.  The returned state reflects:
   *   - all effects from the choice
   *   - time advancement
   *   - updated vitals
   *   - the new current node with its narrative
   *   - resolved available choices
   *   - final score if the new node is an outcome node
   *
   * @throws EngineError (CHOICE_NOT_AVAILABLE) if the choice is invalid.
   * @throws EngineError (NODE_NOT_FOUND) if a node reference is broken.
   */
  processAction(state: GameState, choiceId: string): GameState {
    // ── Validate ──────────────────────────────────────────────────────────────
    this.assertNotTerminal(state);

    const activeChoice = state.progress.activeChoices.find(
      (c) => c.id === choiceId,
    );
    if (!activeChoice) {
      throw new EngineError(
        `Choice "${choiceId}" is not in the current active choices.`,
        "CHOICE_NOT_AVAILABLE",
      );
    }
    if (activeChoice.disabled) {
      throw new EngineError(
        `Choice "${choiceId}" is present but disabled.`,
        "CHOICE_NOT_AVAILABLE",
      );
    }

    // Look up the full choice definition from the current node.
    const currentNode = this.caseDoc.nodesById.get(
      state.progress.currentNodeId,
    );
    if (!currentNode) {
      throw new EngineError(
        `Current node "${state.progress.currentNodeId}" not found.`,
        "NODE_NOT_FOUND",
      );
    }

    const choice = currentNode.choices.find((c) => c.id === choiceId);
    if (!choice) {
      throw new EngineError(
        `Choice "${choiceId}" not found in node "${currentNode.id}".`,
        "NODE_NOT_FOUND",
      );
    }

    // ── Pipeline ───────────────────────────────────────────────────────────────

    // 1. Record this action in history (before effects mutate state).
    let next = produce(state, (draft) => {
      draft.player.actionHistory.push({
        choiceId: choice.id,
        nodeId: currentNode.id,
        gameTime: draft.session.gameTime,
      });
    });

    // 2. Apply choice-level effects (score events, conditions, knowledge, etc.).
    if (choice.effects.length > 0) {
      next = applyEffects(next, choice.effects, this.caseDoc);
    }

    // 3. Advance game time by the choice's time cost.
    next = advanceTime(next, choice.timeCost);

    // 4. Recalculate vitals based on active conditions + new game time.
    //    Also detects threshold events and queues them.
    next = recalculateVitals(next, this.caseDoc);

    // 4a. Deliver any test results whose defaultResultTime has now elapsed.
    next = this.applyPendingTestResults(next);

    // 5. Enter the next node (applies entry effects, updates narrative log,
    //    processes pending events, resolves choices).
    next = enterNode(next, choice.nextNodeId, this.caseDoc);

    // 6. If the new node is an outcome node, compute the final score.
    //    Force-apply any remaining pending test results first so their
    //    scoring effects are captured before the final score is computed.
    const newNode = this.caseDoc.nodesById.get(next.progress.currentNodeId);
    if (newNode?.type === "outcome" || next.session.phase === "terminal") {
      next = this.applyPendingTestResults(next, true);
      if (next.session.phase !== "terminal") {
        next = produce(next, (draft) => {
          draft.session.phase = "terminal";
        });
      }
      next = computeFinalScore(next, this.caseDoc);
    }

    return next;
  }

  // ── Free-action pipeline ────────────────────────────────────────────────────

  /**
   * Handles a player-initiated free action from the categorized menus (Tests,
   * Medications, Procedures).  Unlike processAction, a free action does NOT
   * navigate the narrative node — it mutates state in place and re-resolves
   * the current node's choices.
   *
   * Free actions are idempotent: ordering the same test or dispensing the same
   * medication a second time returns the original state unchanged.
   *
   * @throws EngineError (INVALID_STATE) if the itemId is not in the registry.
   */
  performFreeAction(state: GameState, request: FreeActionRequest): GameState {
    this.assertNotTerminal(state);

    let next: GameState = state;

    switch (request.type) {
      case "order_test": {
        const testDef = this.caseDoc.testsById.get(request.itemId);
        if (!testDef) {
          throw new EngineError(
            `Test "${request.itemId}" not found in registry.`,
            "INVALID_STATE",
          );
        }
        const alreadyOrdered = state.player.orderedTests.some(
          (t) => t.testId === request.itemId,
        );
        if (alreadyOrdered) return state;

        // Apply the order_test effect (records the test as pending, no result yet).
        next = applyEffects(
          state,
          [{ type: "order_test", testId: request.itemId }],
          this.caseDoc,
        );
        // Determine whether this test's case effects include a result_test.
        // If so, results are deferred: they fire via applyPendingTestResults()
        // once defaultResultTime of game time has elapsed through other actions.
        // Effects without result_test (e.g., blood cultures collection feedback)
        // fire immediately since they represent the collection act itself.
        const caseTestEffects =
          this.caseDoc.caseData.freeActionEffects?.tests?.[request.itemId] ??
          [];
        const isDeferred = caseTestEffects.some(
          (e) => e.type === "result_test",
        );
        if (isDeferred) {
          // Show a pending message — results arrive automatically when enough
          // game time has elapsed via medication/procedure actions.
          next = produce(next, (draft) => {
            draft.progress.narrativeLog.push({
              id: generateId(),
              gameTime: draft.session.gameTime,
              type: "system",
              text: `🧪 ${testDef.name} ordered — results expected in ~${testDef.defaultResultTime} min of game time.`,
              isNew: true,
            });
          });
        } else if (caseTestEffects.length > 0) {
          // Immediate: fire collection/confirmation effects now (e.g., blood cultures).
          next = applyEffects(next, caseTestEffects, this.caseDoc);
        } else {
          // No case effects — generic pending message; auto-result fires later.
          next = produce(next, (draft) => {
            draft.progress.narrativeLog.push({
              id: generateId(),
              gameTime: draft.session.gameTime,
              type: "system",
              text: `🧪 ${testDef.name} ordered — results expected in ~${testDef.defaultResultTime} min of game time.`,
              isNew: true,
            });
          });
        }
        // Re-resolve choices: new knowledge from effects may unlock conditions.
        next = resolveChoices(next, next.progress.currentNodeId, this.caseDoc);
        break;
      }

      case "dispense_medication": {
        const medDef = this.caseDoc.medicationsById.get(request.itemId);
        if (!medDef) {
          throw new EngineError(
            `Medication "${request.itemId}" not found in registry.`,
            "INVALID_STATE",
          );
        }
        const alreadyGiven = state.player.dispensedMedications.some(
          (m) => m.medicationId === request.itemId,
        );
        if (alreadyGiven) return state;

        // Apply the dispense_medication effect plus all defaultEffects from registry.
        next = applyEffects(
          state,
          [
            { type: "dispense_medication", medicationId: request.itemId },
            ...medDef.defaultEffects,
          ],
          this.caseDoc,
        );
        // Advance time by the medication's administration cost.
        next = advanceTime(next, medDef.timeCost);
        // Recalculate vitals — vital-adjusting defaultEffects + time change.
        next = recalculateVitals(next, this.caseDoc);
        // Deliver any test results whose defaultResultTime has now elapsed.
        next = this.applyPendingTestResults(next);
        // Append a narrative confirmation.
        next = produce(next, (draft) => {
          draft.progress.narrativeLog.push({
            id: generateId(),
            gameTime: draft.session.gameTime,
            type: "system",
            text: `💊 ${medDef.name} ${medDef.dosageLabel} administered.`,
            isNew: true,
          });
        });
        // Re-resolve choices: new knowledge (e.g. med-aspirin-given) may satisfy
        // conditions on the current node's choices.
        next = resolveChoices(next, next.progress.currentNodeId, this.caseDoc);
        break;
      }

      case "perform_procedure": {
        const procDef = this.caseDoc.proceduresById.get(request.itemId);
        if (!procDef) {
          throw new EngineError(
            `Procedure "${request.itemId}" not found in registry.`,
            "INVALID_STATE",
          );
        }
        const alreadyDone = state.player.performedProcedures.some(
          (p) => p.procedureId === request.itemId,
        );
        if (alreadyDone) return state;

        // Apply the perform_procedure effect plus all defaultEffects.
        next = applyEffects(
          state,
          [
            { type: "perform_procedure", procedureId: request.itemId },
            ...procDef.defaultEffects,
          ],
          this.caseDoc,
        );
        // Advance time by the procedure's time cost.
        next = advanceTime(next, procDef.timeCost);
        // Recalculate vitals.
        next = recalculateVitals(next, this.caseDoc);
        // Deliver any test results whose defaultResultTime has now elapsed.
        next = this.applyPendingTestResults(next);
        // Append a narrative confirmation.
        next = produce(next, (draft) => {
          draft.progress.narrativeLog.push({
            id: generateId(),
            gameTime: draft.session.gameTime,
            type: "system",
            text: `🩺 ${procDef.name} performed.`,
            isNew: true,
          });
        });
        // Re-resolve choices.
        next = resolveChoices(next, next.progress.currentNodeId, this.caseDoc);
        break;
      }

      default: {
        const exhaustive: never = request.type;
        throw new EngineError(
          `Unknown free action type: ${String(exhaustive)}`,
          "INVALID_STATE",
        );
      }
    }

    // Apply case-level free-action effects for medications and procedures.
    // Test effects are handled in the order_test branch above — either fired
    // immediately (no result_test) or deferred via applyPendingTestResults.
    if (request.type !== "order_test") {
      const freeActionEffects = this.caseDoc.caseData.freeActionEffects;
      if (freeActionEffects) {
        const category =
          request.type === "dispense_medication" ? "medications" : "procedures";
        const effects = freeActionEffects[category]?.[request.itemId];
        if (effects && effects.length > 0) {
          next = applyEffects(next, effects, this.caseDoc);
          next = resolveChoices(
            next,
            next.progress.currentNodeId,
            this.caseDoc,
          );
        }
      }
    }

    // Check whether the case's endCondition is now satisfied.
    // Force-apply any remaining pending test results before computing score so
    // their scoring effects are captured even if the case ended before the
    // test's defaultResultTime elapsed.
    const endCondition = this.caseDoc.caseData.endCondition;
    if (
      endCondition !== undefined &&
      evaluateOptionalCondition(endCondition, next)
    ) {
      next = this.applyPendingTestResults(next, true);
      next = produce(next, (draft) => {
        draft.session.phase = "terminal";
      });
      next = computeFinalScore(next, this.caseDoc);
    }

    return next;
  }

  // ── Deferred test result delivery ────────────────────────────────────────────

  /**
   * Checks all ordered-but-not-resulted tests and fires their case-level
   * effects (or a generic result) for any test whose `defaultResultTime` has
   * now elapsed.
   *
   * Called after every `advanceTime` in both `performFreeAction` and
   * `processAction`.
   *
   * @param forceAll - When true, fires ALL pending tests regardless of
   *   defaultResultTime.  Used at case termination to capture scoring effects
   *   from tests that were ordered but had not yet resulted when the case ended.
   */
  private applyPendingTestResults(
    state: GameState,
    forceAll = false,
  ): GameState {
    const freeActionEffects = this.caseDoc.caseData.freeActionEffects;
    let next = state;
    let anyResulted = false;

    for (const orderedTest of state.player.orderedTests) {
      if (orderedTest.resultedAt !== null) continue;

      const testDef = this.caseDoc.testsById.get(orderedTest.testId);
      if (!testDef) continue;

      const readyAt = orderedTest.orderedAt + testDef.defaultResultTime;
      if (!forceAll && next.session.gameTime < readyAt) continue;

      const caseEffects = freeActionEffects?.tests?.[orderedTest.testId];
      if (caseEffects && caseEffects.length > 0) {
        next = applyEffects(next, caseEffects, this.caseDoc);
      } else {
        // No case effects — apply generic result_test + a system log entry.
        next = applyEffects(
          next,
          [{ type: "result_test", testId: orderedTest.testId }],
          this.caseDoc,
        );
        next = produce(next, (draft) => {
          draft.progress.narrativeLog.push({
            id: generateId(),
            gameTime: draft.session.gameTime,
            type: "result",
            text: `📋 ${testDef.name} — results available.`,
            isNew: true,
          });
        });
      }
      anyResulted = true;
    }

    if (anyResulted) {
      next = resolveChoices(next, next.progress.currentNodeId, this.caseDoc);
    }

    return next;
  }

  // ── Hint system ─────────────────────────────────────────────────────────────

  /**
   * Returns true if the current node has any hint text that would be returned
   * by useHint() — used by the UI to disable the hint button on nodes with no
   * authored guidance rather than silently doing nothing when clicked.
   */
  hasHint(state: GameState): boolean {
    const nodeId = state.progress.currentNodeId;
    const node = this.caseDoc.nodesById.get(nodeId);
    if (!node) return false;
    if (node.hint) return true;
    if (node.conditionalHints) {
      for (const ch of node.conditionalHints) {
        if (evaluateOptionalCondition(ch.condition, state)) return true;
      }
    }
    return false;
  }

  /**
   * Reveals the Attending Physician hint for the current narrative node.
   *
   * - If the node has no `hint` field, returns `{ hint: null }` — UI hides the button.
   * - If this node was already hinted this session, returns the text with `alreadyUsed: true`
   *   and does NOT re-apply the score penalty.
   * - Otherwise applies a −10 score event and records the nodeId in `hintsUsedAtNodes`.
   */
  useHint(state: GameState): { newState: GameState; result: HintResult } {
    this.assertNotTerminal(state);

    const nodeId = state.progress.currentNodeId;
    const node = this.caseDoc.nodesById.get(nodeId);

    // Resolve the hint text: check conditionalHints first (first match wins),
    // then fall back to the plain hint field.
    let hintText: string | null = null;
    if (node?.conditionalHints) {
      for (const ch of node.conditionalHints) {
        if (evaluateOptionalCondition(ch.condition, state)) {
          hintText = ch.hint;
          break;
        }
      }
    }
    if (hintText === null) {
      hintText = node?.hint ?? null;
    }

    // No hint authored for this node.
    if (hintText === null) {
      return {
        newState: state,
        result: { hint: null, alreadyUsed: false, penaltyApplied: false },
      };
    }

    // Hint already used at this node — return text without penalty.
    if (state.player.hintsUsedAtNodes.includes(nodeId)) {
      return {
        newState: state,
        result: { hint: hintText, alreadyUsed: true, penaltyApplied: false },
      };
    }

    // First use: apply penalty + record node.
    let next = applyEffects(
      state,
      [
        {
          type: "add_score_event",
          actionId: `hint-used-${nodeId}`,
          points: -10,
          reason: "Attending Physician hint requested",
          category: "penalty",
        },
      ],
      this.caseDoc,
    );
    next = produce(next, (draft) => {
      draft.player.hintsUsedAtNodes.push(nodeId);
    });

    return {
      newState: next,
      result: { hint: hintText, alreadyUsed: false, penaltyApplied: true },
    };
  }

  // ── Query methods ───────────────────────────────────────────────────────────

  /** Returns true if the session has reached a terminal state. */
  isTerminal(state: GameState): boolean {
    return (
      state.session.phase === "terminal" || state.session.phase === "complete"
    );
  }

  /**
   * Returns the score report for a terminal session.
   * Returns null if the session is not yet terminal.
   */
  getScoreReport(state: GameState): ScoreReport | null {
    if (!this.isTerminal(state)) return null;
    return buildScoreReport(state, this.caseDoc);
  }
  /**
   * Returns the IndexedCaseDocument for this engine instance.
   * Used by GameService to expose catalog data (tests, meds, procedures) to the UI.
   */
  getCaseDoc(): IndexedCaseDocument {
    return this.caseDoc;
  }
  // ── Serialization ───────────────────────────────────────────────────────────

  /** Serializes the session state to a JSON string for persistence. */
  serializeState(state: GameState): string {
    return serializeState(state);
  }

  /**
   * Deserializes a JSON string back to a GameState.
   * The case must be the same as when the state was serialized.
   */
  deserializeState(serialized: string): GameState {
    return deserializeState(serialized);
  }

  // ── Static utilities ────────────────────────────────────────────────────────

  /**
   * Validates a case JSON without creating a full engine instance.
   * Useful for CI tooling and the content authoring pipeline.
   */
  static validateCase(
    rawCase: unknown,
    rawConditions: unknown,
    rawTests: unknown,
    rawMedications: unknown = {},
    rawProcedures: unknown = {},
  ): ValidationResult {
    return validateCase(
      rawCase,
      rawConditions,
      rawTests,
      rawMedications,
      rawProcedures,
    );
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private assertNotTerminal(state: GameState): void {
    if (this.isTerminal(state)) {
      throw new EngineError(
        `Cannot process actions on a terminal session (phase: ${state.session.phase}).`,
        "INVALID_STATE",
      );
    }
  }
}
