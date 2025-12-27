import { describe, expect, it } from "vitest";
import { determineTrickWinner, isLegalPlay } from "../rules";
import type { CardT, PlayT, TrumpConfig } from "../types";

describe("rules", () => {
  it("picks the highest card of the lead suit when no trump", () => {
    const trump: TrumpConfig = { enabled: false, suit: "S", mustBreak: true };
    const trick: PlayT[] = [
      { seat: "Me", card: { suit: "H", rank: 10, id: "H10" } },
      { seat: "Left", card: { suit: "H", rank: 12, id: "H12" } },
      { seat: "Across", card: { suit: "H", rank: 3, id: "H3" } },
      { seat: "Right", card: { suit: "H", rank: 14, id: "H14" } },
    ];
    expect(determineTrickWinner(trick, trump)).toBe("Right");
  });

  it("picks the highest trump if any trump is played", () => {
    const trump: TrumpConfig = { enabled: true, suit: "S", mustBreak: true };
    const trick: PlayT[] = [
      { seat: "Me", card: { suit: "H", rank: 10, id: "H10" } },
      { seat: "Left", card: { suit: "S", rank: 2, id: "S2" } },
      { seat: "Across", card: { suit: "H", rank: 14, id: "H14" } },
      { seat: "Right", card: { suit: "S", rank: 11, id: "S11" } },
    ];
    expect(determineTrickWinner(trick, trump)).toBe("Right");
  });

  it("enforces must-follow when you can follow suit", () => {
    const trump: TrumpConfig = { enabled: false, suit: "S", mustBreak: true };
    const hand: CardT[] = [
      { suit: "H", rank: 2, id: "H2" },
      { suit: "S", rank: 14, id: "S14" },
    ];
    const trick: PlayT[] = [{ seat: "Me", card: { suit: "H", rank: 10, id: "H10" } }];
    expect(
      isLegalPlay({
        hand,
        card: { suit: "S", rank: 14, id: "S14" },
        trick,
        isLeader: false,
        trump,
        trumpBroken: false,
      })
    ).toBe(false);
  });

  it("enforces must-break when leading and non-trump is available", () => {
    const trump: TrumpConfig = { enabled: true, suit: "S", mustBreak: true };
    const hand: CardT[] = [
      { suit: "S", rank: 2, id: "S2" },
      { suit: "H", rank: 5, id: "H5" },
    ];
    expect(
      isLegalPlay({
        hand,
        card: { suit: "S", rank: 2, id: "S2" },
        trick: [],
        isLeader: true,
        trump,
        trumpBroken: false,
      })
    ).toBe(false);
  });

  it("allows leading trump after trump is broken", () => {
    const trump: TrumpConfig = { enabled: true, suit: "S", mustBreak: true };
    const hand: CardT[] = [
      { suit: "S", rank: 2, id: "S2" },
      { suit: "H", rank: 5, id: "H5" },
    ];
    expect(
      isLegalPlay({
        hand,
        card: { suit: "S", rank: 2, id: "S2" },
        trick: [],
        isLeader: true,
        trump,
        trumpBroken: true,
      })
    ).toBe(true);
  });

  it("picks trump over lead suit when mixed", () => {
    const trump: TrumpConfig = { enabled: true, suit: "S", mustBreak: true };
    const trick: PlayT[] = [
      { seat: "Me", card: { suit: "H", rank: 14, id: "H14" } },
      { seat: "Left", card: { suit: "S", rank: 2, id: "S2" } },
      { seat: "Across", card: { suit: "H", rank: 2, id: "H2" } },
      { seat: "Right", card: { suit: "S", rank: 3, id: "S3" } },
    ];
    expect(determineTrickWinner(trick, trump)).toBe("Right");
  });

  it("allows leading trump when hand is all trump", () => {
    const trump: TrumpConfig = { enabled: true, suit: "S", mustBreak: true };
    const hand: CardT[] = [
      { suit: "S", rank: 2, id: "S2" },
      { suit: "S", rank: 5, id: "S5" },
    ];
    expect(
      isLegalPlay({
        hand,
        card: { suit: "S", rank: 2, id: "S2" },
        trick: [],
        isLeader: true,
        trump,
        trumpBroken: false,
      })
    ).toBe(true);
  });
});
