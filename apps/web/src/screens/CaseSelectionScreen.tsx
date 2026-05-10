import styles from "./CaseSelectionScreen.module.css";

interface CaseListing {
  id: string;
  title: string;
  specialty: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number;
  chiefComplaint: string;
  tags: string[];
}

const CASES: CaseListing[] = [
  {
    id: "chest-pain-001",
    title: "The Chest That Wouldn't Stop",
    specialty: "Emergency Medicine",
    difficulty: "intermediate",
    estimatedMinutes: 20,
    chiefComplaint: "54M — crushing chest pain, diaphoresis, radiation to jaw",
    tags: ["STEMI", "ACS", "ECG", "Reperfusion"],
  },
  {
    id: "fever-001",
    title: "Not Just a Cold",
    specialty: "General Medicine",
    difficulty: "beginner",
    estimatedMinutes: 20,
    chiefComplaint:
      "34M — 3-day fever, productive cough, pleuritic chest pain, SpO₂ 94%",
    tags: ["Pneumonia", "CAP", "Fever", "Antibiotics", "Sepsis"],
  },
  {
    id: "ectopic-pregnancy-001",
    title: "Pain at 7 Weeks",
    specialty: "OB/GYN",
    difficulty: "intermediate",
    estimatedMinutes: 25,
    chiefComplaint:
      "28F — 7 weeks amenorrhoea, right pelvic pain, vaginal spotting",
    tags: ["Ectopic Pregnancy", "First Trimester", "TVUS", "β-hCG"],
  },
];

const DIFFICULTY_LABEL: Record<CaseListing["difficulty"], string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

interface Props {
  onSelectCase: (caseId: string) => void;
  onBack: () => void;
}

export function CaseSelectionScreen({ onSelectCase, onBack }: Props) {
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <button
          className={styles.backBtn}
          onClick={onBack}
          aria-label="Back to menu"
        >
          ← Back
        </button>
        <h1 className={styles.heading}>Patient Cases</h1>
      </header>

      <ul className={styles.list} role="list">
        {CASES.map((c) => (
          <li key={c.id}>
            <button className={styles.card} onClick={() => onSelectCase(c.id)}>
              <div className={styles.cardTop}>
                <span className={styles.specialty}>{c.specialty}</span>
                <span
                  className={`${styles.difficulty} ${styles[`diff_${c.difficulty}`]}`}
                >
                  {DIFFICULTY_LABEL[c.difficulty]}
                </span>
              </div>
              <h2 className={styles.caseTitle}>{c.title}</h2>
              <p className={styles.complaint}>{c.chiefComplaint}</p>
              <div className={styles.tags}>
                {c.tags.map((t) => (
                  <span key={t} className={styles.tag}>
                    {t}
                  </span>
                ))}
              </div>
              <div className={styles.cardFooter}>
                <span className={styles.time}>⏱ ~{c.estimatedMinutes} min</span>
                <span className={styles.cta}>Start →</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
