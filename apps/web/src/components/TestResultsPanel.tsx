import type { OrderedTest, TestDefinition } from "@emulos/types";
import styles from "./TestResultsPanel.module.css";

interface Props {
  orderedTests: OrderedTest[];
  /** Pass the registry so we can display human-readable names. */
  testsById: ReadonlyMap<string, TestDefinition>;
}

export function TestResultsPanel({ orderedTests, testsById }: Props) {
  if (orderedTests.length === 0) return null;

  return (
    <section
      className={styles.root}
      aria-label="Ordered tests"
      aria-live="polite"
    >
      <h2 className={styles.heading}>Ordered tests</h2>
      <div className={styles.scrollArea}>
        <ul className={styles.list} role="list">
          {orderedTests.map((test) => {
            const def = testsById.get(test.testId);
            const name = def?.name ?? test.testId;
            const hasResult = test.result !== null;

            return (
              <li key={test.testId} className={styles.row}>
                <span
                  className={`${styles.statusDot} ${hasResult ? styles.statusResulted : styles.statusPending}`}
                  aria-hidden="true"
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "var(--sp-2)",
                    }}
                  >
                    <span className={styles.testName}>{name}</span>
                    {hasResult ? (
                      <span
                        className={`${styles.testStatus} ${styles.resultedLabel}`}
                      >
                        Resulted ✓
                      </span>
                    ) : (
                      <span
                        className={`${styles.testStatus} ${styles.pendingLabel}`}
                      >
                        Pending…
                      </span>
                    )}
                  </div>
                  {hasResult && test.result?.summary && (
                    <p className={styles.resultNarrative}>
                      {test.result.summary}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
