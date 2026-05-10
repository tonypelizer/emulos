import { useEffect, useRef } from "react";
import type { NarrativeEntry } from "@emulos/types";
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
}

export function NarrativeLog({ entries }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
          <p className={styles.text}>{entry.text}</p>
          <span className={styles.timestamp}>T+{entry.gameTime}m</span>
        </article>
      ))}
      <div ref={bottomRef} />
    </section>
  );
}
