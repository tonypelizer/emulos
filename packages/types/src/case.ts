/**
 * case.ts — CaseDocument schema: Zod validators + inferred TypeScript types.
 *
 * This file is the contract between the content layer (JSON case files) and the
 * engine.  Every case JSON is parsed through these schemas before the engine
 * touches it.  Malformed content is rejected with a structured error, never
 * crashes silently.
 *
 * Also defines ConditionDefinition and TestDefinition — the registry types used
 * by conditions-registry.json and tests-registry.json.
 */

import { z } from "zod";

// ─── Condition expressions ────────────────────────────────────────────────────
//
// These are the boolean predicates used in choice.condition and
// effect.condition.  They compose recursively (and / or / not),
// allowing arbitrarily complex branching logic in JSON with no eval().

export type ConditionExpr =
  | { op: "and"; conditions: ConditionExpr[] }
  | { op: "or"; conditions: ConditionExpr[] }
  | { op: "not"; condition: ConditionExpr }
  | { op: "eq" | "neq"; path: string; value: string | number | boolean }
  | { op: "gt" | "gte" | "lt" | "lte"; path: string; value: number }
  | { op: "has_knowledge"; knowledgeId: string }
  | { op: "test_ordered"; testId: string }
  | { op: "test_resulted"; testId: string }
  | { op: "condition_active"; conditionId: string }
  | { op: "condition_revealed"; conditionId: string }
  | { op: "time_elapsed_gte"; minutes: number }
  | { op: "game_phase"; phase: string };

// z.lazy() is required for the recursive arms (and / or / not).
export const ConditionExprSchema: z.ZodType<ConditionExpr> = z.lazy(() =>
  z.union([
    z.object({
      op: z.literal("and"),
      conditions: z.array(ConditionExprSchema),
    }),
    z.object({
      op: z.literal("or"),
      conditions: z.array(ConditionExprSchema),
    }),
    z.object({
      op: z.literal("not"),
      condition: ConditionExprSchema,
    }),
    z.object({
      op: z.union([z.literal("eq"), z.literal("neq")]),
      path: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()]),
    }),
    z.object({
      op: z.union([
        z.literal("gt"),
        z.literal("gte"),
        z.literal("lt"),
        z.literal("lte"),
      ]),
      path: z.string(),
      value: z.number(),
    }),
    z.object({ op: z.literal("has_knowledge"), knowledgeId: z.string() }),
    z.object({ op: z.literal("test_ordered"), testId: z.string() }),
    z.object({ op: z.literal("test_resulted"), testId: z.string() }),
    z.object({ op: z.literal("condition_active"), conditionId: z.string() }),
    z.object({
      op: z.literal("condition_revealed"),
      conditionId: z.string(),
    }),
    z.object({ op: z.literal("time_elapsed_gte"), minutes: z.number() }),
    z.object({ op: z.literal("game_phase"), phase: z.string() }),
  ]),
);

// ─── Effects ──────────────────────────────────────────────────────────────────
//
// Effects are the ONLY mechanism that mutates GameState.  They are applied by
// EffectProcessor and may carry an optional condition guard that is evaluated
// before application.  Case authors never write engine code — only effects.

const ScoreEventCategorySchema = z.enum([
  "critical-action",
  "penalty",
  "time-bonus",
  "optional-bonus",
]);

const GamePhaseSchema = z.enum(["intro", "active", "terminal", "complete"]);

const ConditionSeveritySchema = z.enum([
  "mild",
  "moderate",
  "severe",
  "critical",
]);

// Helper: adds the optional condition guard to any effect object shape.
const withCondition = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ ...shape, condition: ConditionExprSchema.optional() });

