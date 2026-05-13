import type { NarrativeEntry } from "@emulos/types";
import styles from "./ResultPopup.module.css";

const TYPE_LABEL: Partial<Record<NarrativeEntry["type"], string>> = {
  result: "Test Result",
  event: "⚠ Event",
  system: "Update",
};

const TYPE_ENTRY_CLASS: Partial<Record<NarrativeEntry["type"], string>> = {
  result: styles.entryResult ?? "",
  event: styles.entryEvent ?? "",
  system: styles.entrySystem ?? "",
};

interface Props {
  entries: NarrativeEntry[];
  onDismiss: () => void;
  /** Net score change from this action (positive = gained, negative = lost). */
  scoreDelta?: number;
}

export function ResultPopup({ entries, onDismiss, scoreDelta }: Props) {
  // Use time from the last entry in the batch.
  const gameTime = entries[entries.length - 1]?.gameTime ?? 0;

  const hasEvent = entries.some((e) => e.type === "event");
  const isNegative = hasEvent || (scoreDelta !== undefined && scoreDelta < 0);
  const isPositive = !isNegative && scoreDelta !== undefined && scoreDelta > 0;

  const panelClass = [
    styles.panel,
    isNegative ? styles.panelPenalty : "",
    isPositive ? styles.panelBonus : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={styles.backdrop}
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
      aria-label="Action result"
    >
      <div className={panelClass} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <span className={styles.time}>T+{gameTime}m</span>
          {scoreDelta !== undefined && scoreDelta !== 0 && (
            <span
              className={`${styles.scoreDelta} ${scoreDelta < 0 ? styles.scoreDeltaNeg : styles.scoreDeltaPos}`}
              aria-label={`${scoreDelta > 0 ? "+" : ""}${scoreDelta} points`}
            >
              {scoreDelta > 0 ? "+" : ""}
              {scoreDelta} pts
            </span>
          )}
        </header>

        {isNegative && (
          <div className={styles.penaltyBanner} role="alert">
            <span aria-hidden="true">⚠</span> Points deducted
          </div>
        )}

        <div className={styles.entryList}>
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`${styles.entryItem} ${TYPE_ENTRY_CLASS[entry.type] ?? ""}`}
            >
              {TYPE_LABEL[entry.type] && (
                <span className={styles.entryLabel}>
                  {TYPE_LABEL[entry.type]}
                </span>
              )}
              <p className={styles.text}>{entry.text}</p>
            </div>
          ))}
        </div>
        <button
          className={`${styles.dismiss} ${isNegative ? styles.dismissPenalty : ""}`}
          onClick={onDismiss}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
