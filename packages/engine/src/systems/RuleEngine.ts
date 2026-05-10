/**
 * RuleEngine.ts — Boolean condition evaluator.
 *
 * Evaluates ConditionExpr trees against a live GameState.  This is the single
 * place where all branching logic is resolved.  No eval(), no Function(),
 * no string interpolation — conditions are pure data.
 *
 * Invariants:
 *   - Never throws for unknown paths or operators — returns false and warns.
 *   - Fully deterministic given the same (expr, state) pair.
 *   - All operators are O(1) or O(n) in collection size.
 */

import type { ConditionExpr } from "@emulos/types";
import type { GameState } from "@emulos/types";
import { resolvePath } from "../utils/paths.js";

/**
 * Evaluates a ConditionExpr recursively against the provided GameState.
 * Returns a boolean indicating whether the condition is satisfied.
 */
export function evaluateCondition(
  expr: ConditionExpr,
  state: GameState,
): boolean {
  switch (expr.op) {
    // ── Logical combinators ────────────────────────────────────────────────
    case "and":
      return expr.conditions.every((c) => evaluateCondition(c, state));

    case "or":
      return expr.conditions.some((c) => evaluateCondition(c, state));

    case "not":
      return !evaluateCondition(expr.condition, state);

    // ── Dot-path comparisons ───────────────────────────────────────────────
    case "eq": {
      const resolved = resolvePath(state, expr.path);
      if (resolved === undefined) {
        console.warn(`[RuleEngine] Path not found: "${expr.path}"`);
        return false;
      }
      return resolved === expr.value;
    }

    case "neq": {
      const resolved = resolvePath(state, expr.path);
      if (resolved === undefined) {
        console.warn(`[RuleEngine] Path not found: "${expr.path}"`);
        return false;
      }
      return resolved !== expr.value;
    }

    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const resolved = resolvePath(state, expr.path);
      if (typeof resolved !== "number") {
        console.warn(
          `[RuleEngine] Expected number at path "${expr.path}", got ${typeof resolved}`,
        );
        return false;
      }
      if (expr.op === "gt") return resolved > expr.value;
      if (expr.op === "gte") return resolved >= expr.value;
      if (expr.op === "lt") return resolved < expr.value;
      return resolved <= expr.value;
    }

    // ── Knowledge checks ───────────────────────────────────────────────────
    case "has_knowledge":
      return state.player.knowledge.includes(expr.knowledgeId);

    // ── Test state ─────────────────────────────────────────────────────────
    case "test_ordered":
      return state.player.orderedTests.some((t) => t.testId === expr.testId);

    case "test_resulted":
      return state.player.orderedTests.some(
        (t) => t.testId === expr.testId && t.result !== null,
      );

    // ── Condition checks ───────────────────────────────────────────────────
    case "condition_active":
      return state.patient.conditions.active.some(
        (c) => c.conditionId === expr.conditionId,
      );

    case "condition_revealed":
      // Revealed = in the active list AND revealedAt is set
      return state.patient.conditions.active.some(
        (c) => c.conditionId === expr.conditionId && c.revealedAt !== undefined,
      );

    // ── Time checks ────────────────────────────────────────────────────────
    case "time_elapsed_gte":
      return state.session.gameTime >= expr.minutes;

    // ── Phase check ────────────────────────────────────────────────────────
    case "game_phase":
      return state.session.phase === expr.phase;

    // ── Safety net ─────────────────────────────────────────────────────────
    default: {
      // TypeScript exhaustiveness: this branch should never be reached.
      const exhaustiveCheck: never = expr;
      console.warn(
        `[RuleEngine] Unknown condition operator: ${(exhaustiveCheck as { op: string }).op}`,
      );
      return false;
    }
  }
}

/**
 * Convenience: evaluates an optional condition.
 * Returns true when no condition is specified (unconditional pass).
 */
export function evaluateOptionalCondition(
  expr: ConditionExpr | null | undefined,
  state: GameState,
): boolean {
  if (expr === null || expr === undefined) return true;
  return evaluateCondition(expr, state);
}
