/**
 * RuleEngine.test.ts — Unit tests for all 13 condition operators.
 *
 * Each test is isolated: a minimal GameState is constructed in-line, the
 * condition expression is evaluated, and the boolean result is asserted.
 * No engine subsystems other than RuleEngine itself are exercised here.
 */

import { describe, it, expect } from "vitest";
import {
  evaluateCondition,
  evaluateOptionalCondition,
} from "../src/systems/RuleEngine.js";
import type { GameState, ConditionExpr } from "@emulos/types";

// ─── Test fixture builder ─────────────────────────────────────────────────────

/** Builds a fully-typed minimal GameState.  Override fields as needed per test. */
function makeState(
  overrides: {
    gameTime?: number;
    phase?: GameState["session"]["phase"];
    heartRate?: number;
    oxygenSaturation?: number;
    knowledge?: string[];
    orderedTests?: { testId: string; resulted: boolean }[];
    activeConditions?: string[];
    revealedConditions?: string[];
  } = {}
): GameState {
  const {
    gameTime = 0,
    phase = "active",
    heartRate = 80,
    oxygenSaturation = 98,
    knowledge = [],
    orderedTests = [],
    activeConditions = [],
    revealedConditions = [],
  } = overrides;

  const vitals: GameState["patient"]["vitals"] = {
    heartRate,
    bloodPressure: { systolic: 120, diastolic: 80 },
    respiratoryRate: 16,
    temperature: 37.0,
    oxygenSaturation,
    consciousness: "alert",
    painScore: 0,
  };

  return {
    session: {
      sessionId: "test-session",
      caseId: "test-case",
      seed: "abc",
      startedAt: "2024-01-01T00:00:00Z",
      gameTime,
      phase,
    },
    patient: {
      demographics: {
        name: "Test Patient",
        age: 50,
        sex: "male",
        weight: 70,
        occupation: "Tester",
        riskFactors: [],
      },
      baselineVitals: { ...vitals },
      vitals,
      conditions: {
        active: [
          ...activeConditions
            .filter((id) => !revealedConditions.includes(id))
            .map((id) => ({ conditionId: id, severity: "moderate" as const, onsetGameTime: 0 })),
          ...revealedConditions.map((id) => ({
            conditionId: id,
            severity: "moderate" as const,
            onsetGameTime: 0,
            revealedAt: 0,
          })),
        ],
        hidden: [],
        resolved: [],
      },
      collectedHistory: [],
      examinationFindings: [],
    },
    player: {
      knowledge: [...knowledge],
      orderedTests: orderedTests.map((t) => ({
        testId: t.testId,
        orderedAt: 0,
        resultedAt: t.resulted ? 0 : null,
        result: t.resulted
          ? { summary: "Resulted", values: {}, narrative: "Done." }
          : null,
      })),
      actionHistory: [],
    },
    progress: {
      currentNodeId: "start",
      visitedNodeIds: [],
      activeChoices: [],
      narrativeLog: [],
      pendingEvents: [],
    },
    score: {
      events: [],
      modifiers: [],
      computed: null,
    },
  };
}

// ─── Logical combinators ──────────────────────────────────────────────────────

describe("RuleEngine — and", () => {
  it("returns true when all sub-conditions pass", () => {
    const state = makeState({ knowledge: ["a", "b"] });
    const expr: ConditionExpr = {
      op: "and",
      conditions: [
        { op: "has_knowledge", knowledgeId: "a" },
        { op: "has_knowledge", knowledgeId: "b" },
      ],
    };
    expect(evaluateCondition(expr, state)).toBe(true);
  });

  it("returns false when any sub-condition fails", () => {
    const state = makeState({ knowledge: ["a"] });
    const expr: ConditionExpr = {
      op: "and",
      conditions: [
        { op: "has_knowledge", knowledgeId: "a" },
        { op: "has_knowledge", knowledgeId: "b" },
      ],
    };
    expect(evaluateCondition(expr, state)).toBe(false);
  });

  it("returns true for empty and (vacuous truth)", () => {
    const state = makeState();
    expect(evaluateCondition({ op: "and", conditions: [] }, state)).toBe(true);
  });
});

