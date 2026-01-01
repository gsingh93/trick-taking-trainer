import type { CardT, Suit, TrumpConfig } from "../types";

// Rough high-card point model (A=4, K=3, Q=2, J=1).
const HCP: Record<number, number> = { 14: 4, 13: 3, 12: 2, 11: 1 };

export function estimateBid(hand: CardT[], trump: TrumpConfig): number {
  let points = 0;
  const suitCounts: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };

  for (const card of hand) {
    // Add HCP baseline and track suit lengths.
    points += HCP[card.rank] ?? 0;
    suitCounts[card.suit] += 1;
  }

  for (const suit of Object.keys(suitCounts) as Suit[]) {
    const count = suitCounts[suit];
    // Reward long suits: extra trick potential from length.
    if (count >= 5) points += 0.5;
    if (count >= 6) points += 0.5;
    if (count >= 7) points += 0.5;
  }

  if (trump.enabled) {
    const trumpCount = suitCounts[trump.suit];
    // Favor holding trump: length in trump usually converts to tricks.
    if (trumpCount >= 5) points += 0.5;
    if (trumpCount >= 6) points += 0.5;

    for (const suit of Object.keys(suitCounts) as Suit[]) {
      if (suit === trump.suit) continue;
      const count = suitCounts[suit];
      // Reward short side suits for trump ruffing potential.
      if (count === 0) points += 1;
      if (count === 1) points += 0.5;
      if (count === 2) points += 0.25;
    }
  }

  const shape = Object.values(suitCounts)
    .slice()
    .sort((a, b) => b - a)
    .join("-");
  // Penalize flat shapes that tend to yield fewer trick-taking chances.
  if (shape === "4-3-3-3" || shape === "4-4-3-2") {
    points -= 0.5;
  }

  // Convert points to a coarse bid estimate and clamp to hand size.
  const bid = Math.floor(points / 3);
  return Math.max(0, Math.min(13, bid));
}
