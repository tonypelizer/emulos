import styles from "./ExpansionSelectScreen.module.css";

export interface ExpansionDef {
  id: string | null;
  icon: string;
  title: string;
  subtitle: string;
  description: string;
  caseCount: number;
  accent: string;
}

const EXPANSIONS: ExpansionDef[] = [
  {
    id: null,
    icon: "🏥",
    title: "Core Clinical Cases",
    subtitle: "Human Medicine",
    description:
      "Diagnose and manage adult patients across general medicine and emergency presentations. Evidence-based decision making, triage priorities, and treatment protocols.",
    caseCount: 1,
    accent: "core",
  },
  {
    id: "vet",
    icon: "🐾",
    title: "Vet Clinic",
    subtitle: "Veterinary Medicine",
    description:
      "Step into a veterinary clinic and diagnose animal patients. Gather owner history, examine your patient, run diagnostics, and prescribe treatments — all adapted for veterinary practice.",
    caseCount: 1,
    accent: "vet",
  },
];

interface Props {
  onSelectExpansion: (expansionId: string | null) => void;
  onBack: () => void;
}

export function ExpansionSelectScreen({ onSelectExpansion, onBack }: Props) {
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <button
          className={styles.backBtn}
          onClick={onBack}
          aria-label="Back to main menu"
        >
          ← Back
        </button>
        <div className={styles.headingGroup}>
          <h1 className={styles.heading}>Choose an Expansion</h1>
          <p className={styles.subheading}>
            Select the type of clinical environment you want to practice in
          </p>
        </div>
      </header>

      <ul className={styles.list} role="list">
        {EXPANSIONS.map((exp) => (
          <li key={exp.id ?? "core"}>
            <button
              className={`${styles.card} ${styles[`accent_${exp.accent}`]}`}
              onClick={() => onSelectExpansion(exp.id)}
            >
              <div className={styles.cardIcon} aria-hidden="true">
                {exp.icon}
              </div>
              <div className={styles.cardBody}>
                <div className={styles.cardTop}>
                  <span className={styles.expansionBadge}>{exp.subtitle}</span>
                  <span className={styles.caseCount}>
                    {exp.caseCount} {exp.caseCount === 1 ? "case" : "cases"}
                  </span>
                </div>
                <h2 className={styles.cardTitle}>{exp.title}</h2>
                <p className={styles.cardDesc}>{exp.description}</p>
              </div>
              <span className={styles.cardArrow} aria-hidden="true">
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
