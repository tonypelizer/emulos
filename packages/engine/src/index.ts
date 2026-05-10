/**
 * index.ts — Public API surface for @emulos/engine.
 *
 * Only symbols exported from this file are considered part of the engine's
 * public contract.  Internal modules (systems/, utils/, etc.) must never be
 * imported directly by consumers.
 */

// Primary engine class — instantiate once per case, call processAction per turn.
export { GameEngine } from "./GameEngine.js";

// Case loading and validation — used by apps and CI tooling.
export { loadCase, validateCase } from "./CaseLoader.js";

// Session serialization — used by GameService in apps/web.
export { serializeState, deserializeState } from "./SessionManager.js";

// Scoring utilities — exposed for results screen construction.
export { buildScoreReport } from "./systems/ScoringEngine.js";

// Condition evaluation — exposed so the UI adapter can filter hints if needed.
export { evaluateCondition, evaluateOptionalCondition } from "./systems/RuleEngine.js";

// Interpolation — exposed for charting vital progressions in a future UI.
export { interpolate } from "./systems/VitalsEngine.js";

// PRNG utilities — exposed so session replay tools can reproduce runs.
export { createPRNG, seedFromString } from "./utils/prng.js";
