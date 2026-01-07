import { canFollowSuit, compareCardsInTrick, isTrump, nextSeat, trickLeadSuit } from "./rules";
import { shouldPromptSuitCount } from "./state";
import { OPPONENTS, type CardT, type PlayT, type Rank, type Seat, type Suit, type TrumpConfig } from "./types";
import type { VoidGrid } from "./state";
import { anyRemainingVoidInSuit, remainingPlayersVoidInSuit } from "./voids";

export type PromptContext = {
  trick: PlayT[];
  trickNo: number;
  hands: Record<Seat, CardT[]>;
  trump: TrumpConfig;
  actualVoid: VoidGrid;
};

export type VoidTrackingSettings = {
  enabled: boolean;
  suits: Suit[];
  skipLowImpact: boolean;
  onlyWhenLeading: boolean;
  promptScope: "global" | "per-suit";
};

export type VoidPromptEligibilityArgs = {
  context: PromptContext;
  settings: VoidTrackingSettings;
  anyVoidObserved: boolean;
};

export function getVoidPromptLead(args: VoidPromptEligibilityArgs): { leadSeat: Seat; leadSuit: Suit } | null {
  const { context, settings, anyVoidObserved } = args;
  if (!settings.enabled) return null;
  if (context.trick.length !== 1) return null;
  // Skip the very first trick since no void information can exist yet.
  if (context.trickNo === 1) return null;
  const leadSeat = context.trick[0].seat;
  const leadSuit = context.trick[0].card.suit;
  if (!settings.suits.includes(leadSuit)) return null;
  if (settings.skipLowImpact) {
    const lastSeat = nextSeat(nextSeat(nextSeat(leadSeat)));
    // If we're last, the void prompt won't change our decision.
    if (lastSeat === "Me") return null;
    // Otherwise, skip when we can't follow suit and have no trump.
    const hasLeadSuit = canFollowSuit(context.hands.Me, leadSuit);
    const hasTrump = context.hands.Me.some((card) => isTrump(card, context.trump));
    if (!hasLeadSuit && !hasTrump) return null;
  }
  // Honor "only when leading" by suppressing opponent-led prompts.
  if (settings.onlyWhenLeading && leadSeat !== "Me") return null;
  const shouldPrompt =
    settings.promptScope === "global"
      ? anyVoidObserved
      : OPPONENTS.some((o) => context.actualVoid[o][leadSuit]);
  if (!shouldPrompt) return null;
  return { leadSeat, leadSuit };
}

export type WinIntentSettings = {
  enabled: boolean;
  minRank: Rank;
  warnHonorsOnly: boolean;
  warnTrump: boolean;
};

export type WinIntentEligibilityArgs = {
  context: PromptContext;
  card: CardT;
  seat: Seat;
  aiPlayMe: boolean;
  honorRemainingBySuit: Record<Suit, Rank[]>;
  settings: WinIntentSettings;
};

export type SuitCountContext = {
  trickHistory: PlayT[][];
  trick: PlayT[];
  selfSeat: Seat;
};

export type SuitCountSettings = {
  enabled: boolean;
  suits: Suit[];
  skipIfSelfOffSuit: boolean;
};

export function getSuitCountPromptSuit(args: { context: SuitCountContext; settings: SuitCountSettings }): Suit | null {
  const { context, settings } = args;
  if (!settings.enabled) return null;
  const promptSuit = shouldPromptSuitCount(context.trickHistory, context.trick, {
    skipIfSelfOffSuit: settings.skipIfSelfOffSuit,
    selfSeat: context.selfSeat,
  });
  if (!promptSuit) return null;
  if (!settings.suits.includes(promptSuit)) return null;
  return promptSuit;
}


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

function higherCardsAllInHand(card: CardT, suit: Suit, hand: CardT[]): boolean {
  if (card.rank >= 14) return false;
  const handRanks = new Set(hand.filter((c) => c.suit === suit).map((c) => c.rank));
  for (let r = card.rank + 1; r <= 14; r += 1) {
    if (!handRanks.has(r as Rank)) return false;
  }
  return true;
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
  const { context, card, seat, aiPlayMe, honorRemainingBySuit, settings } = args;
  if (!settings.enabled) return false;
  if (seat !== "Me") return false;
  if (aiPlayMe) return false;
  if (context.trick.length >= 3) return false;
  // Skip the first trick since we lack enough info for a useful warning.
  if (context.trickNo === 1) return false;
  if (card.rank < settings.minRank) return false;
  const leadSuit = trickLeadSuit(context.trick) ?? card.suit;
  // If an ace is led and no remaining opponents are void, there's no immediate threat.
  if (card.rank === 14 && !anyRemainingVoidInSuit(leadSuit, seat, context.trick, context.actualVoid, false)) {
    return false;
  }
  // Don't prompt when all higher honors have already appeared this trick.
  if (currentTrickHasAllHigherHonors(card, leadSuit, context.trick)) return false;
  // Don't prompt when warning only about honors and all higher honors are already in hand.
  if (settings.warnHonorsOnly && higherHonorsAllInHand(card, leadSuit, honorRemainingBySuit, context.hands.Me)) {
    return false;
  }
  if (!settings.warnHonorsOnly && higherCardsAllInHand(card, leadSuit, context.hands.Me)) return false;
  // If we're already losing, the prompt isn't useful.
  if (alreadyLosingTrick(card, leadSuit, context.trick, context.trump)) return false;
  // If everyone left is void, we can't be beaten in-suit.
  if (remainingPlayersVoidInSuit(leadSuit, seat, context.trick, context.actualVoid, false)) return false;
  return true;
}
