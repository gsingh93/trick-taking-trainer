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
      hand: [],
      trump: { enabled: false, suit: "S", mustBreak: true },
      winIntentWarnTrump: false,
      winIntentWarnHonorsOnly: true,
      actualVoid: createVoidGrid(),
    });
    expect(result.warning).toBe("This card can be beaten by a higher card");
    expect(result.higherRanks).toEqual([12, 13, 14]);
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
});
