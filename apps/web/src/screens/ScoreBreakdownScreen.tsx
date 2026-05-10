import type { ScoreReport } from "@emulos/types";
import styles from "./ScoreBreakdownScreen.module.css";

const CATEGORY_LABEL: Record<string, string> = {
  "critical-action": "Critical",
  "optional-bonus": "Bonus",
  "time-bonus": "Time",
  penalty: "Penalty",
};

interface Props {
  report: ScoreReport;
  onBack: () => void;
}

export function ScoreBreakdownScreen({ report, onBack }: Props) {
  const { score, breakdown, modifiersApplied } = report;

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <button
          className={styles.backBtn}
          onClick={onBack}
          aria-label="Back to results"
        >
          ← Results
        </button>
        <h1 className={styles.heading}>Score Breakdown</h1>
      </header>

      <div className={styles.content}>
        {/* Score events table */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Scored Events</h2>
          <div className={styles.table} role="table" aria-label="Scored events">
            <div className={styles.tableHead} role="row">
              <span role="columnheader">Time</span>
              <span role="columnheader" className={styles.reasonCol}>
                Action
              </span>
              <span role="columnheader">Cat</span>
              <span role="columnheader" className={styles.pointsCol}>
                Pts
              </span>
            </div>
            {breakdown.map((ev, i) => (
              <div
                key={i}
                className={`${styles.tableRow} ${ev.points < 0 ? styles.rowNegative : styles.rowPositive}`}
                role="row"
              >
                <span role="cell" className={styles.cellMono}>
                  T+{ev.gameTime}m
                </span>
                <span role="cell" className={styles.reasonCol}>
                  {ev.reason}
                </span>
                <span
                  role="cell"
                  className={styles.catBadge}
                  data-cat={ev.category}
                >
                  {CATEGORY_LABEL[ev.category] ?? ev.category}
                </span>
                <span
                  role="cell"
                  className={`${styles.points} ${styles.cellMono}`}
                >
                  {ev.points > 0 ? "+" : ""}
                  {ev.points}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Modifiers */}
        {modifiersApplied.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Modifiers Applied</h2>
            <ul className={styles.modList}>
              {modifiersApplied.map((m, i) => (
                <li key={i} className={styles.modItem}>
                  <span className={styles.modDesc}>{m.description}</span>
                  <span className={styles.modValue}>
                    {m.type === "multiplier"
                      ? `×${m.value}`
                      : `${m.value > 0 ? "+" : ""}${m.value}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Final calculation */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Final Calculation</h2>
          <dl className={styles.calcList}>
            <div className={styles.calcRow}>
              <dt>Raw score</dt>
              <dd className={styles.mono}>{score.raw}</dd>
            </div>
            {score.timeBonusEarned > 0 && (
              <div className={styles.calcRow}>
                <dt>Time bonus</dt>
                <dd className={`${styles.mono} ${styles.positive}`}>
                  +{score.timeBonusEarned}
                </dd>
              </div>
            )}
            {modifiersApplied.length > 0 && (
              <div className={styles.calcRow}>
                <dt>After modifiers</dt>
                <dd className={styles.mono}>{score.afterModifiers}</dd>
              </div>
            )}
            <div className={`${styles.calcRow} ${styles.calcFinal}`}>
              <dt>Final</dt>
              <dd className={styles.mono}>
                {score.final} / {score.maxPossible}
              </dd>
            </div>
            <div className={styles.calcRow}>
              <dt>Grade</dt>
              <dd>
                <span className={styles.grade} data-grade={score.grade}>
                  {score.grade}
                </span>
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}
