import type { ResolvedChoice } from "@emulos/types";
import styles from "./ChoiceList.module.css";

interface Props {
  choices: ResolvedChoice[];
  onChoice: (id: string) => void;
}

export function ChoiceList({ choices, onChoice }: Props) {
  if (choices.length === 0) {
    return (
      <div className={styles.empty} role="status">
        Awaiting input…
      </div>
    );
  }

  return (
    <section className={styles.root} aria-label="Available actions">
      <h2 className={styles.heading}>What do you do?</h2>
      <ul className={styles.list} role="list">
        {choices.map((choice) => (
          <li key={choice.id}>
            <button
              className={`${styles.btn} ${choice.disabled ? styles.btnDisabled : ""}`}
              onClick={() => onChoice(choice.id)}
              disabled={choice.disabled}
              aria-disabled={choice.disabled}
            >
              <span className={styles.btnText}>{choice.text}</span>
              {choice.disabled && (
                <span className={styles.doneLabel} aria-label="Already done">
                  ✓
                </span>
              )}
            </button>
            {choice.hint !== undefined && (
              <p className={styles.hint} role="note">
                💡 {choice.hint}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
