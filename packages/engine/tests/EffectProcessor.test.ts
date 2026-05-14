/**
 * EffectProcessor.test.ts — Unit tests for all 16 effect types.
 *
 * Tests are isolated: a minimal GameState is passed to applyEffects()
 * alongside a stub IndexedCaseDocument.  We assert only the fields that
 * the effect under test should have changed.
 */

import { describe, it, expect } from "vitest";
import { applyEffects } from "../src/systems/EffectProcessor.js";
import type { GameState, Effect, IndexedCaseDocument } from "@emulos/types";

// ─── Stubs ────────────────────────────────────────────────────────────────────

/** Minimal IndexedCaseDocument stub. Tests that need real data override this. */
function makeStubCaseDoc(
  overrides: Partial<{
    testsById: ReadonlyMap<string, unknown>;
    modifiers: Array<{
      id: string;
      description: string;
      type: "multiplier" | "flat-delta";
      value: number;
    }>;
  }> = {},
): IndexedCaseDocument {
  return {
    caseData: {
      id: "test-case",
      version: "1.0.0",
      metadata: {
        title: "Test",
        specialty: "test",
        difficulty: "beginner",
        estimatedMinutes: 10,
        tags: [],
        author: "test",
        expansionPack: null,
        requiredEngineVersion: ">=1.0.0",
      },
      patient: {
        demographics: {
          name: "Test",
          age: 40,
          sex: "male",
          weight: 70,
          occupation: "Tester",
        },
        initialVitals: {
          heartRate: 80,
          bloodPressure: { systolic: 120, diastolic: 80 },
          respiratoryRate: 16,
          temperature: 37.0,
          oxygenSaturation: 98,
          consciousness: "alert",
          painScore: 0,
        },
        conditions: { active: [], hidden: [] },
        riskFactors: [],
      },
      scoring: {
        maxScore: 1000,
        passingScore: 600,
        gradeThresholds: { S: 950, A: 850, B: 700, C: 600 },
        timeBonuses: [],
        criticalActions: [],
        modifiers: overrides.modifiers ?? [],
        irrelevantActionPenalty: -25,
      },
      freeActionMode: false,
      nodes: {
        start: {
          id: "start",
          type: "presentation",
          text: "Test",
          effects: [],
          choices: [],
        },
      },
    },
    nodesById: new Map([
      [
        "start",
        {
          id: "start",
          type: "presentation",
          text: "Test",
          effects: [],
          choices: [],
        },
      ],
    ]),
    conditionsById: new Map(),
    testsById: (overrides.testsById ??
      new Map([
        [
          "ecg",
          {
            id: "ecg",
            name: "ECG",
            category: "cardiology",
            defaultResultTime: 10,
            genericResult: {
              summary: "ECG done",
              values: {},
              narrative: "Normal sinus rhythm.",
            },
          },
        ],
      ])) as ReadonlyMap<string, unknown>,
    medicationsById: new Map(),
    proceduresById: new Map(),
  } as IndexedCaseDocument;
}

