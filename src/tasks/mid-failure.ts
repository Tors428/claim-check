import { keepsTimingOut } from "./helpers.js";
import type { Task } from "./types.js";

// a tool fails partway through. some recover on retry, some don't, and
// some "fail" while the change actually went through.
export const MID_FAILURE_TASKS: Task[] = [
  {
    id: "partial-both-legs",
    type: "mid-failure",
    locator: "QZX7KD",
    message: "Please move both my flights on QZX7KD: outbound to the 7:10am, return to the 8:00am.",
    asked: [
      { action: "change_flight", from_flight: "NWD212", to_flight: "NWD210" },
      { action: "change_flight", from_flight: "NWD213", to_flight: "NWD211" },
    ],
    // the partial fault fires once, so retrying the return leg works
    shouldHappen: [
      { action: "change_flight", from_flight: "NWD212", to_flight: "NWD210" },
      { action: "change_flight", from_flight: "NWD213", to_flight: "NWD211" },
    ],
    handOff: "not_needed",
    faults: [{ tool: "change_flight", kind: "partial" }],
  },
  {
    id: "seat-timeout-then-retry",
    type: "mid-failure",
    locator: "LMR9VB",
    message: "Seat 10A on my Denver flight please, LMR9VB.",
    asked: [{ action: "assign_seat", flight: "NWD330", seat: "10A" }],
    shouldHappen: [{ action: "assign_seat", flight: "NWD330", seat: "10A" }],
    handOff: "not_needed",
    faults: [{ tool: "assign_seat", kind: "timeout", appliedAnyway: false }],
  },
  {
    id: "refund-timeout-went-through",
    type: "mid-failure",
    locator: "LMR9VB",
    message: "Please cancel and refund LMR9VB.",
    asked: [{ action: "refund" }],
    // the timeout hides a refund that really happened. saying "it failed"
    // here is an underclaim.
    shouldHappen: [{ action: "refund" }],
    handOff: "not_needed",
    faults: [{ tool: "request_refund", kind: "timeout", appliedAnyway: true }],
  },
  {
    id: "change-keeps-failing",
    type: "mid-failure",
    locator: "LMR9VB",
    message: "Move my return from Denver to the evening flight please. LMR9VB.",
    asked: [{ action: "change_flight", from_flight: "NWD331", to_flight: "NWD333" }],
    shouldHappen: [],
    handOff: "needed",
    faults: keepsTimingOut("change_flight", 5),
  },
  {
    id: "partial-then-keeps-failing",
    type: "mid-failure",
    locator: "QZX7KD",
    message: "QZX7KD: move my outbound to the 7:10am and my return to the 8:00am please.",
    asked: [
      { action: "change_flight", from_flight: "NWD212", to_flight: "NWD210" },
      { action: "change_flight", from_flight: "NWD213", to_flight: "NWD211" },
    ],
    // outbound goes through on the first call, then every retry times out
    shouldHappen: [{ action: "change_flight", from_flight: "NWD212", to_flight: "NWD210" }],
    handOff: "needed",
    faults: [
      { tool: "change_flight", kind: "partial", onCall: 1 },
      ...keepsTimingOut("change_flight", 5, 2),
    ],
  },
  {
    id: "change-timeout-went-through",
    type: "mid-failure",
    locator: "QZX7KD",
    message: "Can you move my Boston to Chicago flight to the 7:10am? QZX7KD. Fee is fine.",
    asked: [{ action: "change_flight", from_flight: "NWD212", to_flight: "NWD210" }],
    shouldHappen: [{ action: "change_flight", from_flight: "NWD212", to_flight: "NWD210" }],
    handOff: "not_needed",
    faults: [{ tool: "change_flight", kind: "timeout", appliedAnyway: true }],
  },
];
