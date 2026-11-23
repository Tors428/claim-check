import type { Flight } from "./types.js";

// first n seats from rows 10+. booked travelers sit in rows 20+ (see
// seed-bookings.ts), so a booked seat never shows up as open.
function openSeats(n: number): string[] {
  const seats: string[] = [];
  for (let row = 10; seats.length < n; row++) {
    for (const letter of ["A", "B", "C", "D", "E", "F"]) {
      if (seats.length < n) seats.push(`${row}${letter}`);
    }
  }
  return seats;
}

// all made up. "NWD" is just the prefix for the fake airline.
export const FLIGHTS: Flight[] = [
  { flightNumber: "NWD210", from: "BOS", to: "ORD", date: "2027-03-14", departs: "07:10", openSeats: openSeats(6) },
  { flightNumber: "NWD212", from: "BOS", to: "ORD", date: "2027-03-14", departs: "12:40", openSeats: [] },
  { flightNumber: "NWD214", from: "BOS", to: "ORD", date: "2027-03-14", departs: "18:05", openSeats: openSeats(3) },

  { flightNumber: "NWD211", from: "ORD", to: "BOS", date: "2027-03-18", departs: "08:00", openSeats: openSeats(5) },
  { flightNumber: "NWD213", from: "ORD", to: "BOS", date: "2027-03-18", departs: "15:30", openSeats: [] },
  { flightNumber: "NWD215", from: "ORD", to: "BOS", date: "2027-03-18", departs: "20:15", openSeats: openSeats(2) },

  { flightNumber: "NWD330", from: "BOS", to: "DEN", date: "2027-04-02", departs: "09:00", openSeats: openSeats(4) },
  { flightNumber: "NWD332", from: "BOS", to: "DEN", date: "2027-04-02", departs: "16:20", openSeats: [] },

  { flightNumber: "NWD331", from: "DEN", to: "BOS", date: "2027-04-09", departs: "10:45", openSeats: openSeats(3) },
  { flightNumber: "NWD333", from: "DEN", to: "BOS", date: "2027-04-09", departs: "19:00", openSeats: openSeats(5) },

  { flightNumber: "NWD450", from: "SEA", to: "DEN", date: "2027-03-21", departs: "06:30", openSeats: openSeats(6) },
  { flightNumber: "NWD452", from: "SEA", to: "DEN", date: "2027-03-21", departs: "13:10", openSeats: openSeats(1) },

  { flightNumber: "NWD451", from: "DEN", to: "SEA", date: "2027-03-25", departs: "11:00", openSeats: [] },
  { flightNumber: "NWD453", from: "DEN", to: "SEA", date: "2027-03-25", departs: "17:45", openSeats: openSeats(4) },
];