export const EffectSchema = z.discriminatedUnion("type", [
  withCondition({
    type: z.literal("set_vital"),
    vital: z.string(),
    value: z.union([z.number(), z.string()]),
  }),
  withCondition({
    type: z.literal("adjust_vital"),
    vital: z.string(),
    delta: z.number(),
  }),
  withCondition({
    type: z.literal("reveal_condition"),
    conditionId: z.string(),
  }),
  withCondition({
    type: z.literal("add_condition"),
    conditionId: z.string(),
    severity: ConditionSeveritySchema,
  }),
  withCondition({
    type: z.literal("resolve_condition"),
    conditionId: z.string(),
  }),
  withCondition({
    type: z.literal("add_knowledge"),
    knowledgeId: z.string(),
  }),
  withCondition({
    type: z.literal("add_history_item"),
    itemId: z.string(),
  }),
  withCondition({
    type: z.literal("add_examination_finding"),
    findingId: z.string(),
  }),
  withCondition({
    type: z.literal("order_test"),
    testId: z.string(),
  }),
  withCondition({
    type: z.literal("result_test"),
    testId: z.string(),
  }),
  withCondition({
    type: z.literal("advance_time"),
    minutes: z.number().positive(),
  }),
  withCondition({
    type: z.literal("add_score_event"),
    /**
     * actionId must match a criticalActions[].actionId or penalties[].actionId
     * in the case's scoring block for cross-referencing in the score report.
     */
    actionId: z.string(),
    points: z.number(),
    reason: z.string(),
    category: ScoreEventCategorySchema,
  }),
  withCondition({
    type: z.literal("apply_score_modifier"),
    modifierId: z.string(),
  }),
  withCondition({
    type: z.literal("trigger_event"),
    eventId: z.string(),
    /** Game-time minutes from now when the event fires. 0 = fires immediately. */
    delayMinutes: z.number().nonnegative().default(0),
  }),
  withCondition({
    type: z.literal("set_game_phase"),
    phase: GamePhaseSchema,
  }),
  withCondition({
    type: z.literal("append_narrative"),
    text: z.string(),
    narrativeType: z
      .enum(["narrative", "result", "event", "system"])
      .default("system"),
  }),
  withCondition({
    type: z.literal("dispense_medication"),
    medicationId: z.string(),
  }),
  withCondition({
    type: z.literal("perform_procedure"),
    procedureId: z.string(),
  }),
]);

export type Effect = z.infer<typeof EffectSchema>;

// ─── Choices & Nodes ─────────────────────────────────────────────────────────

export const ChoiceSchema = z.object({
  id: z.string(),
  text: z.string(),
  nextNodeId: z.string(),
  /** Game-time minutes consumed by this action. */
  timeCost: z.number().nonnegative().default(0),
  /** Effects applied when this choice is selected (before navigating). */
  effects: z.array(EffectSchema).default([]),
  /**
   * When non-null, this choice is only shown if the condition evaluates true.
   * Choices that fail this condition are hidden entirely (not just disabled).
   */
  condition: ConditionExprSchema.nullable().default(null),
  /** Shown to the player only after they have the specified knowledge item. */
  hintCondition: ConditionExprSchema.optional(),
  hint: z.string().optional(),
});

export type Choice = z.infer<typeof ChoiceSchema>;

export const NodeTypeSchema = z.enum([
  "presentation",
  "history",
  "examination",
  "investigation",
  "result",
  "decision",
  "event",
  "outcome",
]);

export type NodeType = z.infer<typeof NodeTypeSchema>;

export const CaseNodeSchema = z.object({
  id: z.string(),
  type: NodeTypeSchema,
  /** Narrative text appended to the log when this node is entered. */
  text: z.string(),
  /** Effects applied on node entry (before choices are shown). */
  effects: z.array(EffectSchema).default([]),
  /** Available player choices from this node. */
  choices: z.array(ChoiceSchema).default([]),
  /**
   * For outcome nodes: the outcome identifier shown on the results screen.
   * Required when type === 'outcome'.
   */
  outcomeId: z.string().optional(),
  /**
   * Plain-English attending-physician nudge for this node.
   * Revealed on demand at a score penalty of −10 pts.
   * Absent = no hint available at this node (button hidden).
   */
  hint: z.string().optional(),
  /**
   * State-dependent hints that override `hint` when their condition is met.
   * Evaluated in order — first match wins. Allows the hint to adapt based on
   * what the player has already done (e.g., different text after oxygen is
   * applied vs before).
   */
  conditionalHints: z
    .array(
      z.object({
        condition: ConditionExprSchema,
        hint: z.string(),
      }),
    )
    .optional(),
});

export type CaseNode = z.infer<typeof CaseNodeSchema>;

// ─── Patient definition ───────────────────────────────────────────────────────

export const CaseConditionInstanceSchema = z.object({
  conditionId: z.string(),
  severity: ConditionSeveritySchema,
});

export const CasePatientSchema = z.object({
  demographics: z.object({
    name: z.string(),
    age: z.number().int().positive(),
    sex: z.enum(["male", "female", "other"]),
    weight: z.number().positive(),
    occupation: z.string(),
  }),
  initialVitals: z.object({
    heartRate: z.number().positive(),
    bloodPressure: z.object({
      systolic: z.number().positive(),
      diastolic: z.number().positive(),
    }),
    respiratoryRate: z.number().positive(),
    temperature: z.number(),
    oxygenSaturation: z.number().min(0).max(100),
    consciousness: z.enum(["alert", "confused", "drowsy", "unresponsive"]),
    painScore: z.number().min(0).max(10),
  }),
  conditions: z.object({
    /** Conditions the player is aware of from the start. */
    active: z.array(CaseConditionInstanceSchema).default([]),
    /** Conditions that exist but are hidden from the player initially. */
    hidden: z.array(CaseConditionInstanceSchema).default([]),
  }),
  riskFactors: z.array(z.string()).default([]),
});

