import type { CardT, Hands, PlayT, Seat, Suit, TrumpConfig } from "./types";
import { SEATS } from "./types";

export function sortHand(hand: CardT[], suitOrder: Suit[], sortAscending: boolean): CardT[] {
  const suitIndex = new Map<Suit, number>(suitOrder.map((s, i) => [s, i]));
  const rankFactor = sortAscending ? 1 : -1;
  return hand
    .slice()
    .sort(
      (a, b) =>
        (suitIndex.get(a.suit) ?? 0) - (suitIndex.get(b.suit) ?? 0) ||
        (a.rank - b.rank) * rankFactor
    );
}

export function nextSeat(seat: Seat): Seat {
  const i = SEATS.indexOf(seat);
  return SEATS[(i + 1) % SEATS.length];
}

export function trickLeadSuit(trick: PlayT[]): Suit | null {
  return trick.length ? trick[0].card.suit : null;
}

export function canFollowSuit(hand: CardT[], suit: Suit): boolean {
  return hand.some((c) => c.suit === suit);
}

export function isTrump(card: CardT, trump: TrumpConfig): boolean {
  return trump.enabled && card.suit === trump.suit;
}

export function isLegalPlay(args: {
  hand: CardT[];
  card: CardT;
  trick: PlayT[];
  isLeader: boolean;
  trump: TrumpConfig;
  trumpBroken: boolean;
}): boolean {
  const { hand, card, trick, isLeader, trump, trumpBroken } = args;

  // Card must be in hand
  if (!hand.some((c) => c.id === card.id)) return false;

  const lead = trickLeadSuit(trick);

  // If leading and mustBreak is enabled, restrict leading trump until broken (unless only trump in hand)
  if (
    isLeader &&
    trick.length === 0 &&
    trump.enabled &&
    trump.mustBreak &&
    !trumpBroken &&
    isTrump(card, trump)
  ) {
    const hasNonTrump = hand.some((c) => !isTrump(c, trump));
    if (hasNonTrump) return false;
  }

  // Must follow suit if possible
  if (lead && card.suit !== lead) {
    if (canFollowSuit(hand, lead)) return false;
  }

  return true;
}

export function compareCardsInTrick(a: CardT, b: CardT, lead: Suit, trump: TrumpConfig): number {
  const aTrump = isTrump(a, trump);
  const bTrump = isTrump(b, trump);

  // trump beats non-trump
  if (aTrump && !bTrump) return 1;
  if (!aTrump && bTrump) return -1;

  const aFollow = a.suit === lead;
  const bFollow = b.suit === lead;

  // neither trump
  if (aFollow && !bFollow) return 1;
  if (!aFollow && bFollow) return -1;

  // both same category (both lead suit, or both off-suit) -> compare rank only if same suit
  if (a.suit === b.suit) {
    return a.rank === b.rank ? 0 : a.rank > b.rank ? 1 : -1;
  }

  // off-suit incomparable: earlier winner stays
  return 0;
}

export function determineTrickWinner(trick: PlayT[], trump: TrumpConfig): Seat {
  const lead = trickLeadSuit(trick);
  if (!lead) throw new Error("Cannot determine winner of empty trick");

  let best = trick[0];
  for (let i = 1; i < trick.length; i++) {
    const challenger = trick[i];
    const cmp = compareCardsInTrick(challenger.card, best.card, lead, trump);
    if (cmp === 1) best = challenger;
  }
  return best.seat;
}

export function sameTrick(a: PlayT[], b: PlayT[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].seat !== b[i].seat || a[i].card.id !== b[i].card.id) return false;
  }
  return true;
}

export function cloneHands(hands: Hands): Hands {
  return {
    Left: hands.Left.slice(),
    Across: hands.Across.slice(),
    Right: hands.Right.slice(),
    Me: hands.Me.slice(),
  };
}
