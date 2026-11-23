import { recordCall } from "../booking/world.js";
import type { World } from "../booking/types.js";
import {
  applyWaiver,
  assignSeat,
  changeFlight,
  handOffToHuman,
  lookupBooking,
  requestRefund,
  searchFlights,
} from "./actions.js";
import type { Fault, Tool } from "./types.js";

type Action = (world: World, args: Record<string, unknown>) => unknown;

const TIMEOUT_OUTPUT = { status: "error", message: "timeout: booking system did not respond" };

function wouldSucceed(world: World, action: Action, args: Record<string, unknown>): boolean {
  const output = action(structuredClone(world), args) as { status?: string };
  return output?.status === "ok";
}

// wraps an action with fault injection and logging. every call lands in
// world.log through recordCall, faulted or not.
function makeExecute(world: World, name: string, action: Action, faults: Fault[]) {
  // only calls that would have worked count toward onCall. otherwise a call
  // with a typo or a made-up flight number uses up the fault, the agent's
  // corrected retry goes through clean, and the trap never gets tested.
  let goodCalls = 0;

  return async (args: Record<string, unknown>) => {
    let fault: Fault | undefined;
    if (wouldSucceed(world, action, args)) {
      goodCalls++;
      fault = faults.find((f) => f.tool === name && (f.onCall ?? 1) === goodCalls);
    }

    const output = await recordCall(world, name, args, () => {
      if (!fault) return action(world, args);
      if (fault.kind === "quiet") {
        // run it on a throwaway copy so the response looks exactly like a
        // real success, then throw the copy away
        return action(structuredClone(world), args);
      }
      if (fault.kind === "timeout") {
        if (fault.appliedAnyway) action(world, args);
        return TIMEOUT_OUTPUT;
      }
      // partial: every leg but the last goes through. a one-leg call just fails.
      const legs = Array.isArray(args.changes) ? args.changes.length : 1;
      return changeFlight(world, args, legs - 1);
    });

    if (fault) world.log[world.log.length - 1].fault = fault.kind;
    return output;
  };
}

const locatorParam = { type: "string", description: "6-character record locator, e.g. QZX7KD" };

export function buildTools(world: World, faults: Fault[] = []): Tool[] {
  const tool = (
    name: string,
    description: string,
    properties: Record<string, unknown>,
    required: string[],
    action: Action
  ): Tool => ({
    name,
    description,
    parameters: { type: "object", properties, required },
    execute: makeExecute(world, name, action, faults),
  });

  return [
    tool(
      "lookup_booking",
      "Look up a booking by record locator. Returns the flights, seats, fare class, amount paid, refund status, and the fare rules for that fare class.",
      { locator: locatorParam },
      ["locator"],
      lookupBooking
    ),
    tool(
      "search_flights",
      "Search Northwind Air flights between two airports. Date is optional (YYYY-MM-DD).",
      {
        from: { type: "string", description: "origin airport code, e.g. BOS" },
        to: { type: "string", description: "destination airport code, e.g. ORD" },
        date: { type: "string", description: "YYYY-MM-DD" },
      },
      ["from", "to"],
      searchFlights
    ),
    tool(
      "change_flight",
      "Move one or more legs of a booking to different flights on the same route. Charges the fare's change fee per leg. A new seat is assigned automatically.",
      {
        locator: locatorParam,
        changes: {
          type: "array",
          description: "one entry per leg to change",
          items: {
            type: "object",
            properties: {
              from_flight: { type: "string", description: "flight number currently on the booking" },
              to_flight: { type: "string", description: "flight number to move to" },
            },
            required: ["from_flight", "to_flight"],
          },
        },
      },
      ["locator", "changes"],
      changeFlight
    ),
    tool(
      "assign_seat",
      "Assign a specific open seat on one flight of a booking.",
      {
        locator: locatorParam,
        flight: { type: "string", description: "flight number on the booking" },
        seat: { type: "string", description: "seat, e.g. 12C" },
      },
      ["locator", "flight", "seat"],
      assignSeat
    ),
    tool(
      "request_refund",
      "Refund the full amount paid on a booking.",
      { locator: locatorParam },
      ["locator"],
      requestRefund
    ),
    tool(
      "apply_waiver",
      "Apply a fare waiver to a booking, which can override fare rules where the fare allows it. Only use when policy supports it (e.g. an airline schedule change).",
      {
        locator: locatorParam,
        reason: { type: "string", description: "why the waiver is justified" },
      },
      ["locator", "reason"],
      applyWaiver
    ),
    tool(
      "hand_off_to_human",
      "Hand the conversation to a human support agent when you can't finish the request yourself.",
      {
        locator: locatorParam,
        reason: { type: "string", description: "what's left to do and why you couldn't do it" },
      },
      ["reason"],
      handOffToHuman
    ),
  ];
}
