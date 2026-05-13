/**
 * SessionManager.ts — Session lifecycle and serialization.
 *
 * Handles creating the initial GameState from a case document and
 * serializing/deserializing state to/from JSON strings (for localStorage,
 * URL sharing, or test fixtures).
 *
 * SessionManager does NOT hold mutable state — it is a collection of
 * pure functions that operate on GameState values.
 */

import type {
  GameState,
  PatientState,
  PatientVitals,
  IndexedCaseDocument,
  SessionOptions,
} from "@emulos/types";
import { EngineError } from "@emulos/types";
import { generateId } from "./utils/id.js";
import { seedFromString } from "./utils/prng.js";

// ─── Session creation ─────────────────────────────────────────────────────────

/**
 * Builds the initial GameState for a new session from a validated case document.
 * The returned state has gameTime = 0, phase = 'intro', and no narrative log.
 * Call GameEngine.createSession() which subsequently enters the start node.
 */
export function createInitialState(
  caseDoc: IndexedCaseDocument,
  options: SessionOptions = {},
): GameState {
  const seed = options.seed ?? generateId();
  // Validate the seed can be converted — this also warms the PRNG.
  seedFromString(seed);

  const { patient } = caseDoc.caseData;

  const demographics = {
    name: patient.demographics.name,
    age: patient.demographics.age,
    sex: patient.demographics.sex,
    weight: patient.demographics.weight,
    occupation: patient.demographics.occupation,
    riskFactors: patient.riskFactors,
  } as const;

  const baselineVitals: PatientVitals = {
    heartRate: patient.initialVitals.heartRate,
    bloodPressure: {
      systolic: patient.initialVitals.bloodPressure.systolic,
      diastolic: patient.initialVitals.bloodPressure.diastolic,
    },
    respiratoryRate: patient.initialVitals.respiratoryRate,
    temperature: patient.initialVitals.temperature,
    oxygenSaturation: patient.initialVitals.oxygenSaturation,
    consciousness: patient.initialVitals.consciousness,
    painScore: patient.initialVitals.painScore,
  };

  const patientState: PatientState = {
    demographics,
    baselineVitals,
    vitals: { ...baselineVitals },
    conditions: {
      active: patient.conditions.active.map((c) => ({
        conditionId: c.conditionId,
        severity: c.severity,
        onsetGameTime: 0,
        revealedAt: 0, // Active from the start — already known to the player.
      })),
      hidden: patient.conditions.hidden.map((c) => ({
        conditionId: c.conditionId,
        severity: c.severity,
        onsetGameTime: 0,
        // revealedAt is undefined — hidden from player.
      })),
      resolved: [],
    },
    collectedHistory: [],
    examinationFindings: [],
  };

  return {
    session: {
      sessionId: generateId(),
      caseId: caseDoc.caseData.id,
      seed,
      startedAt: new Date().toISOString(),
      gameTime: 0,
      phase: "intro",
    },
    patient: patientState,
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

// ─── Serialization ────────────────────────────────────────────────────────────

/**
 * Serializes a GameState to a JSON string.
 * The returned string can be stored in localStorage and passed back to
 * deserializeState() to resume a session exactly.
 */
export function serializeState(state: GameState): string {
  return JSON.stringify(state);
}

/**
 * Deserializes a JSON string back to a GameState.
 * Performs a basic structural check but does NOT re-validate against the
 * case schema (the state may have evolved since the session started).
 *
 * @throws EngineError (DESERIALIZATION_FAILED) if the JSON is invalid.
 */
export function deserializeState(serialized: string): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new EngineError(
      "Failed to parse serialized state: invalid JSON.",
      "DESERIALIZATION_FAILED",
    );
  }

  if (!isGameStateShape(parsed)) {
    throw new EngineError(
      "Deserialized object does not match GameState shape.",
      "DESERIALIZATION_FAILED",
    );
  }

  return parsed as GameState;
}

// ─── Structural guard ─────────────────────────────────────────────────────────

/**
 * Lightweight duck-type check — verifies the top-level keys expected on a
 * GameState are present.  Not a full schema validation.
 */
function isGameStateShape(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["session"] === "object" &&
    typeof obj["patient"] === "object" &&
    typeof obj["player"] === "object" &&
    typeof obj["progress"] === "object" &&
    typeof obj["score"] === "object"
  );
}
