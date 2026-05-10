/**
 * index.ts — Public re-export surface for @emulos/types.
 *
 * Consumers import only from "@emulos/types", never from sub-paths.
 */

export type {
  // state
  GameState,
  SessionState,
  GamePhase,
  PatientState,
  PatientDemographics,
  PatientVitals,
  BloodPressure,
  ConsciousnessLevel,
  PatientConditions,
  ConditionInstance,
  ConditionSeverity,
  PlayerState,
  OrderedTest,
  TestResult,
  ActionRecord,
  CaseProgressState,
  ResolvedChoice,
  NarrativeEntry,
  NarrativeEntryType,
  QueuedEvent,
  ScoreState,
  ScoreEvent,
  ScoreEventCategory,
  ScoreModifier,
  ScoreModifierType,
  ComputedScore,
  Grade,
} from "./state.js";

export type {
  // case schema types
  ConditionExpr,
  Effect,
  Choice,
  NodeType,
  CaseNode,
  CaseDocument,
  CasePatient,
  ScoringDef,
  CriticalActionDef,
  ModifierDef,
  ConditionDefinition,
  ConditionsRegistry,
  TestDefinition,
  TestsRegistry,
} from "./case.js";

export {
  // Zod schemas — needed by CaseLoader for runtime validation
  ConditionExprSchema,
  EffectSchema,
  ChoiceSchema,
  NodeTypeSchema,
  CaseNodeSchema,
  CaseDocumentSchema,
  ConditionDefinitionSchema,
  ConditionsRegistrySchema,
  TestDefinitionSchema,
  TestsRegistrySchema,
} from "./case.js";

export type {
  // engine boundary types
  IndexedCaseDocument,
  SessionOptions,
  ValidationResult,
  ValidationIssue,
  ScoreReport,
  EngineErrorCode,
} from "./engine.js";

export { EngineError } from "./engine.js";
