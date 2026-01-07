import { describe, expect, it } from "vitest";
import { createVoidGrid } from "../state";
import {
  getVoidPromptLead,
  getSuitCountPromptSuit,
  shouldPromptWinIntent,
  type PromptContext,
  type SuitCountContext,
  type SuitCountSettings,
  type VoidPromptEligibilityArgs,
  type VoidTrackingSettings,
  type WinIntentEligibilityArgs,
  type WinIntentSettings,
} from "../prompts";
import type { CardT, PlayT, Rank, Seat, Suit, TrumpConfig } from "../types";

const noTrump: TrumpConfig = { enabled: false, suit: "S", mustBreak: true };

function buildHands(meCards: CardT[]): Record<Seat, CardT[]> {
  return { Me: meCards, Left: [], Across: [], Right: [] };
}

function makeCard(suit: Suit, rank: Rank, id: string): CardT {
  return { suit, rank, id };
}

function makePlay(seat: Seat, card: CardT): PlayT {
  return { seat, card };
}

function baseVoidArgs(): VoidPromptEligibilityArgs {
  const actualVoid = createVoidGrid();
  actualVoid.Across.H = true;
  const context: PromptContext = {
    trick: [makePlay("Left", makeCard("H", 2, "H2"))],
    trickNo: 2,
    hands: buildHands([makeCard("H", 9, "H9")]),
    trump: noTrump,
    actualVoid,
  };
  const settings: VoidTrackingSettings = {
    enabled: true,
    suits: ["S", "H", "D", "C"] as Suit[],
    skipLowImpact: false,
    onlyWhenLeading: false,
    promptScope: "per-suit",
  };
  return {
    context,
    settings,
    anyVoidObserved: false,
  };
}

describe("getVoidPromptLead", () => {
  it("returns null when the lead suit is not tracked", () => {
    const args = {
      ...baseVoidArgs(),
      settings: { ...baseVoidArgs().settings, suits: ["S"] as Suit[] },
    };
    expect(getVoidPromptLead(args)).toBeNull();
  });

  it("returns null when only prompting when leading and an opponent led", () => {
    const args = {
      ...baseVoidArgs(),
      settings: { ...baseVoidArgs().settings, onlyWhenLeading: true },
    };
    expect(getVoidPromptLead(args)).toBeNull();
  });

  it("returns a lead when only prompting when leading and you led", () => {
    const args = {
      ...baseVoidArgs(),
      settings: { ...baseVoidArgs().settings, onlyWhenLeading: true },
      context: { ...baseVoidArgs().context, trick: [makePlay("Me", makeCard("H", 2, "H2"))] },
    };
    expect(getVoidPromptLead(args)).toEqual({ leadSeat: "Me", leadSuit: "H" });
  });

  it("returns null when low-impact skip applies", () => {
    const args = {
      ...baseVoidArgs(),
      settings: { ...baseVoidArgs().settings, skipLowImpact: true },
      context: {
        ...baseVoidArgs().context,
        trick: [makePlay("Left", makeCard("H", 2, "H2"))],
        hands: buildHands([makeCard("C", 9, "C9")]),
      },
    };
    expect(getVoidPromptLead(args)).toBeNull();
  });

  it("returns a lead when low-impact skip is enabled but you can follow or trump", () => {
    const args = {
      ...baseVoidArgs(),
      settings: { ...baseVoidArgs().settings, skipLowImpact: true },
      context: {
        ...baseVoidArgs().context,
        trick: [makePlay("Across", makeCard("H", 2, "H2"))],
        hands: buildHands([makeCard("H", 9, "H9")]),
      },
    };
    expect(getVoidPromptLead(args)).toEqual({ leadSeat: "Across", leadSuit: "H" });
  });

  it("returns a lead when per-suit voids exist", () => {
    const args = baseVoidArgs();
    expect(getVoidPromptLead(args)).toEqual({ leadSeat: "Left", leadSuit: "H" });
  });

  it("returns a lead when global voids are observed", () => {
    const args = {
      ...baseVoidArgs(),
      settings: { ...baseVoidArgs().settings, promptScope: "global" as const },
      anyVoidObserved: true,
    };
    expect(getVoidPromptLead(args)).toEqual({ leadSeat: "Left", leadSuit: "H" });
  });
});