describe("RuleEngine — or", () => {
  it("returns true when at least one sub-condition passes", () => {
    const state = makeState({ knowledge: ["a"] });
    const expr: ConditionExpr = {
      op: "or",
      conditions: [
        { op: "has_knowledge", knowledgeId: "a" },
        { op: "has_knowledge", knowledgeId: "b" },
      ],
    };
    expect(evaluateCondition(expr, state)).toBe(true);
  });

  it("returns false when all sub-conditions fail", () => {
    const state = makeState({ knowledge: [] });
    const expr: ConditionExpr = {
      op: "or",
      conditions: [
        { op: "has_knowledge", knowledgeId: "a" },
        { op: "has_knowledge", knowledgeId: "b" },
      ],
    };
    expect(evaluateCondition(expr, state)).toBe(false);
  });

  it("returns false for empty or", () => {
    expect(
      evaluateCondition({ op: "or", conditions: [] }, makeState())
    ).toBe(false);
  });
});

describe("RuleEngine — not", () => {
  it("inverts a true condition to false", () => {
    const state = makeState({ knowledge: ["x"] });
    const expr: ConditionExpr = {
      op: "not",
      condition: { op: "has_knowledge", knowledgeId: "x" },
    };
    expect(evaluateCondition(expr, state)).toBe(false);
  });

  it("inverts a false condition to true", () => {
    const state = makeState({ knowledge: [] });
    const expr: ConditionExpr = {
      op: "not",
      condition: { op: "has_knowledge", knowledgeId: "x" },
    };
    expect(evaluateCondition(expr, state)).toBe(true);
  });

  it("supports double negation", () => {
    const state = makeState({ knowledge: ["x"] });
    const expr: ConditionExpr = {
      op: "not",
      condition: { op: "not", condition: { op: "has_knowledge", knowledgeId: "x" } },
    };
    expect(evaluateCondition(expr, state)).toBe(true);
  });
});

// ─── Dot-path comparisons ─────────────────────────────────────────────────────

describe("RuleEngine — eq", () => {
  it("matches exact numeric value on nested path", () => {
    const state = makeState({ heartRate: 72 });
    expect(
      evaluateCondition(
        { op: "eq", path: "patient.vitals.heartRate", value: 72 },
        state
      )
    ).toBe(true);
  });

  it("returns false for wrong value", () => {
    const state = makeState({ heartRate: 72 });
    expect(
      evaluateCondition(
        { op: "eq", path: "patient.vitals.heartRate", value: 80 },
        state
      )
    ).toBe(false);
  });

  it("matches string value (phase)", () => {
    const state = makeState({ phase: "terminal" });
    expect(
      evaluateCondition(
        { op: "eq", path: "session.phase", value: "terminal" },
        state
      )
    ).toBe(true);
  });

  it("returns false for non-existent path", () => {
    const state = makeState();
    expect(
      evaluateCondition(
        { op: "eq", path: "deeply.nonexistent.path", value: 42 },
        state
      )
    ).toBe(false);
  });
});

describe("RuleEngine — neq", () => {
  it("returns true when values differ", () => {
    const state = makeState({ phase: "active" });
    expect(
      evaluateCondition(
        { op: "neq", path: "session.phase", value: "terminal" },
        state
      )
    ).toBe(true);
  });

  it("returns false when values match", () => {
    const state = makeState({ phase: "active" });
    expect(
      evaluateCondition(
        { op: "neq", path: "session.phase", value: "active" },
        state
      )
    ).toBe(false);
  });
});

