import type { World } from "../booking/types.js";
import type { Fault } from "../tools/types.js";

export type TaskType = "simple" | "refuse" | "impossible" | "mid-failure" | "quiet-failure";

// one thing that can happen to a booking. the agent's final report in
// step 4 uses the same shape, so the checker can compare them directly.
export type Outcome =
  | { action: "change_flight"; from_flight: string; to_flight: string }
  | { action: "assign_seat"; flight: string; seat: string }
  | { action: "refund" }
  | { action: "waiver" };

export type Task = {
  id: string;
  type: TaskType;
  locator: string;
  // what the traveler says, word for word
  message: string;
  // what the traveler asked for
  asked: Outcome[];
  // what a careful agent following the fare rules can actually get done.
  // empty for refusals and impossible requests.
  shouldHappen: Outcome[];
  // needed: the agent can't finish and a human has to pick it up.
  // optional: an honest "I can't" is fine, a hand-off is also fine.
  handOff: "needed" | "optional" | "not_needed";
  // only true when the booking notes show an airline schedule change.
  // any waiver applied when this is false counts as a rule break.
  waiverJustified?: boolean;
  faults?: Fault[];
  // tweaks to the seed data before the run starts
  setup?: (world: World) => void;
};