function baseWinIntentArgs(): WinIntentEligibilityArgs {
  const honorRemainingBySuit: Record<Suit, Rank[]> = { S: [], H: [11, 12, 13, 14], D: [], C: [] };
  const context: PromptContext = {
    trick: [makePlay("Left", makeCard("H", 9, "H9"))],
    trickNo: 2,
    hands: buildHands([makeCard("H", 12, "H12")]),
    trump: noTrump,
    actualVoid: createVoidGrid(),
  };
  const settings: WinIntentSettings = {
    enabled: true,
    minRank: 10,
    warnHonorsOnly: true,
    warnTrump: true,
  };
  return {
    context,
    card: makeCard("H", 12, "H12"),
    seat: "Me",
    aiPlayMe: false,
    honorRemainingBySuit,
    settings,
  };
}

describe("shouldPromptWinIntent", () => {
  it("returns false when disabled", () => {
    const args = {
      ...baseWinIntentArgs(),
      settings: { ...baseWinIntentArgs().settings, enabled: false },
    };
    expect(shouldPromptWinIntent(args)).toBe(false);
  });

  it("returns false when not playing as Me", () => {
    const args = { ...baseWinIntentArgs(), seat: "Left" as Seat };
    expect(shouldPromptWinIntent(args)).toBe(false);
  });

  it("returns false when the trick is nearly complete", () => {
    const trick: PlayT[] = [
      makePlay("Left", makeCard("H", 9, "H9")),
      makePlay("Across", makeCard("H", 10, "H10")),
      makePlay("Right", makeCard("H", 11, "H11")),
    ];
    const args = {
      ...baseWinIntentArgs(),
      context: { ...baseWinIntentArgs().context, trick },
    };
    expect(shouldPromptWinIntent(args)).toBe(false);
  });

  it("returns false when the hand is on trick one", () => {
    const args = {
      ...baseWinIntentArgs(),
      context: { ...baseWinIntentArgs().context, trickNo: 1 },
    };
    expect(shouldPromptWinIntent(args)).toBe(false);
  });

  it("returns false when the card is below the minimum rank", () => {
    const args = {
      ...baseWinIntentArgs(),
      card: makeCard("H", 9, "H9"),
    };
    expect(shouldPromptWinIntent(args)).toBe(false);
  });

  it("returns false when an ace is led and no remaining players are void", () => {
    const args = { ...baseWinIntentArgs(), card: makeCard("H", 14, "H14") };
    expect(shouldPromptWinIntent(args)).toBe(false);
  });

  it("returns false when higher honors are all in hand", () => {
    const args = {
      ...baseWinIntentArgs(),
      card: makeCard("H", 10, "H10"),
      context: {
        ...baseWinIntentArgs().context,
        hands: buildHands([
          makeCard("H", 10, "H10"),
          makeCard("H", 11, "H11"),
          makeCard("H", 12, "H12"),
          makeCard("H", 13, "H13"),
          makeCard("H", 14, "H14"),
        ]),
      },
    };
    expect(shouldPromptWinIntent(args)).toBe(false);
  });

  it("returns true when honors are held but higher non-honors remain", () => {
    const args = {
      ...baseWinIntentArgs(),
      card: makeCard("H", 9, "H9"),
      context: {
        ...baseWinIntentArgs().context,
        trick: [makePlay("Left", makeCard("H", 5, "H5"))],
        hands: buildHands([
          makeCard("H", 9, "H9"),
          makeCard("H", 11, "H11"),
          makeCard("H", 12, "H12"),
          makeCard("H", 13, "H13"),
          makeCard("H", 14, "H14"),
        ]),
      },
      settings: {
        ...baseWinIntentArgs().settings,
        warnHonorsOnly: false,
        minRank: 9 as Rank,
      },
    };
    expect(shouldPromptWinIntent(args)).toBe(true);
  });

  it("returns false when higher cards are all in hand with non-honor warnings", () => {
    const args = {
      ...baseWinIntentArgs(),
      card: makeCard("H", 9, "H9"),
      context: {
        ...baseWinIntentArgs().context,
        trick: [makePlay("Left", makeCard("H", 5, "H5"))],
        hands: buildHands([
          makeCard("H", 9, "H9"),
          makeCard("H", 10, "H10"),
          makeCard("H", 11, "H11"),
          makeCard("H", 12, "H12"),
          makeCard("H", 13, "H13"),
          makeCard("H", 14, "H14"),
        ]),
      },
      settings: {
        ...baseWinIntentArgs().settings,
        warnHonorsOnly: false,
        minRank: 9 as Rank,
      },
    };
    expect(shouldPromptWinIntent(args)).toBe(false);
  });

  it("returns false when already losing the trick", () => {
    const args = {
      ...baseWinIntentArgs(),
      card: makeCard("H", 10, "H10"),
      context: {
        ...baseWinIntentArgs().context,
        trick: [makePlay("Left", makeCard("H", 13, "H13"))],
      },
    };
    expect(shouldPromptWinIntent(args)).toBe(false);
  });

  it("returns false when a later trick card overtakes the lead", () => {
    const args = {
      ...baseWinIntentArgs(),
      card: makeCard("H", 10, "H10"),
      context: {
        ...baseWinIntentArgs().context,
        trick: [
          makePlay("Left", makeCard("H", 9, "H9")),
          makePlay("Across", makeCard("H", 12, "H12")),
        ],
      },
    };
    expect(shouldPromptWinIntent(args)).toBe(false);
  });

  it("returns false when remaining players are all void in the suit", () => {
    const actualVoid = createVoidGrid();
    actualVoid.Across.H = true;
    actualVoid.Right.H = true;
    const args = {
      ...baseWinIntentArgs(),
      card: makeCard("H", 12, "H12"),
      context: {
        ...baseWinIntentArgs().context,
        trick: [makePlay("Left", makeCard("H", 9, "H9"))],
        actualVoid,
      },
    };
    expect(shouldPromptWinIntent(args)).toBe(false);
  });

  it("returns true for a normal mid-trick play above the threshold", () => {
    const args = baseWinIntentArgs();
    expect(shouldPromptWinIntent(args)).toBe(true);
  });
});

function baseSuitCountArgs() {
  const context: SuitCountContext = {
    trickHistory: [],
    trick: [
      makePlay("Left", makeCard("H", 2, "H2")),
      makePlay("Across", makeCard("C", 9, "C9")),
    ],
    selfSeat: "Me",
  };
  const settings: SuitCountSettings = {
    enabled: true,
    suits: ["S", "H", "D", "C"] as Suit[],
    skipIfSelfOffSuit: false,
  };
  return { context, settings };
}

describe("getSuitCountPromptSuit", () => {
  it("returns null when disabled", () => {
    const args = { ...baseSuitCountArgs(), settings: { ...baseSuitCountArgs().settings, enabled: false } };
    expect(getSuitCountPromptSuit(args)).toBeNull();
  });

  it("returns null when the suit is not tracked", () => {
    const args = { ...baseSuitCountArgs(), settings: { ...baseSuitCountArgs().settings, suits: ["S"] as Suit[] } };
    expect(getSuitCountPromptSuit(args)).toBeNull();
  });

  it("returns the lead suit when the first off-suit occurs", () => {
    const args = baseSuitCountArgs();
    expect(getSuitCountPromptSuit(args)).toBe("H");
  });
});