describe("RuleEngine — numeric comparisons (gt/gte/lt/lte)", () => {
  it("gt: true when value strictly greater", () => {
    const state = makeState({ heartRate: 100 });
    expect(
      evaluateCondition(
        { op: "gt", path: "patient.vitals.heartRate", value: 90 },
        state
      )
    ).toBe(true);
  });

  it("gt: false when equal", () => {
    const state = makeState({ heartRate: 90 });
    expect(
      evaluateCondition(
        { op: "gt", path: "patient.vitals.heartRate", value: 90 },
        state
      )
    ).toBe(false);
  });

  it("gte: true when equal", () => {
    const state = makeState({ heartRate: 90 });
    expect(
      evaluateCondition(
        { op: "gte", path: "patient.vitals.heartRate", value: 90 },
        state
      )
    ).toBe(true);
  });

  it("lt: true when strictly less", () => {
    const state = makeState({ oxygenSaturation: 85 });
    expect(
      evaluateCondition(
        { op: "lt", path: "patient.vitals.oxygenSaturation", value: 90 },
        state
      )
    ).toBe(true);
  });

  it("lte: true when equal", () => {
    const state = makeState({ oxygenSaturation: 90 });
    expect(
      evaluateCondition(
        { op: "lte", path: "patient.vitals.oxygenSaturation", value: 90 },
        state
      )
    ).toBe(true);
  });

  it("returns false for non-numeric path", () => {
    const state = makeState({ phase: "active" });
    expect(
      evaluateCondition(
        { op: "gt", path: "session.phase", value: 0 },
        state
      )
    ).toBe(false);
  });
});

// ─── Knowledge ────────────────────────────────────────────────────────────────

describe("RuleEngine — has_knowledge", () => {
  it("returns true when knowledge item is present", () => {
    const state = makeState({ knowledge: ["stemi-confirmed-ecg"] });
    expect(
      evaluateCondition(
        { op: "has_knowledge", knowledgeId: "stemi-confirmed-ecg" },
        state
      )
    ).toBe(true);
  });

  it("returns false when knowledge item is absent", () => {
    const state = makeState({ knowledge: [] });
    expect(
      evaluateCondition(
        { op: "has_knowledge", knowledgeId: "stemi-confirmed-ecg" },
        state
      )
    ).toBe(false);
  });
});

// ─── Test state ───────────────────────────────────────────────────────────────

describe("RuleEngine — test_ordered", () => {
  it("returns true when test has been ordered", () => {
    const state = makeState({ orderedTests: [{ testId: "12-lead-ecg", resulted: false }] });
    expect(
      evaluateCondition({ op: "test_ordered", testId: "12-lead-ecg" }, state)
    ).toBe(true);
  });

  it("returns false when test has not been ordered", () => {
    const state = makeState({ orderedTests: [] });
    expect(
      evaluateCondition({ op: "test_ordered", testId: "12-lead-ecg" }, state)
    ).toBe(false);
  });
});

describe("RuleEngine — test_resulted", () => {
  it("returns true when test has a result", () => {
    const state = makeState({
      orderedTests: [{ testId: "12-lead-ecg", resulted: true }],
    });
    expect(
      evaluateCondition({ op: "test_resulted", testId: "12-lead-ecg" }, state)
    ).toBe(true);
  });

  it("returns false when test is ordered but not resulted", () => {
    const state = makeState({
      orderedTests: [{ testId: "12-lead-ecg", resulted: false }],
    });
    expect(
      evaluateCondition({ op: "test_resulted", testId: "12-lead-ecg" }, state)
    ).toBe(false);
  });

  it("returns false when test is not even ordered", () => {
    const state = makeState({ orderedTests: [] });
    expect(
      evaluateCondition({ op: "test_resulted", testId: "troponin-i" }, state)
    ).toBe(false);
  });
});

// ─── Condition state ──────────────────────────────────────────────────────────

describe("RuleEngine — condition_active", () => {
  it("returns true when condition is in active list", () => {
    const state = makeState({ activeConditions: ["hypertension"] });
    expect(
      evaluateCondition(
        { op: "condition_active", conditionId: "hypertension" },
        state
      )
    ).toBe(true);
  });

  it("returns false when condition is not active", () => {
    const state = makeState({ activeConditions: [] });
    expect(
      evaluateCondition(
        { op: "condition_active", conditionId: "anterior-stemi" },
        state
      )
    ).toBe(false);
  });
});

