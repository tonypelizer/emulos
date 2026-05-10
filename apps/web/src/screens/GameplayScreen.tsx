import type { GameState } from "@emulos/types";
import { PatientHeader } from "../components/PatientHeader";
import { VitalsPanel } from "../components/VitalsPanel";
import { NarrativeLog } from "../components/NarrativeLog";
import { ChoiceList } from "../components/ChoiceList";
import styles from "./GameplayScreen.module.css";

interface Props {
  state: GameState;
  onChoice: (choiceId: string) => void;
}

export function GameplayScreen({ state, onChoice }: Props) {
  return (
    <div className={styles.root}>
      <PatientHeader patient={state.patient} session={state.session} />
      <VitalsPanel vitals={state.patient.vitals} />
      <NarrativeLog entries={state.progress.narrativeLog} />
      <ChoiceList choices={state.progress.activeChoices} onChoice={onChoice} />
    </div>
  );
}
