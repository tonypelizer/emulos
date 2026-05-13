/**
 * ScoringEngine.test.ts — Unit tests for the full score calculation pipeline.
 *
 * Tests exercise calculateScore / computeFinalScore / buildScoreReport in
 * isolation by constructing GameState and IndexedCaseDocument stubs with
 * exactly the data each test needs.
 */

import { describe, it, expect } from "vitest";
import {
  computeFinalScore,
  buildScoreReport,
} from "../src/systems/ScoringEngine.js";
import type {
  GameState,
  IndexedCaseDocument,
  ScoreEvent,
  ScoreModifier,
} from "@emulos/types";

// ─── Stubs ────────────────────────────────────────────────────────────────────

function makeScoring(
  overrides: {
    maxScore?: number;
    passingScore?: number;
    gradeThresholds?: { S: number; A: number; B: number; C: number };
    timeBonuses?: Array<{
      gameTimeThreshold: number;
      bonus: number;
      label: string;
    }>;
    criticalActions?: Array<{
      actionId: string;
      points: number;
      isMandatory: boolean;
      label: string;
    }>;
    modifiers?: Array<{
      id: string;
      description: string;
      type: "multiplier" | "flat-delta";
      value: number;
    }>;
  } = {},
) {
  return {
    maxScore: overrides.maxScore ?? 1000,
    passingScore: overrides.passingScore ?? 600,
    gradeThresholds: overrides.gradeThresholds ?? {
      S: 950,
      A: 850,
      B: 700,
      C: 600,
    },
    timeBonuses: overrides.timeBonuses ?? [],
    criticalActions: overrides.criticalActions ?? [],
    modifiers: overrides.modifiers ?? [],
  };
}