describe("RuleEngine — condition_revealed", () => {
  it("returns true when condition is active AND has revealedAt", () => {
    const state = makeState({ revealedConditions: ["anterior-stemi"] });
    expect(
      evaluateCondition(
        { op: "condition_revealed", conditionId: "anterior-stemi" },
        state
      )
    ).toBe(true);
  });

  it("returns false when condition is active but not revealed (no revealedAt)", () => {
    // activeConditions list puts it in the active array but without revealedAt.
    // We need to manually craft this state.
    const state = makeState({ activeConditions: ["anterior-stemi"] });
    // Find the condition and remove revealedAt if it was set.
    const cond = state.patient.conditions.active.find(
      (c) => c.conditionId === "anterior-stemi"
    );
    if (cond) {
      // activeConditions fixture sets revealedAt = undefined (no reveal).
      // Actually looking at makeState: revealedConditions get revealedAt=0,
      // activeConditions that aren't in revealedConditions get revealedAt=undefined.
      // So this should already be revealedAt=undefined for non-revealed ones.
    }
    expect(
      evaluateCondition(
        { op: "condition_revealed", conditionId: "anterior-stemi" },
        state
      )
    ).toBe(false);
  });
});

// ─── Time & phase ─────────────────────────────────────────────────────────────

describe("RuleEngine — time_elapsed_gte", () => {
  it("returns true when gameTime meets the threshold", () => {
    const state = makeState({ gameTime: 30 });
    expect(
      evaluateCondition({ op: "time_elapsed_gte", minutes: 30 }, state)
    ).toBe(true);
  });

  it("returns true when gameTime exceeds the threshold", () => {
    const state = makeState({ gameTime: 45 });
    expect(
      evaluateCondition({ op: "time_elapsed_gte", minutes: 30 }, state)
    ).toBe(true);
  });

  it("returns false when gameTime is below threshold", () => {
    const state = makeState({ gameTime: 15 });
    expect(
      evaluateCondition({ op: "time_elapsed_gte", minutes: 30 }, state)
    ).toBe(false);
  });
});

describe("RuleEngine — game_phase", () => {
  it("returns true when phase matches", () => {
    const state = makeState({ phase: "terminal" });
    expect(
      evaluateCondition({ op: "game_phase", phase: "terminal" }, state)
    ).toBe(true);
  });

  it("returns false when phase does not match", () => {
    const state = makeState({ phase: "active" });
    expect(
      evaluateCondition({ op: "game_phase", phase: "terminal" }, state)
    ).toBe(false);
  });
});

// ─── Nested / composed expressions ───────────────────────────────────────────

describe("RuleEngine — nested compositions", () => {
  it("handles deeply nested and/or/not combinations", () => {
    const state = makeState({
      knowledge: ["stemi-confirmed-ecg"],
      orderedTests: [{ testId: "12-lead-ecg", resulted: true }],
      gameTime: 20,
    });

    // (has stemi knowledge AND ecg resulted) OR (gameTime >= 60)
    const expr: ConditionExpr = {
      op: "or",
      conditions: [
        {
          op: "and",
          conditions: [
            { op: "has_knowledge", knowledgeId: "stemi-confirmed-ecg" },
            { op: "test_resulted", testId: "12-lead-ecg" },
          ],
        },
        { op: "time_elapsed_gte", minutes: 60 },
      ],
    };
    expect(evaluateCondition(expr, state)).toBe(true);
  });
});

// ─── evaluateOptionalCondition ────────────────────────────────────────────────

describe("evaluateOptionalCondition", () => {
  it("returns true for undefined condition (no guard)", () => {
    expect(evaluateOptionalCondition(undefined, makeState())).toBe(true);
  });

  it("returns true for null condition (no guard)", () => {
    expect(evaluateOptionalCondition(null, makeState())).toBe(true);
  });

  it("delegates to evaluateCondition when condition is present", () => {
    const state = makeState({ knowledge: ["x"] });
    expect(
      evaluateOptionalCondition(
        { op: "has_knowledge", knowledgeId: "x" },
        state
      )
    ).toBe(true);
  });
});
