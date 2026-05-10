import { useCallback, useRef, useState } from "react";
import type { GameState, ScoreReport } from "@emulos/types";
import { GameService } from "../service/GameService";

export type Screen =
  | "splash"
  | "menu"
  | "select"
  | "play"
  | "summary"
  | "score";

interface HookState {
  screen: Screen;
  gameState: GameState | null;
  report: ScoreReport | null;
  error: string | null;
}

const INITIAL: HookState = {
  screen: "splash",
  gameState: null,
  report: null,
  error: null,
};

export function useGame() {
  const service = useRef(new GameService());
  const [state, setState] = useState<HookState>(INITIAL);

  const goTo = useCallback((screen: Screen) => {
    setState((prev) => ({ ...prev, screen, error: null }));
  }, []);

  const startCase = useCallback((caseId: string) => {
    try {
      const gameState = service.current.startCase(caseId);
      setState({ screen: "play", gameState, report: null, error: null });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to load case.",
      }));
    }
  }, []);

  const makeChoice = useCallback((choiceId: string) => {
    setState((prev) => {
      if (!prev.gameState) return prev;
      try {
        const newState = service.current.makeChoice(prev.gameState, choiceId);
        if (service.current.isTerminal(newState)) {
          const report = service.current.getScoreReport(newState);
          return {
            screen: "summary",
            gameState: newState,
            report,
            error: null,
          };
        }
        return { ...prev, gameState: newState, error: null };
      } catch (err) {
        return {
          ...prev,
          error: err instanceof Error ? err.message : "Unexpected error.",
        };
      }
    });
  }, []);

  const dismissError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    screen: state.screen,
    gameState: state.gameState,
    report: state.report,
    error: state.error,
    goTo,
    startCase,
    makeChoice,
    dismissError,
  };
}
