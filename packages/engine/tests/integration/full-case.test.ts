/**
 * full-case.test.ts — End-to-end integration tests for the chest-pain-001 case.
 *
 * These tests exercise the complete engine pipeline:
 *   GameEngine.fromRawJson() → createSession() → processAction() × N
 *
 * Three distinct clinical paths are tested:
 *   1. Optimal:     immediate ECG → correct STEMI interpretation → aspirin → cath lab → Grade S
 *   2. Suboptimal:  thrombolytics → rescue PCI → Grade C/B
 *   3. Failure:     misread ECG (benign) → catastrophic delay → shock → poor outcome
 *
 * A determinism assertion verifies that given the same seed and the same
 * sequence of choices, the final score is always identical.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { GameEngine } from "../../src/GameEngine.js";
import type { FreeActionRequest } from "@emulos/types";

// JSON imports — Vite resolves these natively in Vitest.
import chestPain001 from "../../../content/cases/general/chest-pain-001.json";
import conditionsRegistry from "../../../content/conditions/conditions-registry.json";
import testsRegistry from "../../../content/tests-catalog/tests-registry.json";

// ─── Engine setup ─────────────────────────────────────────────────────────────

let engine: GameEngine;

beforeAll(() => {
  engine = GameEngine.fromRawJson(
    chestPain001,
    conditionsRegistry,
    testsRegistry,
  );
});

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * A step in a play-through sequence.
 * - A plain string is a narrative choice ID passed to processAction.
 * - An object with `freeAction` invokes performFreeAction (ordering a test,
 *   dispensing a medication, or performing a procedure from the menu).
 */
type Step = string | { freeAction: FreeActionRequest };

/** Replays a sequence of steps from the start, returning the terminal state. */
function playThrough(steps: Step[], seed = "integration-test-seed") {
  let state = engine.createSession({ seed });
  for (const step of steps) {
    if (engine.isTerminal(state)) break;
    if (typeof step === "object" && "freeAction" in step) {
      state = engine.performFreeAction(state, step.freeAction);
    } else {
      state = engine.processAction(state, step);
    }
  }
  return state;
}

// ─── 1. Case loads and starts correctly ──────────────────────────────────────

describe("Integration — session creation", () => {
  it("creates a valid initial session with start node entered", () => {
    const state = engine.createSession();
    expect(state.session.caseId).toBe("chest-pain-001");
    expect(state.session.phase).toBe("active");
    expect(state.progress.currentNodeId).toBe("start");
    expect(state.progress.narrativeLog.length).toBeGreaterThan(0);
    expect(state.progress.activeChoices.length).toBeGreaterThan(0);
  });

  it("initialises patient demographics correctly", () => {
    const state = engine.createSession();
    expect(state.patient.demographics.name).toBe("Malcolm Torres");
    expect(state.patient.demographics.age).toBe(54);
  });

  it("initialises known conditions as active and hidden conditions as hidden", () => {
    const state = engine.createSession();
    const activeIds = state.patient.conditions.active.map((c) => c.conditionId);
    const hiddenIds = state.patient.conditions.hidden.map((c) => c.conditionId);
    expect(activeIds).toContain("hypertension");
    expect(activeIds).toContain("type2-diabetes");
    expect(hiddenIds).toContain("anterior-stemi");
    expect(hiddenIds).toContain("triple-vessel-disease");
  });
});

// ─── 2. Optimal path ─────────────────────────────────────────────────────────

