import { GameEngine } from "@emulos/engine";
import {
  getCase,
  conditionsRegistry,
  testsRegistry,
  medicationsRegistry,
  proceduresRegistry,
} from "@emulos/content";
import type {
  GameState,
  ScoreReport,
  FreeActionRequest,
  TestDefinition,
  MedicationDefinition,
  ProcedureDefinition,
  HintResult,
} from "@emulos/types";

// ─── Specialty filter ─────────────────────────────────────────────────────────

/**
 * Returns a filtered copy of `map` containing only items whose `specialties`
 * array includes `caseSpecialty`, or items with no specialties restriction.
 */
function filterBySpecialty<T extends { specialties: string[] }>(
  map: ReadonlyMap<string, T>,
  caseSpecialty: string,
): ReadonlyMap<string, T> {
  const result = new Map<string, T>();
  for (const [id, item] of map) {
    if (
      item.specialties.length === 0 ||
      item.specialties.includes(caseSpecialty)
    ) {
      result.set(id, item);
    }
  }
  return result;
}

/**
 * When an explicit allowlist is provided (A2), restrict the map to only those
 * IDs — preserving insertion order from the allowlist so the UI renders items
 * in the authored order.  When the allowlist is absent or empty the map is
 * returned unchanged (A3-only behaviour is preserved).
 */
function filterByAllowlist<T>(
  map: ReadonlyMap<string, T>,
  allowlist: string[] | undefined,
): ReadonlyMap<string, T> {
  if (!allowlist || allowlist.length === 0) return map;
  const result = new Map<string, T>();
  for (const id of allowlist) {
    const item = map.get(id);
    if (item !== undefined) result.set(id, item);
  }
  return result;
}

// ─── GameService ──────────────────────────────────────────────────────────────

/**
 * GameService — thin orchestration wrapper around GameEngine.
 * No React. Holds the engine instance for the active case session.
 * The React hook (useGame) holds the state; GameService provides the operations.
 */
export class GameService {
  private engine: GameEngine | null = null;
  /** Specialty string from the loaded case (e.g. "emergency", "obstetrics"). */
  private caseSpecialty: string = "";

  startCase(caseId: string, seed?: string): GameState {
    const rawCase = getCase(caseId);
    this.engine = GameEngine.fromRawJson(
      rawCase,
      conditionsRegistry,
      testsRegistry,
      medicationsRegistry,
      proceduresRegistry,
    );
    this.caseSpecialty = this.engine.getCaseDoc().caseData.metadata.specialty;
    return this.engine.createSession(seed !== undefined ? { seed } : {});
  }

  makeChoice(state: GameState, choiceId: string): GameState {
    if (!this.engine) throw new Error("No active case session.");
    return this.engine.processAction(state, choiceId);
  }

  performFreeAction(state: GameState, request: FreeActionRequest): GameState {
    if (!this.engine) throw new Error("No active case session.");
    return this.engine.performFreeAction(state, request);
  }

  getAvailableTests(): ReadonlyMap<string, TestDefinition> {
    const caseDoc = this.engine?.getCaseDoc();
    const all = caseDoc?.testsById ?? new Map<string, TestDefinition>();
    const bySpecialty = filterBySpecialty(all, this.caseSpecialty);
    return filterByAllowlist(bySpecialty, caseDoc?.caseData.relevantTests);
  }

  getAvailableMedications(): ReadonlyMap<string, MedicationDefinition> {
    const caseDoc = this.engine?.getCaseDoc();
    const all =
      caseDoc?.medicationsById ?? new Map<string, MedicationDefinition>();
    const bySpecialty = filterBySpecialty(all, this.caseSpecialty);
    return filterByAllowlist(
      bySpecialty,
      caseDoc?.caseData.relevantMedications,
    );
  }

  getAvailableProcedures(): ReadonlyMap<string, ProcedureDefinition> {
    const caseDoc = this.engine?.getCaseDoc();
    const all =
      caseDoc?.proceduresById ?? new Map<string, ProcedureDefinition>();
    const bySpecialty = filterBySpecialty(all, this.caseSpecialty);
    return filterByAllowlist(bySpecialty, caseDoc?.caseData.relevantProcedures);
  }

  isTerminal(state: GameState): boolean {
    return this.engine?.isTerminal(state) ?? false;
  }

  getScoreReport(state: GameState): ScoreReport | null {
    return this.engine?.getScoreReport(state) ?? null;
  }

  serializeState(state: GameState): string {
    if (!this.engine) throw new Error("No active case session.");
    return this.engine.serializeState(state);
  }

  useHint(state: GameState): { newState: GameState; result: HintResult } {
    if (!this.engine) throw new Error("No active case session.");
    return this.engine.useHint(state);
  }

  nodeHasHint(state: GameState): boolean {
    return this.engine?.hasHint(state) ?? false;
  }

  isFreeActionMode(): boolean {
    return this.engine?.getCaseDoc().caseData.freeActionMode ?? false;
  }

  getCaseTitle(): string {
    return this.engine?.getCaseDoc().caseData.metadata.title ?? "";
  }
}
