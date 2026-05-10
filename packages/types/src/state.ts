/**
 * state.ts — Runtime GameState and all sub-state interfaces.
 *
 * This is the single source of truth for the shape of data that flows through
 * the engine at runtime. Every field must be JSON-serializable so that sessions
 * can be saved/restored via GameEngine.serializeState / deserializeState.
 *
 * Immutability is enforced at the engine boundary (Immer produces new objects);
 * these interfaces are not frozen at the type level to keep Immer drafts ergonomic.
 */

// ─── Session ─────────────────────────────────────────────────────────────────

export type GamePhase = "intro" | "active" | "terminal" | "complete";

export interface SessionState {
  readonly sessionId: string;
  readonly caseId: string;
  /** PRNG seed string — same seed + same actions always reproduce the same run. */
  readonly seed: string;
  /** ISO 8601 wall-clock timestamp — informational only, not used in logic. */
  readonly startedAt: string;
  /** Minutes elapsed in game-time (not real time). */
  gameTime: number;
  phase: GamePhase;
}

// ─── Patient vitals ───────────────────────────────────────────────────────────

export type ConsciousnessLevel = "alert" | "confused" | "drowsy" | "unresponsive";

export interface BloodPressure {
  systolic: number;
  diastolic: number;
}

export interface PatientVitals {
  heartRate: number;
  bloodPressure: BloodPressure;
  respiratoryRate: number;
  /** Degrees Celsius */
  temperature: number;
  /** Percentage (0–100) */
  oxygenSaturation: number;
  consciousness: ConsciousnessLevel;
  /** 0–10 scale */
  painScore: number;
}

// ─── Patient ─────────────────────────────────────────────────────────────────

export type ConditionSeverity = "mild" | "moderate" | "severe" | "critical";

export interface ConditionInstance {
  readonly conditionId: string;
  severity: ConditionSeverity;
  /** Game-time minute when this condition became active in this session. */
  readonly onsetGameTime: number;
  /**
   * Game-time minute when the player discovered this condition.
   * undefined means the condition is still hidden from the player.
   */
  revealedAt?: number;
}

export interface PatientConditions {
  /** Conditions the player currently knows about. */
  active: ConditionInstance[];
  /** Conditions that exist but have not yet been revealed to the player. */
  hidden: ConditionInstance[];
  /** Conditions that have been treated or resolved. */
  resolved: ConditionInstance[];
}

export interface PatientDemographics {
  readonly name: string;
  readonly age: number;
  readonly sex: "male" | "female" | "other";
  /** Kilograms */
  readonly weight: number;
  readonly occupation: string;
  /** IDs referencing risk factor definitions (display only for MVP). */
  readonly riskFactors: readonly string[];
}

export interface PatientState {
  readonly demographics: PatientDemographics;
  /**
   * The unmodified starting vitals.  Used by VitalsEngine as the baseline
   * from which condition-driven deltas are computed.
   */
  readonly baselineVitals: PatientVitals;
  /** Current computed vitals — updated by VitalsEngine after each time advance. */
  vitals: PatientVitals;
  conditions: PatientConditions;
  /** History item IDs gathered by the player (e.g., "chief-complaint-gathered"). */
  collectedHistory: string[];
  /** Examination item IDs performed by the player. */
  examinationFindings: string[];
}

// ─── Player ───────────────────────────────────────────────────────────────────

export interface TestResult {
  readonly summary: string;
  readonly values: Readonly<Record<string, number | string>>;
  readonly narrative: string;
}

export interface OrderedTest {
  readonly testId: string;
  /** Game-time minute when the test was ordered. */
  readonly orderedAt: number;
  /** null if awaiting results. */
  resultedAt: number | null;
  /** null if awaiting results. */
  result: TestResult | null;
}

export interface ActionRecord {
  readonly choiceId: string;
  readonly nodeId: string;
  /** Game-time minute when the action was taken (before time cost applied). */
  readonly gameTime: number;
}

export interface PlayerState {
  /**
   * Serializable as string[] (no Set in JSON).
   * Engine helpers use Array.includes for membership checks.
   */
  knowledge: string[];
  orderedTests: OrderedTest[];
  actionHistory: ActionRecord[];
}

// ─── Case progress ────────────────────────────────────────────────────────────

export type NarrativeEntryType = "narrative" | "result" | "event" | "system";

export interface NarrativeEntry {
  readonly id: string;
  /** Game-time minute when this entry was added. */
  readonly gameTime: number;
  readonly type: NarrativeEntryType;
  readonly text: string;
  /**
   * True only for entries added in the most recent action.
   * Cleared at the start of the next action so UI can animate new entries.
   */
  isNew: boolean;
}

export interface ResolvedChoice {
  readonly id: string;
  readonly text: string;
  /**
   * Shown but not selectable (e.g., a test already ordered, or an action
   * that requires knowledge the player doesn't yet have — shown grayed out).
   */
  disabled: boolean;
  /** Contextual hint shown when the player has specific knowledge. */
  readonly hint?: string;
}

export interface QueuedEvent {
  readonly eventNodeId: string;
  /** Game-time minute at which this event should fire. */
  readonly triggerAt: number;
}

export interface CaseProgressState {
  currentNodeId: string;
  /** Ordered list of every node the player has visited. */
  visitedNodeIds: string[];
  /** Choices currently available to the player (post condition-filter). */
  activeChoices: ResolvedChoice[];
  /** Full scrollable narrative history — append-only. */
  narrativeLog: NarrativeEntry[];
  /** Events waiting to fire on the next time advancement. */
  pendingEvents: QueuedEvent[];
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export type ScoreEventCategory =
  | "critical-action"
  | "penalty"
  | "time-bonus"
  | "optional-bonus";

export interface ScoreEvent {
  readonly id: string;
  readonly gameTime: number;
  /** Matches the actionId field on CriticalActionDef / PenaltyDef in the case schema. */
  readonly actionId: string;
  readonly points: number;
  readonly reason: string;
  readonly category: ScoreEventCategory;
}

export type ScoreModifierType = "multiplier" | "flat-delta";

export interface ScoreModifier {
  readonly id: string;
  readonly description: string;
  readonly type: ScoreModifierType;
  readonly value: number;
  /** Game-time minute when this modifier was applied. */
  readonly appliedAt: number;
}

export type Grade = "S" | "A" | "B" | "C" | "F";

export interface ComputedScore {
  /** Sum of all ScoreEvent points before time bonuses or modifiers. */
  readonly raw: number;
  /** After adding time bonuses and applying all modifiers. */
  readonly afterModifiers: number;
  /** Clamped to [0, maxPossible] and rounded. */
  readonly final: number;
  readonly maxPossible: number;
  /** 0–100 */
  readonly percentage: number;
  readonly grade: Grade;
  readonly passed: boolean;
  readonly criticalActionsHit: readonly string[];
  readonly criticalActionsMissed: readonly string[];
  readonly timeBonusEarned: number;
}

export interface ScoreState {
  events: ScoreEvent[];
  modifiers: ScoreModifier[];
  /** null until session reaches the 'terminal' phase. */
  computed: ComputedScore | null;
}

// ─── Root state ───────────────────────────────────────────────────────────────

export interface GameState {
  session: SessionState;
  patient: PatientState;
  player: PlayerState;
  progress: CaseProgressState;
  score: ScoreState;
}