describe("Integration — optimal path (ECG → STEMI recognition → full pre-PCI → cath lab)", () => {
  // 100% score path:
  //   [free action] order 12-lead ECG via the Tests menu
  //   start → ecg-ordered (immediate-ecg, now gated by test_ordered, +100)
  //   ecg-ordered → stemi-confirmed (interpret-stemi-correct +75)
  //   stemi-confirmed → stemi-aspirin-given (give-aspirin +100)
  //   stemi-aspirin-given → stemi-iv-established (asp-iv-access +50)
  //   stemi-iv-established → treatment-decision (iv-proceed-treatment)
  //   treatment-decision → cath-lab-activated (primary-pci +250)
  //   cath-lab-activated → pre-pci-complete (full-pre-pci-regimen +75+50)
  //   pre-pci-complete → outcome-excellent (transfer-to-cath-lab)
  const OPTIMAL_PATH: Step[] = [
    { freeAction: { type: "order_test", itemId: "12-lead-ecg" } }, // Free-action: order ECG
    "immediate-ecg", // start → ecg-ordered (review ECG, gated by test_ordered)
    "interpret-stemi-correct", // ecg-ordered → stemi-confirmed
    "give-aspirin", // stemi-confirmed → stemi-aspirin-given
    "asp-iv-access", // stemi-aspirin-given → stemi-iv-established
    "iv-proceed-treatment", // stemi-iv-established → treatment-decision
    "primary-pci", // treatment-decision → cath-lab-activated
    "full-pre-pci-regimen", // cath-lab-activated → pre-pci-complete
    "transfer-to-cath-lab", // pre-pci-complete → outcome-excellent
  ];

  it("reaches the outcome-excellent node", () => {
    const state = playThrough(OPTIMAL_PATH);
    expect(state.progress.currentNodeId).toBe("outcome-excellent");
  });

  it("is in terminal phase", () => {
    const state = playThrough(OPTIMAL_PATH);
    expect(state.session.phase).toBe("terminal");
  });

  it("records all mandatory critical action score events", () => {
    const state = playThrough(OPTIMAL_PATH);
    const actionIds = state.score.events.map((e) => e.actionId);
    expect(actionIds).toContain("order-ecg");
    expect(actionIds).toContain("ecg-interpretation-correct");
    expect(actionIds).toContain("administer-aspirin");
    expect(actionIds).toContain("activate-cath-lab");
  });

  it("reveals the anterior-stemi condition after correct ECG interpretation", () => {
    const state = playThrough(OPTIMAL_PATH);
    const revealed = state.patient.conditions.active.find(
      (c) => c.conditionId === "anterior-stemi",
    );
    expect(revealed).toBeDefined();
    expect(revealed?.revealedAt).toBeDefined();
  });

  it("acquires STEMI-related knowledge items", () => {
    const state = playThrough(OPTIMAL_PATH);
    expect(state.player.knowledge).toContain("stemi-confirmed-ecg");
  });

  it("produces a passing score of at least 650 raw points", () => {
    const state = playThrough(OPTIMAL_PATH);
    const report = engine.getScoreReport(state)!;
    expect(report).not.toBeNull();
    // 100 (ECG) + 75 (interpretation) + 100 (aspirin) + 50 (IV) + 250 (cath) + 75 (heparin) + 50 (P2Y12) = 700 raw
    expect(report.score.raw).toBeGreaterThanOrEqual(650);
    expect(report.score.passed).toBe(true);
  });

  it("has no missed mandatory critical actions", () => {
    const state = playThrough(OPTIMAL_PATH);
    const report = engine.getScoreReport(state)!;
    // The mandatory actions are: order-ecg, ecg-interpretation-correct, administer-aspirin, activate-cath-lab
    const mandatoryLabels = [
      "12-lead ECG obtained promptly",
      "ECG correctly identified as anterior STEMI",
      "Aspirin 300mg given",
      "Cath lab activated — primary PCI initiated",
    ];
    for (const label of mandatoryLabels) {
      expect(report.score.criticalActionsMissed).not.toContain(label);
    }
  });
});

// ─── 3. Thrombolytics path ────────────────────────────────────────────────────

