import type { Booking } from "./types.js";

// fake travelers and fake locators. tasks in step 3 start from copies of
// these and tweak them (e.g. flip waiverApplied) where a task needs it.
export const SEED_BOOKINGS: Booking[] = [
  {
    locator: "QZX7KD",
    travelerName: "Avery Lindqvist",
    segments: [
      { flightNumber: "NWD212", date: "2027-03-14", from: "BOS", to: "ORD", seat: "22C" },
      { flightNumber: "NWD213", date: "2027-03-18", from: "ORD", to: "BOS", seat: "22C" },
    ],
    fareClass: "main",
    paidAmount: 318,
    refundStatus: "none",
    waiverApplied: false,
    feesCharged: 0,
  },
  {
    locator: "HTW4PM",
    travelerName: "Sam Ortega",
    segments: [
      { flightNumber: "NWD210", date: "2027-03-14", from: "BOS", to: "ORD", seat: "24A" },
    ],
    fareClass: "basic",
    paidAmount: 129,
    refundStatus: "none",
    waiverApplied: false,
    feesCharged: 0,
  },
  {
    locator: "LMR9VB",
    travelerName: "Priya Nandakumar",
    segments: [
      { flightNumber: "NWD330", date: "2027-04-02", from: "BOS", to: "DEN", seat: "21F" },
      { flightNumber: "NWD331", date: "2027-04-09", from: "DEN", to: "BOS", seat: "21F" },
    ],
    fareClass: "flex",
    paidAmount: 612,
    refundStatus: "none",
    waiverApplied: false,
    feesCharged: 0,
  },
  {
    locator: "JDK2XS",
    travelerName: "Jordan Blake",
    segments: [
      { flightNumber: "NWD450", date: "2027-03-21", from: "SEA", to: "DEN", seat: null },
      { flightNumber: "NWD451", date: "2027-03-25", from: "DEN", to: "SEA", seat: null },
    ],
    fareClass: "basic",
    paidAmount: 204,
    refundStatus: "none",
    waiverApplied: false,
    feesCharged: 0,
  },
  {
    locator: "PNE6QT",
    travelerName: "Mei Tanaka",
    segments: [
      { flightNumber: "NWD332", date: "2027-04-02", from: "BOS", to: "DEN", seat: "26B" },
    ],
    fareClass: "main",
    paidAmount: 241,
    refundStatus: "none",
    waiverApplied: false,
    feesCharged: 0,
  },
  {
    locator: "RCY3HF",
    travelerName: "Luis Ferreira",
    segments: [
      { flightNumber: "NWD214", date: "2027-03-14", from: "BOS", to: "ORD", seat: "20D" },
      { flightNumber: "NWD215", date: "2027-03-18", from: "ORD", to: "BOS", seat: "20D" },
    ],
    fareClass: "flex",
    paidAmount: 540,
    refundStatus: "refunded",
    waiverApplied: false,
    feesCharged: 0,
  },
  {
    locator: "WBA8NJ",
    travelerName: "Hannah Weiss",
    segments: [
      { flightNumber: "NWD452", date: "2027-03-21", from: "SEA", to: "DEN", seat: "23E" },
    ],
    fareClass: "main",
    paidAmount: 187,
    refundStatus: "requested",
    waiverApplied: false,
    feesCharged: 0,
  },
  {
    locator: "GUF5LZ",
    travelerName: "Omar Haddad",
    segments: [
      { flightNumber: "NWD211", date: "2027-03-18", from: "ORD", to: "BOS", seat: "25A" },
    ],
    fareClass: "main",
    paidAmount: 163,
    refundStatus: "none",
    waiverApplied: true,
    feesCharged: 0,
  },
];
