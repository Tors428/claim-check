import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { findBooking, recordCall } from "../booking/world.js";
import type { Booking, LogEntry } from "../booking/types.js";
import { startWorld } from "../tasks/index.js";
import type { Task } from "../tasks/types.js";
import { buildTools } from "../tools/tools.js";
import type { Agent, AgentRun } from "../agent/types.js";

export const RUNS_DIR = join("results", "runs");

// one agent on one task, one repeat. everything the checker and the
// viewer need lives in here, so neither has to rerun anything.
export type RunRecord = AgentRun & {
  taskId: string;
  taskType: string;
  agentId: string;
  agentLabel: string;
  repeat: number;
  log: LogEntry[];
  startBooking: Booking | null;
  finalBooking: Booking | null;
};

export async function runTask(task: Task, agent: Agent, repeat: number): Promise<RunRecord> {
  const world = startWorld(task);
  const startBooking = structuredClone(findBooking(world, task.locator) ?? null);
  const tools = buildTools(world, task.faults);

  // the agent only ever touches the world through this
  const callTool = async (name: string, args: Record<string, unknown>) => {
    const tool = tools.find((t) => t.name === name);
    if (tool) return tool.execute(args);
    // made-up tool name. still logged so the viewer shows it.
    return recordCall(world, name, args, () => ({ status: "error", message: `unknown tool: ${name}` }));
  };

  const result = await agent.run({ message: task.message, tools, callTool, repeat, task });

  return {
    ...result,
    taskId: task.id,
    taskType: task.type,
    agentId: agent.id,
    agentLabel: agent.label,
    repeat,
    log: world.log,
    startBooking,
    finalBooking: structuredClone(findBooking(world, task.locator) ?? null),
  };
}

export function runPath(record: { agentId: string; taskId: string; repeat: number }): string {
  // slashes and colons in model ids break paths
  const safeAgent = record.agentId.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return join(RUNS_DIR, safeAgent, `${record.taskId}__r${record.repeat}.json`);
}

export async function saveRun(record: RunRecord) {
  const path = runPath(record);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(record, null, 2), "utf-8");
}
