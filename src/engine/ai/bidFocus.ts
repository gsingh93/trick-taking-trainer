import { compareCardsInTrick, isTrump, trickLeadSuit } from "../rules";
import { createVoidGrid, type VoidGrid } from "../state";
import { SEATS } from "../types";
import type { CardT, PlayT, Seat, Suit, TrumpConfig } from "../types";

export type BidAiContext = {
  seat: Seat;
  hand: CardT[];
  legalIds: Set<string>;
  trick: PlayT[];
  trickHistory?: PlayT[][];
  leader: Seat;
  trump: TrumpConfig;
  tricksWon: Record<Seat, number>;
  bid: number | null;
  actualVoid?: VoidGrid;
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
        const willCompleteBid = ctx.tricksWon[ctx.seat] + 1 >= (ctx.bid ?? 0);
        const highestWin = highestWinningCard(legalCards, ctx.trick, ctx.trump) ?? winning;
        const safeToWin =
          ctx.trick.length === 3 ||
          (ctx.trump.enabled &&
            leadSuit &&
            remainingOpponentsVoidInSuit(leadSuit, ctx.seat, ctx.trick, ctx.actualVoid) &&
            remainingOpponentsVoidInSuit(ctx.trump.suit, ctx.seat, ctx.trick, ctx.actualVoid)) ||
          canSafelyWinWithHonors(highestWin, ctx);
        if (willCompleteBid && safeToWin) {
          return { cardId: highestWin.id };
        }
        const offTrumpWinning = lowestWinningCard(
          legalCards.filter((c) => !isTrump(c, ctx.trump)),
          ctx.trick,
          ctx.trump
        );
        return { cardId: (offTrumpWinning ?? winning).id };
      }
    }
    if (!needsTricks) {
      const highestLosing = highestLosingCard(legalCards, ctx.trick, ctx.trump);
      if (highestLosing) {
        return { cardId: highestLosing.id };
      }
      if (
        ctx.trick.length === 3 ||
        (ctx.trump.enabled &&
          leadSuit &&
          remainingOpponentsVoidInSuit(leadSuit, ctx.seat, ctx.trick, ctx.actualVoid) &&
          remainingOpponentsVoidInSuit(ctx.trump.suit, ctx.seat, ctx.trick, ctx.actualVoid))
      ) {
        const highest = highestCard(legalCards, ctx.trump, countSuits(ctx.hand), rng);
        return { cardId: highest.id };
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

function remainingOpponentsVoidInSuit(
  suit: Suit,
  currentSeat: Seat,
  trick: PlayT[],
  actualVoid: VoidGrid = createVoidGrid()
): boolean {
  const playedSeats = new Set(trick.map((t) => t.seat));
  const remaining = SEATS.filter((seat) => seat !== currentSeat && !playedSeats.has(seat));
  if (!remaining.length) return false;
  if (remaining.includes("Me")) return false;
  for (const seat of remaining) {
    if (seat === "Me") return false;
    if (!actualVoid[seat][suit]) return false;
  }
  return true;
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

function highestLosingCard(cards: CardT[], trick: PlayT[], trump: TrumpConfig): CardT | null {
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
  let best: CardT | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const card of cards) {
    if (compareCardsInTrick(card, currentBest, leadSuit, trump) === 1) continue;
    const score = loseScore(card, trump);
    if (!best || score > bestScore) {
      best = card;
      bestScore = score;
    }
  }
  return best;
}

function highestWinningCard(cards: CardT[], trick: PlayT[], trump: TrumpConfig): CardT | null {
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
    if (compareCardsInTrick(card, bestWin, leadSuit, trump) === 1) {
      bestWin = card;
    }
  }
  return bestWin;
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

function canSafelyWinWithHonors(card: CardT, ctx: BidAiContext): boolean {
  if (!ctx.trick.length) return false;
  const leadSuit = trickLeadSuit(ctx.trick);
  if (!leadSuit) return false;

  const known = new Set<string>();
  const history = ctx.trickHistory ?? [];
  for (const trick of history) {
    for (const play of trick) known.add(play.card.id);
  }
  for (const play of ctx.trick) known.add(play.card.id);
  for (const held of ctx.hand) known.add(held.id);

  const higherRanks = (rank: number) =>
    Array.from({ length: 14 - rank }, (_, i) => rank + 1 + i).filter((r) => r <= 14);
  const hasUnknownHigher = (suit: Suit, rank: number) => {
    for (const r of higherRanks(rank)) {
      const id = `${suit}${r}`;
      if (!known.has(id)) return true;
    }
    return false;
  };

  if (ctx.trump.enabled && card.suit === ctx.trump.suit) {
    return !hasUnknownHigher(card.suit, card.rank);
  }

  if (card.suit === leadSuit && !hasUnknownHigher(card.suit, card.rank)) {
    if (!ctx.trump.enabled) return true;
    for (let r = 2; r <= 14; r += 1) {
      const id = `${ctx.trump.suit}${r}`;
      if (!known.has(id)) return false;
    }
    return true;
  }

  return false;
}
