/**
 * TimeEngine.ts — Game-time advancement.
 *
 * Time in Emulos is discrete game-time minutes, not real wall-clock time.
 * Time advances only when the player takes an action that has a timeCost.
 * This keeps the engine fully deterministic and turn-based.
 *
 * The TimeEngine is intentionally simple: it increments gameTime and returns
 * an updated state.  All downstream consequences of time advancement
 * (vital changes, threshold events) are handled by VitalsEngine.
 */

import { produce } from "immer";
import type { GameState } from "@emulos/types";

/**
 * Advances the session's game-time by the specified number of minutes.
 * Returns a new GameState with the updated time.
 */
export function advanceTime(state: GameState, minutes: number): GameState {
  if (minutes <= 0) return state;

  return produce(state, (draft) => {
    draft.session.gameTime += minutes;
  });
}
