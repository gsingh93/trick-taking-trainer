import { describe, expect, it } from "vitest";
import { buildBidOrder, currentBidder, initBidState, isBiddingComplete, submitBid } from "../bidding";

describe("bidding phase", () => {
  it("builds a bid order starting from the chosen seat", () => {
    const order = buildBidOrder("Me");
    expect(order).toEqual(["Me", "Left", "Across", "Right"]);
  });

  it("advances bids in order and completes after four bids", () => {
    let state = initBidState("Me");
    expect(currentBidder(state)).toBe("Me");
    state = submitBid(state, "Me", 3);
    expect(currentBidder(state)).toBe("Left");
    state = submitBid(state, "Left", 2);
    state = submitBid(state, "Across", 1);
    state = submitBid(state, "Right", 0);
    expect(isBiddingComplete(state)).toBe(true);
  });

  it("ignores bids from the wrong seat", () => {
    const state = submitBid(initBidState("Me"), "Left", 2);
    expect(state.bids.Left).toBeNull();
    expect(currentBidder(state)).toBe("Me");
  });
});
