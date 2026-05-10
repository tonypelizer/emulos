/**
 * CaseLoader.ts — Loads, validates, and indexes a case document.
 *
 * CaseLoader is responsible for the boundary between raw JSON (untrusted) and
 * the engine's internal IndexedCaseDocument.  It runs once per session at
 * creation time and produces an immutable document used by all subsystems.
 *
 * Validation strategy:
 *   1. Zod schema parse — catches shape/type errors with field-level messages.
 *   2. Reference integrity checks — catches dangling node/condition/test IDs.
 *   3. Graph reachability — verifies a 'start' node exists and all nextNodeIds
 *      resolve to defined nodes.
 *
 * Throws a structured CaseValidationError with all issues listed.  Never
 * throws a generic Error or swallows schema violations silently.
 */

import {
  CaseDocumentSchema,
  ConditionsRegistrySchema,
  TestsRegistrySchema,
  EngineError,
  type CaseDocument,
  type IndexedCaseDocument,
  type ValidationResult,
  type ValidationIssue,
} from "@emulos/types";
import { ZodError } from "zod";

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parses and validates a case JSON object alongside its registries.
 * Returns an IndexedCaseDocument ready for engine use.
 *
 * @param rawCase - The parsed JSON from a case file (unknown shape).
 * @param rawConditions - The parsed conditions-registry.json.
 * @param rawTests - The parsed tests-registry.json.
 * @throws EngineError (CASE_VALIDATION_FAILED) if any validation fails.
 */
export function loadCase(
  rawCase: unknown,
  rawConditions: unknown,
  rawTests: unknown,
): IndexedCaseDocument {
  const issues: ValidationIssue[] = [];

  // ── Step 1: Schema validation ────────────────────────────────────────────
  const caseResult = safeParse(CaseDocumentSchema, rawCase, "case");
  const conditionsResult = safeParse(
    ConditionsRegistrySchema,
    rawConditions,
    "conditionsRegistry",
  );
  const testsResult = safeParse(TestsRegistrySchema, rawTests, "testsRegistry");

  issues.push(...caseResult.issues);
  issues.push(...conditionsResult.issues);
  issues.push(...testsResult.issues);

  if (issues.length > 0) {
    throw buildValidationError(issues);
  }

  const caseData = caseResult.data as CaseDocument;

  // ── Step 2: Build indexes ─────────────────────────────────────────────────
  const nodesById = new Map(Object.entries(caseData.nodes));
  const conditionsById = new Map(
    Object.entries(
      conditionsResult.data as ReturnType<
        typeof ConditionsRegistrySchema.parse
      >,
    ),
  );
  const testsById = new Map(
    Object.entries(
      testsResult.data as ReturnType<typeof TestsRegistrySchema.parse>,
    ),
  );

  // ── Step 3: Reference integrity ───────────────────────────────────────────
  const refIssues = validateReferences(
    caseData,
    nodesById,
    conditionsById,
    testsById,
  );
  if (refIssues.length > 0) {
    throw buildValidationError(refIssues);
  }

  return Object.freeze({ caseData, nodesById, conditionsById, testsById });
}

/**
 * Validates a case without throwing — returns a ValidationResult.
 * Useful for the case editor or CI tooling.
 */
export function validateCase(
  rawCase: unknown,
  rawConditions: unknown,
  rawTests: unknown,
): ValidationResult {
  try {
    loadCase(rawCase, rawConditions, rawTests);
    return { valid: true, issues: [] };
  } catch (err) {
    if (err instanceof EngineError && err.code === "CASE_VALIDATION_FAILED") {
      // Extract issues from the error message (serialized as JSON).
      try {
        const payload = JSON.parse(err.message) as {
          issues: ValidationIssue[];
        };
        return { valid: false, issues: payload.issues };
      } catch {
        return {
          valid: false,
          issues: [{ path: "unknown", message: err.message }],
        };
      }
    }
    return {
      valid: false,
      issues: [{ path: "unknown", message: String(err) }],
    };
  }
}

// ─── Reference integrity ──────────────────────────────────────────────────────

function validateReferences(
  caseData: CaseDocument,
  nodesById: Map<string, CaseDocument["nodes"][string]>,
  conditionsById: Map<string, unknown>,
  testsById: Map<string, unknown>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Must have a 'start' node.
  if (!nodesById.has("start")) {
    issues.push({
      path: "nodes",
      message: 'Case must define a node with id "start".',
    });
  }

  // Every nextNodeId and event nodeId referenced in choices/effects must exist.
  for (const [nodeId, node] of nodesById) {
    for (const choice of node.choices) {
      if (!nodesById.has(choice.nextNodeId)) {
        issues.push({
          path: `nodes.${nodeId}.choices.${choice.id}.nextNodeId`,
          message: `References undefined node "${choice.nextNodeId}".`,
        });
      }

      // Check effect references.
      for (const effect of choice.effects) {
        if (effect.type === "trigger_event") {
          if (!nodesById.has(effect.eventId)) {
            issues.push({
              path: `nodes.${nodeId}.choices.${choice.id}.effects`,
              message: `trigger_event references undefined node "${effect.eventId}".`,
            });
          }
        }
        if (
          effect.type === "reveal_condition" ||
          effect.type === "add_condition"
        ) {
          if (!conditionsById.has(effect.conditionId)) {
            issues.push({
              path: `nodes.${nodeId}.choices.${choice.id}.effects`,
              message: `Condition "${effect.conditionId}" not found in conditions registry.`,
            });
          }
        }
        if (effect.type === "order_test" || effect.type === "result_test") {
          if (!testsById.has(effect.testId)) {
            issues.push({
              path: `nodes.${nodeId}.choices.${choice.id}.effects`,
              message: `Test "${effect.testId}" not found in tests registry.`,
            });
          }
        }
      }

      // Check node entry effect references too.
      for (const effect of node.effects) {
        if (effect.type === "trigger_event" && !nodesById.has(effect.eventId)) {
          issues.push({
            path: `nodes.${nodeId}.effects`,
            message: `trigger_event references undefined node "${effect.eventId}".`,
          });
        }
      }
    }
  }

  // Outcome nodes must have outcomeId.
  for (const [nodeId, node] of nodesById) {
    if (node.type === "outcome" && !node.outcomeId) {
      issues.push({
        path: `nodes.${nodeId}`,
        message: 'Outcome node is missing required "outcomeId" field.',
      });
    }
  }

  // Hidden condition IDs must exist in the registry.
  for (const cond of caseData.patient.conditions.hidden) {
    if (!conditionsById.has(cond.conditionId)) {
      issues.push({
        path: "patient.conditions.hidden",
        message: `Condition "${cond.conditionId}" not in conditions registry.`,
      });
    }
  }

  return issues;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type SafeParseResult<T> =
  | { data: T; issues: [] }
  | { data: null; issues: ValidationIssue[] };

function safeParse<T>(
  schema: { parse: (v: unknown) => T },
  value: unknown,
  label: string,
): SafeParseResult<T> {
  try {
    return { data: schema.parse(value), issues: [] };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        data: null,
        issues: err.errors.map((e) => ({
          path: `${label}.${e.path.join(".")}`,
          message: e.message,
        })),
      };
    }
    return {
      data: null,
      issues: [{ path: label, message: String(err) }],
    };
  }
}

function buildValidationError(issues: ValidationIssue[]): EngineError {
  return new EngineError(JSON.stringify({ issues }), "CASE_VALIDATION_FAILED");
}
