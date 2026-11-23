import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { DEFAULT_CACHE_DIR, totalSpent } from "../src/agent/cache.js";
import { liarAgent, oracleAgent, refuserAgent, trusterAgent } from "../src/agent/controls.js";
import { MODELS } from "../src/agent/models.js";
import { openRouterAgent } from "../src/agent/openrouter.js";
import { checkRun, type Verdict } from "../src/checker/check.js";
import {
  METRIC_HEADERS,
  frac,
  groupBy,
  markdownTable,
  metricCells,
  statsFor,
} from "../src/results/summarize.js";
import { runPath, runTask, type RunRecord } from "../src/runner/run.js";
import { TASKS } from "../src/tasks/index.js";

// npm run results
// rebuilds every number from the response cache. no api calls, no key needed.
// writes results/summary.md, the viewer's data files, and the generated
// block in README.md. nothing in the README's numbers is typed by hand.

const REPEATS = 3;
const TASK_TYPES = ["simple", "refuse", "impossible", "mid-failure", "quiet-failure"];

async function readSaved(record: RunRecord): Promise<RunRecord | null> {
  try {
    return JSON.parse(await readFile(runPath(record), "utf-8"));
  } catch {
    return null;
  }
}

// 1. replay every model run from the cache
const runs: RunRecord[] = [];
let missing = 0;
for (const m of MODELS) {
  const agent = openRouterAgent(m.id, m.label, { budget: { spentUsd: 0, limitUsd: 0 }, offline: true });
  for (const task of TASKS) {
    for (let repeat = 1; repeat <= REPEATS; repeat++) {
      let record = await runTask(task, agent, repeat);
      if (record.status === "cache_miss") {
        // provider errors are never cached, so the saved run file is the only
        // record of them. anything else missing means the run never happened.
        const saved = await readSaved(record);
        if (saved?.status === "provider_error") record = saved;
        else missing++;
      }
      runs.push(record);
    }
  }
}

// 2. the scripted controls. free and deterministic, so just run them.
const controlRuns: RunRecord[] = [];
for (const agent of [liarAgent(), oracleAgent(), refuserAgent(), trusterAgent()]) {
  for (const task of TASKS) controlRuns.push(await runTask(task, agent, 1));
}

const taskById = new Map(TASKS.map((t) => [t.id, t]));
const check = (r: RunRecord) => checkRun(taskById.get(r.taskId)!, r);
const verdicts = runs.map(check);
const controlVerdicts = controlRuns.map(check);

// 3. tables
const byModel = groupBy(verdicts, (v) => v.agentLabel);
const byType = groupBy(verdicts, (v) => v.taskType);
const byControl = groupBy(controlVerdicts, (v) => v.agentLabel);
const all = statsFor(verdicts);

const modelTable = markdownTable(
  ["model", ...METRIC_HEADERS],
  MODELS.map((m) => [m.label, ...metricCells(statsFor(byModel.get(m.label) ?? []))])
);
const typeTable = markdownTable(
  ["task type", ...METRIC_HEADERS],
  TASK_TYPES.map((t) => [t, ...metricCells(statsFor(byType.get(t) ?? []))])
);
const overclaimMatrix = markdownTable(
  ["model", ...TASK_TYPES],
  MODELS.map((m) => [
    m.label,
    ...TASK_TYPES.map((t) => {
      const s = statsFor((byModel.get(m.label) ?? []).filter((v) => v.taskType === t));
      return frac(s.overclaim, s.withReport);
    }),
  ])
);
const ruleBreakMatrix = markdownTable(
  ["model", ...TASK_TYPES],
  MODELS.map((m) => [
    m.label,
    ...TASK_TYPES.map((t) => {
      const s = statsFor((byModel.get(m.label) ?? []).filter((v) => v.taskType === t));
      return frac(s.ruleBreak, s.scored);
    }),
  ])
);
const controlTable = markdownTable(
  ["control", ...METRIC_HEADERS],
  [...byControl].map(([label, vs]) => [label, ...metricCells(statsFor(vs))])
);

const spent = await totalSpent(DEFAULT_CACHE_DIR);
const quiet = statsFor(byType.get("quiet-failure") ?? []);
const refuse = statsFor(byType.get("refuse") ?? []);
const needed = statsFor(verdicts.filter((v) => taskById.get(v.taskId)!.handOff === "needed"));

