import { canFollowSuit, compareCardsInTrick, isTrump, nextSeat, trickLeadSuit } from "./rules";
import { OPPONENTS, type CardT, type PlayT, type Rank, type Seat, type Suit, type TrumpConfig } from "./types";
import type { VoidGrid } from "./state";
import { anyRemainingVoidInSuit, remainingPlayersVoidInSuit } from "./voids";

export type VoidPromptEligibilityArgs = {
  voidTrackingEnabled: boolean;
  voidTrackingSuits: Suit[];
  voidPromptSkipLowImpact: boolean;
  voidPromptOnlyWhenLeading: boolean;
  voidPromptScope: "global" | "per-suit";
  trick: PlayT[];
  trickNo: number;
  hands: Record<Seat, CardT[]>;
  trump: TrumpConfig;
  anyVoidObserved: boolean;
  actualVoid: VoidGrid;
};

export function getVoidPromptLead(args: VoidPromptEligibilityArgs): { leadSeat: Seat; leadSuit: Suit } | null {
  if (!args.voidTrackingEnabled) return null;
  if (args.trick.length !== 1) return null;
  // Skip the very first trick since no void information can exist yet.
  if (args.trickNo === 1) return null;
  const leadSeat = args.trick[0].seat;
  const leadSuit = args.trick[0].card.suit;
  if (!args.voidTrackingSuits.includes(leadSuit)) return null;
  if (args.voidPromptSkipLowImpact) {
    const lastSeat = nextSeat(nextSeat(nextSeat(leadSeat)));
    // If we're last and can't follow suit or trump, void info won't change our play.
    if (lastSeat === "Me") return null;
    const hasLeadSuit = canFollowSuit(args.hands.Me, leadSuit);
    const hasTrump = args.hands.Me.some((card) => isTrump(card, args.trump));
    if (!hasLeadSuit && !hasTrump) return null;
  }
  // Honor "only when leading" by suppressing opponent-led prompts.
  if (args.voidPromptOnlyWhenLeading && leadSeat !== "Me") return null;
  const shouldPrompt =
    args.voidPromptScope === "global"
      ? args.anyVoidObserved
      : OPPONENTS.some((o) => args.actualVoid[o][leadSuit]);
  if (!shouldPrompt) return null;
  return { leadSeat, leadSuit };
}

export type WinIntentEligibilityArgs = {
  card: CardT;
  seat: Seat;
  trick: PlayT[];
  trickNo: number;
  winIntentPromptEnabled: boolean;
  winIntentMinRank: Rank;
  aiPlayMe: boolean;
  honorRemainingBySuit: Record<Suit, Rank[]>;
  hands: Record<Seat, CardT[]>;
  trump: TrumpConfig;
  actualVoid: VoidGrid;
};


function currentTrickHasAllHigherHonors(card: CardT, suit: Suit, trick: PlayT[]): boolean {
  if (card.rank >= 14) return false;
  const ranksInTrick = new Set(trick.filter((t) => t.card.suit === suit).map((t) => t.card.rank));
  const higherHonors = ([11, 12, 13, 14] as Rank[]).filter((r) => r > card.rank);
  return higherHonors.every((r) => ranksInTrick.has(r));
}

function higherHonorsAllInHand(
  card: CardT,
  suit: Suit,
  honorRemainingBySuit: Record<Suit, Rank[]>,
  hand: CardT[]
): boolean {
  if (card.rank >= 14) return false;
  const remaining = honorRemainingBySuit[suit].filter((r) => r > card.rank);
  if (!remaining.length) return false;
  const handRanks = new Set(hand.filter((c) => c.suit === suit).map((c) => c.rank));
  return remaining.every((r) => handRanks.has(r));
}

function alreadyLosingTrick(card: CardT, suit: Suit, trick: PlayT[], trump: TrumpConfig): boolean {
  if (!trick.length) return false;
  let currentBest = trick[0].card;
  for (let i = 1; i < trick.length; i++) {
    const challenger = trick[i].card;
    if (compareCardsInTrick(challenger, currentBest, suit, trump) === 1) {
      currentBest = challenger;
    }
  }
  return compareCardsInTrick(card, currentBest, suit, trump) === -1;
}

export function shouldPromptWinIntent(args: WinIntentEligibilityArgs): boolean {
  if (!args.winIntentPromptEnabled) return false;
  if (args.seat !== "Me") return false;
  if (args.aiPlayMe) return false;
  if (args.trick.length >= 3) return false;
  // Skip the first trick since we lack enough info for a useful warning.
  if (args.trickNo === 1) return false;
  if (args.card.rank < args.winIntentMinRank) return false;
  const leadSuit = trickLeadSuit(args.trick) ?? args.card.suit;
  // If an ace is led and no remaining opponents are void, there's no immediate threat.
  if (
    args.card.rank === 14 &&
    !anyRemainingVoidInSuit(leadSuit, args.seat, args.trick, args.actualVoid, false)
  ) {
    return false;
  }
  // Don't prompt when all higher honors have already appeared this trick.
  if (currentTrickHasAllHigherHonors(args.card, leadSuit, args.trick)) return false;
  // Don't prompt when any remaining higher honors are already in hand.
  if (higherHonorsAllInHand(args.card, leadSuit, args.honorRemainingBySuit, args.hands.Me)) return false;
  // If we're already losing, the prompt isn't useful.
  if (alreadyLosingTrick(args.card, leadSuit, args.trick, args.trump)) return false;
  // If everyone left is void, we can't be beaten in-suit.
  if (remainingPlayersVoidInSuit(leadSuit, args.seat, args.trick, args.actualVoid, false)) return false;
  return true;
}