export type CasePatient = z.infer<typeof CasePatientSchema>;

// ─── Scoring definition ───────────────────────────────────────────────────────

export const CriticalActionDefSchema = z.object({
  /** Must match the actionId in an add_score_event effect in the case nodes. */
  actionId: z.string(),
  /** Points awarded when this action is performed. */
  points: z.number(),
  /** Mandatory actions flagged as missed in the score report even with passing score. */
  isMandatory: z.boolean().default(false),
  label: z.string(),
});

export type CriticalActionDef = z.infer<typeof CriticalActionDefSchema>;

export const GradeThresholdsSchema = z.object({
  S: z.number(),
  A: z.number(),
  B: z.number(),
  C: z.number(),
});

export const TimeBonusSchema = z.object({
  /** If game-time at case completion is <= this value, bonus is awarded. */
  gameTimeThreshold: z.number(),
  bonus: z.number(),
  label: z.string(),
});

export const ModifierDefSchema = z.object({
  id: z.string(),
  description: z.string(),
  type: z.enum(["multiplier", "flat-delta"]),
  value: z.number(),
});

export type ModifierDef = z.infer<typeof ModifierDefSchema>;

export const ScoringDefSchema = z.object({
  maxScore: z.number().positive(),
  passingScore: z.number().nonnegative(),
  gradeThresholds: GradeThresholdsSchema,
  timeBonuses: z.array(TimeBonusSchema).default([]),
  criticalActions: z.array(CriticalActionDefSchema).default([]),
  modifiers: z.array(ModifierDefSchema).default([]),
  /**
   * Points deducted (negative number) when a player performs a free action
   * (test / medication / procedure) that has no authored effects in
   * freeActionEffects.  These items are shown in the UI but are not clinically
   * relevant to the case.  Defaults to -25 if absent.
   */
  irrelevantActionPenalty: z.number().default(-25),
  /**
   * Optional case-specific remarks shown when the player performs an
   * irrelevant free action.  Each string may contain `{item}` which is
   * replaced with the item name at runtime.  When absent the engine falls
   * back to its built-in generic remarks.
   */
  irrelevantActionRemarks: z.array(z.string()).optional(),
  /**
   * Optional item-specific overrides for irrelevant free-action remarks.
   * Keys are free-action item IDs, and values are arrays of possible remarks.
   * Each string may contain `{item}` which is replaced with the item name.
   */
  irrelevantActionRemarksByItem: z.record(z.array(z.string())).optional(),
});

export type ScoringDef = z.infer<typeof ScoringDefSchema>;

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const MetadataSchema = z.object({
  title: z.string(),
  specialty: z.string(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  estimatedMinutes: z.number().positive(),
  tags: z.array(z.string()).default([]),
  author: z.string(),
  expansionPack: z.string().nullable().default(null),
  requiredEngineVersion: z.string().default(">=1.0.0"),
});

// ─── Full CaseDocument ────────────────────────────────────────────────────────

export const CaseDocumentSchema = z.object({
  id: z.string().min(1),
  version: z.string(),
  metadata: MetadataSchema,
  patient: CasePatientSchema,
  scoring: ScoringDefSchema,
  /**
   * Map of nodeId → CaseNode.  The graph structure is encoded in
   * Choice.nextNodeId references.  Every referenced nodeId must be a key here.
   */
  nodes: z.record(z.string(), CaseNodeSchema),
  /**
   * Optional map of case-specific effects keyed by testId / medicationId /
   * procedureId.  Applied after every free action that matches an entry.
   * Per-effect condition guards are evaluated at runtime before application.
   * Absent = no case-level scoring for free actions.
   */
  freeActionEffects: z
    .object({
      tests: z.record(z.string(), z.array(EffectSchema)).default({}),
      medications: z.record(z.string(), z.array(EffectSchema)).default({}),
      procedures: z.record(z.string(), z.array(EffectSchema)).default({}),
    })
    .optional(),
  /**
   * Optional condition evaluated after every free action.  When it evaluates
   * true the session transitions to terminal and the final score is computed.
   * Enables a purely free-action play mode requiring no outcome node.
   */
  endCondition: ConditionExprSchema.optional(),
  /**
   * When true, the UI hides the Story tab and defaults to the Tests panel.
   * The case is designed to be completed entirely through free actions
   * (tests / medications / procedures).
   * The narrative graph still exists and its text is shown in the log,
   * but the player never drives it with choices.
   */
  freeActionMode: z.boolean().default(false),
  /**
   * Optional allowlists that restrict the free-action menus to only the
   * specified item IDs.  Applied as a second pass after the specialty filter
   * (A3), so the specialty filter still acts as a safety net for structural
   * mismatches (e.g. OB items in a general case).
   *
   * When a list is absent the behaviour falls back to A3-only filtering.
   * This allows per-case curation without requiring every case to maintain
   * these lists — only cases that need precise control need to define them.
   */
  relevantTests: z.array(z.string()).optional(),
  relevantMedications: z.array(z.string()).optional(),
  relevantProcedures: z.array(z.string()).optional(),
});

export type CaseDocument = z.infer<typeof CaseDocumentSchema>;

// ─── Condition registry ───────────────────────────────────────────────────────

export const VitalProgressionPointSchema = z.object({
  atMinute: z.number().nonnegative(),
  value: z.number(),
});

export const ThresholdEventSchema = z.object({
  vital: z.string(),
  operator: z.enum(["lte", "gte", "lt", "gt", "eq"]),
  value: z.number(),
  /** Node to inject when the threshold is crossed. */
  eventNodeId: z.string(),
});

export const ConditionDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  isFatal: z.boolean().default(false),
  /**
   * Per-vital arrays of { atMinute, value } interpolation points.
   * VitalsEngine linearly interpolates between points.
   */
  vitalProgression: z
    .record(z.string(), z.array(VitalProgressionPointSchema))
    .optional(),
  /**
   * When the computed vital crosses this threshold, the engine automatically
   * injects the specified event node.
   */
  thresholdEvents: z.array(ThresholdEventSchema).optional(),
});

