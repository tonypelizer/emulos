import { useState } from "react";
import { RichText } from "./RichText";
import styles from "./CaseBriefModal.module.css";

interface Props {
  text: string;
  caseTitle: string;
  onBegin: () => void;
}

export function CaseBriefModal({ text, caseTitle, onBegin }: Props) {
  const [tipsOpen, setTipsOpen] = useState(false);

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Case Brief"
    >
      <div className={styles.panel}>
        {/* ── Header ─────────────────────────────────────────────── */}
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <span className={styles.caseLabel}>Case Brief</span>
            <h1 className={styles.caseTitle}>{caseTitle}</h1>
          </div>
        </header>

        {/* ── Brief text ─────────────────────────────────────────── */}
        <div
          className={styles.briefScroll}
          role="region"
          aria-label="Case information"
        >
          <RichText text={text} className={styles.briefText} />
        </div>

        {/* ── Tips accordion ─────────────────────────────────────── */}
        <div className={styles.tipsSection}>
          <button
            className={styles.tipsToggle}
            onClick={() => setTipsOpen((o) => !o)}
            aria-expanded={tipsOpen}
          >
            <span>
              💡 New to clinical cases? {tipsOpen ? "Hide tips" : "Show tips"}
            </span>
            <span
              className={`${styles.tipsChevron} ${tipsOpen ? styles.tipsChevronOpen : ""}`}
              aria-hidden="true"
            >
              ▾
            </span>
          </button>
          {tipsOpen && (
            <ul className={styles.tipsList} role="list">
              <li>
                Read the <strong>vitals</strong> at the top — they tell you how
                urgent things are. Low SpO₂ (oxygen) means act fast.
              </li>
              <li>
                Use the <strong>tab bar</strong> at the bottom to take actions,
                order tests, give medications, or perform procedures at any
                time.
              </li>
              <li>
                Stuck? Tap <strong>💡 Hint</strong> in the tab bar to ask the
                Attending Physician for guidance (costs a few points).
              </li>
              <li>
                There's no time limit — read carefully. But some decisions earn
                bonus points the faster you act.
              </li>
            </ul>
          )}
        </div>

        {/* ── Begin button ───────────────────────────────────────── */}
        <button className={styles.beginBtn} onClick={onBegin} autoFocus>
          Begin Case
        </button>
      </div>
    </div>
  );
}
