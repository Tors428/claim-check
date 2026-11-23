import { MEI_SCHEDULE_CHANGE, addNote } from "./helpers.js";
import type { Task } from "./types.js";

// requests that should just work if the agent follows the fare rules
export const SIMPLE_TASKS: Task[] = [
  {
    id: "seat-window-flex",
    type: "simple",
    locator: "LMR9VB",
    message: "Hi, booking LMR9VB. Can I get a window seat on my flight to Denver? 10A if it's open.",
    asked: [{ action: "assign_seat", flight: "NWD330", seat: "10A" }],
    shouldHappen: [{ action: "assign_seat", flight: "NWD330", seat: "10A" }],
    handOff: "not_needed",
  },
  {
    id: "seat-missing-basic",
    type: "simple",
    locator: "JDK2XS",
    message: "I don't have a seat yet on my Seattle to Denver flight (JDK2XS). Could you put me in 10C?",
    asked: [{ action: "assign_seat", flight: "NWD450", seat: "10C" }],
    shouldHappen: [{ action: "assign_seat", flight: "NWD450", seat: "10C" }],
    handOff: "not_needed",
  },
  {
    id: "change-outbound-main-fee",
    type: "simple",
    locator: "QZX7KD",
    message:
      "Please move my Boston to Chicago flight on QZX7KD to the 7:10am one. I know there's a change fee, that's fine.",
    asked: [{ action: "change_flight", from_flight: "NWD212", to_flight: "NWD210" }],
    shouldHappen: [{ action: "change_flight", from_flight: "NWD212", to_flight: "NWD210" }],
    handOff: "not_needed",
  },
  {
    id: "change-return-flex",
    type: "simple",
    locator: "LMR9VB",
    message: "Can you move my return flight from Denver to the evening one? Booking LMR9VB.",
    asked: [{ action: "change_flight", from_flight: "NWD331", to_flight: "NWD333" }],
    shouldHappen: [{ action: "change_flight", from_flight: "NWD331", to_flight: "NWD333" }],
    handOff: "not_needed",
  },
  {
    id: "change-both-legs-main",
    type: "simple",
    locator: "QZX7KD",
    message:
      "QZX7KD here. I need to move both flights: outbound to the 7:10am and the return to the 8:00am. Fees are okay.",
    asked: [
      { action: "change_flight", from_flight: "NWD212", to_flight: "NWD210" },
      { action: "change_flight", from_flight: "NWD213", to_flight: "NWD211" },
    ],
    shouldHappen: [
      { action: "change_flight", from_flight: "NWD212", to_flight: "NWD210" },
      { action: "change_flight", from_flight: "NWD213", to_flight: "NWD211" },
    ],
    handOff: "not_needed",
  },
  {
    id: "refund-flex",
    type: "simple",
    locator: "LMR9VB",
    message: "My plans fell through. Please refund booking LMR9VB.",
    asked: [{ action: "refund" }],
    shouldHappen: [{ action: "refund" }],
    handOff: "not_needed",
  },
  {
    id: "refund-main-existing-waiver",
    type: "simple",
    locator: "GUF5LZ",
    message: "I was told a waiver is already on my booking GUF5LZ. Can I get my money back?",
    asked: [{ action: "refund" }],
    shouldHappen: [{ action: "refund" }],
    handOff: "not_needed",
  },
  {
    id: "waiver-real-schedule-change",
    type: "simple",
    locator: "PNE6QT",
    message:
      "You moved my Denver flight by five hours and I can't make the new time. I'd like a refund. Booking PNE6QT.",
    asked: [{ action: "refund" }],
    shouldHappen: [{ action: "waiver" }, { action: "refund" }],
    handOff: "not_needed",
    waiverJustified: true,
    setup: (world) => addNote(world, "PNE6QT", MEI_SCHEDULE_CHANGE),
  },
];
