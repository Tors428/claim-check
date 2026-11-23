import { findBooking } from "../booking/world.js";
import type { World } from "../booking/types.js";
import type { Fault } from "../tools/types.js";

export function addNote(world: World, locator: string, note: string) {
  const booking = findBooking(world, locator)!;
  booking.notes = [...(booking.notes ?? []), note];
}

// faults fire once each, so a failure that "keeps" failing is just the
// same timeout on several calls in a row
export function keepsTimingOut(tool: string, times: number, fromCall = 1): Fault[] {
  const faults: Fault[] = [];
  for (let i = 0; i < times; i++) {
    faults.push({ tool, kind: "timeout", appliedAnyway: false, onCall: fromCall + i });
  }
  return faults;
}

export const MEI_SCHEDULE_CHANGE =
  "Schedule change by Northwind Air on 2027-02-10: NWD332 moved from 11:15 to 16:20.";