/** Minimal GameState for testing. */
function makeState(): GameState {
  const vitals: GameState["patient"]["vitals"] = {
    heartRate: 80,
    bloodPressure: { systolic: 120, diastolic: 80 },
    respiratoryRate: 16,
    temperature: 37.0,
    oxygenSaturation: 98,
    consciousness: "alert",
    painScore: 2,
  };
  return {
    session: {
      sessionId: "s1",
      caseId: "test-case",
      seed: "seed",
      startedAt: "2024-01-01T00:00:00Z",
      gameTime: 10,
      phase: "active",
    },
    patient: {
      demographics: {
        name: "P",
        age: 50,
        sex: "male",
        weight: 70,
        occupation: "T",
        riskFactors: [],
      },
      baselineVitals: { ...vitals },
      vitals: { ...vitals },
      conditions: {
        active: [
          {
            conditionId: "hypertension",
            severity: "moderate",
            onsetGameTime: 0,
            revealedAt: 0,
          },
        ],
        hidden: [
          {
            conditionId: "anterior-stemi",
            severity: "critical",
            onsetGameTime: 0,
          },
        ],
        resolved: [],
      },
      collectedHistory: [],
      examinationFindings: [],
    },
    player: {
      knowledge: [],
      orderedTests: [],
      dispensedMedications: [],
      performedProcedures: [],
      actionHistory: [],
      hintsUsedAtNodes: [],
    },
    progress: {
      currentNodeId: "start",
      visitedNodeIds: ["start"],
      activeChoices: [],
      narrativeLog: [],
      pendingEvents: [],
    },
    score: { events: [], modifiers: [], computed: null },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apply(
  state: GameState,
  effects: Effect[],
  caseDoc = makeStubCaseDoc(),
): GameState {
  return applyEffects(state, effects, caseDoc);
}

// ─── set_vital ────────────────────────────────────────────────────────────────

describe("EffectProcessor — set_vital", () => {
  it("sets a numeric vital to the given value", () => {
    const next = apply(makeState(), [
      { type: "set_vital", vital: "heartRate", value: 120 },
    ]);
    expect(next.patient.vitals.heartRate).toBe(120);
  });

  it("sets consciousness to a string value", () => {
    const next = apply(makeState(), [
      { type: "set_vital", vital: "consciousness", value: "confused" },
    ]);
    expect(next.patient.vitals.consciousness).toBe("confused");
  });

  it("does not mutate the original state", () => {
    const original = makeState();
    apply(original, [{ type: "set_vital", vital: "heartRate", value: 200 }]);
    expect(original.patient.vitals.heartRate).toBe(80);
  });
});

// ─── adjust_vital ─────────────────────────────────────────────────────────────

describe("EffectProcessor — adjust_vital", () => {
  it("adds delta to a numeric vital", () => {
    const next = apply(makeState(), [
      { type: "adjust_vital", vital: "heartRate", delta: 20 },
    ]);
    expect(next.patient.vitals.heartRate).toBe(100);
  });

  it("supports negative deltas", () => {
    const next = apply(makeState(), [
      { type: "adjust_vital", vital: "oxygenSaturation", delta: -5 },
    ]);
    expect(next.patient.vitals.oxygenSaturation).toBe(93);
  });
});

// ─── reveal_condition ─────────────────────────────────────────────────────────

describe("EffectProcessor — reveal_condition", () => {
  it("moves a condition from hidden to active and sets revealedAt", () => {
    const state = makeState();
    const next = apply(state, [
      { type: "reveal_condition", conditionId: "anterior-stemi" },
    ]);
    expect(next.patient.conditions.hidden).toHaveLength(0);
    expect(
      next.patient.conditions.active.find(
        (c) => c.conditionId === "anterior-stemi",
      ),
    ).toBeDefined();
    expect(
      next.patient.conditions.active.find(
        (c) => c.conditionId === "anterior-stemi",
      )?.revealedAt,
    ).toBe(10); // gameTime at time of effect
  });

  it("is idempotent — noop for condition not in hidden", () => {
    const state = makeState();
    const next = apply(state, [
      { type: "reveal_condition", conditionId: "nonexistent-condition" },
    ]);
    // No crash, no change.
    expect(next.patient.conditions.active.length).toBe(
      state.patient.conditions.active.length,
    );
  });
});

// ─── add_condition ────────────────────────────────────────────────────────────

describe("EffectProcessor — add_condition", () => {
  it("adds a new condition to active list", () => {
    const next = apply(makeState(), [
      {
        type: "add_condition",
        conditionId: "cardiogenic-shock",
        severity: "critical",
      },
    ]);
    expect(
      next.patient.conditions.active.find(
        (c) => c.conditionId === "cardiogenic-shock",
      ),
    ).toBeDefined();
  });

  it("is idempotent — does not duplicate existing active condition", () => {
    const state = makeState();
    const next = apply(state, [
      {
        type: "add_condition",
        conditionId: "hypertension",
        severity: "severe",
      },
    ]);
    const count = next.patient.conditions.active.filter(
      (c) => c.conditionId === "hypertension",
    ).length;
    expect(count).toBe(1);
  });
});

// ─── resolve_condition ────────────────────────────────────────────────────────

describe("EffectProcessor — resolve_condition", () => {
  it("moves condition from active to resolved", () => {
    const next = apply(makeState(), [
      { type: "resolve_condition", conditionId: "hypertension" },
    ]);
    expect(
      next.patient.conditions.active.find(
        (c) => c.conditionId === "hypertension",
      ),
    ).toBeUndefined();
    expect(
      next.patient.conditions.resolved.find(
        (c) => c.conditionId === "hypertension",
      ),
    ).toBeDefined();
  });
});

// ─── add_knowledge ────────────────────────────────────────────────────────────

describe("EffectProcessor — add_knowledge", () => {
  it("adds a knowledge item", () => {
    const next = apply(makeState(), [
      { type: "add_knowledge", knowledgeId: "stemi-confirmed" },
    ]);
    expect(next.player.knowledge).toContain("stemi-confirmed");
  });

  it("is idempotent — does not duplicate", () => {
    let state = makeState();
    state = apply(state, [
      { type: "add_knowledge", knowledgeId: "stemi-confirmed" },
    ]);
    state = apply(state, [
      { type: "add_knowledge", knowledgeId: "stemi-confirmed" },
    ]);
    expect(
      state.player.knowledge.filter((k) => k === "stemi-confirmed").length,
    ).toBe(1);
  });
});

// ─── add_history_item & add_examination_finding ───────────────────────────────

describe("EffectProcessor — add_history_item", () => {
  it("adds a history item", () => {
    const next = apply(makeState(), [
      { type: "add_history_item", itemId: "chief-complaint" },
    ]);
    expect(next.patient.collectedHistory).toContain("chief-complaint");
  });
});

describe("EffectProcessor — add_examination_finding", () => {
  it("adds an examination finding", () => {
    const next = apply(makeState(), [
      { type: "add_examination_finding", findingId: "cardiovascular-exam" },
    ]);
    expect(next.patient.examinationFindings).toContain("cardiovascular-exam");
  });
});

// ─── order_test & result_test ─────────────────────────────────────────────────

describe("EffectProcessor — order_test", () => {
  it("adds the test as pending in orderedTests", () => {
    const next = apply(makeState(), [{ type: "order_test", testId: "ecg" }]);
    const ordered = next.player.orderedTests.find((t) => t.testId === "ecg");
    expect(ordered).toBeDefined();
    expect(ordered?.resultedAt).toBeNull();
    expect(ordered?.result).toBeNull();
    expect(ordered?.orderedAt).toBe(10); // current gameTime
  });

  it("is idempotent — does not duplicate", () => {
    let state = apply(makeState(), [{ type: "order_test", testId: "ecg" }]);
    state = apply(state, [{ type: "order_test", testId: "ecg" }]);
    expect(
      state.player.orderedTests.filter((t) => t.testId === "ecg").length,
    ).toBe(1);
  });
});

describe("EffectProcessor — result_test", () => {
  it("marks the test as resulted and populates result", () => {
    let state = apply(makeState(), [{ type: "order_test", testId: "ecg" }]);
    state = apply(state, [{ type: "result_test", testId: "ecg" }]);
    const test = state.player.orderedTests.find((t) => t.testId === "ecg");
    expect(test?.resultedAt).toBe(10);
    expect(test?.result).not.toBeNull();
    expect(test?.result?.summary).toBe("ECG done");
  });
});

// ─── advance_time ─────────────────────────────────────────────────────────────

describe("EffectProcessor — advance_time", () => {
  it("increments session gameTime", () => {
    const next = apply(makeState(), [{ type: "advance_time", minutes: 15 }]);
    expect(next.session.gameTime).toBe(25); // 10 + 15
  });
});

// ─── add_score_event ─────────────────────────────────────────────────────────

describe("EffectProcessor — add_score_event", () => {
  it("appends a score event with correct fields", () => {
    const next = apply(makeState(), [
      {
        type: "add_score_event",
        actionId: "order-ecg",
        points: 100,
        reason: "ECG ordered immediately",
        category: "critical-action",
      },
    ]);
    expect(next.score.events).toHaveLength(1);
    const ev = next.score.events[0];
    expect(ev?.actionId).toBe("order-ecg");
    expect(ev?.points).toBe(100);
    expect(ev?.category).toBe("critical-action");
    expect(ev?.gameTime).toBe(10);
  });
});

// ─── apply_score_modifier ─────────────────────────────────────────────────────

describe("EffectProcessor — apply_score_modifier", () => {
  it("applies a defined modifier to the score modifiers list", () => {
    const caseDoc = makeStubCaseDoc({
      modifiers: [
        {
          id: "patient-harmed",
          description: "Patient harmed",
          type: "multiplier",
          value: 0.5,
        },
      ],
    });
    const next = apply(
      makeState(),
      [{ type: "apply_score_modifier", modifierId: "patient-harmed" }],
      caseDoc,
    );
    expect(next.score.modifiers).toHaveLength(1);
    expect(next.score.modifiers[0]?.type).toBe("multiplier");
    expect(next.score.modifiers[0]?.value).toBe(0.5);
  });

  it("is idempotent — same modifier applied twice only appears once", () => {
    const caseDoc = makeStubCaseDoc({
      modifiers: [
        {
          id: "patient-harmed",
          description: "Patient harmed",
          type: "multiplier",
          value: 0.5,
        },
      ],
    });
    let state = apply(
      makeState(),
      [{ type: "apply_score_modifier", modifierId: "patient-harmed" }],
      caseDoc,
    );
    state = apply(
      state,
      [{ type: "apply_score_modifier", modifierId: "patient-harmed" }],
      caseDoc,
    );
    expect(state.score.modifiers.length).toBe(1);
  });
});

// ─── trigger_event ────────────────────────────────────────────────────────────

describe("EffectProcessor — trigger_event", () => {
  it("queues an event in pendingEvents at the correct trigger time", () => {
    const next = apply(makeState(), [
      { type: "trigger_event", eventId: "vf-arrest-event", delayMinutes: 0 },
    ]);
    expect(next.progress.pendingEvents).toHaveLength(1);
    expect(next.progress.pendingEvents[0]?.eventNodeId).toBe("vf-arrest-event");
    expect(next.progress.pendingEvents[0]?.triggerAt).toBe(10); // gameTime + 0
  });

  it("applies delay correctly", () => {
    const next = apply(makeState(), [
      { type: "trigger_event", eventId: "alarm-event", delayMinutes: 30 },
    ]);
    expect(next.progress.pendingEvents[0]?.triggerAt).toBe(40); // 10 + 30
  });
});

// ─── set_game_phase ───────────────────────────────────────────────────────────

describe("EffectProcessor — set_game_phase", () => {
  it("updates the session phase", () => {
    const next = apply(makeState(), [
      { type: "set_game_phase", phase: "terminal" },
    ]);
    expect(next.session.phase).toBe("terminal");
  });
});

// ─── append_narrative ─────────────────────────────────────────────────────────

describe("EffectProcessor — append_narrative", () => {
  it("appends a narrative entry with correct type and text", () => {
    const next = apply(makeState(), [
      {
        type: "append_narrative",
        text: "An alarm sounds.",
        narrativeType: "event",
      },
    ]);
    expect(next.progress.narrativeLog).toHaveLength(1);
    expect(next.progress.narrativeLog[0]?.text).toBe("An alarm sounds.");
    expect(next.progress.narrativeLog[0]?.type).toBe("event");
    expect(next.progress.narrativeLog[0]?.isNew).toBe(true);
  });
});

// ─── Conditional effects ──────────────────────────────────────────────────────

describe("EffectProcessor — conditional effects (condition guard)", () => {
  it("skips an effect when its condition is false", () => {
    const next = apply(makeState(), [
      {
        type: "add_knowledge",
        knowledgeId: "guarded-item",
        condition: { op: "has_knowledge", knowledgeId: "prerequisite" },
      },
    ]);
    // The prerequisite is not in state, so the guarded effect should not fire.
    expect(next.player.knowledge).not.toContain("guarded-item");
  });

  it("applies an effect when its condition is true", () => {
    const state = applyEffects(
      makeState(),
      [{ type: "add_knowledge", knowledgeId: "prerequisite" }],
      makeStubCaseDoc(),
    );
    const next = apply(state, [
      {
        type: "add_knowledge",
        knowledgeId: "guarded-item",
        condition: { op: "has_knowledge", knowledgeId: "prerequisite" },
      },
    ]);
    expect(next.player.knowledge).toContain("guarded-item");
  });
});

// ─── Effect ordering ──────────────────────────────────────────────────────────

describe("EffectProcessor — effect ordering", () => {
  it("applies effects sequentially (each sees the result of the previous)", () => {
    // First add knowledge "a", then use a condition guard on "a" to add "b".
    const next = apply(makeState(), [
      { type: "add_knowledge", knowledgeId: "a" },
      {
        type: "add_knowledge",
        knowledgeId: "b",
        condition: { op: "has_knowledge", knowledgeId: "a" },
      },
    ]);
    expect(next.player.knowledge).toContain("a");
    expect(next.player.knowledge).toContain("b");
  });
});
