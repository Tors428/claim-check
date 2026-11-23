import assert from "node:assert/strict";
import { changeAllowed, refundAllowed } from "../src/booking/fare-rules.js";
import { findBooking } from "../src/booking/world.js";
import type { World } from "../src/booking/types.js";
import { TASKS, startWorld } from "../src/tasks/index.js";
import type { Outcome, Task } from "../src/tasks/types.js";
import { buildTools } from "../src/tools/tools.js";
import type { Fault } from "../src/tools/types.js";

// sanity checks on the task set: does each task mean what it says?
// a task whose "shouldHappen" can't happen, or whose refusal isn't really
// against the rules, would make every score on it meaningless.

function outcomeCall(task: Task, o: Outcome): [string, Record<string, unknown>] {
  const locator = task.locator;
  switch (o.action) {
    case "change_flight":
      return ["change_flight", { locator, changes: [{ from_flight: o.from_flight, to_flight: o.to_flight }] }];
    case "assign_seat":
      return ["assign_seat", { locator, flight: o.flight, seat: o.seat }];
    case "refund":
      return ["request_refund", { locator }];
    case "waiver":
      return ["apply_waiver", { locator, reason: "airline schedule change" }];
  }
}

async function apply(world: World, task: Task, o: Outcome, faults: Fault[] = []) {
  const tools = buildTools(world, faults);
  const [name, args] = outcomeCall(task, o);
  return (await tools.find((t) => t.name === name)!.execute(args)) as { status: string };
}

// would doing this outcome right now break a fare rule?
function breaksRule(world: World, task: Task, o: Outcome): boolean {
  const booking = findBooking(world, task.locator)!;
  if (o.action === "refund") return !refundAllowed(booking);
  if (o.action === "change_flight") return !changeAllowed(booking);
  if (o.action === "waiver") return !task.waiverJustified;
  return false;
}

async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  console.log(`ok   ${name}`);
}

await check(`task count is 25-30 (have ${TASKS.length})`, () => {
  assert.ok(TASKS.length >= 25 && TASKS.length <= 30);
});

await check("ids are unique", () => {
  assert.equal(new Set(TASKS.map((t) => t.id)).size, TASKS.length);
});

await check("every type has at least 4 tasks", () => {
  for (const type of ["simple", "refuse", "impossible", "mid-failure", "quiet-failure"]) {
    const n = TASKS.filter((t) => t.type === type).length;
    assert.ok(n >= 4, `${type} has ${n}`);
  }
});

await check("each message mentions its locator, and the booking exists", () => {
  for (const task of TASKS) {
    assert.ok(task.message.includes(task.locator), task.id);
    const exists = !!findBooking(startWorld(task), task.locator);
    assert.equal(exists, task.id !== "unknown-locator", task.id);
  }
});

await check("faults only name real tools", () => {
  const toolNames = new Set(buildTools(startWorld(TASKS[0])).map((t) => t.name));
  for (const task of TASKS) {
    for (const f of task.faults ?? []) assert.ok(toolNames.has(f.tool), `${task.id}: ${f.tool}`);
  }
});

await check("shouldHappen works with no faults and breaks no rule", async () => {
  for (const task of TASKS) {
    const world = startWorld(task);
    for (const o of task.shouldHappen) {
      assert.ok(!breaksRule(world, task, o), `${task.id}: ${o.action} breaks a rule`);
      assert.equal((await apply(world, task, o)).status, "ok", `${task.id}: ${o.action}`);
    }
  }
});

await check("refuse tasks: everything asked breaks a fare rule", () => {
  for (const task of TASKS.filter((t) => t.type === "refuse")) {
    assert.equal(task.shouldHappen.length, 0, task.id);
    assert.ok(task.asked.length > 0, task.id);
    const world = startWorld(task);
    assert.ok(task.asked.every((o) => breaksRule(world, task, o)), task.id);
  }
});

await check("impossible tasks: the system rejects everything asked", async () => {
  for (const task of TASKS.filter((t) => t.type === "impossible")) {
    assert.equal(task.shouldHappen.length, 0, task.id);
    for (const o of task.asked) {
      assert.equal((await apply(startWorld(task), task, o)).status, "error", `${task.id}: ${o.action}`);
    }
  }
});

await check("failure tasks: the fault really fires on a first try", async () => {
  for (const task of TASKS.filter((t) => t.faults?.length)) {
    const world = startWorld(task);
    // shouldHappen first, since a fault can sit on a step the traveler
    // didn't ask for (the waiver in quiet-waiver-then-refund)
    const steps = task.shouldHappen.length > 0 ? task.shouldHappen : task.asked;
    // apply() builds fresh tools each time, so call counts restart. that's
    // fine here: we only want to see that a first attempt trips a fault.
    for (const o of steps) await apply(world, task, o, task.faults);
    assert.ok(world.log.some((e) => e.fault), task.id);
  }
});

await check("hand-off is only 'needed' where something can't be finished", () => {
  for (const task of TASKS.filter((t) => t.handOff === "needed")) {
    assert.ok(task.shouldHappen.length < task.asked.length, task.id);
  }
});

const counts = new Map<string, number>();
for (const t of TASKS) counts.set(t.type, (counts.get(t.type) ?? 0) + 1);
console.log(`\nall task checks passed (${[...counts].map(([k, v]) => `${k} ${v}`).join(", ")})`);
