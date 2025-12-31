import { OPPONENTS, SEATS, type Opp, type Seat, type Suit } from "./types";
import type { PlayT } from "./types";
import type { VoidGrid } from "./state";

function remainingSeats(currentSeat: Seat, trick: PlayT[]): Seat[] {
  const playedSeats = new Set(trick.map((t) => t.seat));
  return SEATS.filter((s) => s !== currentSeat && !playedSeats.has(s));
}

export function remainingPlayersVoidInSuit(
  suit: Suit,
  currentSeat: Seat,
  trick: PlayT[],
  actualVoid: VoidGrid,
  includeMe: boolean
): boolean {
  const remaining = remainingSeats(currentSeat, trick);
  if (!remaining.length) return true;
  for (const seat of remaining) {
    if (!includeMe && seat === "Me") return false;
    if (seat === "Me") continue;
    if (!actualVoid[seat][suit]) return false;
  }
  return true;
}

export function anyRemainingVoidInSuit(
  suit: Suit,
  currentSeat: Seat,
  trick: PlayT[],
  actualVoid: VoidGrid,
  includeMe: boolean
): boolean {
  const remaining = remainingSeats(currentSeat, trick);
  for (const seat of remaining) {
    if (seat === "Me") {
      if (!includeMe) continue;
      return true;
    }
    if (actualVoid[seat][suit]) return true;
  }
  return false;
}

export function remainingOpponentSeats(trick: PlayT[]): Opp[] {
  const playedSeats = new Set(trick.map((t) => t.seat));
  return OPPONENTS.filter((seat) => !playedSeats.has(seat));
}
