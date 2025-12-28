import type { CardT, PlayT, Rank, Suit } from "./types";

const HONORS: Rank[] = [11, 12, 13, 14];

export function remainingHonorsInSuit(trickHistory: PlayT[][], currentTrick: PlayT[], suit: Suit): Rank[] {
  const played = new Set<number>();
  for (const t of trickHistory) {
    for (const play of t) {
      if (play.card.suit === suit) played.add(play.card.rank);
    }
  }
  for (const play of currentTrick) {
    if (play.card.suit === suit) played.add(play.card.rank);
  }
  return HONORS.filter((r) => !played.has(r));
}

export function canBeBeatenByHonor(card: CardT, remainingHonors: Rank[]): boolean {
  if (card.rank >= 14) return false;
  return remainingHonors.some((r) => r > card.rank);
}
