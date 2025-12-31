import { describe, expect, it } from "vitest";
import { createVoidGrid } from "../state";
import { getVoidPromptLead, shouldPromptWinIntent, type VoidPromptEligibilityArgs, type WinIntentEligibilityArgs } from "../prompts";
import type { CardT, PlayT, Rank, Seat, Suit, TrumpConfig } from "../types";

const noTrump: TrumpConfig = { enabled: false, suit: "S", mustBreak: true };

function buildHands(meCards: CardT[]): Record<Seat, CardT[]> {
  return { Me: meCards, Left: [], Across: [], Right: [] };
}

function baseVoidArgs(): VoidPromptEligibilityArgs {
  const actualVoid = createVoidGrid();
  actualVoid.Across.H = true;
  return {
    voidTrackingEnabled: true,
    voidTrackingSuits: ["S", "H", "D", "C"],
    voidPromptSkipLowImpact: false,
    voidPromptOnlyWhenLeading: false,
    voidPromptScope: "per-suit",
    trick: [{ seat: "Left", card: { suit: "H", rank: 2, id: "H2" } }],
    trickNo: 2,
    hands: buildHands([{ suit: "H", rank: 9, id: "H9" }]),
    trump: noTrump,
    anyVoidObserved: false,
    actualVoid,
  };
}

describe("getVoidPromptLead", () => {
  it("returns null when the lead suit is not tracked", () => {
    const args = { ...baseVoidArgs(), voidTrackingSuits: ["S"] };
    expect(getVoidPromptLead(args)).toBeNull();
  });

  it("returns null when only prompting when leading and an opponent led", () => {
    const args = { ...baseVoidArgs(), voidPromptOnlyWhenLeading: true };
    expect(getVoidPromptLead(args)).toBeNull();
  });

  it("returns null when low-impact skip applies", () => {
    const args = {
      ...baseVoidArgs(),
      voidPromptSkipLowImpact: true,
      trick: [{ seat: "Left", card: { suit: "H", rank: 2, id: "H2" } }],
      hands: buildHands([{ suit: "C", rank: 9, id: "C9" }]),
    };
    expect(getVoidPromptLead(args)).toBeNull();
  });

  it("returns a lead when per-suit voids exist", () => {
    const args = baseVoidArgs();
    expect(getVoidPromptLead(args)).toEqual({ leadSeat: "Left", leadSuit: "H" });
  });

  it("returns a lead when global voids are observed", () => {
    const args = { ...baseVoidArgs(), voidPromptScope: "global", anyVoidObserved: true };
    expect(getVoidPromptLead(args)).toEqual({ leadSeat: "Left", leadSuit: "H" });
  });
});

function baseWinIntentArgs(): WinIntentEligibilityArgs {
  const honorRemainingBySuit: Record<Suit, Rank[]> = { S: [], H: [11, 12, 13, 14], D: [], C: [] };
  return {
    card: { suit: "H", rank: 12, id: "H12" },
    seat: "Me",
    trick: [{ seat: "Left", card: { suit: "H", rank: 9, id: "H9" } }],
    trickNo: 2,
    winIntentPromptEnabled: true,
    winIntentMinRank: 10,
    aiPlayMe: false,
    honorRemainingBySuit,
    hands: buildHands([{ suit: "H", rank: 12, id: "H12" }]),
    trump: noTrump,
    actualVoid: createVoidGrid(),
  };
}

describe("shouldPromptWinIntent", () => {
  it("returns false when disabled", () => {
    const args = { ...baseWinIntentArgs(), winIntentPromptEnabled: false };
    expect(shouldPromptWinIntent(args)).toBe(false);
  });

  it("returns false when not playing as Me", () => {
    const args = { ...baseWinIntentArgs(), seat: "Left" };
    expect(shouldPromptWinIntent(args)).toBe(false);
  });

  it("returns false when the trick is nearly complete", () => {
    const trick: PlayT[] = [
      { seat: "Left", card: { suit: "H", rank: 9, id: "H9" } },
      { seat: "Across", card: { suit: "H", rank: 10, id: "H10" } },
      { seat: "Right", card: { suit: "H", rank: 11, id: "H11" } },
    ];
    const args = { ...baseWinIntentArgs(), trick };
    expect(shouldPromptWinIntent(args)).toBe(false);
  });

  it("returns false when the hand is on trick one", () => {
    const args = { ...baseWinIntentArgs(), trickNo: 1 };
    expect(shouldPromptWinIntent(args)).toBe(false);
  });

  it("returns false when the card is below the minimum rank", () => {
    const args = { ...baseWinIntentArgs(), card: { suit: "H", rank: 9, id: "H9" } };
    expect(shouldPromptWinIntent(args)).toBe(false);
  });

  it("returns false when an ace is led and no remaining players are void", () => {
    const args = { ...baseWinIntentArgs(), card: { suit: "H", rank: 14, id: "H14" } };
    expect(shouldPromptWinIntent(args)).toBe(false);
  });

  it("returns false when higher honors are all in hand", () => {
    const args = {
      ...baseWinIntentArgs(),
      card: { suit: "H", rank: 10, id: "H10" },
      hands: buildHands([
        { suit: "H", rank: 10, id: "H10" },
        { suit: "H", rank: 11, id: "H11" },
        { suit: "H", rank: 12, id: "H12" },
        { suit: "H", rank: 13, id: "H13" },
        { suit: "H", rank: 14, id: "H14" },
      ]),
    };
    expect(shouldPromptWinIntent(args)).toBe(false);
  });

  it("returns false when already losing the trick", () => {
    const args = {
      ...baseWinIntentArgs(),
      card: { suit: "H", rank: 10, id: "H10" },
      trick: [{ seat: "Left", card: { suit: "H", rank: 13, id: "H13" } }],
    };
    expect(shouldPromptWinIntent(args)).toBe(false);
  });

  it("returns false when remaining players are all void in the suit", () => {
    const actualVoid = createVoidGrid();
    actualVoid.Across.H = true;
    actualVoid.Right.H = true;
    const args = {
      ...baseWinIntentArgs(),
      actualVoid,
      card: { suit: "H", rank: 12, id: "H12" },
      trick: [{ seat: "Left", card: { suit: "H", rank: 9, id: "H9" } }],
    };
    expect(shouldPromptWinIntent(args)).toBe(false);
  });

  it("returns true for a normal mid-trick play above the threshold", () => {
    const args = baseWinIntentArgs();
    expect(shouldPromptWinIntent(args)).toBe(true);
  });
});
