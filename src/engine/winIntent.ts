import type { CardT, PlayT, Rank, Seat, Suit, TrumpConfig } from "./types";
import { remainingHonorsInSuit } from "./training";
import { trickLeadSuit } from "./rules";
import type { VoidGrid } from "./state";
import { remainingOpponentSeats, remainingPlayersVoidInSuit } from "./voids";

export function remainingHigherRanksInSuit(
  card: CardT,
  suit: Suit,
  trickHistory: PlayT[][],
  trick: PlayT[],
  hand: CardT[]
): Rank[] {
  const played = new Set<Rank>();
  for (const t of trickHistory) {
    for (const play of t) {
      if (play.card.suit === suit) played.add(play.card.rank);
    }
  }
  for (const play of trick) {
    if (play.card.suit === suit) played.add(play.card.rank);
  }
  for (const c of hand) {
    if (c.suit === suit) played.add(c.rank);
  }
  const ranks: Rank[] = [];
  for (let r = card.rank + 1; r <= 14; r += 1) {
    if (!played.has(r as Rank)) ranks.push(r as Rank);
  }
  return ranks;
}

export function evaluateWinIntent(args: {
  card: CardT;
  trickHistory: PlayT[][];
  trick: PlayT[];
  hand: CardT[];
  trump: TrumpConfig;
  winIntentWarnTrump: boolean;
  winIntentWarnHonorsOnly: boolean;
  actualVoid: VoidGrid;
}): { warning: string | null; higherRanks: Rank[]; trumpThreats: Seat[] } {
  const {
    card,
    trickHistory,
    trick,
    hand,
    trump,
    winIntentWarnTrump,
    winIntentWarnHonorsOnly,
    actualVoid,
  } = args;
  const leadSuit = trickLeadSuit(trick) ?? card.suit;
  const handSuitRanks = new Set(hand.filter((c) => c.suit === leadSuit).map((c) => c.rank));
  const honors = remainingHonorsInSuit(trickHistory, trick, leadSuit).filter(
    (r) => r > card.rank && !handSuitRanks.has(r)
  );
  const higherRanks = winIntentWarnHonorsOnly
    ? honors
    : remainingHigherRanksInSuit(card, leadSuit, trickHistory, trick, hand);
  const honorWarning = higherRanks.length > 0;
  let trumpWarning = false;
  const trumpThreats: Seat[] = [];
  if (
    winIntentWarnTrump &&
    trump.enabled &&
    leadSuit !== trump.suit &&
    !remainingPlayersVoidInSuit(leadSuit, "Me", trick, actualVoid, true)
  ) {
    const remaining = remainingOpponentSeats(trick);
    trumpWarning = remaining.some((seat) => actualVoid[seat][leadSuit] && !actualVoid[seat][trump.suit]);
    for (const seat of remaining) {
      if (actualVoid[seat][leadSuit] && !actualVoid[seat][trump.suit]) {
        trumpThreats.push(seat as Seat);
      }
    }
  }
  if (honorWarning && trumpWarning) {
    return { warning: "This card can be beaten by a higher card or trump", higherRanks, trumpThreats };
  }
  if (honorWarning) {
    return { warning: "This card can be beaten by a higher card", higherRanks, trumpThreats };
  }
  if (trumpWarning) {
    return { warning: "This card can be trumped", higherRanks, trumpThreats };
  }
  return { warning: null, higherRanks, trumpThreats };
}
