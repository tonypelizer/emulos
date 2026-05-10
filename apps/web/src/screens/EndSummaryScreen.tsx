import type { GameState, ScoreReport, Grade } from "@emulos/types";
import styles from "./EndSummaryScreen.module.css";

const GRADE_LABEL: Record<Grade, string> = {
  S: "Outstanding",
  A: "Excellent",
  B: "Good",
  C: "Passing",
  F: "Failed",
};

interface Props {
  state: GameState;
  report: ScoreReport;
  onViewScore: () => void;
  onPlayAgain: () => void;
}

export function EndSummaryScreen({
  state,
  report,
  onViewScore,
  onPlayAgain,
}: Props) {
  const computed = report.score;

  const outcomeNode = state.progress.currentNodeId
    .replace(/-/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

  // Pull the last narrative entry for the outcome text
  const finalEntry = [...state.progress.narrativeLog]
    .reverse()
    .find((e) => e.type === "narrative");

  return (
    <main className={styles.root}>
      <div className={styles.inner}>
        <div className={styles.gradeBadge} data-grade={computed.grade}>
          <span className={styles.gradeChar}>{computed.grade}</span>
          <span className={styles.gradeLabel}>
            {GRADE_LABEL[computed.grade]}
          </span>
        </div>

        <div className={styles.scoreRow}>
          <span className={styles.finalScore}>{computed.final}</span>
          <span className={styles.maxScore}>/ {computed.maxPossible}</span>
        </div>

        <div
          className={styles.pctBar}
          aria-label={`Score: ${computed.percentage}%`}
        >
          <div
            className={styles.pctFill}
            style={{ width: `${computed.percentage}%` }}
          />
        </div>

        <div className={styles.meta}>
          <span>{computed.passed ? "✓ Passed" : "✗ Not Passed"}</span>
          <span>·</span>
          <span>{computed.percentage}%</span>
          <span>·</span>
          <span>T+{state.session.gameTime}m</span>
        </div>

        {finalEntry !== undefined && (
          <div className={styles.outcome}>
            <span className={styles.outcomeName}>{outcomeNode}</span>
            <p className={styles.outcomeText}>{finalEntry.text}</p>
          </div>
        )}

        <div className={styles.criticals}>
          {computed.criticalActionsHit.length > 0 && (
            <div className={styles.critGroup}>
              <h2 className={styles.critHeading}>Critical Actions Completed</h2>
              <ul className={styles.critList}>
                {computed.criticalActionsHit.map((a) => (
                  <li key={a} className={styles.critHit}>
                    <span aria-hidden="true">✓</span> {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {computed.criticalActionsMissed.length > 0 && (
            <div className={styles.critGroup}>
              <h2 className={styles.critHeading}>Critical Actions Missed</h2>
              <ul className={styles.critList}>
                {computed.criticalActionsMissed.map((a) => (
                  <li key={a} className={styles.critMiss}>
                    <span aria-hidden="true">✗</span> {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {computed.timeBonusEarned > 0 && (
          <p className={styles.timeBonus}>
            ⚡ Time bonus earned: +{computed.timeBonusEarned} pts
          </p>
        )}

        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={onViewScore} autoFocus>
            View Score Breakdown
          </button>
          <button className={styles.btnSecondary} onClick={onPlayAgain}>
            Play Again
          </button>
        </div>
      </div>
    </main>
  );
}
