# Emulos — Architecture & Systems Design

> **Status:** Pre-implementation specification  
> **Date:** 2026-05-09  
> **Revision:** 1.0

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Folder Structure](#3-folder-structure)
4. [Core Architecture](#4-core-architecture)
5. [Engine Systems](#5-engine-systems)
6. [State Model](#6-state-model)
7. [Case Schema Design](#7-case-schema-design)
8. [Data Flow](#8-data-flow)
9. [MVP Scope](#9-mvp-scope)
10. [Recommended First Milestone](#10-recommended-first-milestone)
11. [What NOT to Build Yet](#11-what-not-to-build-yet)

---

## 1. Tech Stack

### Guiding Principles

- TypeScript-first, strict mode everywhere
- Engine has zero UI or framework dependencies — it is pure logic
- Cases are content: JSON files validated at build time, never hardcoded
- Web-first MVP; architecture must not obstruct a future mobile port
- No backend required for MVP — fully static deployable

### Selected Stack

| Layer               | Technology                  | Rationale                                                                   |
| ------------------- | --------------------------- | --------------------------------------------------------------------------- |
| Language            | TypeScript 5.x (strict)     | Type safety across all layers; shared contract between engine and UI        |
| Monorepo tooling    | pnpm workspaces + Turborepo | Fast installs, caching, clean dependency graph                              |
| Web app framework   | Next.js 14+ (App Router)    | Static export support, file-based routing, React Server Components optional |
| UI library          | React 18                    | Component model matches the render-game-state pattern                       |
| Styling             | Tailwind CSS                | Responsive by default; no custom CSS needed at MVP scale                    |
| UI state            | Zustand                     | Lightweight, no boilerplate, colocates well with GameService adapter        |
| Schema validation   | Zod                         | Runtime validation at the content boundary; shares types with TypeScript    |
| Immutable state     | Immer                       | Enables reducer-style updates without mutation bugs                         |
| Testing             | Vitest                      | Fast, native ESM, works in monorepo without config thrash                   |
| E2E testing         | Playwright                  | End-to-end case playthrough tests against the web app                       |
| Case content format | JSON                        | Human-editable, machine-validatable, no build step required                 |
| Build/deploy        | Vercel (static export)      | Zero-config, free tier sufficient for MVP                                   |

### What Is Deliberately Excluded

- No GraphQL or REST API (not needed for MVP)
- No ORM or database (state lives in browser for MVP)
- No Redux (Zustand is sufficient; Redux adds overhead without benefit here)
- No CSS-in-JS (Tailwind covers all MVP needs)
- No Electron or React Native yet (mobile is post-MVP)

---

## 2. Monorepo Structure

**Yes — a monorepo is required.**

The game has three fundamentally different domains that must be developed and tested in isolation but deployed together:

| Package            | Purpose                                                   | External deps                 |
| ------------------ | --------------------------------------------------------- | ----------------------------- |
| `packages/types`   | Shared TypeScript interfaces and Zod schemas              | Zod only                      |
| `packages/engine`  | Pure game engine — state machine, rule evaluator, scoring | `packages/types`, Immer       |
| `packages/content` | Case JSON files + content registry                        | `packages/types` (validation) |
| `apps/web`         | Next.js web application                                   | All of the above              |

**Why this isolation matters:**

- The engine can be unit-tested with zero React involvement
- Cases can be validated in CI before any UI code runs
- A future mobile app (`apps/mobile`) drops in alongside `apps/web` and reuses the engine and content packages unchanged
- AI-generated cases run through the same content validation pipeline regardless of origin

**Workspace tooling:**

```
pnpm-workspace.yaml        — declares workspace packages
turbo.json                 — defines build pipelines + caching
tsconfig.base.json         — shared compiler settings (strict, paths)
```

---

## 3. Folder Structure

```
emulos/
│
├── apps/
│   └── web/                              # Next.js web application
│       ├── app/
│       │   ├── layout.tsx                # Root layout (fonts, globals)
│       │   ├── page.tsx                  # Case selection / landing
│       │   ├── game/
│       │   │   └── [caseId]/
│       │   │       └── page.tsx          # Active game session
│       │   └── results/
│       │       └── [sessionId]/
│       │           └── page.tsx          # Post-case results screen
│       ├── components/
│       │   ├── game/                     # Game-specific components
│       │   │   ├── CaseIntro.tsx         # Patient presentation card
│       │   │   ├── PatientCard.tsx       # Demographics + current vitals
│       │   │   ├── VitalsDisplay.tsx     # Vital signs panel
│       │   │   ├── NarrativeLog.tsx      # Scrolling narrative history
│       │   │   ├── ActionPanel.tsx       # Available choices / actions
│       │   │   ├── TestResultsPanel.tsx  # Ordered tests + results
│       │   │   └── ScoreHUD.tsx          # In-game score tracker
│       │   └── ui/                       # Primitive, reusable UI atoms
│       │       ├── Button.tsx
│       │       ├── Badge.tsx
│       │       ├── Card.tsx
│       │       └── Modal.tsx
│       ├── hooks/
│       │   ├── useGameSession.ts         # Bridge: engine state → React
│       │   └── useKeyboardShortcuts.ts
│       ├── services/
│       │   └── GameService.ts            # Thin adapter: UI actions → engine
│       └── stores/
│           └── gameStore.ts              # Zustand store (UI-layer state)
│
├── packages/
│   │
│   ├── types/                            # Shared type definitions
│   │   ├── src/
│   │   │   ├── index.ts                  # Re-exports everything
│   │   │   ├── case.ts                   # Case schema types + Zod schemas
│   │   │   ├── state.ts                  # GameState shape
│   │   │   ├── engine.ts                 # Engine API types (actions, events)
│   │   │   └── scoring.ts                # Score types
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── engine/                           # Core game engine
│   │   ├── src/
│   │   │   ├── index.ts                  # Public API surface (explicit exports only)
│   │   │   ├── GameEngine.ts             # Orchestrator — coordinates all systems
│   │   │   ├── SessionManager.ts         # Session lifecycle, snapshots
│   │   │   ├── CaseLoader.ts             # Load, validate, index case documents
│   │   │   └── systems/
│   │   │       ├── NarrativeGraph.ts     # Node traversal + choice filtering
│   │   │       ├── RuleEngine.ts         # Condition evaluation (no eval())
│   │   │       ├── EffectProcessor.ts    # Apply effects → new state (immutable)
│   │   │       ├── ScoringEngine.ts      # Score event tracking + final calc
│   │   │       ├── VitalsEngine.ts       # Vital sign dynamics per condition
│   │   │       └── TimeEngine.ts         # Game-time advancement
│   │   ├── tests/
│   │   │   ├── RuleEngine.test.ts
│   │   │   ├── EffectProcessor.test.ts
│   │   │   ├── NarrativeGraph.test.ts
│   │   │   ├── ScoringEngine.test.ts
│   │   │   └── integration/
│   │   │       └── full-case.test.ts     # Complete case run, no UI
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── content/                          # Case data
│       ├── cases/
│       │   ├── general/
│       │   │   └── chest-pain-001.json
│       │   ├── emergency/
│       │   ├── cardiology/
│       │   └── ob-gyn/
│       ├── conditions/
│       │   └── conditions-registry.json  # Master condition definitions
│       ├── tests-catalog/
│       │   └── tests-registry.json       # All orderable tests + result templates
│       ├── templates/
│       │   └── case.template.json        # Blank case scaffold for authors
│       ├── schemas/
│       │   └── case.schema.json          # JSON Schema (auto-generated from Zod)
│       ├── index.ts                      # Case registry: id → file path
│       ├── package.json
│       └── tsconfig.json
│
├── docs/
│   ├── architecture.md                   # Points to this file
│   ├── case-authoring-guide.md           # How to write new cases
│   └── engine-api.md                     # Engine public API reference
│
├── .github/
│   └── workflows/
│       ├── ci.yml                        # Lint + test on PR
│       └── validate-content.yml          # Case schema validation on push
│
├── package.json                          # Root workspace config
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .eslintrc.json
└── ARCHITECTURE.md                       # This file
```

---

## 4. Core Architecture

### Layered Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  UI LAYER  (apps/web)                                        │
│                                                              │
│  React components receive rendered GameState and dispatch    │
│  typed PlayerActions. Components contain zero game logic.    │
│  They are pure render functions of state.                    │
└───────────────────────────┬──────────────────────────────────┘
                            │  PlayerAction (typed union)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  ADAPTER LAYER  (GameService + Zustand store)                │
│                                                              │
│  GameService is a thin class that:                           │
│   - Holds the current GameState                              │
│   - Forwards actions to GameEngine                           │
│   - Projects new GameState into the Zustand store            │
│   - Manages session persistence (localStorage for MVP)       │
│                                                              │
│  Zustand store is the React-visible surface.                 │
│  Components subscribe to store slices, not raw engine state. │
└───────────────────────────┬──────────────────────────────────┘
                            │  (GameState, PlayerAction) → GameState
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  ENGINE LAYER  (packages/engine)                             │
│                                                              │
│  Pure deterministic computation.                             │
│  No React. No browser APIs. No side effects.                 │
│  Imports only: packages/types, Immer.                        │
│                                                              │
│  Subsystems:                                                 │
│    NarrativeGraph   RuleEngine   EffectProcessor             │
│    ScoringEngine    VitalsEngine TimeEngine                  │
│                                                              │
│  GameEngine orchestrates subsystems in a fixed pipeline.     │
└───────────────────────────┬──────────────────────────────────┘
                            │  CaseDocument
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  CONTENT LAYER  (packages/content)                           │
│                                                              │
│  JSON case files loaded and validated by CaseLoader.         │
│  All game content lives here. Nothing is hardcoded.          │
│  Validated at build time via CI; crashes loudly on error.    │
└──────────────────────────────────────────────────────────────┘
```

### The Engine As a Pure Function

The fundamental invariant of the engine is:

```
(GameState, PlayerAction) → GameState
```

This single property gives us:

| Property          | Mechanism                                                                          |
| ----------------- | ---------------------------------------------------------------------------------- |
| **Determinism**   | Same state + same action always produces the same next state                       |
| **Testability**   | Each system can be tested as a function with plain assertions                      |
| **Replayability** | A session is just an ordered list of actions; replay them to reconstruct any state |
| **Save/Load**     | Serialize `GameState` to JSON; deserialize to resume exactly                       |
| **Undo (future)** | Maintain a state history stack                                                     |

### Key Constraints

- The engine **never reads from** external sources (no fetch, no Date.now(), no Math.random() without a seeded PRNG)
- All randomness uses a seedable PRNG (Mulberry32 or similar) initialized per session
- The UI **never computes** outcomes, scores, or available choices — it only renders what the engine returns
- Case JSON files are **immutable at runtime** — the engine reads them once at session start

---

## 5. Engine Systems

### 5.1 GameEngine — Orchestrator

**Responsibility:** Single public-facing entry point. Coordinates all subsystems in a deterministic pipeline for every player action.

**Processing pipeline (per action):**

```
validateAction()
  └─► EffectProcessor.apply(action.effects, state)
        └─► TimeEngine.advance(action.timeCost, state)
              └─► VitalsEngine.recalculate(state)
                    └─► ScoringEngine.record(action, state)
                          └─► NarrativeGraph.resolveNextNode(action, state)
                                └─► RuleEngine.filterChoices(node.choices, state)
                                      └─► return new GameState
```

**Public API (engine surface):**

```
GameEngine.createSession(caseId, seed?)      → GameState
GameEngine.processAction(state, action)      → GameState
GameEngine.getAvailableActions(state)        → PlayerAction[]
GameEngine.isTerminal(state)                 → boolean
GameEngine.getScoreReport(state)             → ScoreReport
GameEngine.serializeState(state)             → string (JSON)
GameEngine.deserializeState(json)            → GameState
```

Nothing outside `packages/engine/src/index.ts` is part of the public API.

---

### 5.2 CaseLoader

**Responsibility:** Load a case document from the content layer, validate it, and build an indexed internal representation for fast node lookup.

**Operations:**

- Reads case JSON by case ID from the content registry
- Validates against the Zod schema; throws a structured `CaseValidationError` if invalid
- Builds a `Map<nodeId, Node>` for O(1) node access
- Builds a `Map<conditionId, Condition>` for condition lookups
- Constructs the initial `PatientState` from case patient definition
- Returns a sealed `CaseDocument` object — immutable after construction

**Design note:** CaseLoader runs once at session start, not on every action. The indexed CaseDocument is passed to all subsystems.

---

### 5.3 NarrativeGraph

**Responsibility:** Given the current node and the action taken, return the ID of the next node and the set of choices available to the player from that node.

**Graph model:**

- Nodes are vertices; choice targets are directed edges
- Edges can carry `condition` expressions — evaluated by RuleEngine before being surfaced to the player
- A node with zero outgoing choices (after condition filtering) is a terminal node
- Multi-path nodes: a single action can yield different next nodes based on state conditions (conditional branching without explicit player choice)

**Supported node types:**

| Type            | Description                                                        |
| --------------- | ------------------------------------------------------------------ |
| `presentation`  | Initial patient presentation; always first node                    |
| `history`       | Player gathers history — returns information items                 |
| `examination`   | Physical examination findings                                      |
| `investigation` | Order a test; result revealed after time advance                   |
| `result`        | Test result presentation; triggers knowledge additions             |
| `decision`      | Explicit clinical decision point                                   |
| `event`         | Triggered by time passage or vital threshold — not a player choice |
| `outcome`       | Terminal node; triggers end-of-case scoring                        |

---

### 5.4 RuleEngine

**Responsibility:** Evaluate boolean condition expressions against the current `GameState`. Used by NarrativeGraph to filter choices and by EffectProcessor to evaluate conditional effects.

**Conditions are data, not code.** No `eval()`, no `Function()`, no template strings that execute.

**Condition expression schema:**

```json
{
  "op": "and",
  "conditions": [
    { "op": "gte", "path": "patient.vitals.heartRate", "value": 100 },
    { "op": "has_knowledge", "knowledgeId": "ecg-stemi-confirmed" },
    {
      "op": "not",
      "condition": { "op": "condition_active", "conditionId": "hypertension" }
    }
  ]
}
```

**Supported operators:**

| Operator                 | Inputs          | Description                           |
| ------------------------ | --------------- | ------------------------------------- |
| `and`                    | `conditions[]`  | All must be true                      |
| `or`                     | `conditions[]`  | At least one must be true             |
| `not`                    | `condition`     | Inverts result                        |
| `eq`, `neq`              | `path`, `value` | Equality on state path                |
| `gt`, `gte`, `lt`, `lte` | `path`, `value` | Numeric comparison on state path      |
| `has_knowledge`          | `knowledgeId`   | Player has learned this item          |
| `test_ordered`           | `testId`        | Player has ordered this test          |
| `test_resulted`          | `testId`        | Test has returned results             |
| `condition_active`       | `conditionId`   | Condition is in patient's active list |
| `condition_revealed`     | `conditionId`   | Condition has been revealed to player |
| `time_elapsed_gte`       | `minutes`       | Game time >= threshold                |
| `game_phase`             | `phase`         | Current session phase matches         |

Paths use dot-notation and are resolved against the live `GameState` object. Invalid paths return `false` and log a warning — they never throw in production.

---

### 5.5 EffectProcessor

**Responsibility:** Apply a list of effect declarations to a `GameState` and return a new `GameState`. Never mutates the input.

**Effects are the only mechanism by which the state changes.** Every state transition must be expressible as effects in a case JSON file.

**Effect types:**

| Effect                 | Fields             | Description                           |
| ---------------------- | ------------------ | ------------------------------------- |
| `set_vital`            | `vital`, `value`   | Override a specific vital sign        |
| `adjust_vital`         | `vital`, `delta`   | Add/subtract from a vital             |
| `reveal_condition`     | `conditionId`      | Move condition from hidden → revealed |
| `add_condition`        | `conditionId`      | Add a new condition to active list    |
| `resolve_condition`    | `conditionId`      | Move condition to resolved            |
| `add_knowledge`        | `knowledgeId`      | Add to player knowledge set           |
| `add_history_item`     | `itemId`           | Mark history item as gathered         |
| `order_test`           | `testId`           | Queue a test with result time         |
| `result_test`          | `testId`           | Return results for a test             |
| `advance_time`         | `minutes`          | Advance game time                     |
| `add_score_event`      | `points`, `reason` | Explicit score event                  |
| `apply_score_modifier` | `modifierId`       | Apply a named score modifier          |
| `trigger_event`        | `eventId`          | Queue a game event node               |
| `set_game_phase`       | `phase`            | Transition session phase              |
| `set_narrative`        | `text`             | Append to narrative log               |

**Conditional effects:** Effects can carry a `condition` field. If present, the effect is only applied if the RuleEngine evaluates the condition as true against the state at the moment of application.

---

### 5.6 ScoringEngine

**Responsibility:** Record all scoring events throughout a session, apply modifiers, and calculate the final `ScoreReport` at case conclusion.

**Score event model:** Every score-affecting action appends a `ScoreEvent` to the `ScoreState.breakdown` array. This creates a complete audit trail.

```
ScoreEvent {
  timestamp: number       // game-time minutes when event occurred
  actionId: string        // what the player did
  points: number          // positive or negative
  reason: string          // human-readable explanation (shown in results)
  category: string        // 'critical-action' | 'penalty' | 'time-bonus' | 'optional'
}
```

**Score calculation pipeline:**

1. Sum raw points from all `ScoreEvent` entries
2. Apply time bonuses (thresholds defined in case schema)
3. Apply percentage modifiers (e.g., "patient harmed" applies `× 0.6` to total)
4. Clamp to `[0, maxScore]`
5. Calculate `percentile` against the case's `passingScore`
6. Compute `grade`: S / A / B / C / F based on thresholds

**Critical actions:** Actions tagged `isMandatory: true` in the case schema contribute to the `criticalActionsCompleted` metric in the ScoreReport, independent of points. A case can be considered a "medical failure" even with a passing score if mandatory actions were skipped.

---

### 5.7 VitalsEngine

**Responsibility:** Recalculate patient vitals after every time advancement, based on the patient's active conditions and their progression tables.

**Design approach:**

- Each condition definition (in `conditions-registry.json`) carries a `vitalProgression` map: at elapsed time T with this condition untreated, vital V is at value X
- The engine uses linear interpolation between defined time points
- Multiple active conditions combine via a defined merge strategy (additive deltas, max-absolute for competing effects)
- Vital thresholds can trigger `event` nodes (e.g., SpO2 ≤ 85% fires the "respiratory-deterioration" event node, regardless of what the player is doing)

**This is not real-time.** Vitals only update when time advances. Time advances only when the player takes an action with a `timeCost`. This keeps the engine deterministic and turn-based.

---

### 5.8 TimeEngine

**Responsibility:** Advance game time by the cost associated with each player action.

**Time is game-time minutes**, not wall-clock time. The TimeEngine:

- Increments `session.gameTime` by the action's defined `timeCost`
- Records the cumulative time at each action in the action history
- Triggers time-based score modifiers (door-to-balloon time in ACS cases, etc.)
- Enables the VitalsEngine to compute how much vitals have drifted

**Action time costs are defined in the case schema**, not hardcoded in the engine. Different cases can have different time scales (a fast-paced ED case vs. a multi-day ICU case).

A future extension: `globalTimeCosts` in a content configuration file so common actions (take history: 5 min, order ECG: 10 min) have defaults that cases can override.

---

## 6. State Model

The full game state is a single serializable object. All engine systems read from and produce new versions of this object.

```typescript
// ─── Root ────────────────────────────────────────────────────────────────────

interface GameState {
  session: SessionState;
  patient: PatientState;
  player: PlayerState;
  progress: CaseProgressState;
  score: ScoreState;
}

// ─── Session ─────────────────────────────────────────────────────────────────

interface SessionState {
  sessionId: string; // UUID, generated at session start
  caseId: string; // Matches case JSON id field
  seed: string; // PRNG seed — enables deterministic reproduction
  startedAt: string; // ISO 8601 wall-clock time (informational only)
  gameTime: number; // Minutes elapsed in game time
  phase: GamePhase;
}

type GamePhase =
  | "intro" // Patient being presented; no actions yet
  | "active" // Player is making decisions
  | "terminal" // Patient outcome determined; awaiting results screen
  | "complete"; // Session finished

// ─── Patient ─────────────────────────────────────────────────────────────────

interface PatientState {
  demographics: PatientDemographics;
  vitals: PatientVitals;
  conditions: {
    active: ConditionInstance[]; // Conditions the player knows about
    hidden: ConditionInstance[]; // Not yet revealed to player
    resolved: ConditionInstance[]; // Treated / no longer active
  };
  collectedHistory: string[]; // History item IDs gathered by player
  examinationFindings: string[]; // Exam item IDs performed by player
}

interface PatientDemographics {
  name: string;
  age: number;
  sex: "male" | "female" | "other";
  weight: number; // kg
  occupation: string;
  riskFactors: string[]; // IDs referencing risk factor definitions
}

interface PatientVitals {
  heartRate: number; // bpm
  bloodPressure: { systolic: number; diastolic: number };
  respiratoryRate: number; // breaths/min
  temperature: number; // °C
  oxygenSaturation: number; // %
  consciousness: ConsciousnessLevel;
  painScore: number; // 0–10
}

type ConsciousnessLevel = "alert" | "confused" | "drowsy" | "unresponsive";

interface ConditionInstance {
  conditionId: string;
  severity: "mild" | "moderate" | "severe" | "critical";
  onsetGameTime: number; // Minutes into session when condition became active
  revealedAt?: number; // Minutes when player discovered it (undefined = hidden)
}

// ─── Player ───────────────────────────────────────────────────────────────────

interface PlayerState {
  knowledge: Set<string>; // Knowledge item IDs the player has acquired
  orderedTests: OrderedTest[]; // Tests queue plus result state
  actionHistory: ActionRecord[]; // Full ordered log of every player action
}

interface OrderedTest {
  testId: string;
  orderedAt: number; // game-time minutes
  resultedAt: number | null; // null if pending
  result: TestResult | null;
}

interface TestResult {
  summary: string; // Short text shown in results panel
  values: Record<string, number | string>; // Structured values for condition logic
  narrative: string; // Full clinical narrative shown to player
}

interface ActionRecord {
  actionId: string;
  choiceId: string;
  nodeId: string; // Node where action was taken
  gameTime: number; // Time when action was taken
  effectsApplied: Effect[]; // What changed
  scoreEvents: ScoreEvent[]; // What was scored
}

// ─── Case Progress ────────────────────────────────────────────────────────────

interface CaseProgressState {
  currentNodeId: string;
  visitedNodeIds: string[];
  activeChoices: ResolvedChoice[]; // Choices available right now (post-filter)
  narrativeLog: NarrativeEntry[]; // Full scrollable history
  pendingEvents: QueuedEvent[]; // Events that will fire on next turn
}

interface ResolvedChoice {
  id: string;
  text: string;
  disabled: boolean; // Shown but not selectable (e.g., already ordered)
  hint?: string; // Optional contextual hint (unlocked by knowledge)
}

interface NarrativeEntry {
  id: string;
  gameTime: number;
  type: "narrative" | "result" | "event" | "system";
  text: string;
  isNew: boolean; // True only for entries added this turn (for animation)
}

interface QueuedEvent {
  eventNodeId: string;
  triggerAt: number; // game-time minutes
}

// ─── Score ────────────────────────────────────────────────────────────────────

interface ScoreState {
  events: ScoreEvent[];
  modifiers: ScoreModifier[];
  computed: ComputedScore | null; // Null until session is terminal
}

interface ScoreEvent {
  id: string;
  gameTime: number;
  actionId: string;
  points: number;
  reason: string;
  category: "critical-action" | "penalty" | "time-bonus" | "optional-bonus";
}

interface ScoreModifier {
  id: string;
  description: string;
  type: "multiplier" | "flat-delta";
  value: number;
  appliedAt: number; // game-time minutes
}

interface ComputedScore {
  raw: number;
  afterModifiers: number;
  final: number;
  maxPossible: number;
  percentage: number;
  grade: "S" | "A" | "B" | "C" | "F";
  passed: boolean;
  criticalActionsHit: string[];
  criticalActionsMissed: string[];
  timeBonusEarned: number;
}
```

---

## 7. Case Schema Design

Cases are authored as JSON files in `packages/content/cases/`. Every field is validated by the CaseLoader using a Zod schema derived from `packages/types/src/case.ts`.

### Top-Level Structure

```json
{
  "id": "chest-pain-001",
  "version": "1.0.0",
  "metadata": { ... },
  "patient": { ... },
  "scoring": { ... },
  "nodes": { ... },
  "outcomes": { ... }
}
```

### metadata

```json
{
  "title": "The Chest That Wouldn't Stop",
  "specialty": "emergency",
  "difficulty": "intermediate",
  "estimatedMinutes": 15,
  "tags": ["STEMI", "ACS", "ECG", "troponin", "reperfusion"],
  "author": "emulos-content-team",
  "expansionPack": null,
  "requiredEngineVersion": ">=1.0.0"
}
```

### patient

```json
{
  "demographics": {
    "name": "Robert Chen",
    "age": 58,
    "sex": "male",
    "weight": 85,
    "occupation": "accountant"
  },
  "initialVitals": {
    "heartRate": 102,
    "bloodPressure": { "systolic": 148, "diastolic": 92 },
    "respiratoryRate": 18,
    "temperature": 37.1,
    "oxygenSaturation": 96,
    "consciousness": "alert",
    "painScore": 8
  },
  "conditions": {
    "active": [
      { "conditionId": "hypertension", "severity": "moderate" },
      { "conditionId": "type2-diabetes", "severity": "mild" }
    ],
    "hidden": [
      { "conditionId": "anterior-stemi", "severity": "critical" },
      { "conditionId": "triple-vessel-disease", "severity": "severe" }
    ]
  },
  "riskFactors": ["smoking-history", "family-hx-cad", "hyperlipidemia"]
}
```

### scoring

```json
{
  "maxScore": 1000,
  "passingScore": 600,
  "gradeThresholds": {
    "S": 950,
    "A": 850,
    "B": 700,
    "C": 600
  },
  "timeBonuses": [
    {
      "gameTimeThreshold": 30,
      "bonus": 150,
      "label": "Lightning fast (< 30 min)"
    },
    { "gameTimeThreshold": 60, "bonus": 75, "label": "Within golden hour" }
  ],
  "criticalActions": [
    {
      "actionId": "order-ecg",
      "points": 100,
      "isMandatory": true,
      "label": "12-lead ECG obtained"
    },
    {
      "actionId": "administer-aspirin",
      "points": 100,
      "isMandatory": true,
      "label": "Aspirin given"
    },
    {
      "actionId": "activate-cath-lab",
      "points": 250,
      "isMandatory": true,
      "label": "Cath lab activated — primary PCI pathway"
    }
  ],
  "penalties": [
    {
      "actionId": "administer-nsaids",
      "points": -200,
      "reason": "NSAIDs are contraindicated in ACS — increased mortality risk"
    },
    {
      "actionId": "thrombolytics-with-pci-available",
      "points": -100,
      "reason": "Thrombolytics are second-line when primary PCI is available within 120 min"
    }
  ],
  "modifiers": [
    {
      "id": "patient-harmed",
      "description": "Patient experienced significant iatrogenic harm",
      "type": "multiplier",
      "value": 0.5
    }
  ]
}
```

### nodes

Nodes form a directed graph. Each node has a type, narrative text, effects applied on entry, and choices leading to other nodes.

```json
{
  "start": {
    "id": "start",
    "type": "presentation",
    "text": "Mr. Chen, a 58-year-old accountant, arrives via ambulance to the ED. He is clutching his chest, pale, and diaphoretic. He describes crushing, central chest pain radiating to his left jaw and arm, starting 45 minutes ago. His wife says he has been 'not himself' for the past hour.",
    "effects": [],
    "choices": [
      {
        "id": "take-history",
        "text": "Take a focused cardiac history",
        "nextNodeId": "history-cardiac",
        "timeCost": 5,
        "effects": [],
        "condition": null
      },
      {
        "id": "order-ecg-immediately",
        "text": "Order an immediate 12-lead ECG",
        "nextNodeId": "ecg-result",
        "timeCost": 10,
        "effects": [
          { "type": "order_test", "testId": "12-lead-ecg" },
          {
            "type": "add_score_event",
            "points": 100,
            "reason": "ECG ordered promptly",
            "category": "critical-action"
          }
        ],
        "condition": null
      },
      {
        "id": "start-examination",
        "text": "Perform a rapid physical examination",
        "nextNodeId": "examination-cardiovascular",
        "timeCost": 8,
        "effects": [],
        "condition": null
      }
    ]
  },

  "ecg-result": {
    "id": "ecg-result",
    "type": "result",
    "text": "The 12-lead ECG shows 3mm ST-segment elevation in leads V1–V4, with reciprocal ST depression in the inferior leads (II, III, aVF). There are hyperacute T-waves in V2 and V3. This is a textbook anterior STEMI.",
    "effects": [
      { "type": "result_test", "testId": "12-lead-ecg" },
      { "type": "reveal_condition", "conditionId": "anterior-stemi" },
      { "type": "add_knowledge", "knowledgeId": "stemi-confirmed-on-ecg" },
      { "type": "add_knowledge", "knowledgeId": "anterior-distribution" }
    ],
    "choices": [
      {
        "id": "activate-cath-lab",
        "text": "Activate the Cath Lab — initiate STEMI protocol",
        "nextNodeId": "cath-lab-activated",
        "timeCost": 5,
        "effects": [
          {
            "type": "add_score_event",
            "points": 250,
            "reason": "Cath lab activated — correct primary PCI decision",
            "category": "critical-action"
          }
        ],
        "condition": null
      },
      {
        "id": "give-thrombolytics",
        "text": "Administer IV thrombolytics",
        "nextNodeId": "thrombolytics-administered",
        "timeCost": 15,
        "effects": [
          {
            "type": "add_score_event",
            "points": -100,
            "reason": "Primary PCI available within 120 min — thrombolytics suboptimal",
            "category": "penalty"
          }
        ],
        "condition": null
      },
      {
        "id": "consult-cardiology-first",
        "text": "Call cardiology for advice before deciding",
        "nextNodeId": "cardiology-consult-delay",
        "timeCost": 25,
        "effects": [
          { "type": "advance_time", "minutes": 20 },
          {
            "type": "add_score_event",
            "points": -50,
            "reason": "Unnecessary delay before reperfusion",
            "category": "penalty"
          },
          { "type": "adjust_vital", "vital": "heartRate", "delta": 12 }
        ],
        "condition": null
      },
      {
        "id": "order-more-tests",
        "text": "Order troponin and echo before deciding",
        "nextNodeId": "unnecessary-workup-delay",
        "timeCost": 60,
        "effects": [
          {
            "type": "add_score_event",
            "points": -75,
            "reason": "Do not delay reperfusion for routine workup when ECG is diagnostic",
            "category": "penalty"
          },
          { "type": "trigger_event", "eventId": "patient-deterioration-event" }
        ],
        "condition": null
      }
    ]
  },

  "patient-deterioration-event": {
    "id": "patient-deterioration-event",
    "type": "event",
    "text": "Mr. Chen suddenly clutches his chest harder. The monitor alarms: VF. He has arrested.",
    "effects": [
      { "type": "set_vital", "vital": "heartRate", "value": 0 },
      { "type": "set_vital", "vital": "oxygenSaturation", "value": 0 },
      {
        "type": "set_vital",
        "vital": "consciousness",
        "value": "unresponsive"
      },
      { "type": "apply_score_modifier", "modifierId": "patient-harmed" }
    ],
    "choices": [
      {
        "id": "start-cpr",
        "text": "Start CPR and call a code",
        "nextNodeId": "resuscitation-sequence",
        "timeCost": 5,
        "effects": [],
        "condition": null
      }
    ]
  },

  "optimal-outcome": {
    "id": "optimal-outcome",
    "type": "outcome",
    "text": "Mr. Chen undergoes successful primary PCI. The LAD is opened with a drug-eluting stent. Door-to-balloon time: 48 minutes. He is transferred to the CCU in stable condition. His wife squeezes your hand. 'Thank you, doctor.'",
    "effects": [{ "type": "set_game_phase", "phase": "terminal" }],
    "choices": [],
    "outcomeId": "optimal"
  }
}
```

### Condition Registry (excerpt)

```json
{
  "anterior-stemi": {
    "id": "anterior-stemi",
    "name": "Anterior ST-Elevation Myocardial Infarction",
    "category": "cardiovascular",
    "isFatal": true,
    "vitalProgression": {
      "heartRate": [
        { "atMinute": 0, "value": 100 },
        { "atMinute": 60, "value": 115 },
        { "atMinute": 120, "value": 45 }
      ],
      "oxygenSaturation": [
        { "atMinute": 0, "value": 96 },
        { "atMinute": 90, "value": 89 }
      ]
    },
    "thresholdEvents": [
      {
        "vital": "heartRate",
        "operator": "lte",
        "value": 40,
        "eventNodeId": "vf-arrest-event"
      }
    ]
  }
}
```

---

## 8. Data Flow

### Complete action cycle: Player clicks "Order 12-lead ECG"

```
[React Component: ActionPanel]
  │
  │  User clicks choice button
  │
  ▼
[Zustand store action: dispatchChoice("order-ecg-immediately")]
  │
  ▼
[GameService.handleChoice(choiceId)]
  │  Retrieves current GameState from store
  │  Constructs PlayerAction object
  │
  ▼
[GameEngine.processAction(state, action)]
  │
  ├─► [1] Validate action is in state.progress.activeChoices
  │         Throws EngineError if not — prevents invalid state transitions
  │
  ├─► [2] EffectProcessor.apply(choice.effects, state)
  │         Applies: order_test("12-lead-ecg"), add_score_event(100pts)
  │         Returns intermediate state (immutable, new object)
  │
  ├─► [3] TimeEngine.advance(choice.timeCost, state)
  │         state.session.gameTime += 10
  │
  ├─► [4] VitalsEngine.recalculate(state)
  │         Reads active conditions + new gameTime
  │         Interpolates vital progressions
  │         Returns updated PatientVitals
  │
  ├─► [5] ScoringEngine.record(action, scoreEvents, state)
  │         Appends ScoreEvent to state.score.events
  │         Checks critical actions hit/missed
  │
  ├─► [6] NarrativeGraph.resolveNextNode(choice.nextNodeId, caseDocument)
  │         Looks up "ecg-result" node in node index
  │         Applies node entry effects (result_test, reveal_condition, add_knowledge)
  │         Appends narrative text to log
  │
  ├─► [7] RuleEngine.filterChoices(nextNode.choices, state)
  │         Evaluates conditions on each choice against new state
  │         Returns only choices the player may see now
  │
  └─► Returns new GameState
          {
            session: { gameTime: 10, ... },
            patient: { vitals: { heartRate: 102, ... }, conditions: { revealed: ["anterior-stemi"], ... } },
            player:  { knowledge: Set(["stemi-confirmed-on-ecg", "anterior-distribution"]), ... },
            progress: { currentNodeId: "ecg-result", activeChoices: [4 choices], narrativeLog: [...] },
            score:   { events: [{ points: 100, reason: "ECG ordered promptly" }], ... }
          }

[GameService receives new GameState]
  │
  ▼
[Zustand store updated with projected view of new state]
  │
  ▼
[React re-renders]
  │
  ├─► NarrativeLog: new entry "The ECG shows 3mm ST elevation in V1-V4..."
  ├─► VitalsDisplay: heartRate still 102 (10 min hasn't advanced it much)
  ├─► ActionPanel: 4 new choices rendered (Activate Cath Lab / Thrombolytics / etc.)
  ├─► TestResultsPanel: ECG appears as "Resulted"
  └─► ScoreHUD: shows +100 pts earned
```

### State serialization / save

At any point, `GameService.saveSession()` calls `GameEngine.serializeState(state)` which JSON-stringifies the entire `GameState`. This is written to `localStorage` keyed by `sessionId`. Restoring calls `GameEngine.deserializeState(json)` and hands the state back to the `GameService`.

---

## 9. MVP Scope

### In Scope for MVP

| Area        | Specifics                                                          |
| ----------- | ------------------------------------------------------------------ |
| Cases       | 5–7 hand-authored cases across 2–3 specialties                     |
| Case types  | Single-visit cases only                                            |
| Game loop   | Presentation → history → exam → investigation → decision → outcome |
| Engine      | Full engine with all 8 systems operational                         |
| Scoring     | Score breakdown, grade, critical actions report                    |
| Vitals      | Static vitals display, basic progression per condition             |
| UI          | Case selection, active game, results screen                        |
| Persistence | Session save/load via localStorage                                 |
| Deployment  | Static Next.js export → Vercel                                     |
| Testing     | Engine fully unit-tested; integration test per case                |

### Out of Scope for MVP (but architecturally supported)

| Feature                 | Why Deferred                                                                 |
| ----------------------- | ---------------------------------------------------------------------------- |
| User accounts           | No backend yet; localStorage sufficient for MVP                              |
| Leaderboards            | No backend                                                                   |
| Multi-visit cases       | Schema supports future extension; not built yet                              |
| Expansion packs         | Folder structure and `expansionPack` field ready                             |
| AI-generated cases      | Content validation pipeline is in place; AI just needs to produce valid JSON |
| Mobile app              | Engine and content are platform-agnostic; `apps/mobile` can be added         |
| Real-time deterioration | Requires event loop; deferred to make engine simpler at MVP                  |
| Case editor UI          | Authors write JSON directly; tooling comes later                             |
| Analytics               | Event structure exists; backend ingestion deferred                           |
| Undo                    | State history stack not implemented at MVP                                   |
| Multiplayer             | Architecture does not preclude it; deferred                                  |

---

## 10. Recommended First Milestone

**Milestone 1: Engine Foundation**  
_Definition of Done: A complete medical case can be run from start to terminal outcome entirely in TypeScript tests, with no UI, no browser, and no network._

### Tasks

| Task                      | Output                                                  | Notes                                       |
| ------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| Initialize monorepo       | pnpm workspace, Turborepo, tsconfig                     | Foundation for everything else              |
| Define all types          | `packages/types` fully authored                         | No logic, just contracts                    |
| Implement RuleEngine      | Operators, path resolution, composability               | Test-driven; test every operator            |
| Implement EffectProcessor | All effect types, immutability                          | Test every effect type                      |
| Implement TimeEngine      | Game-time advancement                                   | Simple; test with multi-step sequences      |
| Implement VitalsEngine    | Interpolation, threshold detection                      | Test condition progression tables           |
| Implement ScoringEngine   | Event recording, modifier application, final score calc | Test score reports                          |
| Implement NarrativeGraph  | Node lookup, choice filtering, conditional edges        | Test branch paths                           |
| Implement CaseLoader      | Zod validation, node indexing                           | Should produce clear errors, not crashes    |
| Implement GameEngine      | Orchestration pipeline                                  | Integration test: complete case playthrough |
| Author first case         | `chest-pain-001.json`                                   | Drives schema refinement                    |
| Write integration tests   | `tests/integration/full-case.test.ts`                   | Run three distinct paths through the case   |

### Success Criteria

- `vitest run` shows all tests passing
- The integration test runs a case to all three possible outcomes
- The same action sequence on the same seed always produces the same final score
- An intentionally malformed case JSON produces a human-readable validation error, not a crash

### What is explicitly NOT in Milestone 1

- Any React code
- Any UI
- Any file system reads at runtime (test fixtures only)
- Any backend
- Any network calls

Milestone 2 (web UI) can begin in parallel once the engine API is stable, because the engine's types define the contract the UI will consume.

---

## 11. What NOT to Build Yet

This list exists to protect the team from scope creep. Each item below has value — none should be dismissed — but none are required for MVP validation.

| Do Not Build                      | Reason                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Backend API                       | No multi-user features in MVP. Static deployment handles everything            |
| Database                          | localStorage is the persistence layer for MVP                                  |
| Authentication / user accounts    | Adds infrastructure overhead with no MVP value                                 |
| Case editor / authoring tool      | Authors write JSON. Tooling comes after content pipeline is proven             |
| Procedural case generation        | AI will generate valid JSON; the hard part is the schema, which we're building |
| Sound and music                   | Text-based game; audio is a polish layer                                       |
| CSS animations beyond transitions | Engine is the differentiator, not visual effects                               |
| Real-time vital updates           | Adds complexity without MVP-validating the core loop                           |
| Multiplayer / collab mode         | Different product entirely; share engine only                                  |
| PWA / offline support             | Defer until there's a reason users need offline access                         |
| Internationalization (i18n)       | English-first; i18n infrastructure adds real overhead                          |
| A/B testing framework             | No user base yet to run experiments on                                         |
| Analytics pipeline                | Valuable post-launch; instrument events now but don't build ingestion          |
| Mobile app                        | Web MVP first; validate the loop before porting                                |
| Undo / redo                       | Out of scope for MVP game design; add if playtests show it matters             |
| Content recommendation engine     | Needs data; build after 20+ cases exist                                        |
| Subscription / monetization       | A commercial concern; deferred until product is validated                      |

---

## Appendix A — Engine Public API Contract

The engine exposes exactly this surface from `packages/engine/src/index.ts`. Nothing else should be imported by consumers.

```
createSession(caseId, options?)         → GameState
processAction(state, action)            → GameState
getAvailableActions(state)              → ResolvedChoice[]
isTerminal(state)                       → boolean
getScoreReport(state)                   → ScoreReport | null
serializeState(state)                   → string
deserializeState(serialized)            → GameState
validateCase(caseDocument)              → ValidationResult
```

---

## Appendix B — Condition Expression Reference

Condition expressions used in case JSON are evaluated by the RuleEngine. They compose recursively.

```json
// Simple comparison
{ "op": "gte", "path": "patient.vitals.heartRate", "value": 100 }

// Knowledge check
{ "op": "has_knowledge", "knowledgeId": "stemi-confirmed-on-ecg" }

// Test state
{ "op": "test_resulted", "testId": "12-lead-ecg" }

// Compound
{ "op": "and", "conditions": [
    { "op": "has_knowledge", "knowledgeId": "stemi-confirmed-on-ecg" },
    { "op": "not", "condition":
        { "op": "test_resulted", "testId": "troponin" }
    }
]}

// Time gate
{ "op": "time_elapsed_gte", "minutes": 30 }

// Condition revealed
{ "op": "condition_revealed", "conditionId": "anterior-stemi" }
```

---

## Appendix C — Case Authoring Checklist

Before submitting a case file for review:

- [ ] `id` is unique across all cases in the registry
- [ ] All nodes referenced in `choices[].nextNodeId` exist in the `nodes` map
- [ ] At least one node has `type: "outcome"` with `phase: "terminal"` effect
- [ ] `scoring.criticalActions` include at least one `isMandatory: true` action
- [ ] All `conditionId` references exist in `conditions-registry.json`
- [ ] All `testId` references exist in `tests-registry.json`
- [ ] At least three distinct paths through the case (optimal, suboptimal, failure)
- [ ] `CaseLoader.validate()` returns no errors
- [ ] An integration test runs all three major paths

---

_This document is the source of truth for Emulos architecture decisions. Changes to fundamental architectural choices (engine API surface, state shape, case schema keys) should be reflected here before implementation begins._