export type ConditionDefinition = z.infer<typeof ConditionDefinitionSchema>;

export const ConditionsRegistrySchema = z.record(
  z.string(),
  ConditionDefinitionSchema,
);
export type ConditionsRegistry = z.infer<typeof ConditionsRegistrySchema>;

// ─── Test registry ────────────────────────────────────────────────────────────

export const TestDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  /**
   * If present, only show this test when the case specialty matches one of
   * these values.  Absent or empty array = shown for all specialties.
   */
  specialties: z.array(z.string()).default([]),
  /** Default game-time minutes until result is available. */
  defaultResultTime: z.number().nonnegative().default(30),
  /**
   * Generic/fallback result if the case does not supply a result_test override.
   * Most cases will override via their result node text instead.
   */
  genericResult: z
    .object({
      summary: z.string(),
      values: z
        .record(z.string(), z.union([z.number(), z.string()]))
        .default({}),
      narrative: z.string(),
    })
    .optional(),
});

export type TestDefinition = z.infer<typeof TestDefinitionSchema>;

export const TestsRegistrySchema = z.record(z.string(), TestDefinitionSchema);
export type TestsRegistry = z.infer<typeof TestsRegistrySchema>;

// ─── Medication registry ──────────────────────────────────────────────────────

export const MedicationDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  /** Game-time minutes consumed when administered. */
  timeCost: z.number().nonnegative().default(2),
  /** Displayed to player in the medication menu (e.g. "300 mg PO"). */
  dosageLabel: z.string(),
  /** conditionIds that contraindicate this medication. */
  contraindications: z.array(z.string()).default([]),
  /**
   * If present, only show this medication when the case specialty matches one
   * of these values.  Absent or empty array = shown for all specialties.
   */
  specialties: z.array(z.string()).default([]),
  /** Effects automatically applied to state when a free-action dispenses this medication. */
  defaultEffects: z.array(EffectSchema).default([]),
});

export type MedicationDefinition = z.infer<typeof MedicationDefinitionSchema>;
export const MedicationsRegistrySchema = z.record(
  z.string(),
  MedicationDefinitionSchema,
);
export type MedicationsRegistry = z.infer<typeof MedicationsRegistrySchema>;

// ─── Procedure registry ───────────────────────────────────────────────────────

export const ProcedureDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  /** Game-time minutes consumed when performed. */
  timeCost: z.number().nonnegative().default(5),
  /**
   * If present, only show this procedure when the case specialty matches one
   * of these values.  Absent or empty array = shown for all specialties.
   */
  specialties: z.array(z.string()).default([]),
  /** Effects automatically applied to state when a free-action performs this procedure. */
  defaultEffects: z.array(EffectSchema).default([]),
});

export type ProcedureDefinition = z.infer<typeof ProcedureDefinitionSchema>;
export const ProceduresRegistrySchema = z.record(
  z.string(),
  ProcedureDefinitionSchema,
);
export type ProceduresRegistry = z.infer<typeof ProceduresRegistrySchema>;
