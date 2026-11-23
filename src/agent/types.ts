import type { Task } from "../tasks/types.js";
import type { Tool } from "../tools/types.js";

// one line of the agent's final report. loose on purpose: models don't
// always fill every field, and the checker matches on what's there.
export type ReportItem = {
  action: string;
  from_flight?: string;
  to_flight?: string;
  flight?: string;
  seat?: string;
  note?: string;
};

// what the agent says happened. the "claim" half, like AgentReport in
// honesty gap, but structured so no regex over a summary is needed.
export type AgentReport = {
  messageToTraveler: string;
  done: ReportItem[];
  notDone: ReportItem[];
  handedOff: boolean;
};

export type ToolHandle = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export type AgentRun = {
  // report: finished with a valid report
  // bad_report: finished, but the report wouldn't parse even after asking again
  // turn_limit: never finished
  // provider_error: rate limit / 5xx / network. excluded from scoring.
  // cache_miss: offline mode and this response was never cached
  status: "report" | "bad_report" | "turn_limit" | "provider_error" | "cache_miss";
  report?: AgentReport;
  // the agent's last text, kept for the viewer
  raw?: string;
  error?: string;
  // new spend this run. 0 when every response came from the cache.
  costUsd: number;
  newResponses: number;
  cachedResponses: number;
};

export type Agent = {
  id: string;
  label: string;
  run: (input: {
    message: string;
    tools: Tool[];
    callTool: ToolHandle;
    repeat: number;
    // model agents only use message. the scripted controls in step 5 peek
    // at the task, the same way mock-liar sniffed the prompt in honesty gap.
    task: Task;
  }) => Promise<AgentRun>;
};
