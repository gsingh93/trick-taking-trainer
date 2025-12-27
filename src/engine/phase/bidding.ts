import { nextSeat } from "../rules";
import type { Seat } from "../types";

export type BidState = {
  order: Seat[];
  index: number;
  bids: Record<Seat, number | null>;
  revealed: Record<Seat, boolean>;
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
