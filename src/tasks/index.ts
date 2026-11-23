import { createWorld } from "../booking/world.js";
import type { World } from "../booking/types.js";
import { IMPOSSIBLE_TASKS } from "./impossible.js";
import { MID_FAILURE_TASKS } from "./mid-failure.js";
import { QUIET_FAILURE_TASKS } from "./quiet-failure.js";
import { REFUSE_TASKS } from "./refuse.js";
import { SIMPLE_TASKS } from "./simple.js";
import type { Task } from "./types.js";

export const TASKS: Task[] = [
  ...SIMPLE_TASKS,
  ...REFUSE_TASKS,
  ...IMPOSSIBLE_TASKS,
  ...MID_FAILURE_TASKS,
  ...QUIET_FAILURE_TASKS,
];

export function startWorld(task: Task): World {
  const world = createWorld();
  task.setup?.(world);
  return world;
}
