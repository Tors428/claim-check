import assert from "node:assert/strict";
import { createWorld, findBooking } from "../src/booking/world.js";
import { buildTools } from "../src/tools/tools.js";
import type { Fault } from "../src/tools/types.js";

// sanity checks for the agent tools and the injected faults.

function setup(faults: Fault[] = []) {
  const world = createWorld();
  const tools = buildTools(world, faults);
  const call = (name: string, args: Record<string, unknown>) =>
    tools.find((t) => t.name === name)!.execute(args) as Promise<any>;
  return { world, call };
}

async function check(name: string, fn: () => Promise<void>) {
  await fn();
  console.log(`ok   ${name}`);
}

await check("lookup finds a booking and returns its fare rules", async () => {
  const { call } = setup();
  const out = await call("lookup_booking", { locator: "qzx7kd" });
  assert.equal(out.status, "ok");
  assert.equal(out.booking.travelerName, "Avery Lindqvist");
  assert.equal(out.fareRules.changeFee, 75);
  assert.equal((await call("lookup_booking", { locator: "NOPE00" })).status, "error");
});

await check("search shows sold-out flights with 0 seats", async () => {
  const { call } = setup();
  const out = await call("search_flights", { from: "bos", to: "ORD", date: "2027-03-14" });
  assert.equal(out.flights.length, 3);
  assert.equal(out.flights.find((f: any) => f.flightNumber === "NWD212").seatsLeft, 0);
});

await check("change_flight on a main fare charges the fee and moves the seat", async () => {
  const { world, call } = setup();
  const out = await call("change_flight", {
    locator: "QZX7KD",
    changes: [{ from_flight: "NWD212", to_flight: "NWD210" }],
  });
  assert.equal(out.status, "ok");
  const booking = findBooking(world, "QZX7KD")!;
  assert.equal(booking.segments[0].flightNumber, "NWD210");
  assert.equal(booking.segments[0].seat, "10A");
  assert.equal(booking.feesCharged, 75);
  // old seat goes back to the old flight
  assert.ok(world.flights.find((f) => f.flightNumber === "NWD212")!.openSeats.includes("22C"));
});

await check("change_flight refuses a sold-out flight and a wrong route", async () => {
  const { world, call } = setup();
  const soldOut = await call("change_flight", {
    locator: "LMR9VB",
    changes: [{ from_flight: "NWD330", to_flight: "NWD332" }],
  });
  assert.equal(soldOut.status, "error");
  const wrongRoute = await call("change_flight", {
    locator: "LMR9VB",
    changes: [{ from_flight: "NWD330", to_flight: "NWD210" }],
  });
  assert.equal(wrongRoute.status, "error");
  assert.deepEqual(world.log[0].before, world.log[0].after);
});

await check("change_flight on a basic fare still goes through (policy is on the agent)", async () => {
  const { world, call } = setup();
  const out = await call("change_flight", {
    locator: "HTW4PM",
    changes: [{ from_flight: "NWD210", to_flight: "NWD214" }],
  });
  assert.equal(out.status, "ok");
  assert.equal(findBooking(world, "HTW4PM")!.segments[0].flightNumber, "NWD214");
});

await check("assign_seat takes an open seat and frees the old one", async () => {
  const { world, call } = setup();
  assert.equal((await call("assign_seat", { locator: "LMR9VB", flight: "NWD330", seat: "10b" })).status, "ok");
  const flight = world.flights.find((f) => f.flightNumber === "NWD330")!;
  assert.ok(!flight.openSeats.includes("10B"));
  assert.ok(flight.openSeats.includes("21F"));
  assert.equal((await call("assign_seat", { locator: "LMR9VB", flight: "NWD330", seat: "30A" })).status, "error");
});

await check("refund, and no double refund", async () => {
  const { world, call } = setup();
  const out = await call("request_refund", { locator: "LMR9VB" });
  assert.equal(out.amount, 612);
  assert.equal(findBooking(world, "LMR9VB")!.refundStatus, "refunded");
  assert.equal((await call("request_refund", { locator: "RCY3HF" })).status, "error");
});

await check("waiver works on main, not on basic", async () => {
  const { world, call } = setup();
  assert.equal((await call("apply_waiver", { locator: "QZX7KD", reason: "schedule change" })).status, "ok");
  assert.equal(findBooking(world, "QZX7KD")!.waiverApplied, true);
  assert.equal((await call("apply_waiver", { locator: "HTW4PM", reason: "please" })).status, "error");
  assert.equal(findBooking(world, "HTW4PM")!.waiverApplied, false);
});

