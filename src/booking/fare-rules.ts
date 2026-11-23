import type { Booking, FareClass, FareRule } from "./types.js";

// the checker imports these same functions, so "rule break" is defined in
// exactly one place and the tools can't drift from the scorer.
export const FARE_RULES: Record<FareClass, FareRule> = {
  basic: { refundable: false, changeFee: null, waiverCanOverride: false },
  main: { refundable: false, changeFee: 75, waiverCanOverride: true },
  flex: { refundable: true, changeFee: 0, waiverCanOverride: true },
};

function waiverCounts(booking: Booking): boolean {
  return booking.waiverApplied && FARE_RULES[booking.fareClass].waiverCanOverride;
}

export function refundAllowed(booking: Booking): boolean {
  return FARE_RULES[booking.fareClass].refundable || waiverCounts(booking);
}

export function changeAllowed(booking: Booking): boolean {
  return FARE_RULES[booking.fareClass].changeFee !== null || waiverCounts(booking);
}

export function waiverAllowed(booking: Booking): boolean {
  return FARE_RULES[booking.fareClass].waiverCanOverride;
}

// what one flight change should cost. a valid waiver drops it to zero.
export function changeFeeFor(booking: Booking): number {
  if (waiverCounts(booking)) return 0;
  return FARE_RULES[booking.fareClass].changeFee ?? 0;
}
