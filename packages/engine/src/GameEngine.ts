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
import { enterNode } from "./systems/NarrativeGraph.js";
import {
  computeFinalScore,
  buildScoreReport,
} from "./systems/ScoringEngine.js";

// ─── GameEngine ───────────────────────────────────────────────────────────────

export class GameEngine {
  private constructor(private readonly caseDoc: IndexedCaseDocument) {}

  // ── Factory methods ─────────────────────────────────────────────────────────

  /**
   * Creates a GameEngine from pre-loaded raw JSON objects.
   * This is the primary constructor — all three JSON sources must be provided.
   *
   * @param rawCase - Parsed content from a case JSON file.
   * @param rawConditions - Parsed content from conditions-registry.json.
   * @param rawTests - Parsed content from tests-registry.json.
   */
  static fromRawJson(
    rawCase: unknown,
    rawConditions: unknown,
    rawTests: unknown,
  ): GameEngine {
    const caseDoc = loadCase(rawCase, rawConditions, rawTests);
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

    // 5. Enter the next node (applies entry effects, updates narrative log,
    //    processes pending events, resolves choices).
    next = enterNode(next, choice.nextNodeId, this.caseDoc);

    // 6. If the new node is an outcome node, compute the final score.
    const newNode = this.caseDoc.nodesById.get(next.progress.currentNodeId);
    if (newNode?.type === "outcome" || next.session.phase === "terminal") {
      if (next.session.phase !== "terminal") {
        next = produce(next, (draft) => {
          draft.session.phase = "terminal";
        });
      }
      next = computeFinalScore(next, this.caseDoc);
    }

    return next;
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
  ): ValidationResult {
    return validateCase(rawCase, rawConditions, rawTests);
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
