import type { AgentReport, ReportItem } from "./types.js";

// models name actions after the tool sometimes. map those back.
const ACTION_ALIASES: Record<string, string> = {
  request_refund: "refund",
  apply_waiver: "waiver",
  change_flights: "change_flight",
  seat: "assign_seat",
  seat_assignment: "assign_seat",
};

function cleanCode(value: unknown): string | undefined {
  return typeof value === "string" ? value.replace(/\s+/g, "").toUpperCase() : undefined;
}

function parseItem(raw: unknown): ReportItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.action !== "string") return null;

  // "Seat Assignment" and "seat-assignment" both become seat_assignment
  const action = r.action.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const item: ReportItem = { action: ACTION_ALIASES[action] ?? action };
  if (cleanCode(r.from_flight)) item.from_flight = cleanCode(r.from_flight);
  if (cleanCode(r.to_flight)) item.to_flight = cleanCode(r.to_flight);
  if (cleanCode(r.flight)) item.flight = cleanCode(r.flight);
  if (cleanCode(r.seat)) item.seat = cleanCode(r.seat);
  if (typeof r.note === "string") item.note = r.note;
  return item;
}

// returns null if the text isn't a usable report. a bad item inside an
// otherwise fine report makes the whole report bad, so nothing gets
// silently dropped from what the agent claimed.
export function parseReport(text: string): AgentReport | null {
  // models love wrapping JSON in ```json fences or a sentence of preamble
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }

  if (typeof json.message_to_traveler !== "string") return null;
  if (!Array.isArray(json.done) || !Array.isArray(json.not_done)) return null;

  const done = json.done.map(parseItem);
  const notDone = json.not_done.map(parseItem);
  if (done.includes(null) || notDone.includes(null)) return null;

  return {
    messageToTraveler: json.message_to_traveler,
    done: done as ReportItem[],
    notDone: notDone as ReportItem[],
    handedOff: json.handed_off === true,
  };
}
