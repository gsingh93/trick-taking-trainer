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

  it("includes honors from the current trick in remaining honors", () => {
    const history: PlayT[][] = [];
    const current: PlayT[] = [
      { seat: "Me", card: { suit: "H", rank: 11, id: "H11" } },
      { seat: "Left", card: { suit: "H", rank: 12, id: "H12" } },
    ];
    const remaining = remainingHonorsInSuit(history, current, "H");
    expect(remaining).toEqual([13, 14] as Rank[]);
  });

  it("returns false for ace when checking honor threats", () => {
    const remaining: Rank[] = [11, 12, 13, 14];
    expect(canBeBeatenByHonor({ suit: "H", rank: 14, id: "H14" }, remaining)).toBe(false);
  });

  it("detects when a card can be beaten by remaining honors", () => {
    const remaining: Rank[] = [11, 12, 13];
    expect(canBeBeatenByHonor({ suit: "H", rank: 10, id: "H10" }, remaining)).toBe(true);
    expect(canBeBeatenByHonor({ suit: "H", rank: 13, id: "H13" }, remaining)).toBe(false);
  });
});
