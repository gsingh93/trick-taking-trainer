import type { CardT, Suit, TrumpConfig } from "../types";

const HCP: Record<number, number> = { 14: 4, 13: 3, 12: 2, 11: 1 };

export function estimateBid(hand: CardT[], trump: TrumpConfig): number {
  let points = 0;
  const suitCounts: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };

  for (const card of hand) {
    points += HCP[card.rank] ?? 0;
    suitCounts[card.suit] += 1;
  }

  for (const suit of Object.keys(suitCounts) as Suit[]) {
    const count = suitCounts[suit];
    if (count >= 5) points += 0.5;
    if (count >= 6) points += 0.5;
    if (count >= 7) points += 0.5;
  }

  if (trump.enabled) {
    const trumpCount = suitCounts[trump.suit];
    if (trumpCount >= 5) points += 0.5;
    if (trumpCount >= 6) points += 0.5;
  }

  const bid = Math.round(points / 3);
  return Math.max(0, Math.min(13, bid));
}
