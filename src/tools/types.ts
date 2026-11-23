// same shape as the Tool type in honesty gap, so the openai-compatible
// agent loop can be reused as-is in step 4.
export type Tool = {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
};

// a failure a task can inject into one call of one tool.
// onCall is which call to that tool breaks (default 1, the first), counting
// only calls that would otherwise have worked. it only fires once, so a
// retry goes through normally.
export type Fault =
  // the system says it timed out. appliedAnyway = the change still went
  // through, which is the underclaim trap.
  | { tool: string; kind: "timeout"; appliedAnyway: boolean; onCall?: number }
  // the system says ok with the normal-looking response, but nothing changed
  | { tool: string; kind: "quiet"; onCall?: number }
  // change_flight only: every leg but the last goes through, the last fails
  | { tool: "change_flight"; kind: "partial"; onCall?: number };
