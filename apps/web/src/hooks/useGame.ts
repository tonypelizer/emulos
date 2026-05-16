import { useCallback, useRef, useState } from "react";
import type {
  GameState,
  ScoreReport,
  FreeActionRequest,
  TestDefinition,
  MedicationDefinition,
  ProcedureDefinition,
  ScoreEvent,
} from "@emulos/types";
import { GameService } from "../service/GameService";

export type Screen =
  | "splash"
  | "menu"
  | "expansions"
  | "select"
  | "play"
  | "summary"
  | "score";

interface HookState {
  screen: Screen;
  /** The selected expansion pack ID (null = core cases). Set when the player
   * picks an expansion and carried forward to the case selection screen. */
  selectedExpansionId: string | null;
  gameState: GameState | null;
  report: ScoreReport | null;
  error: string | null;
  /** Hint text from the last useHint() call, or null if none revealed yet. */
  currentHint: string | null;
  /** Score events added by the most recent action (penalty feedback). */
  lastActionEvents: ScoreEvent[];
}

const INITIAL: HookState = {
  screen: "splash",
  selectedExpansionId: null,
  gameState: null,
  report: null,
  error: null,
  currentHint: null,
  lastActionEvents: [],
};

export function useGame() {
  const service = useRef(new GameService());
  const [state, setState] = useState<HookState>(INITIAL);

  const goTo = useCallback((screen: Screen) => {
    setState((prev) => ({ ...prev, screen, error: null }));
  }, []);

  const selectExpansion = useCallback((expansionId: string | null) => {
    setState((prev) => ({
      ...prev,
      selectedExpansionId: expansionId,
      screen: "select",
      error: null,
    }));
  }, []);

  const startCase = useCallback((caseId: string) => {
    try {
      const gameState = service.current.startCase(caseId);
      setState((prev) => ({
        ...prev,
        screen: "play",
        gameState,
        report: null,
        error: null,
        currentHint: null,
        lastActionEvents: [],
      }));
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
        // Detect new score events added by this choice.
        const prevEventIds = new Set(
          prev.gameState.score.events.map((e) => e.id),
        );
        const newEvents = newState.score.events.filter(
          (e) => !prevEventIds.has(e.id),
        );
        if (service.current.isTerminal(newState)) {
          const report = service.current.getScoreReport(newState);
          return {
            ...prev,
            screen: "summary",
            gameState: newState,
            report,
            error: null,
            currentHint: null,
            lastActionEvents: newEvents,
          };
        }
        return {
          ...prev,
          gameState: newState,
          error: null,
          currentHint: null,
          lastActionEvents: newEvents,
        };
      } catch (err) {
        return {
          ...prev,
          error: err instanceof Error ? err.message : "Unexpected error.",
        };
      }
    });
  }, []);

  const performFreeAction = useCallback((request: FreeActionRequest) => {
    setState((prev) => {
      if (!prev.gameState) return prev;
      try {
        const newState = service.current.performFreeAction(
          prev.gameState,
          request,
        );
        // Detect new score events added by this action.
        const prevEventIds = new Set(
          prev.gameState.score.events.map((e) => e.id),
        );
        const newEvents = newState.score.events.filter(
          (e) => !prevEventIds.has(e.id),
        );
        if (service.current.isTerminal(newState)) {
          const report = service.current.getScoreReport(newState);
          return {
            ...prev,
            screen: "summary",
            gameState: newState,
            report,
            error: null,
            currentHint: null,
            lastActionEvents: newEvents,
          };
        }
        return {
          ...prev,
          gameState: newState,
          error: null,
          lastActionEvents: newEvents,
        };
      } catch (err) {
        return {
          ...prev,
          error: err instanceof Error ? err.message : "Unexpected error.",
        };
      }
    });
  }, []);

  const useHint = useCallback(() => {
    setState((prev) => {
      if (!prev.gameState) return prev;
      try {
        const { newState, result } = service.current.useHint(prev.gameState);
        // If no hint is available, keep currentHint as-is (button is hidden anyway).
        if (result.hint === null) return prev;
        // Collect the penalty event that was just added, if any.
        const prevEventIds = new Set(
          prev.gameState.score.events.map((e) => e.id),
        );
        const newEvents = newState.score.events.filter(
          (e) => !prevEventIds.has(e.id),
        );
        return {
          ...prev,
          gameState: newState,
          currentHint: result.hint,
          lastActionEvents: newEvents,
          error: null,
        };
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
    selectedExpansionId: state.selectedExpansionId,
    gameState: state.gameState,
    report: state.report,
    error: state.error,
    currentHint: state.currentHint,
    lastActionEvents: state.lastActionEvents,
    freeActionMode: service.current.isFreeActionMode(),
    caseTitle: service.current.getCaseTitle(),
    nodeHasHint: state.gameState
      ? service.current.nodeHasHint(state.gameState)
      : false,
    goTo,
    selectExpansion,
    startCase,
    makeChoice,
    performFreeAction,
    useHint,
    dismissError,
    // Registry accessors — stable references from the service (not re-created on state change)
    availableTests: service.current.getAvailableTests() as ReadonlyMap<
      string,
      TestDefinition
    >,
    availableMedications:
      service.current.getAvailableMedications() as ReadonlyMap<
        string,
        MedicationDefinition
      >,
    availableProcedures:
      service.current.getAvailableProcedures() as ReadonlyMap<
        string,
        ProcedureDefinition
      >,
  };
}
