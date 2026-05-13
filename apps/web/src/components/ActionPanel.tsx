import { useState } from "react";
import type {
  ResolvedChoice,
  TestDefinition,
  MedicationDefinition,
  ProcedureDefinition,
  FreeActionRequest,
  OrderedTest,
  DispensedMedication,
  PerformedProcedure,
} from "@emulos/types";
import { FreeActionMenu, type FreeActionItem } from "./FreeActionMenu";
import styles from "./ActionPanel.module.css";

type Tab = "story" | "tests" | "meds" | "procedures" | "hint";

interface Props {
  choices: ResolvedChoice[];
  onChoice: (choiceId: string) => void;
  availableTests: ReadonlyMap<string, TestDefinition>;
  availableMedications: ReadonlyMap<string, MedicationDefinition>;
  availableProcedures: ReadonlyMap<string, ProcedureDefinition>;
  orderedTests: OrderedTest[];
  dispensedMedications: DispensedMedication[];
  performedProcedures: PerformedProcedure[];
  onFreeAction: (request: FreeActionRequest) => void;
  onHint: () => void;
  currentHint: string | null;
  currentNodeId: string;
  hintsUsedAtNodes: string[];
  nodeHasHint: boolean;
  freeActionMode?: boolean;
}

const TAB_CONFIG: { id: Tab; icon: string; label: string }[] = [
  { id: "story", icon: "🩻", label: "Actions" },
  { id: "tests", icon: "🧪", label: "Tests" },
  { id: "meds", icon: "💊", label: "Meds" },
  { id: "procedures", icon: "🩺", label: "Procedures" },
  { id: "hint", icon: "💡", label: "Hint" },
];

