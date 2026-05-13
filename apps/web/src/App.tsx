import { useGame } from "./hooks/useGame";
import { SplashScreen } from "./screens/SplashScreen";
import { MainMenuScreen } from "./screens/MainMenuScreen";
import { CaseSelectionScreen } from "./screens/CaseSelectionScreen";
import { GameplayScreen } from "./screens/GameplayScreen";
import { EndSummaryScreen } from "./screens/EndSummaryScreen";
import { ScoreBreakdownScreen } from "./screens/ScoreBreakdownScreen";

export function App() {
  const {
    screen,
    gameState,
    report,
    error,
    currentHint,
    freeActionMode,
    caseTitle,
    lastActionEvents,
    nodeHasHint,
    goTo,
    startCase,
    makeChoice,
    performFreeAction,
    useHint,
    dismissError,
    availableTests,
    availableMedications,
    availableProcedures,
  } = useGame();

  return (
    <>
      {error !== null && (
        <div
          role="alert"
          style={{
            position: "fixed",
            top: "var(--sp-4)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            background: "var(--c-critical-bg)",
            border: "1px solid var(--c-critical-border)",
            color: "var(--c-critical)",
            padding: "var(--sp-3) var(--sp-4)",
            borderRadius: "var(--r-md)",
            fontSize: "0.875rem",
            maxWidth: "min(480px, 90vw)",
            display: "flex",
            gap: "var(--sp-3)",
            alignItems: "center",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={dismissError}
            aria-label="Dismiss error"
            style={{
              color: "var(--c-critical)",
              fontWeight: 600,
              fontSize: "1rem",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {screen === "splash" && <SplashScreen onEnter={() => goTo("menu")} />}
      {screen === "menu" && (
        <MainMenuScreen onSelectCases={() => goTo("select")} />
      )}
      {screen === "select" && (
        <CaseSelectionScreen
          onSelectCase={startCase}
          onBack={() => goTo("menu")}
        />
      )}
      {screen === "play" && gameState !== null && (
        <GameplayScreen
          state={gameState}
          onChoice={makeChoice}
          onFreeAction={performFreeAction}
          onHint={useHint}
          currentHint={currentHint}
          freeActionMode={freeActionMode}
          availableTests={availableTests}
          availableMedications={availableMedications}
          availableProcedures={availableProcedures}
          caseTitle={caseTitle}
          lastActionEvents={lastActionEvents}
          nodeHasHint={nodeHasHint}
        />
      )}
      {screen === "summary" && gameState !== null && report !== null && (
        <EndSummaryScreen
          state={gameState}
          report={report}
          onViewScore={() => goTo("score")}
          onPlayAgain={() => goTo("select")}
        />
      )}
      {screen === "score" && report !== null && (
        <ScoreBreakdownScreen report={report} onBack={() => goTo("summary")} />
      )}
    </>
  );
}
