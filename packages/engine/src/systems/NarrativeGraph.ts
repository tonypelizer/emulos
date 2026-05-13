/**
 * NarrativeGraph.ts — Node traversal and choice resolution.
 *
 * The NarrativeGraph manages movement through the case's directed node graph.
 * It is responsible for:
 *
 *   1. Entering a node: applying entry effects, appending narrative text.
 *   2. Filtering choices: using the RuleEngine to hide choices whose conditions
 *      are unmet and disable choices that cannot be taken again.
 *   3. Processing pending events: injecting event nodes that fire at the current
 *      game-time before presenting choices to the player.
 *
 * Node entry always produces a fully resolved GameState with activeChoices set
 * and narrativeLog updated.  The UI receives this state and renders it directly.
 */

import { produce } from "immer";
import type {
  GameState,
  ResolvedChoice,
  IndexedCaseDocument,
} from "@emulos/types";
import { applyEffects } from "./EffectProcessor.js";
import { evaluateOptionalCondition } from "./RuleEngine.js";
import { generateId } from "../utils/id.js";
import { EngineError } from "@emulos/types";

// ─── Node entry ───────────────────────────────────────────────────────────────

/**
 * Enters a node: applies entry effects, appends the node's narrative,
 * updates currentNodeId, then resolves available choices.
 *
 * Also processes any pending events that should fire at the current game-time
 * (events are processed AFTER the node is entered so they can react to its
 * effects).
 */
export function enterNode(
  state: GameState,
  nodeId: string,
  caseDoc: IndexedCaseDocument,
): GameState {
  const node = caseDoc.nodesById.get(nodeId);
  if (!node) {
    throw new EngineError(
      `Node "${nodeId}" not found in case "${caseDoc.caseData.id}"`,
      "NODE_NOT_FOUND",
    );
  }

  // Clear the isNew flag on all existing narrative entries.
  let next = clearNewFlags(state);

  // Check first-visit BEFORE updating visitedNodeIds so we can suppress
  // repeated text on hub nodes (e.g. history-hub, investigation-hub) that
  // the player returns to multiple times.
  const isFirstVisit = !next.progress.visitedNodeIds.includes(nodeId);

  // Update navigation state.
  next = produce(next, (draft) => {
    draft.progress.currentNodeId = nodeId;
    if (!draft.progress.visitedNodeIds.includes(nodeId)) {
      draft.progress.visitedNodeIds.push(nodeId);
    }
  });

  // Append the node's narrative text to the log on first visit only.
  // Revisiting a hub node should not repeat its intro text or trigger a popup.
  if (isFirstVisit) {
    next = produce(next, (draft) => {
      draft.progress.narrativeLog.push({
        id: generateId(),
        gameTime: draft.session.gameTime,
        type: nodeTypeToNarrativeType(node.type),
        text: node.text,
        isNew: true,
      });
    });
  }

  // Apply the node's entry effects.
  if (node.effects.length > 0) {
    next = applyEffects(next, node.effects, caseDoc);
  }

  // Process any pending events that fire at or before now.
  next = processPendingEvents(next, caseDoc);

  // Resolve the choices the player can see from the CURRENT node.
  // If pending events changed currentNodeId (e.g., an event node was entered),
  // we must resolve choices from that node, not the original nodeId argument.
  next = resolveChoices(next, next.progress.currentNodeId, caseDoc);

  // Auto-advance: if the current node resolved to exactly one non-disabled
  // choice that has zero time cost and no effects, it's a pure "continue"
  // step — follow it automatically so the player never has to tap a single
  // forced button just to proceed.
  const active = next.progress.activeChoices.filter((c) => !c.disabled);
  if (active.length === 1) {
    const [onlyChoice] = active;
    const currentNode = caseDoc.nodesById.get(next.progress.currentNodeId);
    const rawChoice = currentNode?.choices.find((c) => c.id === onlyChoice!.id);
    if (
      rawChoice &&
      rawChoice.timeCost === 0 &&
      rawChoice.effects.length === 0
    ) {
      return enterNode(next, rawChoice.nextNodeId, caseDoc);
    }
  }

  return next;
}

// ─── Choice resolution ────────────────────────────────────────────────────────

/**
 * Evaluates each choice's condition against the current state.
 * - Choices with failing conditions are hidden (not included).
 * - Choices for already-ordered tests are shown but disabled.
 * Returns state with populated activeChoices.
 */
export function resolveChoices(
  state: GameState,
  nodeId: string,
  caseDoc: IndexedCaseDocument,
): GameState {
  const node = caseDoc.nodesById.get(nodeId);
  if (!node) return state;

  const resolved: ResolvedChoice[] = [];

  for (const choice of node.choices) {
    // Condition: null means always shown; non-null is evaluated.
    if (
      choice.condition !== null &&
      !evaluateOptionalCondition(choice.condition, state)
    ) {
      // Hidden — not shown to player.
      continue;
    }

    // Determine if the choice should be disabled.
    const disabled = isChoiceDisabled(choice.id, state);

    // Determine if the player should see a hint (hint condition met).
    let hint: string | undefined;
    if (
      choice.hint &&
      choice.hintCondition &&
      evaluateOptionalCondition(choice.hintCondition, state)
    ) {
      hint = choice.hint;
    } else if (choice.hint && !choice.hintCondition) {
      hint = choice.hint;
    }

    resolved.push({
      id: choice.id,
      text: choice.text,
      disabled,
      ...(hint !== undefined ? { hint } : {}),
    });
  }

  return produce(state, (draft) => {
    draft.progress.activeChoices = resolved;
  });
}

// ─── Pending event processing ─────────────────────────────────────────────────

/**
 * Fires any pending events whose triggerAt <= current game-time.
 * Events are processed in chronological order and chained sequentially:
 * the state after each event node entry is the input to the next.
 *
 * After all events fire, choices are resolved from the LAST event node
 * (not the original node the player was on).  This means event nodes
 * override the player's choices until resolved.
 */
function processPendingEvents(
  state: GameState,
  caseDoc: IndexedCaseDocument,
): GameState {
  const due = state.progress.pendingEvents
    .filter((e) => e.triggerAt <= state.session.gameTime)
    .sort((a, b) => a.triggerAt - b.triggerAt);

  if (due.length === 0) return state;

  // Remove the due events from the queue.
  let next = produce(state, (draft) => {
    draft.progress.pendingEvents = draft.progress.pendingEvents.filter(
      (e) => e.triggerAt > state.session.gameTime,
    );
  });

  // Enter each event node in order.
  for (const queued of due) {
    next = enterNode(next, queued.eventNodeId, caseDoc);
  }

  return next;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * A choice is disabled if the player has already taken it (it's in history)
 * and the choice leads to a test that's already been ordered.
 * For MVP: choices are disabled if already in action history.
 */
function isChoiceDisabled(choiceId: string, state: GameState): boolean {
  return state.player.actionHistory.some((a) => a.choiceId === choiceId);
}

function clearNewFlags(state: GameState): GameState {
  const hasNew = state.progress.narrativeLog.some((e) => e.isNew);
  if (!hasNew) return state;
  return produce(state, (draft) => {
    for (const entry of draft.progress.narrativeLog) {
      entry.isNew = false;
    }
  });
}

function nodeTypeToNarrativeType(
  nodeType: string,
): "narrative" | "result" | "event" | "system" {
  switch (nodeType) {
    case "result":
      return "result";
    case "event":
      return "event";
    case "presentation":
    case "history":
    case "examination":
    case "investigation":
    case "decision":
    case "outcome":
      return "narrative";
    default:
      return "system";
  }
}
