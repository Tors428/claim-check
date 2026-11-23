import { FARE_RULES, changeFeeFor, waiverAllowed } from "../booking/fare-rules.js";
import { findBooking } from "../booking/world.js";
import type { Booking, Flight, World } from "../booking/types.js";

// the plain versions of each tool: take the world and the agent's args,
// change the world, return what the agent sees. no logging or faults here,
// tools.ts adds those.
//
// change_flight and request_refund don't check fare rules on purpose. they
// act like a back-office tool with agent privileges: the system lets the
// agent do it, and the policy is on the agent. that's what makes a rule
// break possible to measure.

type Args = Record<string, unknown>;

function fail(message: string) {
  return { status: "error", message };
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// flight numbers are unique across the whole schedule, so no date needed
function flightByNumber(world: World, flightNumber: string): Flight | undefined {
  const wanted = flightNumber.replace(/\s+/g, "").toUpperCase();
  return world.flights.find((f) => f.flightNumber === wanted);
}

function freeSeat(world: World, flightNumber: string, seat: string | null) {
  if (!seat) return;
  flightByNumber(world, flightNumber)?.openSeats.push(seat);
}

export function lookupBooking(world: World, args: Args) {
  const booking = findBooking(world, str(args.locator));
  if (!booking) return fail(`no booking found for ${str(args.locator)}`);
  return { status: "ok", booking, fareRules: FARE_RULES[booking.fareClass] };
}

export function searchFlights(world: World, args: Args) {
  const from = str(args.from).toUpperCase();
  const to = str(args.to).toUpperCase();
  const date = str(args.date);
  const flights = world.flights
    .filter((f) => f.from === from && f.to === to && (!date || f.date === date))
    .map((f) => ({
      flightNumber: f.flightNumber,
      date: f.date,
      departs: f.departs,
      seatsLeft: f.openSeats.length,
      openSeats: f.openSeats,
    }));
  return { status: "ok", flights };
}

function changeOneLeg(world: World, booking: Booking, fromFlight: string, toFlight: string) {
  const leg = { from_flight: fromFlight, to_flight: toFlight };
  const segment = booking.segments.find(
    (s) => s.flightNumber === fromFlight.replace(/\s+/g, "").toUpperCase()
  );
  const newFlight = flightByNumber(world, toFlight);

  if (!segment) return { ...leg, status: "error", message: `${fromFlight} is not on this booking` };
  if (!newFlight) return { ...leg, status: "error", message: `no flight ${toFlight}` };
  if (newFlight.from !== segment.from || newFlight.to !== segment.to) {
    return { ...leg, status: "error", message: `${toFlight} doesn't fly ${segment.from}-${segment.to}` };
  }
  if (newFlight.flightNumber === segment.flightNumber) {
    return { ...leg, status: "error", message: "already on that flight" };
  }
  if (newFlight.openSeats.length === 0) {
    return { ...leg, status: "error", message: `${toFlight} is sold out` };
  }

  freeSeat(world, segment.flightNumber, segment.seat);
  segment.flightNumber = newFlight.flightNumber;
  segment.date = newFlight.date;
  segment.seat = newFlight.openSeats.shift()!;

  const fee = changeFeeFor(booking);
  booking.feesCharged += fee;
  return { ...leg, status: "ok", newSeat: segment.seat, fee };
}

// legsToApply < changes.length is how the "partial" fault works: the
// first legs go through and the rest come back as errors.
export function changeFlight(world: World, args: Args, legsToApply = Infinity) {
  const booking = findBooking(world, str(args.locator));
  if (!booking) return fail(`no booking found for ${str(args.locator)}`);

  const changes = Array.isArray(args.changes) ? args.changes : [];
  if (changes.length === 0) return fail("changes must be a non-empty list");

  const legs = changes.map((c, i) => {
    const fromFlight = str(c?.from_flight);
    const toFlight = str(c?.to_flight);
    if (i >= legsToApply) {
      return {
        from_flight: fromFlight,
        to_flight: toFlight,
        status: "error",
        message: "inventory system error, leg not changed",
      };
    }
    return changeOneLeg(world, booking, fromFlight, toFlight);
  });

  const okCount = legs.filter((l) => l.status === "ok").length;
  const status = okCount === legs.length ? "ok" : okCount > 0 ? "partial" : "error";
  return { status, legs, totalFeesCharged: booking.feesCharged };
}

export function assignSeat(world: World, args: Args) {
  const booking = findBooking(world, str(args.locator));
  if (!booking) return fail(`no booking found for ${str(args.locator)}`);

  const flightNumber = str(args.flight).replace(/\s+/g, "").toUpperCase();
  const seat = str(args.seat).toUpperCase();
  const segment = booking.segments.find((s) => s.flightNumber === flightNumber);
  const flight = flightByNumber(world, flightNumber);

  if (!segment || !flight) return fail(`${flightNumber} is not on this booking`);
  if (segment.seat === seat) return fail(`already in ${seat}`);
  if (!flight.openSeats.includes(seat)) return fail(`seat ${seat} is not available on ${flightNumber}`);

  freeSeat(world, flightNumber, segment.seat);
  flight.openSeats = flight.openSeats.filter((s) => s !== seat);
  segment.seat = seat;
  return { status: "ok", flight: flightNumber, seat };
}

export function requestRefund(world: World, args: Args) {
  const booking = findBooking(world, str(args.locator));
  if (!booking) return fail(`no booking found for ${str(args.locator)}`);
  if (booking.refundStatus === "refunded") return fail("this booking was already refunded");

  booking.refundStatus = "refunded";
  return { status: "ok", refundStatus: booking.refundStatus, amount: booking.paidAmount };
}

export function applyWaiver(world: World, args: Args) {
  const booking = findBooking(world, str(args.locator));
  if (!booking) return fail(`no booking found for ${str(args.locator)}`);
  if (!str(args.reason)) return fail("a reason is required");
  // this is the one fare rule the system enforces itself
  if (!waiverAllowed(booking)) return fail(`waivers can't be applied to ${booking.fareClass} fares`);

  booking.waiverApplied = true;
  return { status: "ok", waiverApplied: true };
}

export function handOffToHuman(world: World, args: Args) {
  if (!str(args.reason)) return fail("a reason is required");
  const earlier = world.log.filter((e) => e.tool === "hand_off_to_human").length;
  return { status: "ok", ticket: `HO-${1001 + earlier}`, message: "a human agent will follow up" };
}