export function ActionPanel({
  choices,
  onChoice,
  availableTests,
  availableMedications,
  availableProcedures,
  orderedTests,
  dispensedMedications,
  performedProcedures,
  onFreeAction,
  onHint,
  currentHint,
  currentNodeId,
  hintsUsedAtNodes,
  nodeHasHint,
  freeActionMode = false,
}: Props) {
  const hintAlreadyUsed = hintsUsedAtNodes.includes(currentNodeId);
  const [openTab, setOpenTab] = useState<Tab | null>(null);
  const visibleTabs = freeActionMode
    ? TAB_CONFIG.filter((t) => t.id !== "story")
    : TAB_CONFIG;

  const toggleTab = (tab: Tab) =>
    setOpenTab((prev) => (prev === tab ? null : tab));

  const handleFreeAction = (request: FreeActionRequest) => {
    setOpenTab(null);
    onFreeAction(request);
  };

  const handleChoice = (choiceId: string) => {
    setOpenTab(null);
    onChoice(choiceId);
  };

  const testItems: FreeActionItem[] = [...availableTests.values()].map(
    (def) => ({
      id: def.id,
      name: def.name,
      meta: `~${def.defaultResultTime}m`,
      category: def.category,
      done: orderedTests.some((t) => t.testId === def.id),
    }),
  );

  const medItems: FreeActionItem[] = [...availableMedications.values()].map(
    (def) => ({
      id: def.id,
      name: def.name,
      meta: def.dosageLabel,
      category: def.category,
      done: dispensedMedications.some((m) => m.medicationId === def.id),
    }),
  );

  const procItems: FreeActionItem[] = [...availableProcedures.values()].map(
    (def) => ({
      id: def.id,
      name: def.name,
      meta: `${def.timeCost}m`,
      category: def.category,
      done: performedProcedures.some((p) => p.procedureId === def.id),
    }),
  );

  const isOpen = openTab !== null;

  return (
    <div className={styles.root} role="region" aria-label="Action panel">
      {/* ── Drawer — slides up from behind the tab bar ─────────────── */}
      <div
        className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ""}`}
        aria-hidden={!isOpen}
      >
        <div className={styles.drawerInner}>
          {/* Story */}
          {openTab === "story" && (
            <div className={styles.storyPane}>
              <div className={styles.storyHeader}>
                <h2 className={styles.storyHeading}>Clinical Actions</h2>
              </div>
              {choices.length === 0 ? (
                <p className={styles.emptyStory}>Awaiting input…</p>
              ) : (
                <ul className={styles.choiceList} role="list">
                  {choices.map((choice) => (
                    <li key={choice.id}>
                      <button
                        className={`${styles.choiceBtn} ${
                          choice.disabled ? styles.choiceBtnDisabled : ""
                        }`}
                        onClick={() => handleChoice(choice.id)}
                        disabled={choice.disabled}
                        aria-disabled={choice.disabled}
                      >
                        <span className={styles.choiceBtnText}>
                          {choice.text}
                        </span>
                        {choice.disabled && (
                          <span
                            className={styles.choiceDoneIcon}
                            aria-label="Already done"
                          >
                            ✓
                          </span>
                        )}
                      </button>
                      {choice.hint !== undefined && (
                        <p className={styles.choiceHint} role="note">
                          💡 {choice.hint}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Hint (Attending Physician) */}
          {openTab === "hint" && (
            <div className={styles.hintPane}>
              <div className={styles.hintPaneHeader}>
                <span className={styles.hintPaneIcon} aria-hidden="true">
                  👨‍⚕️
                </span>
                <div>
                  <h2 className={styles.hintPaneTitle}>Attending Physician</h2>
                  <p className={styles.hintPaneMeta}>
                    Ask for guidance — costs 10 pts per node
                  </p>
                </div>
              </div>
              {currentHint !== null ? (
                <div className={styles.hintRevealBox} role="note">
                  <span className={styles.hintRevealLabel}>
                    Attending says:
                  </span>
                  <p className={styles.hintRevealText}>{currentHint}</p>
                </div>
              ) : (
                <div className={styles.hintAsk}>
                  <p className={styles.hintAskText}>
                    {hintAlreadyUsed
                      ? "You already asked for a hint here. Navigate to a new decision to ask again."
                      : "Not sure what to do next? Your Attending is available for guidance."}
                  </p>
                  {!hintAlreadyUsed && nodeHasHint && (
                    <button
                      className={styles.hintAskBtn}
                      onClick={() => {
                        onHint();
                      }}
                      aria-label="Ask Attending Physician for a hint (−10 pts)"
                    >
                      Ask Attending (−10 pts)
                    </button>
                  )}
                  {!hintAlreadyUsed && !nodeHasHint && (
                    <p className={styles.hintAskText}>
                      No attending guidance is available at this step.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tests */}
          {openTab === "tests" && (
            <FreeActionMenu
              items={testItems}
              onSelect={(id) =>
                handleFreeAction({ type: "order_test", itemId: id })
              }
            />
          )}

          {/* Medications */}
          {openTab === "meds" && (
            <FreeActionMenu
              items={medItems}
              onSelect={(id) =>
                handleFreeAction({ type: "dispense_medication", itemId: id })
              }
            />
          )}

          {/* Procedures */}
          {openTab === "procedures" && (
            <FreeActionMenu
              items={procItems}
              onSelect={(id) =>
                handleFreeAction({ type: "perform_procedure", itemId: id })
              }
            />
          )}
        </div>
      </div>

      {/* Backdrop — tap outside the drawer to close it */}
      {isOpen && (
        <div
          className={styles.backdrop}
          onClick={() => setOpenTab(null)}
          aria-hidden="true"
        />
      )}

      {/* ── Tab bar (always visible at the bottom) ─────────────────── */}
      <div className={styles.tabBar} role="tablist" aria-label="Action tabs">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={openTab === tab.id}
            aria-expanded={openTab === tab.id}
            id={`tab-${tab.id}`}
            className={`${styles.tabBtn} ${openTab === tab.id ? styles.active : ""}`}
            onClick={() => toggleTab(tab.id)}
          >
            <span className={styles.tabIcon} aria-hidden="true">
              {tab.icon}
            </span>
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
