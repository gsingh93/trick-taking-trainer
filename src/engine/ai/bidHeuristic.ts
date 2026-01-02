import type { CardT, Rank, Suit, TrumpConfig } from "../types";

/**
 * Bidding heuristic overview (trump-enabled rules):
 * - Compute suit-by-suit honor winners using a "sacrifice" model.
 *   - Honors are counted as +1 when you have enough low cards in that suit
 *     to draw higher missing honors. If you're one sacrifice short, count +0.5.
 * - For the trump suit, treat 10+ as honors and apply the same sacrifice logic.
 *   Short-suit bonuses (singletons +1, doubletons +0.5) are applied first and
 *   consume trump sacrifices before counting trump honor winners.
 * - For non-trump suits, cap the suit contribution when trump is enabled:
 *   - 4 cards or fewer: cap 3
 *   - 5 cards: cap 2
 *   - 6+ cards: cap 1.5
 * - When trump is not enabled, only non-trump honors are scored and capped at 3.
 * - The final bid is the floored total, clamped to [0, 13].
 */
// Honor ladders used for conservative trick estimates.
const NON_TRUMP_HONORS: Rank[] = [12, 13, 14]; // Q, K, A
const TRUMP_HONORS: Rank[] = [10, 11, 12, 13, 14]; // 10, J, Q, K, A

type HonorScore = {
  points: number;
  sacrifices: number;
  effectiveSacrifices: number;
  maxMissingHigher: number;
  honorsHeld: Rank[];
  missingHigherByHonor: Record<number, number>;
  winnerPointsByHonor: Record<number, number>;
};

function scoreHonorWinners(
  cards: CardT[],
  honorRanks: Rank[],
  sacrificeOverride?: number
): HonorScore {
  const honorSet = new Set(honorRanks);
  const honorsHeld = cards.filter((c) => honorSet.has(c.rank));
  const sacrifices = cards.length - honorsHeld.length;
  // "Sacrifices" are low cards available to draw out higher honors.
  const effectiveSacrifices = Math.max(0, sacrificeOverride ?? sacrifices);
  const heldRanks = new Set(honorsHeld.map((c) => c.rank));
  let points = 0;
  let maxMissingHigher = 0;
  const missingHigherByHonor: Record<number, number> = {};
  const winnerPointsByHonor: Record<number, number> = {};

  for (const honor of honorsHeld) {
    // Missing higher honors you do not hold must be "paid for" with sacrifices.
    const missingHigher = honorRanks.filter((r) => r > honor.rank && !heldRanks.has(r)).length;
    missingHigherByHonor[honor.rank] = missingHigher;
    if (missingHigher > maxMissingHigher) maxMissingHigher = missingHigher;
    if (missingHigher <= effectiveSacrifices) {
      points += 1;
      winnerPointsByHonor[honor.rank] = 1;
    } else if (missingHigher === effectiveSacrifices + 1) {
      // One sacrifice short: treat the honor as a half winner.
      points += 0.5;
      winnerPointsByHonor[honor.rank] = 0.5;
    } else {
      winnerPointsByHonor[honor.rank] = 0;
    }
  }

  return {
    points,
    sacrifices,
    effectiveSacrifices,
    maxMissingHigher,
    honorsHeld: honorsHeld.map((c) => c.rank),
    missingHigherByHonor,
    winnerPointsByHonor,
  };
}

export function estimateBid(hand: CardT[], trump: TrumpConfig): number {
  const breakdown = buildBidBreakdown(hand, trump);
  return breakdown.bid;
}

export type SuitBreakdown = {
  length: number;
  honorsHeld: Rank[];
  sacrifices: number;
  maxMissingHigher: number;
  missingHigherByHonor: Record<number, number>;
  winnerPointsByHonor: Record<number, number>;
  points: number;
  cap: number;
  cappedPoints: number;
};

export type BidBreakdown = {
  total: number;
  bid: number;
  suits: Record<Suit, SuitBreakdown>;
  trump?: {
    suit: Suit;
    honorRanks: Rank[];
    points: number;
    sacrifices: number;
    effectiveSacrifices: number;
    maxMissingHigher: number;
    leftover: number;
    shortBonus: number;
    shortBonusApplied: number;
    singletons: number;
    doubletons: number;
  };
};

