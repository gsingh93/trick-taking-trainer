import { describe, expect, it } from "vitest";
import { createVoidGrid } from "../state";
import { evaluateWinIntent } from "../winIntent";
import type { CardT, PlayT, TrumpConfig } from "../types";

describe("winIntent", () => {
  it("warns about higher honors when honors-only is enabled", () => {
    const card: CardT = { suit: "D", rank: 11, id: "D11" };
    const result = evaluateWinIntent({
      card,
      trickHistory: [],
      trick: [],
      hand: [{ suit: "D", rank: 12, id: "D12" }],
      trump: { enabled: false, suit: "S", mustBreak: true },
      winIntentWarnTrump: false,
      winIntentWarnHonorsOnly: true,
      actualVoid: createVoidGrid(),
    });
    expect(result.warning).toBe("This card can be beaten by a higher card");
    expect(result.higherRanks).toEqual([13, 14]);
  });

  it("warns about any higher card when honors-only is disabled", () => {
    const card: CardT = { suit: "H", rank: 9, id: "H9" };
    const hand: CardT[] = [{ suit: "H", rank: 14, id: "H14" }];
    const result = evaluateWinIntent({
      card,
      trickHistory: [],
      trick: [],
      hand,
      trump: { enabled: false, suit: "S", mustBreak: true },
      winIntentWarnTrump: false,
      winIntentWarnHonorsOnly: false,
      actualVoid: createVoidGrid(),
    });
    expect(result.warning).toBe("This card can be beaten by a higher card");
    expect(result.higherRanks).toEqual([10, 11, 12, 13]);
  });

  it("does not warn when all higher ranks are in your hand", () => {
    const card: CardT = { suit: "S", rank: 9, id: "S9" };
    const hand: CardT[] = [
      { suit: "S", rank: 10, id: "S10" },
      { suit: "S", rank: 11, id: "S11" },
      { suit: "S", rank: 12, id: "S12" },
      { suit: "S", rank: 13, id: "S13" },
      { suit: "S", rank: 14, id: "S14" },
    ];
    const result = evaluateWinIntent({
      card,
      trickHistory: [],
      trick: [],
      hand,
      trump: { enabled: false, suit: "S", mustBreak: true },
      winIntentWarnTrump: false,
      winIntentWarnHonorsOnly: false,
      actualVoid: createVoidGrid(),
    });
    expect(result.warning).toBeNull();
    expect(result.higherRanks).toEqual([]);
  });

  it("lists trump threats when opponents are void in the lead suit", () => {
    const card: CardT = { suit: "H", rank: 14, id: "H14" };
    const trick: PlayT[] = [{ seat: "Me", card }];
    const actualVoid = createVoidGrid();
    actualVoid.Left.H = true;
    actualVoid.Left.S = false;
    const result = evaluateWinIntent({
      card,
      trickHistory: [],
      trick,
      hand: [],
      trump: { enabled: true, suit: "S", mustBreak: true } as TrumpConfig,
      winIntentWarnTrump: true,
      winIntentWarnHonorsOnly: true,
      actualVoid,
    });
    expect(result.warning).toBe("This card can be trumped");
    expect(result.trumpThreats).toEqual(["Left"]);
  });

  it("combines honor and trump warnings when both apply", () => {
    const card: CardT = { suit: "H", rank: 11, id: "H11" };
    const trick: PlayT[] = [{ seat: "Me", card }];
    const actualVoid = createVoidGrid();
    actualVoid.Left.H = true;
    actualVoid.Left.S = false;
    const result = evaluateWinIntent({
      card,
      trickHistory: [],
      trick,
      hand: [],
      trump: { enabled: true, suit: "S", mustBreak: true } as TrumpConfig,
      winIntentWarnTrump: true,
      winIntentWarnHonorsOnly: true,
      actualVoid,
    });
    expect(result.warning).toBe("This card can be beaten by a higher card or trump");
    expect(result.trumpThreats).toEqual(["Left"]);
  });

  it("returns no warning when higher ranks are already played", () => {
    const card: CardT = { suit: "H", rank: 11, id: "H11" };
    const trick: PlayT[] = [
      { seat: "Left", card: { suit: "H", rank: 14, id: "H14" } },
      { seat: "Across", card: { suit: "H", rank: 13, id: "H13" } },
      { seat: "Right", card: { suit: "H", rank: 12, id: "H12" } },
    ];
    const result = evaluateWinIntent({
      card,
      trickHistory: [],
      trick,
      hand: [{ suit: "H", rank: 11, id: "H11" }],
      trump: { enabled: false, suit: "S", mustBreak: true },
      winIntentWarnTrump: false,
      winIntentWarnHonorsOnly: true,
      actualVoid: createVoidGrid(),
    });
    expect(result.warning).toBeNull();
    expect(result.higherRanks).toEqual([]);
  });
});
