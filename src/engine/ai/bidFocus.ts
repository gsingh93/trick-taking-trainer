import { compareCardsInTrick, isTrump, trickLeadSuit } from "../rules";
import type { CardT, PlayT, Seat, Suit, TrumpConfig } from "../types";

export type BidAiContext = {
  seat: Seat;
  hand: CardT[];
  legalIds: Set<string>;
  trick: PlayT[];
  leader: Seat;
  trump: TrumpConfig;
  tricksWon: Record<Seat, number>;
  bid: number | null;
};

export function chooseCardToPlayForBid(
  ctx: BidAiContext,
  rng: () => number = Math.random
): { cardId: string } | null {
  const legalCards = ctx.hand.filter((c) => ctx.legalIds.has(c.id));
  if (legalCards.length === 0) return null;

  const bidTarget = ctx.bid ?? 0;
  const needsTricks = ctx.tricksWon[ctx.seat] < bidTarget;
  const leadSuit = trickLeadSuit(ctx.trick);

  if (leadSuit) {
    // Following a trick:
    // - If we still need tricks, attempt to win with the lowest winning card.
    //   Prefer winning off-trump to conserve trump when possible.
    // - Otherwise, dump the lowest card to avoid accidental wins.
    if (needsTricks) {
      const winning = lowestWinningCard(legalCards, ctx.trick, ctx.trump);
      if (winning) {
        const offTrumpWinning = lowestWinningCard(
          legalCards.filter((c) => !isTrump(c, ctx.trump)),
          ctx.trick,
          ctx.trump
        );
        return { cardId: (offTrumpWinning ?? winning).id };
      }
    }
    const lowest = lowestCard(legalCards, ctx.trump);
    return { cardId: lowest.id };
  }

  // Leading a trick.
  if (needsTricks) {
    // Lead the highest-scoring card based on rank, trump, and suit length.
    const suitCounts = countSuits(ctx.hand);
    const best = highestCard(legalCards, ctx.trump, suitCounts, rng);
    return { cardId: best.id };
  }
  // If we're already at/above the bid, lead low to avoid taking extras.
  const lowest = lowestCard(legalCards, ctx.trump);
  return { cardId: lowest.id };
}

function countSuits(hand: CardT[]): Record<Suit, number> {
  const counts: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const c of hand) counts[c.suit] += 1;
  return counts;
}

function lowestCard(cards: CardT[], trump: TrumpConfig): CardT {
  return cards.reduce((best, card) => {
    if (!best) return card;
    const bestScore = loseScore(best, trump);
    const cardScore = loseScore(card, trump);
    return cardScore < bestScore ? card : best;
  }, cards[0]);
}

function highestCard(
  cards: CardT[],
  trump: TrumpConfig,
  suitCounts: Record<Suit, number>,
  rng: () => number
): CardT {
  // Score cards by rank, trump weight, and suit length; break ties randomly.
  const scored = cards.map((c) => ({
    card: c,
    score: winScore(c, trump, suitCounts),
    tie: rng(),
  }));
  scored.sort((a, b) => b.score - a.score || a.tie - b.tie);
  return scored[0].card;
}

function winScore(card: CardT, trump: TrumpConfig, suitCounts: Record<Suit, number>): number {
  const trumpBonus = isTrump(card, trump) ? 20 : 0;
  return card.rank + trumpBonus + suitCounts[card.suit] * 0.5;
}

function loseScore(card: CardT, trump: TrumpConfig): number {
  return card.rank + (isTrump(card, trump) ? 20 : 0);
}

function lowestWinningCard(cards: CardT[], trick: PlayT[], trump: TrumpConfig): CardT | null {
  if (trick.length === 0) return null;
  const leadSuit = trickLeadSuit(trick);
  if (!leadSuit) return null;

  let currentBest = trick[0].card;
  for (let i = 1; i < trick.length; i++) {
    const challenger = trick[i].card;
    if (compareCardsInTrick(challenger, currentBest, leadSuit, trump) === 1) {
      currentBest = challenger;
    }
  }

  let bestWin: CardT | null = null;
  for (const card of cards) {
    if (compareCardsInTrick(card, currentBest, leadSuit, trump) !== 1) continue;
    if (!bestWin) {
      bestWin = card;
      continue;
    }
    if (compareCardsInTrick(card, bestWin, leadSuit, trump) === -1) {
      bestWin = card;
    }
  }
  return bestWin;
}
