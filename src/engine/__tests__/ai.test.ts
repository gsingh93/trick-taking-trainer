import { describe, expect, it } from "vitest";
import { chooseCardToPlay } from "../ai/random";

describe("ai", () => {
  it("returns null when no legal cards exist", () => {
    const decision = chooseCardToPlay([{ id: "S2" }], new Set());
    expect(decision).toBeNull();
  });

  it("returns a card id from the legal set", () => {
    const hand = [{ id: "S2" }, { id: "H3" }, { id: "D4" }];
    const legal = new Set(["H3", "D4"]);
    const decision = chooseCardToPlay(hand, legal, () => 0);
    expect(decision).not.toBeNull();
    expect(legal.has(decision?.cardId ?? "")).toBe(true);
  });
});
