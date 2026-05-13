import { useCallback, useRef, useState } from "react";
import type {
  GameState,
  FreeActionRequest,
  TestDefinition,
  MedicationDefinition,
  ProcedureDefinition,
  NarrativeEntry,
  ScoreEvent,
} from "@emulos/types";
import { PatientHeader } from "../components/PatientHeader";
import { VitalsPanel } from "../components/VitalsPanel";
import { NarrativeLog } from "../components/NarrativeLog";
import { ActionPanel } from "../components/ActionPanel";
import { TestResultsPanel } from "../components/TestResultsPanel";
import { ResultPopup } from "../components/ResultPopup";
import { CaseBriefModal } from "../components/CaseBriefModal";
import { PenaltyToast } from "../components/PenaltyToast";
import styles from "./GameplayScreen.module.css";

interface Props {
  state: GameState;
  onChoice: (choiceId: string) => void;
  onFreeAction: (request: FreeActionRequest) => void;
  onHint: () => void;
  currentHint: string | null;
  freeActionMode: boolean;
  availableTests: ReadonlyMap<string, TestDefinition>;
  availableMedications: ReadonlyMap<string, MedicationDefinition>;
  availableProcedures: ReadonlyMap<string, ProcedureDefinition>;
  caseTitle: string;
  /** New score events from the most recent action — used for penalty feedback. */
  lastActionEvents: ScoreEvent[];
}

export function GameplayScreen({
  state,
  onChoice,
  onFreeAction,
  onHint,
  currentHint,
  freeActionMode,
  availableTests,
  availableMedications,
  availableProcedures,
  caseTitle,
  lastActionEvents,
}: Props) {
  // Case brief shown once when the case loads.
  const [hasDismissedBrief, setHasDismissedBrief] = useState(false);

  // Queue of entry batches — each free action produces one batch.
  const [popupQueue, setPopupQueue] = useState<
    { entries: NarrativeEntry[]; scoreDelta: number }[]
  >([]);
  const currentPopup = popupQueue[0] ?? null;

  // Running score total to compute delta for each free-action popup.
  const prevScoreTotalRef = useRef<number>(
    state.score.events.reduce((s, e) => s + e.points, 0),
  );

  const handleNewEntries = useCallback(
    (entries: NarrativeEntry[]) => {
      const currentTotal = state.score.events.reduce((s, e) => s + e.points, 0);
      const delta = currentTotal - prevScoreTotalRef.current;
      prevScoreTotalRef.current = currentTotal;
      setPopupQueue((q) => [...q, { entries, scoreDelta: delta }]);
    },
    [state.score.events],
  );

  const handleDismiss = useCallback(() => {
    setPopupQueue((q) => q.slice(1));
  }, []);

  // Penalty events from story choices (non-popup path).
  // Only show if there's no popup queued (avoid double feedback).
  const penaltyEvents = lastActionEvents.filter(
    (e) => e.category === "penalty" && e.points < 0,
  );
  const showPenaltyToast = penaltyEvents.length > 0 && popupQueue.length === 0;

  const briefText = state.progress.narrativeLog[0]?.text ?? "";
  const patientName = `${state.patient.demographics.name}, ${state.patient.demographics.age}${state.patient.demographics.sex === "male" ? "M" : state.patient.demographics.sex === "female" ? "F" : "O"}`;

  return (
    <div className={styles.root}>
      {/* Case brief shown on game start */}
      {!hasDismissedBrief && (
        <CaseBriefModal
          text={briefText}
          caseTitle={caseTitle}
          patientName={patientName}
          onBegin={() => setHasDismissedBrief(true)}
        />
      )}

      <PatientHeader patient={state.patient} session={state.session} />
      <VitalsPanel vitals={state.patient.vitals} />
      <NarrativeLog
        entries={state.progress.narrativeLog}
        {...(hasDismissedBrief && { onNewEntries: handleNewEntries })}
      />
      <TestResultsPanel
        orderedTests={state.player.orderedTests}
        testsById={availableTests}
      />
      <ActionPanel
        choices={state.progress.activeChoices}
        onChoice={onChoice}
        availableTests={availableTests}
        availableMedications={availableMedications}
        availableProcedures={availableProcedures}
        orderedTests={state.player.orderedTests}
        dispensedMedications={state.player.dispensedMedications}
        performedProcedures={state.player.performedProcedures}
        onFreeAction={onFreeAction}
        onHint={onHint}
        currentHint={currentHint}
        freeActionMode={freeActionMode}
        currentNodeId={state.progress.currentNodeId}
        hintsUsedAtNodes={state.player.hintsUsedAtNodes}
      />

      {/* Penalty toast for story-choice penalties (no popup produced) */}
      {showPenaltyToast && <PenaltyToast events={penaltyEvents} />}

      {currentPopup && (
        <ResultPopup
          entries={currentPopup.entries}
          scoreDelta={currentPopup.scoreDelta}
          onDismiss={handleDismiss}
        />
      )}
    </div>
  );
}
