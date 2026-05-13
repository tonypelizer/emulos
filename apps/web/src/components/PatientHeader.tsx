import type { PatientState, SessionState, ScoreState } from "@emulos/types";
import styles from "./PatientHeader.module.css";

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `T+${m}m`;
}

interface Props {
  patient: PatientState;
  session: SessionState;
  score: ScoreState;
}

export function PatientHeader({ patient, session, score }: Props) {
  const { demographics } = patient;
  const sexShort =
    demographics.sex === "male"
      ? "M"
      : demographics.sex === "female"
        ? "F"
        : "O";

  const totalPoints = score.events.reduce((s, e) => s + e.points, 0);

  return (
    <header className={styles.root}>
      <div className={styles.identity}>
        <span className={styles.name}>{demographics.name}</span>
        <span className={styles.demo}>
          {demographics.age}
          {sexShort} · {demographics.weight}kg
        </span>
      </div>
      <div className={styles.right}>
        <div
          className={`${styles.scoreChip} ${totalPoints < 0 ? styles.scoreNeg : ""}`}
          aria-label={`Score: ${totalPoints} points`}
        >
          <span className={styles.scoreIcon} aria-hidden="true">★</span>
          <span className={styles.scoreValue}>{totalPoints >= 0 ? "+" : ""}{totalPoints}</span>
        </div>
        <div
          className={styles.timer}
          aria-label={`Game time: ${formatTime(session.gameTime)}`}
        >
          <span className={styles.timerIcon} aria-hidden="true">
            ⏱
          </span>
          <span className={styles.timerValue}>
            {formatTime(session.gameTime)}
          </span>
        </div>
      </div>
    </header>
  );
}
