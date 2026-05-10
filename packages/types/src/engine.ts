/**
 * engine.ts — Engine-specific types that cross the engine/UI boundary.
 *
 * These types define the shape of requests going INTO the engine and the
 * structured results coming OUT.  They are separate from GameState (runtime
 * state) and CaseDocument (content schema).
 */

import type {
  CaseDocument,
  ConditionDefinition,
  TestDefinition,
} from "./case.js";
import type { ComputedScore } from "./state.js";

// ─── Indexed case document ────────────────────────────────────────────────────
//
// The CaseLoader produces this once per session.  It wraps the validated
// CaseDocument with O(1) lookup maps so engine subsystems don't traverse
// arrays repeatedly.

export interface IndexedCaseDocument {
  /** The validated, parsed case data. */
  readonly caseData: CaseDocument;
  /** nodeId → CaseNode — built from caseData.nodes. */
  readonly nodesById: ReadonlyMap<string, CaseDocument["nodes"][string]>;
  /** conditionId → ConditionDefinition — from conditions-registry. */
  readonly conditionsById: ReadonlyMap<string, ConditionDefinition>;
  /** testId → TestDefinition — from tests-registry. */
  readonly testsById: ReadonlyMap<string, TestDefinition>;
}

// ─── Session creation ─────────────────────────────────────────────────────────

export interface SessionOptions {
  /**
   * Optional seed string for the PRNG.
   * Providing the same seed + same choices always produces the same run.
   * Omit to generate a random seed.
   */
  seed?: string;
}

// ─── Engine errors ────────────────────────────────────────────────────────────

export class EngineError extends Error {
  constructor(
    message: string,
    public readonly code: EngineErrorCode,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export type EngineErrorCode =
  | "CHOICE_NOT_AVAILABLE"
  | "NODE_NOT_FOUND"
  | "INVALID_STATE"
  | "CASE_VALIDATION_FAILED"
  | "DESERIALIZATION_FAILED";

// ─── Case validation ──────────────────────────────────────────────────────────

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

// ─── Score report ─────────────────────────────────────────────────────────────

/**
 * The full score report returned by GameEngine.getScoreReport().
 * Contains the ComputedScore plus narrative-friendly breakdowns.
 */
export interface ScoreReport {
  readonly score: ComputedScore;
  /** Every scored event in chronological order (points + reason). */
  readonly breakdown: ReadonlyArray<{
    readonly gameTime: number;
    readonly points: number;
    readonly reason: string;
    readonly category: string;
  }>;
  /** Modifiers that were applied (multipliers, flat adjustments). */
  readonly modifiersApplied: ReadonlyArray<{
    readonly description: string;
    readonly type: string;
    readonly value: number;
  }>;
}
