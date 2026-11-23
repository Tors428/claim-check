import "dotenv/config";
import { DEFAULT_CACHE_DIR, totalSpent } from "../src/agent/cache.js";
import { MODELS } from "../src/agent/models.js";
import { BudgetReached, openRouterAgent, type Budget } from "../src/agent/openrouter.js";
import type { AgentRun } from "../src/agent/types.js";
import { runTask, saveRun } from "../src/runner/run.js";
import { TASKS } from "../src/tasks/index.js";

// usage:
//   npm run agents                         all models, all tasks, 3 repeats
//   npm run agents -- --offline            rebuild every run from the cache, no api calls
//   npm run agents -- --models qwen/qwen3.7-flash --tasks refund-basic --repeats 1

const BUDGET_USD = 2;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const offline = process.argv.includes("--offline");
const repeats = Number(arg("repeats") ?? 3);
const modelIds = arg("models")?.split(",");
const taskIds = arg("tasks")?.split(",");

const models = modelIds ? MODELS.filter((m) => modelIds.includes(m.id)) : MODELS;
const tasks = taskIds ? TASKS.filter((t) => taskIds.includes(t.id)) : TASKS;
if (models.length === 0 || tasks.length === 0) {
  console.error("no matching models or tasks");
  process.exit(1);
}

const spentBefore = await totalSpent(DEFAULT_CACHE_DIR);
const budget: Budget = { spentUsd: spentBefore, limitUsd: BUDGET_USD };
console.log(
  `${models.length} models x ${tasks.length} tasks x ${repeats} repeats` +
    `${offline ? " (offline)" : ""}. spent so far: $${spentBefore.toFixed(4)} of $${BUDGET_USD}\n`
);

const statusCounts = new Map<string, Map<AgentRun["status"], number>>();

// models run side by side, each one works through its runs in order
await Promise.all(
  models.map(async (m) => {
    const agent = openRouterAgent(m.id, m.label, { budget, offline });
    const counts = new Map<AgentRun["status"], number>();
    statusCounts.set(m.label, counts);

    try {
      for (const task of tasks) {
        for (let repeat = 1; repeat <= repeats; repeat++) {
          const record = await runTask(task, agent, repeat);
          // a cache miss offline means we never ran it. don't overwrite a good file.
          if (record.status !== "cache_miss") await saveRun(record);
          counts.set(record.status, (counts.get(record.status) ?? 0) + 1);
          console.log(
            `[${m.label}] ${task.id} r${repeat}  ${record.status}` +
              `  +$${record.costUsd.toFixed(4)}  total $${budget.spentUsd.toFixed(4)}` +
              (record.error ? `  (${record.error.slice(0, 80)})` : "")
          );
        }
      }
    } catch (err) {
      if (!(err instanceof BudgetReached)) throw err;
      console.log(`[${m.label}] stopped: ${err.message}`);
    }
  })
);

console.log("\nstatus by model:");
for (const [label, counts] of statusCounts) {
  console.log(`  ${label}: ${[...counts].map(([s, n]) => `${s} ${n}`).join(", ")}`);
}
console.log(
  `\nnew spend this run: $${(budget.spentUsd - spentBefore).toFixed(4)}. ` +
    `total: $${budget.spentUsd.toFixed(4)} of $${BUDGET_USD}`
);