describe("Integration — suboptimal path (thrombolytics → rescue PCI)", () => {
  const LYTIC_PATH: Step[] = [
    { freeAction: { type: "order_test", itemId: "12-lead-ecg" } }, // Free-action: order ECG
    "immediate-ecg", // start → ecg-ordered
    "interpret-stemi-correct", // ecg-ordered → stemi-confirmed
    "go-to-treatment-decision", // stemi-confirmed → treatment-decision
    "thrombolytics", // treatment-decision → thrombolytics-pathway
    "rescue-pci-after-lytic", // thrombolytics-pathway → outcome-rescue-pci
  ];

  it("reaches the outcome-rescue-pci node", () => {
    const state = playThrough(LYTIC_PATH);
    expect(state.progress.currentNodeId).toBe("outcome-rescue-pci");
  });

  it("is in terminal phase", () => {
    const state = playThrough(LYTIC_PATH);
    expect(state.session.phase).toBe("terminal");
  });

  it("records a penalty for choosing thrombolytics when PCI is available", () => {
    const state = playThrough(LYTIC_PATH);
    const penaltyEvents = state.score.events.filter((e) => e.points < 0);
    expect(penaltyEvents.length).toBeGreaterThan(0);
  });

  it("ECG was ordered (first critical action hit)", () => {
    const state = playThrough(LYTIC_PATH);
    const actionIds = state.score.events.map((e) => e.actionId);
    expect(actionIds).toContain("order-ecg");
  });

  it("final score is lower than the optimal path", () => {
    const optimalState = playThrough([
      { freeAction: { type: "order_test", itemId: "12-lead-ecg" } },
      "immediate-ecg",
      "interpret-stemi-correct",
      "give-aspirin",
      "asp-iv-access",
      "iv-proceed-treatment",
      "primary-pci",
      "full-pre-pci-regimen",
      "transfer-to-cath-lab",
    ]);
    const lyticState = playThrough(LYTIC_PATH);

    const optimalScore = engine.getScoreReport(optimalState)!.score.final;
    const lyticScore = engine.getScoreReport(lyticState)!.score.final;

    expect(lyticScore).toBeLessThan(optimalScore);
  });
});

// ─── 4. Delay / failure path ──────────────────────────────────────────────────

describe("Integration — delay path (ECG misread as benign → catastrophic delay)", () => {
  // Player misreads the ECG as benign repolarisation, triggering catastrophic delay.
  // The vf-arrest-event fires immediately via trigger_event.
  // The player then resuscitates and eventually reaches a terminal shock-pci outcome.
  const DELAY_PATH: Step[] = [
    { freeAction: { type: "order_test", itemId: "12-lead-ecg" } }, // Free-action: order ECG
    "immediate-ecg", // start → ecg-ordered
    "interpret-benign", // ecg-ordered → catastrophic-delay (30 min timeCost) → vf-arrest-event fires immediately (delayMinutes: 0)
    "cpr-and-defib", // vf-arrest-event → resuscitation
    "shock-200j", // resuscitation → rosc-achieved
    "rosc-to-cath", // rosc-achieved → outcome-complicated (TERMINAL)
  ];

  it("reaches a terminal outcome", () => {
    const state = playThrough(DELAY_PATH);
    expect(engine.isTerminal(state)).toBe(true);
  });

  it("accrues large penalty events from the benign misread", () => {
    const state = playThrough(DELAY_PATH);
    const penaltyTotal = state.score.events
      .filter((e) => e.points < 0)
      .reduce((sum, e) => sum + e.points, 0);
    expect(penaltyTotal).toBeLessThan(-200);
  });

  it("game time advances significantly due to the 30-minute delay", () => {
    const state = playThrough(DELAY_PATH);
    expect(state.session.gameTime).toBeGreaterThanOrEqual(30);
  });
});

// ─── 5. Determinism ───────────────────────────────────────────────────────────

