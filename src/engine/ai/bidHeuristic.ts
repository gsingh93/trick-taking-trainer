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

    for (const suit of Object.keys(suitCounts) as Suit[]) {
      if (suit === trump.suit) continue;
      const count = suitCounts[suit];
      if (count === 0) points += 1;
      if (count === 1) points += 0.5;
      if (count === 2) points += 0.25;
    }
  }

  const shape = Object.values(suitCounts)
    .slice()
    .sort((a, b) => b - a)
    .join("-");
  if (shape === "4-3-3-3" || shape === "4-4-3-2") {
    points -= 0.5;
  }

  const bid = Math.round(points / 3);
  return Math.max(0, Math.min(13, bid));
}