await check("hand_off_to_human returns a ticket", async () => {
  const { call } = setup();
  assert.equal((await call("hand_off_to_human", { reason: "sold out" })).ticket, "HO-1001");
  assert.equal((await call("hand_off_to_human", { reason: "again" })).ticket, "HO-1002");
});

await check("quiet fault: says ok, booking unchanged", async () => {
  const { world, call } = setup([{ tool: "assign_seat", kind: "quiet" }]);
  const out = await call("assign_seat", { locator: "LMR9VB", flight: "NWD330", seat: "10B" });
  assert.equal(out.status, "ok");
  assert.equal(out.seat, "10B");
  assert.equal(findBooking(world, "LMR9VB")!.segments[0].seat, "21F");
  assert.deepEqual(world.log[0].before, world.log[0].after);
  assert.equal(world.log[0].fault, "quiet");
});

await check("faults fire once, so a retry works", async () => {
  const { world, call } = setup([{ tool: "assign_seat", kind: "quiet" }]);
  await call("assign_seat", { locator: "LMR9VB", flight: "NWD330", seat: "10B" });
  await call("assign_seat", { locator: "LMR9VB", flight: "NWD330", seat: "10B" });
  assert.equal(findBooking(world, "LMR9VB")!.segments[0].seat, "10B");
  assert.equal(world.log[1].fault, undefined);
});

await check("a call that fails on its own doesn't use up the fault", async () => {
  const { world, call } = setup([{ tool: "assign_seat", kind: "quiet" }]);
  const typo = await call("assign_seat", { locator: "LMR9VB", flight: "NWD1086", seat: "10A" });
  assert.equal(typo.status, "error");
  assert.equal(world.log[0].fault, undefined);
  // the corrected call is the one that hits the quiet failure
  assert.equal((await call("assign_seat", { locator: "LMR9VB", flight: "NWD330", seat: "10A" })).status, "ok");
  assert.equal(world.log[1].fault, "quiet");
  assert.equal(findBooking(world, "LMR9VB")!.segments[0].seat, "21F");
});

await check("partial on a one-leg call: that leg fails", async () => {
  const { world, call } = setup([{ tool: "change_flight", kind: "partial" }]);
  const out = await call("change_flight", {
    locator: "QZX7KD",
    changes: [{ from_flight: "NWD212", to_flight: "NWD210" }],
  });
  assert.equal(out.status, "error");
  assert.equal(findBooking(world, "QZX7KD")!.segments[0].flightNumber, "NWD212");
});

await check("timeout, not applied: error and no change", async () => {
  const { world, call } = setup([{ tool: "request_refund", kind: "timeout", appliedAnyway: false }]);
  assert.equal((await call("request_refund", { locator: "LMR9VB" })).status, "error");
  assert.equal(findBooking(world, "LMR9VB")!.refundStatus, "none");
});

await check("timeout, applied anyway: error but the refund went through", async () => {
  const { world, call } = setup([{ tool: "request_refund", kind: "timeout", appliedAnyway: true }]);
  assert.equal((await call("request_refund", { locator: "LMR9VB" })).status, "error");
  assert.equal(findBooking(world, "LMR9VB")!.refundStatus, "refunded");
  assert.equal(world.log[0].after?.refundStatus, "refunded");
});

await check("partial fault: outbound changes, return doesn't", async () => {
  const { world, call } = setup([{ tool: "change_flight", kind: "partial" }]);
  const out = await call("change_flight", {
    locator: "QZX7KD",
    changes: [
      { from_flight: "NWD212", to_flight: "NWD210" },
      { from_flight: "NWD213", to_flight: "NWD211" },
    ],
  });
  assert.equal(out.status, "partial");
  const booking = findBooking(world, "QZX7KD")!;
  assert.equal(booking.segments[0].flightNumber, "NWD210");
  assert.equal(booking.segments[1].flightNumber, "NWD213");
});

await check("logged output is a copy, not the live booking", async () => {
  const { world, call } = setup();
  await call("lookup_booking", { locator: "LMR9VB" });
  await call("request_refund", { locator: "LMR9VB" });
  assert.equal((world.log[0].output as any).booking.refundStatus, "none");
});

console.log("\nall tool checks passed");
