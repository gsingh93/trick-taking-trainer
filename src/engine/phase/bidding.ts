import { nextSeat } from "../rules";
import type { Seat } from "../types";

export type BidState = {
  order: Seat[];
  index: number;
  bids: Record<Seat, number | null>;
  revealed: Record<Seat, boolean>;
};

export type BidOutcome = {
  bid: number | null;
  tricksWon: number;
  made: boolean;
};

export function buildBidOrder(start: Seat = "Me"): Seat[] {
  const order: Seat[] = [start];
  let cur = start;
  for (let i = 0; i < 3; i++) {
    cur = nextSeat(cur);
    order.push(cur);
  }
  return order;
}

export function initBidState(start: Seat = "Me"): BidState {
  return {
    order: buildBidOrder(start),
    index: 0,
    bids: { Left: null, Across: null, Right: null, Me: null },
    revealed: { Left: false, Across: false, Right: false, Me: false },
  };
}

export function currentBidder(state: BidState): Seat | null {
  return state.index >= state.order.length ? null : state.order[state.index];
}

export function isBiddingComplete(state: BidState): boolean {
  return state.index >= state.order.length;
}

export function submitBid(state: BidState, seat: Seat, bid: number): BidState {
  const current = currentBidder(state);
  if (!current || current !== seat) return state;
  const nextIndex = state.index + 1;
  return {
    ...state,
    index: nextIndex,
    bids: { ...state.bids, [seat]: bid },
    revealed: { ...state.revealed, [seat]: true },
  };
}

export function evaluateExactBids(
  bids: Record<Seat, number | null>,
  tricksWon: Record<Seat, number>
): Record<Seat, BidOutcome> {
  return {
    Left: { bid: bids.Left, tricksWon: tricksWon.Left, made: bids.Left != null && tricksWon.Left === bids.Left },
    Across: {
      bid: bids.Across,
      tricksWon: tricksWon.Across,
      made: bids.Across != null && tricksWon.Across === bids.Across,
    },
    Right: {
      bid: bids.Right,
      tricksWon: tricksWon.Right,
      made: bids.Right != null && tricksWon.Right === bids.Right,
    },
    Me: { bid: bids.Me, tricksWon: tricksWon.Me, made: bids.Me != null && tricksWon.Me === bids.Me },
  };
}
