import { FLIGHTS } from "./schedule.js";
import { SEED_BOOKINGS } from "./seed-bookings.js";
import type { Booking, Flight, World } from "./types.js";

// every run gets its own deep copy, so one agent's changes can't leak
// into the next run (same idea as buildTools(state) in honesty gap).
export function createWorld(
  bookings: Booking[] = SEED_BOOKINGS,
  flights: Flight[] = FLIGHTS
): World {
  return {
    bookings: structuredClone(bookings),
    flights: structuredClone(flights),
    log: [],
  };
}

// models sometimes send locators in lowercase, so match loosely
export function findBooking(world: World, locator: string): Booking | undefined {
  const wanted = locator.trim().toUpperCase();
  return world.bookings.find((b) => b.locator === wanted);
}

export function findFlight(
  world: World,
  flightNumber: string,
  date: string
): Flight | undefined {
  const wanted = flightNumber.replace(/\s+/g, "").toUpperCase();
  return world.flights.find((f) => f.flightNumber === wanted && f.date === date);
}

function snapshot(world: World, locator: string | null): Booking | null {
  if (!locator) return null;
  const booking = findBooking(world, locator);
  return booking ? structuredClone(booking) : null;
}

// every tool goes through here. the before/after copies are the ground
// truth the checker reads, not the tool's output, which is what lets us
// catch a tool that says "ok" while nothing changed.
export async function recordCall(
  world: World,
  tool: string,
  input: Record<string, unknown>,
  fn: () => unknown | Promise<unknown>
): Promise<unknown> {
  const locator = typeof input.locator === "string" ? input.locator : null;
  const before = snapshot(world, locator);

  let output: unknown;
  try {
    // copy so later changes to the world can't rewrite what the agent was shown
    output = structuredClone(await fn());
  } catch (err) {
    // a tool bug shouldn't kill the run. log it like any other failure.
    output = { error: err instanceof Error ? err.message : String(err) };
  }

  world.log.push({
    step: world.log.length + 1,
    tool,
    input,
    output,
    locator,
    before,
    after: snapshot(world, locator),
  });

  return output;
}
