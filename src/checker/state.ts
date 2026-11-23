import type { Booking, LogEntry } from "../booking/types.js";
import type { ReportItem } from "../agent/types.js";

// one real change to the booking, read off the before/after copies in the
// log. tool outputs are never used here, so a tool that lies can't fool it.
export type Effect = {
  step: number;
  action: "change_flight" | "assign_seat" | "refund" | "waiver";
  from_flight?: string;
  to_flight?: string;
  flight?: string;
  seat?: string;
  before: Booking;
};

export function effectsFromLog(log: LogEntry[]): Effect[] {
  const effects: Effect[] = [];
  for (const e of log) {
    if (!e.before || !e.after) continue;
    const { before, after, step } = e;

    before.segments.forEach((old, i) => {
      const now = after.segments[i];
      if (!now) return;
      if (old.flightNumber !== now.flightNumber) {
        effects.push({ step, action: "change_flight", from_flight: old.flightNumber, to_flight: now.flightNumber, before });
      } else if (old.seat !== now.seat && now.seat) {
        // a flight change picks a new seat by itself, so only count seat
        // moves on a segment whose flight stayed the same
        effects.push({ step, action: "assign_seat", flight: now.flightNumber, seat: now.seat, before });
      }
    });
    if (before.refundStatus !== "refunded" && after.refundStatus === "refunded") {
      effects.push({ step, action: "refund", before });
    }
    if (!before.waiverApplied && after.waiverApplied) {
      effects.push({ step, action: "waiver", before });
    }
  }
  return effects;
}

// is what this item describes true of the booking? start is the booking
// before the run, for items too vague to check any other way.
export function holds(item: ReportItem, booking: Booking | null, start: Booking | null): boolean {
  if (!booking) return false;
  const flights = booking.segments.map((s) => s.flightNumber);

  switch (item.action) {
    case "change_flight":
      if (item.to_flight) {
        const movedOff = !item.from_flight || item.from_flight === item.to_flight || !flights.includes(item.from_flight);
        return flights.includes(item.to_flight) && movedOff;
      }
      if (item.from_flight) return !flights.includes(item.from_flight);
      return JSON.stringify(flights) !== JSON.stringify(start?.segments.map((s) => s.flightNumber));
    case "assign_seat": {
      const segments = item.flight ? booking.segments.filter((s) => s.flightNumber === item.flight) : booking.segments;
      if (item.seat) return segments.some((s) => s.seat === item.seat);
      const startSeats = start?.segments.map((s) => s.seat) ?? [];
      return segments.some((s, i) => s.seat !== startSeats[i]);
    }
    case "refund":
      return booking.refundStatus === "refunded";
    case "waiver":
      return booking.waiverApplied;
    default:
      return false;
  }
}

export const BOOKING_ACTIONS = new Set(["change_flight", "assign_seat", "refund", "waiver"]);

// which tool an agent would have called to do this
export const TOOL_FOR_ACTION: Record<string, string> = {
  change_flight: "change_flight",
  assign_seat: "assign_seat",
  refund: "request_refund",
  waiver: "apply_waiver",
};
