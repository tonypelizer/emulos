import { useEffect, useState } from "react";
import type { ScoreEvent } from "@emulos/types";
import styles from "./PenaltyToast.module.css";

interface Props {
  /** New penalty events from the last action. Clear by passing []. */
  events: ScoreEvent[];
}

/**
 * Displays a brief animated toast for each penalty score event.
 * Auto-dismisses after 3.5 s.  Used for story-choice penalties that
 * don't produce a ResultPopup (no free-action narrative entries).
 */
export function PenaltyToast({ events }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (events.length === 0) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const id = window.setTimeout(() => setVisible(false), 3500);
    return () => window.clearTimeout(id);
  }, [events]);

  if (!visible || events.length === 0) return null;

  const totalDelta = events.reduce((sum, e) => sum + e.points, 0);

  return (
    <div
      className={styles.toast}
      role="alert"
      aria-live="assertive"
      aria-label={`Penalty: ${totalDelta} points`}
    >
      <span className={styles.icon} aria-hidden="true">
        ⚠
      </span>
      <div className={styles.body}>
        <span className={styles.delta}>{totalDelta} pts</span>
        {events.map((e) => (
          <p key={e.id} className={styles.reason}>
            {e.reason}
          </p>
        ))}
      </div>
    </div>
  );
}
