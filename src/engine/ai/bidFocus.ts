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
    const trumpCards = legalCards.filter((c) => isTrump(c, ctx.trump));
    const nonTrumpCards = legalCards.filter((c) => !isTrump(c, ctx.trump));
    if (nonTrumpCards.length) {
      // 1) Shorten non-trump suits first by leading low from the shortest suit.
      const suitCounts = countSuits(nonTrumpCards);
      const shortestSuit = shortestNonTrumpSuit(nonTrumpCards);
      const shortestCount = suitCounts[shortestSuit];
      if (shortestCount <= 2) {
        return { cardId: lowestCardInSuit(nonTrumpCards, shortestSuit).id };
      }
      // 2) Otherwise, try to win with the highest non-trump card.
      return { cardId: highestCardInSuit(nonTrumpCards, strongestSuit(nonTrumpCards)).id };
    }
    if (ctx.trump.enabled && trumpCards.length) {
      const hasAceTrump = ctx.hand.some((c) => c.suit === ctx.trump.suit && c.rank === 14);
      // 3) If only trump remains, lead high trump when it's likely to win.
      if (hasAceTrump) {
        return { cardId: highestCardInSuit(trumpCards, ctx.trump.suit).id };
      }
      // 4) Otherwise, pull trump with the lowest card.
      return { cardId: lowestCard(trumpCards, ctx.trump).id };
    }
    // Fallback to highest card when no other rule applies.
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

function lowestCardInSuit(cards: CardT[], suit: Suit): CardT {
  const suitCards = cards.filter((c) => c.suit === suit);
  return suitCards.reduce((best, card) => (card.rank < best.rank ? card : best), suitCards[0]);
}

function shortestNonTrumpSuit(cards: CardT[]): Suit {
  const counts: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const card of cards) counts[card.suit] += 1;
  let bestSuit: Suit = "S";
  let bestCount = Number.POSITIVE_INFINITY;
  for (const suit of Object.keys(counts) as Suit[]) {
    const count = counts[suit];
    if (count === 0) continue;
    if (count < bestCount) {
      bestSuit = suit;
      bestCount = count;
    }
  }
  return bestSuit;
}

function strongestSuit(cards: CardT[]): Suit {
  const suits: Record<Suit, CardT[]> = { S: [], H: [], D: [], C: [] };
  for (const card of cards) suits[card.suit].push(card);
  let bestSuit: Suit = "S";
  let bestRank = -1;
  for (const suit of Object.keys(suits) as Suit[]) {
    const suitCards = suits[suit];
    if (!suitCards.length) continue;
    const top = suitCards.reduce((best, card) => (card.rank > best.rank ? card : best), suitCards[0]);
    if (top && top.rank > bestRank) {
      bestRank = top.rank;
      bestSuit = suit;
    }
  }
  return bestSuit;
}

function highestCardInSuit(cards: CardT[], suit: Suit): CardT {
  const suitCards = cards.filter((c) => c.suit === suit);
  return suitCards.reduce((best, card) => (card.rank > best.rank ? card : best), suitCards[0]);
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
