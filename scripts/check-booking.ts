import assert from "node:assert/strict";
import { changeAllowed, changeFeeFor, refundAllowed } from "../src/booking/fare-rules.js";
import { createWorld, findBooking, findFlight, recordCall } from "../src/booking/world.js";

// sanity checks for the fake booking system. not a test suite, just
// enough to catch a broken seed or a snapshot that's secretly a reference.

function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(() => console.log(`ok   ${name}`));
}

await check("every booked segment points at a real flight", () => {
  const world = createWorld();
  for (const b of world.bookings) {
    for (const s of b.segments) {
      const flight = findFlight(world, s.flightNumber, s.date);
      assert.ok(flight, `${b.locator} -> ${s.flightNumber} on ${s.date}`);
      assert.equal(flight.from, s.from);
      assert.equal(flight.to, s.to);
      if (s.seat) assert.ok(!flight.openSeats.includes(s.seat), `${s.seat} is booked but listed open`);
    }
  }
});

await check("locators are unique", () => {
  const world = createWorld();
  const locators = world.bookings.map((b) => b.locator);
  assert.equal(new Set(locators).size, locators.length);
});

await check("some flights are sold out", () => {
  const world = createWorld();
  assert.ok(world.flights.filter((f) => f.openSeats.length === 0).length >= 3);
});

await check("fare rules", () => {
  const world = createWorld();
  const basic = findBooking(world, "HTW4PM")!;
  const main = findBooking(world, "QZX7KD")!;
  const flex = findBooking(world, "LMR9VB")!;

  assert.equal(refundAllowed(basic), false);
  assert.equal(changeAllowed(basic), false);
  // a waiver can't rescue a basic fare
  basic.waiverApplied = true;
  assert.equal(refundAllowed(basic), false);
  assert.equal(changeAllowed(basic), false);

  assert.equal(refundAllowed(main), false);
  assert.equal(changeAllowed(main), true);
  assert.equal(changeFeeFor(main), 75);
  main.waiverApplied = true;
  assert.equal(refundAllowed(main), true);
  assert.equal(changeFeeFor(main), 0);

  assert.equal(refundAllowed(flex), true);
  assert.equal(changeFeeFor(flex), 0);
});

await check("lowercase locator still matches", () => {
  const world = createWorld();
  assert.equal(findBooking(world, " qzx7kd ")?.travelerName, "Avery Lindqvist");
});

await check("recordCall snapshots before and after", async () => {
  const world = createWorld();
  await recordCall(world, "test_seat_change", { locator: "QZX7KD" }, () => {
    findBooking(world, "QZX7KD")!.segments[0].seat = "10A";
    return { status: "ok" };
  });
  const entry = world.log[0];
  assert.equal(entry.step, 1);
  assert.equal(entry.before?.segments[0].seat, "22C");
  assert.equal(entry.after?.segments[0].seat, "10A");
});

await check("quiet failure: ok output, before equals after", async () => {
  const world = createWorld();
  await recordCall(world, "test_quiet_fail", { locator: "QZX7KD" }, () => ({ status: "ok" }));
  assert.deepEqual(world.log[0].before, world.log[0].after);
});

await check("a throwing tool is logged, not fatal", async () => {
  const world = createWorld();
  const out = await recordCall(world, "test_throw", { locator: "QZX7KD" }, () => {
    throw new Error("timeout");
  });
  assert.deepEqual(out, { error: "timeout" });
  assert.equal(world.log.length, 1);
});

await check("unknown locator gives null snapshots", async () => {
  const world = createWorld();
  await recordCall(world, "test_lookup", { locator: "NOPE00" }, () => ({ error: "not found" }));
  assert.equal(world.log[0].before, null);
  assert.equal(world.log[0].after, null);
});

await check("worlds don't share state", () => {
  const a = createWorld();
  const b = createWorld();
  findBooking(a, "QZX7KD")!.refundStatus = "refunded";
  a.flights[0].openSeats.pop();
  assert.equal(findBooking(b, "QZX7KD")!.refundStatus, "none");
  assert.equal(b.flights[0].openSeats.length, 6);
  assert.equal(createWorld().log.length, 0);
});

console.log("\nall booking checks passed");
