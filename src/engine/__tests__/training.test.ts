import { describe, expect, it } from "vitest";
import { canBeBeatenByHonor, remainingHonorsInSuit } from "../training";
import type { PlayT, Rank } from "../types";

describe("training helpers", () => {
  it("tracks remaining honors in a suit", () => {
    const history: PlayT[][] = [
      [{ seat: "Me", card: { suit: "S", rank: 14, id: "S14" } }],
      [{ seat: "Left", card: { suit: "S", rank: 13, id: "S13" } }],
    ];
    const remaining = remainingHonorsInSuit(history, [], "S");
    expect(remaining).toEqual([11, 12] as Rank[]);
  });

  it("detects when a card can be beaten by remaining honors", () => {
    const remaining: Rank[] = [11, 12, 13];
    expect(canBeBeatenByHonor({ suit: "H", rank: 10, id: "H10" }, remaining)).toBe(true);
    expect(canBeBeatenByHonor({ suit: "H", rank: 13, id: "H13" }, remaining)).toBe(false);
  });
});
