import { beforeAll, describe, expect, it } from "vitest";
import { GameEngine } from "../src/GameEngine.js";

import catUti001 from "../../content/cases/vet/cat-uti-001.json";
import conditionsRegistry from "../../content/conditions/conditions-registry.json";
import medicationsRegistry from "../../content/medications/medications-registry.json";
import proceduresRegistry from "../../content/procedures/procedures-registry.json";
import testsRegistry from "../../content/tests-catalog/tests-registry.json";

describe("GameEngine free actions", () => {
  let engine: GameEngine;

  beforeAll(() => {
    engine = GameEngine.fromRawJson(
      catUti001,
      conditionsRegistry,
      testsRegistry,
      medicationsRegistry,
      proceduresRegistry,
    );
  });

  it("does not administer irrelevant medications", () => {
    const state = engine.createSession({ seed: "irrelevant-medication-test" });
    const next = engine.performFreeAction(state, {
      type: "dispense_medication",
      itemId: "ibuprofen",
    });

    expect(next.player.dispensedMedications).toHaveLength(0);
    expect(next.session.gameTime).toBe(state.session.gameTime);
    expect(
      next.progress.narrativeLog.some((entry) =>
        entry.text.includes("administered."),
      ),
    ).toBe(false);
    expect(next.progress.narrativeLog.length).toBeGreaterThan(
      state.progress.narrativeLog.length,
    );
    expect(
      next.score.events.some(
        (event) =>
          event.actionId === "irrelevant-dispense_medication-ibuprofen" &&
          event.points < 0,
      ),
    ).toBe(true);
  });

  it("does not perform irrelevant procedures", () => {
    const state = engine.createSession({ seed: "irrelevant-procedure-test" });
    const next = engine.performFreeAction(state, {
      type: "perform_procedure",
      itemId: "lumbar-puncture",
    });

    expect(next.player.performedProcedures).toHaveLength(0);
    expect(next.session.gameTime).toBe(state.session.gameTime);
    expect(
      next.progress.narrativeLog.some((entry) =>
        entry.text.includes("performed."),
      ),
    ).toBe(false);
    expect(next.progress.narrativeLog.length).toBeGreaterThan(
      state.progress.narrativeLog.length,
    );
    expect(
      next.score.events.some(
        (event) =>
          event.actionId === "irrelevant-perform_procedure-lumbar-puncture" &&
          event.points < 0,
      ),
    ).toBe(true);
  });
});