describe("Integration — determinism", () => {
  const CHOICES: Step[] = [
    { freeAction: { type: "order_test", itemId: "12-lead-ecg" } },
    "immediate-ecg",
    "interpret-stemi-correct",
    "give-aspirin",
    "asp-iv-access",
    "iv-proceed-treatment",
    "primary-pci",
    "full-pre-pci-regimen",
    "transfer-to-cath-lab",
  ];

  it("same seed + same choices always produce the same final score", () => {
    const seed = "determinism-test-42";
    const run1 = playThrough(CHOICES, seed);
    const run2 = playThrough(CHOICES, seed);
    expect(run1.score.computed?.final).toBeDefined();
    expect(run1.score.computed?.final).toBe(run2.score.computed?.final);
  });

  it("same choices with different seeds still produce the same score (score is deterministic regardless of seed)", () => {
    // Score depends on choices, not on PRNG (PRNG only used for cosmetic variation).
    const run1 = playThrough(CHOICES, "seed-alpha");
    const run2 = playThrough(CHOICES, "seed-beta");
    expect(run1.score.computed?.final).toBe(run2.score.computed?.final);
  });
});

// ─── 6. Error cases ───────────────────────────────────────────────────────────

describe("Integration — error handling", () => {
  it("throws CHOICE_NOT_AVAILABLE when an invalid choice ID is provided", () => {
    const state = engine.createSession();
    expect(() => engine.processAction(state, "nonexistent-choice-id")).toThrow(
      "not in the current active choices",
    );
  });

  it("throws INVALID_STATE when processing an action on a terminal session", () => {
    const terminalState = playThrough([
      { freeAction: { type: "order_test", itemId: "12-lead-ecg" } },
      "immediate-ecg",
      "interpret-stemi-correct",
      "give-aspirin",
      "asp-iv-access",
      "iv-proceed-treatment",
      "primary-pci",
      "full-pre-pci-regimen",
      "transfer-to-cath-lab",
    ]);
    expect(() => engine.processAction(terminalState, "some-choice")).toThrow(
      "terminal session",
    );
  });

  it("getScoreReport returns null for non-terminal sessions", () => {
    const state = engine.createSession();
    expect(engine.getScoreReport(state)).toBeNull();
  });
});

// ─── 7. Serialization round-trip ──────────────────────────────────────────────

describe("Integration — serialization", () => {
  it("serializes and deserializes a mid-session state preserving all fields", () => {
    let state = engine.createSession({ seed: "serialize-test" });
    // Order the ECG via free action then navigate to the result node.
    state = engine.performFreeAction(state, {
      type: "order_test",
      itemId: "12-lead-ecg",
    });
    state = engine.processAction(state, "immediate-ecg");

    const json = engine.serializeState(state);
    const restored = engine.deserializeState(json);

    expect(restored.session.sessionId).toBe(state.session.sessionId);
    expect(restored.session.gameTime).toBe(state.session.gameTime);
    expect(restored.progress.currentNodeId).toBe(state.progress.currentNodeId);
    expect(restored.player.orderedTests.length).toBe(
      state.player.orderedTests.length,
    );
    expect(restored.score.events.length).toBe(state.score.events.length);
  });

  it("continues gameplay correctly from a deserialized state", () => {
    let state = engine.createSession({ seed: "resume-test" });
    // Order the ECG via free action then navigate to the result node.
    state = engine.performFreeAction(state, {
      type: "order_test",
      itemId: "12-lead-ecg",
    });
    state = engine.processAction(state, "immediate-ecg");

    const json = engine.serializeState(state);
    let restored = engine.deserializeState(json);

    // Should be able to continue from where it was left off.
    restored = engine.processAction(restored, "interpret-stemi-correct");
    expect(restored.progress.currentNodeId).toBe("stemi-confirmed");
  });
});

// ─── 8. Case validation ───────────────────────────────────────────────────────

describe("Integration — static case validation", () => {
  it("validates the chest-pain-001 case without errors", () => {
    const result = GameEngine.validateCase(
      chestPain001,
      conditionsRegistry,
      testsRegistry,
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});
