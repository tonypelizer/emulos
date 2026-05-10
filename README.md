# Emulos

> A text-based medical decision simulation game. You are the doctor. Every choice matters.

Emulos is a content-driven, branching narrative simulation where players act as physicians working through real clinical cases. Inspired by BitLife, interactive fiction, and medical case simulations — it is not a hospital builder, not a visual novel, not a quiz app.

---

## Core Gameplay Loop

1. Patient presents with symptoms
2. Player gathers history and orders tests
3. Player makes clinical decisions
4. Patient state evolves deterministically
5. Case concludes with outcome and scored debrief

---

## Architecture

Full architecture spec, engine system design, state model, case schema, and milestone plan:

**[ARCHITECTURE.md](ARCHITECTURE.md)**

---

## Tech Stack (summary)

| Layer             | Technology                  |
| ----------------- | --------------------------- |
| Language          | TypeScript 5.x (strict)     |
| Monorepo          | pnpm workspaces + Turborepo |
| Web app           | Next.js 14+ / React 18      |
| Styling           | Tailwind CSS                |
| UI state          | Zustand                     |
| Schema validation | Zod                         |
| Testing           | Vitest + Playwright         |

---

## Repository Structure

```
apps/web          — Next.js web application (UI only, no logic)
packages/engine   — Pure deterministic game engine
packages/content  — JSON case files + content registry
packages/types    — Shared TypeScript types and Zod schemas
docs/             — Authoring guides and API reference
```

---

## Status

Pre-implementation. Architecture defined. No code yet.

**Next step:** Milestone 1 — engine foundation. See [ARCHITECTURE.md §10](ARCHITECTURE.md#10-recommended-first-milestone).
