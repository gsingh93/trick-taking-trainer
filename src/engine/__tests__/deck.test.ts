import { describe, expect, it } from "vitest";
import { buildDeck, createRng, dealNewHands } from "../deck";
import { SEATS, SUITS } from "../types";

describe("deck", () => {
  it("builds a 52-card deck with 13 of each suit", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
    for (const s of SUITS) {
      expect(deck.filter((c) => c.suit === s)).toHaveLength(13);
    }
  });

  it("deals 13 cards to each seat", () => {
    const hands = dealNewHands(createRng(1));
    for (const seat of SEATS) {
      expect(hands[seat]).toHaveLength(13);
    }
    const ids = SEATS.flatMap((s) => hands[s].map((c) => c.id));
    expect(ids).toHaveLength(52);
    expect(new Set(ids).size).toBe(52);
  });
});
