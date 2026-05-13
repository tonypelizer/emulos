/**
 * index.ts — Content package registry.
 *
 * Provides typed access to all case files, condition definitions, and test
 * definitions bundled with @emulos/content.  The GameService in apps/web
 * imports from here — it never touches JSON files directly.
 *
 * Usage:
 *   import { getCase, conditionsRegistry, testsRegistry, medicationsRegistry, proceduresRegistry } from '@emulos/content';
 *   const engine = GameEngine.fromRawJson(
 *     getCase('chest-pain-001'),
 *     conditionsRegistry,
 *     testsRegistry,
 *     medicationsRegistry,
 *     proceduresRegistry,
 *   );
 */

// JSON imports — Vite/Vitest resolve these natively. Node ≥ 22 uses --experimental-import-meta-resolve.
import chestPain001 from "../cases/general/chest-pain-001.json";
import fever001 from "../cases/general/fever-001.json";
import confusion001 from "../cases/general/confusion-001.json";
import ectopicPregnancy001 from "../cases/obgyn/ectopic-pregnancy-001.json";
import firstTrimesterBleeding001 from "../cases/obgyn/first-trimester-bleeding-001.json";
import preeclampsia001 from "../cases/obgyn/preeclampsia-001.json";
import placentalAbruption001 from "../cases/obgyn/placental-abruption-001.json";
import conditionsRegistryJson from "../conditions/conditions-registry.json";
import testsRegistryJson from "../tests-catalog/tests-registry.json";
import medicationsRegistryJson from "../medications/medications-registry.json";
import proceduresRegistryJson from "../procedures/procedures-registry.json";

// ─── Registry exports ─────────────────────────────────────────────────────────

/** Raw conditions-registry.json — pass directly to GameEngine.fromRawJson(). */
export const conditionsRegistry: unknown = conditionsRegistryJson;

/** Raw tests-registry.json — pass directly to GameEngine.fromRawJson(). */
export const testsRegistry: unknown = testsRegistryJson;

/** Raw medications-registry.json — pass directly to GameEngine.fromRawJson(). */
export const medicationsRegistry: unknown = medicationsRegistryJson;

/** Raw procedures-registry.json — pass directly to GameEngine.fromRawJson(). */
export const proceduresRegistry: unknown = proceduresRegistryJson;

// ─── Case registry ────────────────────────────────────────────────────────────

/** Map of caseId → raw case JSON. Add new cases here as they are authored. */
const CASE_REGISTRY: Record<string, unknown> = {
  "fever-001": fever001,
  // "chest-pain-001": chestPain001,
  // "confusion-001": confusion001,
  // "ectopic-pregnancy-001": ectopicPregnancy001,
  // "first-trimester-bleeding-001": firstTrimesterBleeding001,
  // "preeclampsia-001": preeclampsia001,
  // "placental-abruption-001": placentalAbruption001,
};

/**
 * Returns the raw case JSON for the given case ID.
 * Throws if the case is not found — use `listCaseIds()` to enumerate available cases.
 */
export function getCase(id: string): unknown {
  const caseJson = CASE_REGISTRY[id];
  if (caseJson === undefined) {
    const available = Object.keys(CASE_REGISTRY).join(", ");
    throw new Error(
      `Case "${id}" not found in content registry. Available cases: ${available}`,
    );
  }
  return caseJson;
}

/** Returns all registered case IDs. */
export function listCaseIds(): string[] {
  return Object.keys(CASE_REGISTRY);
}
