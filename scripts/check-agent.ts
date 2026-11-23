import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BudgetReached, openRouterAgent, type Budget } from "../src/agent/openrouter.js";
import { parseReport } from "../src/agent/report.js";
import { runTask } from "../src/runner/run.js";
import { TASKS } from "../src/tasks/index.js";

// offline checks for the agent loop, the cache and the runner. a fake
// fetch stands in for openrouter, so this costs nothing.

type FakeReply = { toolCalls?: [string, Record<string, unknown>][]; content?: string } | number;

function chatBody(reply: Exclude<FakeReply, number>, n: number) {
  const toolCalls = (reply.toolCalls ?? []).map(([name, args], i) => ({
    id: `call_${n}_${i}`,
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  }));
  return {
    id: `fake-${n}`,
    object: "chat.completion",
    created: 0,
    model: "fake",
    choices: [
      {
        index: 0,
        finish_reason: toolCalls.length ? "tool_calls" : "stop",
        message: { role: "assistant", content: reply.content ?? null, tool_calls: toolCalls.length ? toolCalls : undefined },
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.001 },
  };
}

// replies in order. a number means "respond with that http status".
function fakeFetch(replies: FakeReply[]) {
  let n = 0;
  const fn = (async () => {
    const reply = replies[Math.min(n, replies.length - 1)];
    n++;
    if (typeof reply === "number") {
      return new Response(JSON.stringify({ error: { message: `fake ${reply}` } }), {
        status: reply,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(chatBody(reply, n)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fn, calls: () => n };
}

const GOOD_REPORT = JSON.stringify({
  message_to_traveler: "Your booking is refunded.",
  done: [{ action: "request_refund" }],
  not_done: [],
  handed_off: false,
});

const REFUND_REPLIES: FakeReply[] = [
  { toolCalls: [["lookup_booking", { locator: "LMR9VB" }]] },
  { toolCalls: [["request_refund", { locator: "LMR9VB" }]] },
  { content: "```json\n" + GOOD_REPORT + "\n```" },
];

const refundTask = TASKS.find((t) => t.id === "refund-flex")!;
const newBudget = (): Budget => ({ spentUsd: 0, limitUsd: 2 });
const newCacheDir = () => mkdtemp(join(tmpdir(), "claim-check-cache-"));

async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  console.log(`ok   ${name}`);
}

await check("parseReport: fences, aliases, cleanup", () => {
  const r = parseReport('Sure! ```json\n{"message_to_traveler":"hi","done":[{"action":"apply_waiver"},' +
    '{"action":"assign_seat","flight":"nwd 330","seat":"10a"}],"not_done":[],"handed_off":true}\n```');
  assert.ok(r);
  assert.deepEqual(r.done, [{ action: "waiver" }, { action: "assign_seat", flight: "NWD330", seat: "10A" }]);
  assert.equal(r.handedOff, true);
});

await check("parseReport: rejects missing fields and bad items", () => {
  assert.equal(parseReport("I refunded you!"), null);
  assert.equal(parseReport('{"done":[],"not_done":[]}'), null);
  assert.equal(parseReport('{"message_to_traveler":"x","done":["refund"],"not_done":[]}'), null);
});

const cacheDir = await newCacheDir();
let liveRun: Awaited<ReturnType<typeof runTask>>;

await check("live run: tools run, report parses, cost is counted", async () => {
  const fake = fakeFetch(REFUND_REPLIES);
  const budget = newBudget();
  const agent = openRouterAgent("fake/model", "Fake", { budget, cacheDir, fetch: fake.fn, retryDelaysMs: [] });
  liveRun = await runTask(refundTask, agent, 1);
  assert.equal(liveRun.status, "report");
  assert.equal(liveRun.newResponses, 3);
  assert.equal(liveRun.cachedResponses, 0);
  assert.ok(Math.abs(liveRun.costUsd - 0.003) < 1e-9);
  assert.ok(Math.abs(budget.spentUsd - 0.003) < 1e-9);
  assert.equal(liveRun.finalBooking?.refundStatus, "refunded");
  assert.deepEqual(liveRun.report?.done, [{ action: "refund" }]);
  assert.equal(liveRun.log.length, 2);
});

await check("offline replay gives the identical run with no api calls", async () => {
  const agent = openRouterAgent("fake/model", "Fake", { budget: newBudget(), cacheDir, offline: true });
  const replay = await runTask(refundTask, agent, 1);
  assert.equal(replay.newResponses, 0);
  assert.equal(replay.cachedResponses, 3);
  assert.equal(replay.costUsd, 0);
  assert.deepEqual(replay.report, liveRun.report);
  assert.deepEqual(replay.log, liveRun.log);
  assert.deepEqual(replay.finalBooking, liveRun.finalBooking);
});

await check("a different repeat is a different cache entry", async () => {
  const agent = openRouterAgent("fake/model", "Fake", { budget: newBudget(), cacheDir, offline: true });
  assert.equal((await runTask(refundTask, agent, 2)).status, "cache_miss");
});

await check("chatter around the report gets one second chance", async () => {
  const fake = fakeFetch([{ content: "All done, you're refunded!" }, { content: GOOD_REPORT }]);
  const agent = openRouterAgent("fake/model", "Fake", {
    budget: newBudget(), cacheDir: await newCacheDir(), fetch: fake.fn, retryDelaysMs: [],
  });
  const run = await runTask(refundTask, agent, 1);
  assert.equal(run.status, "report");
  assert.equal(fake.calls(), 2);
});

await check("two unparseable reports in a row is bad_report", async () => {
  const fake = fakeFetch([{ content: "All done!" }, { content: "Yes, all done!" }]);
  const agent = openRouterAgent("fake/model", "Fake", {
    budget: newBudget(), cacheDir: await newCacheDir(), fetch: fake.fn, retryDelaysMs: [],
  });
  const run = await runTask(refundTask, agent, 1);
  assert.equal(run.status, "bad_report");
  assert.equal(run.raw, "Yes, all done!");
});

await check("5xx is retried, then provider_error, and nothing is cached", async () => {
  const dir = await newCacheDir();
  const fake = fakeFetch([503]);
  const agent = openRouterAgent("fake/model", "Fake", { budget: newBudget(), cacheDir: dir, fetch: fake.fn, retryDelaysMs: [0, 0] });
  const run = await runTask(refundTask, agent, 1);
  assert.equal(run.status, "provider_error");
  assert.equal(fake.calls(), 3);
  assert.equal((await readdir(dir)).length, 0);
});

await check("a 429 that clears on retry is a normal run", async () => {
  const fake = fakeFetch([429, ...REFUND_REPLIES]);
  const agent = openRouterAgent("fake/model", "Fake", {
    budget: newBudget(), cacheDir: await newCacheDir(), fetch: fake.fn, retryDelaysMs: [0, 0],
  });
  assert.equal((await runTask(refundTask, agent, 1)).status, "report");
});

await check("a model that never stops calling tools hits the turn limit", async () => {
  const fake = fakeFetch([{ toolCalls: [["lookup_booking", { locator: "LMR9VB" }]] }]);
  const agent = openRouterAgent("fake/model", "Fake", {
    budget: newBudget(), cacheDir: await newCacheDir(), fetch: fake.fn, retryDelaysMs: [],
  });
  assert.equal((await runTask(refundTask, agent, 1)).status, "turn_limit");
});

await check("made-up tool names are logged as errors", async () => {
  const fake = fakeFetch([{ toolCalls: [["cancel_everything", { locator: "LMR9VB" }]] }, { content: GOOD_REPORT }]);
  const agent = openRouterAgent("fake/model", "Fake", {
    budget: newBudget(), cacheDir: await newCacheDir(), fetch: fake.fn, retryDelaysMs: [],
  });
  const run = await runTask(refundTask, agent, 1);
  assert.equal(run.log[0].tool, "cancel_everything");
  assert.equal((run.log[0].output as any).status, "error");
});

await check("budget cap stops new calls", async () => {
  const fake = fakeFetch(REFUND_REPLIES);
  const agent = openRouterAgent("fake/model", "Fake", {
    budget: { spentUsd: 2, limitUsd: 2 }, cacheDir: await newCacheDir(), fetch: fake.fn, retryDelaysMs: [],
  });
  await assert.rejects(runTask(refundTask, agent, 1), BudgetReached);
  assert.equal(fake.calls(), 0);
});

console.log("\nall agent checks passed");
