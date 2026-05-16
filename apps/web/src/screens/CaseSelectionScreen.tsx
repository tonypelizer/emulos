import styles from "./CaseSelectionScreen.module.css";

interface CaseListing {
  id: string;
  /** null = core pack; string = named expansion (e.g. "vet") */
  expansionId: string | null;
  title: string;
  specialty: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number;
  chiefComplaint: string;
  tags: string[];
}

const ALL_CASES: CaseListing[] = [
  // ── Core Clinical Cases ──────────────────────────────────────────────────
  {
    id: "fever-001",
    expansionId: null,
    title: "Not Just a Cold",
    specialty: "General Medicine",
    difficulty: "beginner",
    estimatedMinutes: 20,
    chiefComplaint:
      "34M — 3-day fever, productive cough, pleuritic chest pain, SpO₂ 94%",
    tags: ["Fever", "Cough", "Respiratory", "Acute Presentation"],
  },
  // {
  //   id: "chest-pain-001",
  //   expansionId: null,
  //   title: "The Chest That Wouldn't Stop",
  //   specialty: "Emergency Medicine",
  //   difficulty: "intermediate",
  //   estimatedMinutes: 20,
  //   chiefComplaint: "54M — crushing chest pain, diaphoresis, radiation to jaw",
  //   tags: ["Chest Pain", "Emergency", "Cardiology", "ECG"],
  // },
  // {
  //   id: "ectopic-pregnancy-001",
  //   expansionId: null,
  //   title: "Pain at 7 Weeks",
  //   specialty: "OB/GYN",
  //   difficulty: "intermediate",
  //   estimatedMinutes: 25,
  //   chiefComplaint:
  //     "28F — 7 weeks amenorrhoea, right pelvic pain, vaginal spotting",
  //   tags: ["Pelvic Pain", "First Trimester", "OB/GYN", "Early Pregnancy"],
  // },
  // {
  //   id: "confusion-001",
  //   expansionId: null,
  //   title: "Not Herself Today",
  //   specialty: "Emergency Medicine",
  //   difficulty: "beginner",
  //   estimatedMinutes: 20,
  //   chiefComplaint:
  //     "78F — acute confusion, fever, not herself since yesterday, brought in by daughter",
  //   tags: [
  //     "Altered Mental Status",
  //     "Elderly",
  //     "Emergency",
  //     "Acute Presentation",
  //   ],
  // },
  // {
  //   id: "first-trimester-bleeding-001",
  //   expansionId: null,
  //   title: "Six Weeks and Bleeding",
  //   specialty: "OB/GYN",
  //   difficulty: "beginner",
  //   estimatedMinutes: 20,
  //   chiefComplaint:
  //     "26F — 6 weeks pregnant, vaginal bleeding, right-sided pelvic pain, prior ectopic",
  //   tags: ["Vaginal Bleeding", "Pelvic Pain", "First Trimester", "OB/GYN"],
  // },
  // {
  //   id: "preeclampsia-001",
  //   expansionId: null,
  //   title: "Headache at 34 Weeks",
  //   specialty: "OB/GYN",
  //   difficulty: "intermediate",
  //   estimatedMinutes: 20,
  //   chiefComplaint:
  //     "28F — 34 weeks pregnant, severe headache, visual disturbances, BP 162/108",
  //   tags: ["Headache", "Visual Disturbance", "Third Trimester", "OB/GYN"],
  // },
  // {
  //   id: "placental-abruption-001",
  //   expansionId: null,
  //   title: "Something\u2019s Not Right",
  //   specialty: "OB/GYN",
  //   difficulty: "advanced",
  //   estimatedMinutes: 20,
  //   chiefComplaint:
  //     "32F \u2014 32 weeks pregnant, sudden severe abdominal pain, dark vaginal bleeding, no fetal heartbeat on Doppler",
  //   tags: [
  //     "Abdominal Pain",
  //     "Antepartum Haemorrhage",
  //     "Third Trimester",
  //     "OB/GYN",
  //   ],
  // },

  // ── Vet Clinic ───────────────────────────────────────────────────────────
  {
    id: "cat-uti-001",
    expansionId: "vet",
    title: "Luna Won't Use Her Box",
    specialty: "Feline Medicine",
    difficulty: "beginner",
    estimatedMinutes: 20,
    chiefComplaint:
      "5F spayed DSH cat — haematuria, stranguria, pollakiuria × 2 days. Owner reports crying when urinating.",
    tags: ["UTI", "Feline", "Urinary", "Cystitis"],
  },
  {
    id: "dog-otitis-001",
    expansionId: "vet",
    title: "Bella Won't Stop Scratching",
    specialty: "Canine Medicine",
    difficulty: "beginner",
    estimatedMinutes: 20,
    chiefComplaint:
      "4F spayed Golden Retriever — head shaking, pawing at right ear × 4 days. Brown discharge and musty odour.",
    tags: ["Otitis", "Canine", "Ear", "Yeast", "Malassezia"],
  },
];

const DIFFICULTY_LABEL: Record<CaseListing["difficulty"], string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const EXPANSION_HEADING: Record<string, string> = {
  core: "Core Clinical Cases",
  vet: "Vet Clinic",
};

interface Props {
  /** null = core cases; string = named expansion */
  expansionId: string | null;
  onSelectCase: (caseId: string) => void;
  onBack: () => void;
}

export function CaseSelectionScreen({
  expansionId,
  onSelectCase,
  onBack,
}: Props) {
  const cases = ALL_CASES.filter((c) => c.expansionId === expansionId);
  const headingKey = expansionId ?? "core";
  const heading = EXPANSION_HEADING[headingKey] ?? "Cases";

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <button
          className={styles.backBtn}
          onClick={onBack}
          aria-label="Back to expansions"
        >
          ← Back
        </button>
        <h1 className={styles.heading}>{heading}</h1>
      </header>

      <ul className={styles.list} role="list">
        {cases.map((c) => (
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