function makeCaseDoc(
  scoringOverrides: Parameters<typeof makeScoring>[0] = {},
): IndexedCaseDocument {
  return {
    caseData: {
      id: "test",
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
          name: "P",
          age: 40,
          sex: "male",
          weight: 70,
          occupation: "T",
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
      scoring: makeScoring(scoringOverrides),
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
    nodesById: new Map(),
    conditionsById: new Map(),
    testsById: new Map(),
  } as unknown as IndexedCaseDocument;
}

function makeState(
  overrides: {
    gameTime?: number;
    events?: Array<Partial<ScoreEvent>>;
    modifiers?: Array<Partial<ScoreModifier>>;
  } = {},
): GameState {
  const vitals: GameState["patient"]["vitals"] = {
    heartRate: 80,
    bloodPressure: { systolic: 120, diastolic: 80 },
    respiratoryRate: 16,
    temperature: 37.0,
    oxygenSaturation: 98,
    consciousness: "alert" as const,
    painScore: 0,
  };

  return {
    session: {
      sessionId: "s1",
      caseId: "test",
      seed: "seed",
      startedAt: "2024-01-01T00:00:00Z",
      gameTime: overrides.gameTime ?? 30,
      phase: "terminal" as const,
    },
    patient: {
      demographics: {
        name: "P",
        age: 40,
        sex: "male",
        weight: 70,
        occupation: "T",
        riskFactors: [],
      },
      baselineVitals: { ...vitals },
      vitals: { ...vitals },
      conditions: { active: [], hidden: [], resolved: [] },
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
      currentNodeId: "end",
      visitedNodeIds: ["start", "end"],
      activeChoices: [],
      narrativeLog: [],
      pendingEvents: [],
    },
    score: {
      events: (overrides.events ?? []).map((e, i) => ({
        id: `ev-${i}`,
        gameTime: 10,
        actionId: "default-action",
        points: 0,
        reason: "Default",
        category: "optional-bonus" as const,
        ...e,
      })),
      modifiers: (overrides.modifiers ?? []).map((m, i) => ({
        id: `mod-${i}`,
        description: "Default modifier",
        type: "flat-delta" as const,
        value: 0,
        appliedAt: 10,
        ...m,
      })),
      computed: null,
    },
  };
}

// ─── Raw score ────────────────────────────────────────────────────────────────

describe("ScoringEngine — raw score", () => {
  it("sums all score event points", () => {
    const state = makeState({
      events: [{ points: 100 }, { points: 200 }, { points: -50 }],
    });
    const result = computeFinalScore(state, makeCaseDoc());
    expect(result.score.computed?.raw).toBe(250);
  });

  it("handles empty events (zero score)", () => {
    const state = makeState({ events: [] });
    const result = computeFinalScore(state, makeCaseDoc());
    expect(result.score.computed?.raw).toBe(0);
  });
});

// ─── Time bonuses ─────────────────────────────────────────────────────────────

describe("ScoringEngine — time bonuses", () => {
  it("awards the tightest qualifying bonus", () => {
    const caseDoc = makeCaseDoc({
      timeBonuses: [
        { gameTimeThreshold: 30, bonus: 150, label: "Fast" },
        { gameTimeThreshold: 60, bonus: 75, label: "Good" },
      ],
    });
    const state = makeState({ gameTime: 25, events: [{ points: 500 }] });
    const result = computeFinalScore(state, caseDoc);
    // gameTime 25 qualifies for the 30-min bonus (150), which is the tightest match.
    expect(result.score.computed?.timeBonusEarned).toBe(150);
  });

  it("awards the next best bonus when fastest is not achieved", () => {
    const caseDoc = makeCaseDoc({
      timeBonuses: [
        { gameTimeThreshold: 30, bonus: 150, label: "Fast" },
        { gameTimeThreshold: 60, bonus: 75, label: "Good" },
      ],
    });
    const state = makeState({ gameTime: 45, events: [{ points: 500 }] });
    const result = computeFinalScore(state, caseDoc);
    expect(result.score.computed?.timeBonusEarned).toBe(75);
  });

  it("awards no bonus when all thresholds are exceeded", () => {
    const caseDoc = makeCaseDoc({
      timeBonuses: [
        { gameTimeThreshold: 30, bonus: 150, label: "Fast" },
        { gameTimeThreshold: 60, bonus: 75, label: "Good" },
      ],
    });
    const state = makeState({ gameTime: 90, events: [{ points: 500 }] });
    const result = computeFinalScore(state, caseDoc);
    expect(result.score.computed?.timeBonusEarned).toBe(0);
  });
});

// ─── Modifiers ────────────────────────────────────────────────────────────────

describe("ScoringEngine — multiplier modifier", () => {
  it("halves the score with a 0.5× multiplier", () => {
    const state = makeState({
      events: [{ points: 600 }],
      modifiers: [{ type: "multiplier", value: 0.5 }],
    });
    const result = computeFinalScore(state, makeCaseDoc());
    expect(result.score.computed?.final).toBe(300);
  });

  it("applies multiple modifiers in sequence", () => {
    const state = makeState({
      events: [{ points: 500 }],
      modifiers: [
        { type: "flat-delta", value: 100 }, // 500 + 100 = 600
        { type: "multiplier", value: 0.5 }, // 600 × 0.5 = 300
      ],
    });
    const result = computeFinalScore(state, makeCaseDoc());
    expect(result.score.computed?.final).toBe(300);
  });
});

describe("ScoringEngine — flat-delta modifier", () => {
  it("adds a flat amount to the score", () => {
    const state = makeState({
      events: [{ points: 400 }],
      modifiers: [{ type: "flat-delta", value: 200 }],
    });
    const result = computeFinalScore(state, makeCaseDoc());
    expect(result.score.computed?.final).toBe(600);
  });

  it("supports negative flat deltas (penalties)", () => {
    const state = makeState({
      events: [{ points: 800 }],
      modifiers: [{ type: "flat-delta", value: -200 }],
    });
    const result = computeFinalScore(state, makeCaseDoc());
    expect(result.score.computed?.final).toBe(600);
  });
});

// ─── Clamping ─────────────────────────────────────────────────────────────────

describe("ScoringEngine — clamping", () => {
  it("clamps negative score to 0", () => {
    const state = makeState({
      events: [{ points: 100 }],
      modifiers: [{ type: "flat-delta", value: -500 }],
    });
    const result = computeFinalScore(state, makeCaseDoc());
    expect(result.score.computed?.final).toBe(0);
    expect(result.score.computed?.final).toBeGreaterThanOrEqual(0);
  });

  it("clamps score exceeding maxScore", () => {
    const state = makeState({
      events: [{ points: 900 }],
      modifiers: [{ type: "flat-delta", value: 500 }],
    });
    const result = computeFinalScore(state, makeCaseDoc({ maxScore: 1000 }));
    expect(result.score.computed?.final).toBe(1000);
  });
});

// ─── Grade derivation ─────────────────────────────────────────────────────────

describe("ScoringEngine — grade derivation", () => {
  const thresholds = { S: 950, A: 850, B: 700, C: 600 };

  const cases: Array<
    [
      number,
      GameState["score"]["computed"] extends null
        ? never
        : NonNullable<GameState["score"]["computed"]>["grade"],
    ]
  > = [
    [950, "S"],
    [900, "A"],
    [850, "A"],
    [750, "B"],
    [700, "B"],
    [620, "C"],
    [600, "C"],
    [599, "F"],
    [0, "F"],
  ];

  for (const [score, expectedGrade] of cases) {
    it(`score ${score} → grade ${expectedGrade}`, () => {
      const state = makeState({ events: [{ points: score }] });
      const result = computeFinalScore(
        state,
        makeCaseDoc({ gradeThresholds: thresholds }),
      );
      expect(result.score.computed?.grade).toBe(expectedGrade);
    });
  }

  it("passing: true when final >= passingScore", () => {
    const state = makeState({ events: [{ points: 700 }] });
    const result = computeFinalScore(state, makeCaseDoc({ passingScore: 600 }));
    expect(result.score.computed?.passed).toBe(true);
  });

  it("passing: false when final < passingScore", () => {
    const state = makeState({ events: [{ points: 400 }] });
    const result = computeFinalScore(state, makeCaseDoc({ passingScore: 600 }));
    expect(result.score.computed?.passed).toBe(false);
  });
});

// ─── Critical action tracking ─────────────────────────────────────────────────

describe("ScoringEngine — critical action tracking", () => {
  const criticalActions = [
    {
      actionId: "order-ecg",
      points: 100,
      isMandatory: true,
      label: "ECG obtained",
    },
    {
      actionId: "activate-cath-lab",
      points: 250,
      isMandatory: true,
      label: "Cath lab activated",
    },
    {
      actionId: "administer-aspirin",
      points: 100,
      isMandatory: true,
      label: "Aspirin given",
    },
  ];

  it("identifies which critical actions were hit via matching actionId", () => {
    const state = makeState({
      events: [
        { actionId: "order-ecg", points: 100 },
        { actionId: "activate-cath-lab", points: 250 },
      ],
    });
    const result = computeFinalScore(state, makeCaseDoc({ criticalActions }));
    expect(result.score.computed?.criticalActionsHit).toContain("ECG obtained");
    expect(result.score.computed?.criticalActionsHit).toContain(
      "Cath lab activated",
    );
  });

  it("identifies which critical actions were missed", () => {
    const state = makeState({
      events: [{ actionId: "order-ecg", points: 100 }],
    });
    const result = computeFinalScore(state, makeCaseDoc({ criticalActions }));
    expect(result.score.computed?.criticalActionsMissed).toContain(
      "Cath lab activated",
    );
    expect(result.score.computed?.criticalActionsMissed).toContain(
      "Aspirin given",
    );
  });

  it("all actions hit → criticalActionsMissed is empty", () => {
    const state = makeState({
      events: [
        { actionId: "order-ecg", points: 100 },
        { actionId: "activate-cath-lab", points: 250 },
        { actionId: "administer-aspirin", points: 100 },
      ],
    });
    const result = computeFinalScore(state, makeCaseDoc({ criticalActions }));
    expect(result.score.computed?.criticalActionsMissed).toHaveLength(0);
  });
});

// ─── buildScoreReport ─────────────────────────────────────────────────────────

describe("buildScoreReport", () => {
  it("includes a breakdown entry for each score event", () => {
    const state = makeState({
      events: [
        { actionId: "order-ecg", points: 100, reason: "ECG ordered" },
        {
          actionId: "activate-cath-lab",
          points: 250,
          reason: "Cath lab activated",
        },
      ],
    });
    const stateWithScore = computeFinalScore(state, makeCaseDoc());
    const report = buildScoreReport(stateWithScore, makeCaseDoc());
    expect(report.breakdown).toHaveLength(2);
    expect(report.breakdown[0]?.reason).toBe("ECG ordered");
    expect(report.breakdown[1]?.reason).toBe("Cath lab activated");
  });

  it("includes applied modifiers in the report", () => {
    const state = makeState({
      events: [{ points: 800 }],
      modifiers: [
        { type: "multiplier", value: 0.5, description: "Patient harmed" },
      ],
    });
    const stateWithScore = computeFinalScore(state, makeCaseDoc());
    const report = buildScoreReport(stateWithScore, makeCaseDoc());
    expect(report.modifiersApplied).toHaveLength(1);
    expect(report.modifiersApplied[0]?.description).toBe("Patient harmed");
    expect(report.modifiersApplied[0]?.value).toBe(0.5);
  });

  it("returns a valid report even when called without prior computeFinalScore", () => {
    const state = makeState({ events: [{ points: 500 }] });
    const report = buildScoreReport(state, makeCaseDoc());
    expect(report.score.final).toBeGreaterThanOrEqual(0);
  });
});
