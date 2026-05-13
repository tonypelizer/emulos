import { useEffect, useRef } from "react";
import type { NarrativeEntry } from "@emulos/types";
import { RichText } from "./RichText";
import styles from "./NarrativeLog.module.css";

const TYPE_CLASS: Record<NarrativeEntry["type"], string> = {
  narrative: styles["typeNarrative"] ?? "",
  result: styles["typeResult"] ?? "",
  event: styles["typeEvent"] ?? "",
  system: styles["typeSystem"] ?? "",
};

const TYPE_LABEL: Record<NarrativeEntry["type"], string> = {
  narrative: "",
  result: "Test Result",
  event: "⚠ Event",
  system: "System",
};

interface Props {
  entries: NarrativeEntry[];
  onNewEntries?: (entries: NarrativeEntry[]) => void;
}

export function NarrativeLog({ entries, onNewEntries }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  // Initialised to current length so the first effect run (on mount) is a no-op.
  const prevCountRef = useRef(entries.length);
  // Stable ref so the effect dep array only needs [entries].
  const onNewEntriesRef = useRef(onNewEntries);
  useEffect(() => {
    onNewEntriesRef.current = onNewEntries;
  });

  useEffect(() => {
    const prev = prevCountRef.current;
    const next = entries.length;
    prevCountRef.current = next;

    if (next <= prev) return; // no new entries (covers initial mount)

    const newEntries = entries.slice(prev);

    if (onNewEntriesRef.current) {
      // Popup handles the notification — no auto-scroll needed.
      onNewEntriesRef.current(newEntries);
    } else {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries]);

  return (
    <section
      className={styles.root}
      aria-label="Narrative log"
      aria-live="polite"
      aria-relevant="additions"
    >
      {entries.map((entry) => (
        <article
          key={entry.id}
          className={`${styles.entry} ${TYPE_CLASS[entry.type] ?? ""} ${
            entry.isNew ? styles.isNew : ""
          }`}
        >
          {entry.type !== "narrative" && (
            <span className={styles.typeLabel}>{TYPE_LABEL[entry.type]}</span>
          )}
          {entry.type === "narrative" || entry.type === "event" ? (
            <RichText text={entry.text} className={styles.text} />
          ) : (
            <p className={styles.text}>{entry.text}</p>
          )}
          <span className={styles.timestamp}>T+{entry.gameTime}m</span>
        </article>
      ))}
      <div ref={bottomRef} />
    </section>
  );
}
