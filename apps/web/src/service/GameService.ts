import { GameEngine } from "@emulos/engine";
import { getCase, conditionsRegistry, testsRegistry } from "@emulos/content";
import type { GameState, ScoreReport } from "@emulos/types";

/**
 * GameService — thin orchestration wrapper around GameEngine.
 * No React. Holds the engine instance for the active case session.
 * The React hook (useGame) holds the state; GameService provides the operations.
 */
export class GameService {
  private engine: GameEngine | null = null;

  startCase(caseId: string, seed?: string): GameState {
    const rawCase = getCase(caseId);
    this.engine = GameEngine.fromRawJson(
      rawCase,
      conditionsRegistry,
      testsRegistry,
    );
    return this.engine.createSession(seed !== undefined ? { seed } : {});
  }

  makeChoice(state: GameState, choiceId: string): GameState {
    if (!this.engine) throw new Error("No active case session.");
    return this.engine.processAction(state, choiceId);
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
}
