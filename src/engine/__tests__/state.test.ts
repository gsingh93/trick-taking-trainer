import { describe, expect, it } from "vitest";
import {
  applyPlay,
  computeActualVoid,
  computeLegalBySeat,
  initGameState,
  isPlayLegal,
  resetTrick,
  resolveTrick,
} from "../state";
import type { CardT, PlayT, TrumpConfig } from "../types";

describe("state", () => {
  it("applyPlay removes the card and advances the trick", () => {
    const trump: TrumpConfig = { enabled: false, suit: "S", mustBreak: true };
    const base = initGameState(1);
    const card = base.hands.Me[0];
    const next = applyPlay(base, { seat: "Me", card }, trump);
    expect(next.trick).toHaveLength(1);
    expect(next.hands.Me.find((c) => c.id === card.id)).toBeUndefined();
  });

  it("resolveTrick updates winner and history", () => {
    const trump: TrumpConfig = { enabled: false, suit: "S", mustBreak: true };
    const base = initGameState(1);
    const trick: PlayT[] = [
      { seat: "Me", card: { suit: "H", rank: 10, id: "H10" } },
      { seat: "Left", card: { suit: "H", rank: 12, id: "H12" } },
      { seat: "Across", card: { suit: "H", rank: 3, id: "H3" } },
      { seat: "Right", card: { suit: "H", rank: 14, id: "H14" } },
    ];
    const next = resolveTrick({ ...base, trick }, trump);
    expect(next.trickHistory).toHaveLength(1);
    expect(next.tricksWon.Right).toBe(1);
    expect(next.leader).toBe("Right");
  });

  it("resetTrick restores cards and leader", () => {
    const trump: TrumpConfig = { enabled: false, suit: "S", mustBreak: true };
    const base = initGameState(1);
    const card = base.hands.Me[0];
    const played = applyPlay(base, { seat: "Me", card }, trump);
    const reset = resetTrick(played, trump);
    expect(reset.trick).toHaveLength(0);
    expect(reset.hands.Me.find((c) => c.id === card.id)).toBeDefined();
    expect(reset.turn).toBe(reset.trickStartTurn);
  });

  it("computeActualVoid flags off-suit plays", () => {
    const trick: PlayT[] = [
      { seat: "Left", card: { suit: "H", rank: 2, id: "H2" } },
      { seat: "Across", card: { suit: "S", rank: 3, id: "S3" } },
    ];
    const actual = computeActualVoid([], trick);
    expect(actual.Across.H).toBe(true);
  });

  it("computeLegalBySeat and isPlayLegal agree on legality", () => {
    const trump: TrumpConfig = { enabled: false, suit: "S", mustBreak: true };
    const base = initGameState(1);
    const card = base.hands.Me[0];
    const legal = computeLegalBySeat(base, trump);
    expect(legal.Me.has(card.id)).toBe(true);
    expect(isPlayLegal({ state: base, seat: "Me", card, trump })).toBe(true);
  });

  it("isPlayLegal rejects off-suit when following is possible", () => {
    const trump: TrumpConfig = { enabled: false, suit: "S", mustBreak: true };
    const base = initGameState(1);
    const hand: CardT[] = [
      { suit: "H", rank: 2, id: "H2" },
      { suit: "S", rank: 14, id: "S14" },
    ];
    const lead: PlayT[] = [{ seat: "Left", card: { suit: "H", rank: 10, id: "H10" } }];
    const state = { ...base, hands: { ...base.hands, Me: hand }, leader: "Left", turn: "Me", trick: lead };
    expect(isPlayLegal({ state, seat: "Me", card: hand[1], trump })).toBe(false);
  });
});