export function buildBidBreakdown(hand: CardT[], trump: TrumpConfig): BidBreakdown {
  let total = 0;
  const suitCards: Record<Suit, CardT[]> = { S: [], H: [], D: [], C: [] };
  const suits: Record<Suit, SuitBreakdown> = {
    S: {
      length: 0,
      honorsHeld: [],
      sacrifices: 0,
      maxMissingHigher: 0,
      missingHigherByHonor: {},
      winnerPointsByHonor: {},
      points: 0,
      cap: 0,
      cappedPoints: 0,
    },
    H: {
      length: 0,
      honorsHeld: [],
      sacrifices: 0,
      maxMissingHigher: 0,
      missingHigherByHonor: {},
      winnerPointsByHonor: {},
      points: 0,
      cap: 0,
      cappedPoints: 0,
    },
    D: {
      length: 0,
      honorsHeld: [],
      sacrifices: 0,
      maxMissingHigher: 0,
      missingHigherByHonor: {},
      winnerPointsByHonor: {},
      points: 0,
      cap: 0,
      cappedPoints: 0,
    },
    C: {
      length: 0,
      honorsHeld: [],
      sacrifices: 0,
      maxMissingHigher: 0,
      missingHigherByHonor: {},
      winnerPointsByHonor: {},
      points: 0,
      cap: 0,
      cappedPoints: 0,
    },
  };

  for (const card of hand) {
    suitCards[card.suit].push(card);
  }

  let trumpInfo: BidBreakdown["trump"];
  let trumpLeftover = 0;
  let singletons = 0;
  let doubletons = 0;

  if (trump.enabled) {
    // Count short suits for ruffing potential.
    for (const suit of Object.keys(suitCards) as Suit[]) {
      if (suit === trump.suit) continue;
      const count = suitCards[suit].length;
      if (count === 1) singletons += 1;
      if (count === 2) doubletons += 1;
    }
    const shortBonus = singletons + doubletons * 0.5;
    const trumpSacrifices = suitCards[trump.suit].length - suitCards[trump.suit].filter((c) => TRUMP_HONORS.includes(c.rank)).length;
    // Apply short-suit bonus first and consume trump sacrifices.
    const shortBonusApplied = Math.min(shortBonus, trumpSacrifices);
    const trumpScore = scoreHonorWinners(
      suitCards[trump.suit],
      TRUMP_HONORS,
      trumpSacrifices - shortBonusApplied
    );
    total += trumpScore.points + shortBonusApplied;
    // Leftover low trump after supporting honors and short-suit bonus.
    trumpLeftover = Math.max(0, trumpScore.sacrifices - shortBonusApplied);
    trumpInfo = {
      suit: trump.suit,
      honorRanks: TRUMP_HONORS,
      points: trumpScore.points,
      sacrifices: trumpScore.sacrifices,
      effectiveSacrifices: trumpScore.effectiveSacrifices,
      maxMissingHigher: trumpScore.maxMissingHigher,
      leftover: trumpLeftover,
      shortBonus,
      shortBonusApplied,
      singletons,
      doubletons,
    };
  }

  for (const suit of Object.keys(suitCards) as Suit[]) {
    if (trump.enabled && suit === trump.suit) {
      suits[suit] = {
        length: suitCards[suit].length,
        honorsHeld: [],
        sacrifices: 0,
        maxMissingHigher: 0,
        missingHigherByHonor: {},
        winnerPointsByHonor: {},
        points: 0,
        cap: 0,
        cappedPoints: 0,
      };
      continue;
    }
    const cards = suitCards[suit];
    const suitScore = scoreHonorWinners(cards, NON_TRUMP_HONORS);
    // Non-trump cap: ≤4 cards cap at 3, 5 cards cap at 2, 6+ cards cap at 1.5 when trump enabled.
    const cap = trump.enabled
      ? cards.length <= 4
        ? 3
        : cards.length >= 6
          ? 1.5
          : 2
      : 3;
    const cappedPoints = Math.min(suitScore.points, cap);
    suits[suit] = {
      length: cards.length,
      honorsHeld: suitScore.honorsHeld,
      sacrifices: suitScore.sacrifices,
      maxMissingHigher: suitScore.maxMissingHigher,
      missingHigherByHonor: suitScore.missingHigherByHonor,
      winnerPointsByHonor: suitScore.winnerPointsByHonor,
      points: suitScore.points,
      cap,
      cappedPoints,
    };
    total += cappedPoints;
  }

  // Final bid is the floored total, clamped to 0-13.
  const bid = Math.max(0, Math.min(13, Math.floor(total)));
  return { total, bid, suits, trump: trumpInfo };
}
