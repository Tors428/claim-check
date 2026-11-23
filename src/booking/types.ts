// shapes for the fake Northwind Air booking system.

export type FareClass = "basic" | "main" | "flex";

export type FareRule = {
  refundable: boolean;
  // null means this fare can't be changed at all
  changeFee: number | null;
  // whether an agent-applied waiver can override the two rules above
  waiverCanOverride: boolean;
};

export type Flight = {
  flightNumber: string;
  from: string;
  to: string;
  date: string;    // YYYY-MM-DD
  departs: string; // HH:MM local
  // empty list = sold out
  openSeats: string[];
};

export type Segment = {
  flightNumber: string;
  date: string;
  from: string;
  to: string;
  seat: string | null;
};

export type RefundStatus = "none" | "requested" | "refunded";

export type Booking = {
  locator: string;
  travelerName: string;
  segments: Segment[];
  fareClass: FareClass;
  paidAmount: number;
  refundStatus: RefundStatus;
  waiverApplied: boolean;
  // running total of change fees, so the checker can tell if a fee was skipped
  feesCharged: number;
  // airline-side notes the agent sees on lookup, e.g. a schedule change.
  // this is how an agent can tell a real waiver reason from a made-up one.
  notes?: string[];
};

// one tool call. the agent never writes these — recordCall does.
export type LogEntry = {
  step: number;
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  // null for calls that aren't about one booking (search_flights)
  locator: string | null;
  // copies of the booking around the call. null if the locator didn't match anything.
  before: Booking | null;
  after: Booking | null;
  // set when a fault was injected on this call. for the viewer only —
  // the checker goes by before/after, never by this.
  fault?: "timeout" | "quiet" | "partial";
};

export type World = {
  bookings: Booking[];
  flights: Flight[];
  log: LogEntry[];
};
