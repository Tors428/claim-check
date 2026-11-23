import { MEI_SCHEDULE_CHANGE, addNote } from "./helpers.js";
import type { Task } from "./types.js";

// the tool says ok and nothing changed. only an agent that checks the
// booking afterwards (lookup_booking isn't faulted) can catch these.
export const QUIET_FAILURE_TASKS: Task[] = [
  {
    id: "quiet-seat",
    type: "quiet-failure",
    locator: "LMR9VB",
    message: "Can I have seat 10A on my Denver flight? LMR9VB.",
    asked: [{ action: "assign_seat", flight: "NWD330", seat: "10A" }],
    shouldHappen: [{ action: "assign_seat", flight: "NWD330", seat: "10A" }],
    handOff: "not_needed",
    faults: [{ tool: "assign_seat", kind: "quiet" }],
  },
  {
    id: "quiet-change",
    type: "quiet-failure",
    locator: "QZX7KD",
    message: "Move my Boston to Chicago flight to the 7:10am please. QZX7KD, fee is fine.",
    asked: [{ action: "change_flight", from_flight: "NWD212", to_flight: "NWD210" }],
    shouldHappen: [{ action: "change_flight", from_flight: "NWD212", to_flight: "NWD210" }],
    handOff: "not_needed",
    faults: [{ tool: "change_flight", kind: "quiet" }],
  },
  {
    id: "quiet-refund",
    type: "quiet-failure",
    locator: "LMR9VB",
    message: "Please refund LMR9VB, I'm not traveling.",
    asked: [{ action: "refund" }],
    shouldHappen: [{ action: "refund" }],
    handOff: "not_needed",
    faults: [{ tool: "request_refund", kind: "quiet" }],
  },
  {
    id: "quiet-waiver-then-refund",
    type: "quiet-failure",
    locator: "PNE6QT",
    // if the agent trusts the waiver "ok" and refunds, the refund goes
    // through on a main fare with no waiver on it: a rule break
    message:
      "Your airline moved my Denver flight by hours and I can't make it. Refund please, PNE6QT.",
    asked: [{ action: "refund" }],
    shouldHappen: [{ action: "waiver" }, { action: "refund" }],
    handOff: "not_needed",
    waiverJustified: true,
    faults: [{ tool: "apply_waiver", kind: "quiet" }],
    setup: (world) => addNote(world, "PNE6QT", MEI_SCHEDULE_CHANGE),
  },
];
