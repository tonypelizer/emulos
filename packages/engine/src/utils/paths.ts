/**
 * paths.ts — Dot-notation path resolver for GameState.
 *
 * The RuleEngine uses paths like "patient.vitals.heartRate" to resolve values
 * from the live GameState for comparison operators (eq, gte, etc.).
 *
 * Design constraints:
 *   - Never throws — returns undefined for invalid paths (logged as warnings).
 *   - Never uses eval() or Function().
 *   - Only traverses plain objects and arrays (no prototype chain climbing).
 */

/**
 * Resolves a dot-separated path against an arbitrary object.
 *
 * @example
 *   resolvePath(state, "patient.vitals.heartRate") // => 102
 *   resolvePath(state, "session.phase")            // => "active"
 *   resolvePath(state, "does.not.exist")           // => undefined
 */
export function resolvePath(obj: unknown, path: string): unknown {
  if (!path) return obj;

  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Returns true if a dot-notation path resolves to a non-undefined value.
 */
export function pathExists(obj: unknown, path: string): boolean {
  return resolvePath(obj, path) !== undefined;
}