// the task type with the highest overclaim rate, against everything else
const typeRates = TASK_TYPES.map((t) => ({ t, s: statsFor(byType.get(t) ?? []) }));
const worst = typeRates.reduce((a, b) =>
  b.s.overclaim / Math.max(1, b.s.withReport) > a.s.overclaim / Math.max(1, a.s.withReport) ? b : a
);
const rest = statsFor(verdicts.filter((v) => v.taskType !== worst.t));
const mainFinding = `**Main finding:** overclaiming was concentrated in **${worst.t}** tasks: ${frac(worst.s.overclaim, worst.s.withReport)} runs with a report, against ${frac(rest.overclaim, rest.withReport)} on every other task type combined.`;

const findings = [
  mainFinding,
  "",
  `- **Overclaim:** in ${frac(all.overclaim, all.withReport)} runs with a report, the agent said something was done that the booking didn't show.`,
  `- **Quiet failures:** on tasks where a tool said \`ok\` but nothing changed, the agent overclaimed in ${frac(quiet.overclaim, quiet.withReport)} runs.`,
  `- **Rule breaks:** ${frac(all.ruleBreak, all.scored)} scored runs did something the fare rules didn't allow. On requests that should have been refused: ${frac(refuse.ruleBreak, refuse.scored)}.`,
  `- **Underclaim:** in ${frac(all.underclaim, all.withReport)} runs with a report, the agent said something failed that actually went through.`,
  `- **Hand-offs:** on tasks that couldn't be finished without a person, the agent handed off in ${frac(needed.goodHandOff, needed.unfinished)} runs.`,
].join("\n");

const generated = `_Generated by \`npm run results\` from ${all.runs} model runs (${MODELS.length} models x ${TASKS.length} tasks x ${REPEATS} repeats). ${all.excluded} excluded for provider errors${missing ? `, ${missing} missing from the cache` : ""}. API spend: $${spent.toFixed(2)}._

${findings}

**By model**

${modelTable}

**By task type** (all models together)

${typeTable}

**Overclaim rate, model by task type**

${overclaimMatrix}

**Rule-break rate, model by task type**

${ruleBreakMatrix}

**Scripted controls** (sanity check for the checker)

${controlTable}

Overclaim, underclaim: out of runs with a valid report. Rule break, finished: out of scored runs. Hand-off: out of runs that weren't finished, or that needed a person by design.`;

console.log(generated);
if (missing) console.log(`\nwarning: ${missing} runs were never cached. run \`npm run agents\` to fill them in.`);

// 4. files
await mkdir("results", { recursive: true });
await writeFile("results/summary.md", `# Claim Check results\n\n${generated}\n`, "utf-8");

await mkdir("viewer/data", { recursive: true });
const viewerRun = (r: RunRecord, v: Verdict) => {
  const task = taskById.get(r.taskId)!;
  return {
    id: `${r.agentId}__${r.taskId}__r${r.repeat}`,
    agentId: r.agentId,
    agentLabel: r.agentLabel,
    taskId: r.taskId,
    taskType: r.taskType,
    repeat: r.repeat,
    status: r.status,
    error: r.error,
    message: task.message,
    asked: task.asked,
    shouldHappen: task.shouldHappen,
    log: r.log,
    report: r.report,
    raw: r.report ? undefined : r.raw,
    startBooking: r.startBooking,
    finalBooking: r.finalBooking,
    verdict: v,
  };
};
await writeFile(
  "viewer/data/runs.json",
  JSON.stringify([
    ...runs.map((r, i) => viewerRun(r, verdicts[i])),
    ...controlRuns.map((r, i) => viewerRun(r, controlVerdicts[i])),
  ]),
  "utf-8"
);
await writeFile("viewer/data/summary.md", generated, "utf-8");

// the viewer's passcode screen compares against a hash, so the code itself
// isn't sitting in the page. not real security, the data is fake anyway.
const passcode = process.env.VIEWER_PASSCODE;
if (passcode) {
  const sha256 = createHash("sha256").update(passcode).digest("hex");
  await writeFile("viewer/data/passcode.json", JSON.stringify({ sha256 }), "utf-8");
} else {
  console.log("\nTODO: set VIEWER_PASSCODE in .env, then rerun, or the viewer stays locked.");
}

// swap the generated block in the README, if the markers are there
try {
  const readme = await readFile("README.md", "utf-8");
  const start = "<!-- results:start -->";
  const end = "<!-- results:end -->";
  const i = readme.indexOf(start);
  const j = readme.indexOf(end);
  if (i !== -1 && j > i) {
    await writeFile("README.md", `${readme.slice(0, i + start.length)}\n${generated}\n${readme.slice(j)}`, "utf-8");
    console.log("\nupdated the results block in README.md");
  }
} catch {
  // no README yet
}
