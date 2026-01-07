import { describe, expect, it } from "vitest";
import { chooseCardToPlay } from "../ai/random";
import { shouldRunAi, type AiDecisionContext, type AiSettings } from "../ai/logic";
import { canAdvanceTrick, canPlayCard } from "../flow";
import { chooseCardToPlayForBid } from "../ai/bidFocus";
import { estimateBid } from "../ai/bidHeuristic";
import type { CardT, TrumpConfig } from "../types";
import { createVoidGrid } from "../state";

describe("ai", () => {
  const baseContext: AiDecisionContext = {
    biddingActive: false,
    biddingComplete: true,
    isResolving: false,
    handComplete: false,
    awaitContinue: false,
    isViewingHistory: false,
    turn: "Left",
    leadPromptActive: false,
    suitCountPromptActive: false,
    trickLength: 1,
    leader: "Left",
  };
  const baseSettings: AiSettings = {
    enabled: true,
    playMe: true,
  };

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

  it("blocks AI when bidding is active and incomplete", () => {
    const should = shouldRunAi({
      context: { ...baseContext, biddingActive: true, biddingComplete: false, trickLength: 0 },
      settings: { ...baseSettings, playMe: false },
    });
    expect(should).toBe(false);
  });

  it("allows AI when bidding is complete and other gates are clear", () => {
    const should = shouldRunAi({
      context: { ...baseContext, biddingActive: true, biddingComplete: true, trickLength: 0 },
      settings: { ...baseSettings, playMe: false },
    });
    expect(should).toBe(true);
  });

  it("blocks AI when it is my turn and aiPlayMe is off", () => {
    const should = shouldRunAi({
      context: { ...baseContext, turn: "Me", leader: "Me" },
      settings: { ...baseSettings, playMe: false },
    });
    expect(should).toBe(false);
  });

  it("blocks AI when awaiting continue or resolving or history view is active", () => {
    expect(
      shouldRunAi({
        context: { ...baseContext, isResolving: true },
        settings: baseSettings,
      })
    ).toBe(false);
    expect(
      shouldRunAi({
        context: { ...baseContext, awaitContinue: true },
        settings: baseSettings,
      })
    ).toBe(false);
    expect(
      shouldRunAi({
        context: { ...baseContext, isViewingHistory: true },
        settings: baseSettings,
      })
    ).toBe(false);
  });

  it("blocks AI when prompts are active or when turn/leader mismatch at trick start", () => {
    expect(
      shouldRunAi({
        context: { ...baseContext, leadPromptActive: true },
        settings: baseSettings,
      })
    ).toBe(false);
    expect(
      shouldRunAi({
        context: { ...baseContext, suitCountPromptActive: true },
        settings: baseSettings,
      })
    ).toBe(false);
    expect(
      shouldRunAi({
        context: { ...baseContext, turn: "Across", trickLength: 0, leader: "Left" },
        settings: baseSettings,
      })
    ).toBe(false);
  });

  it("canPlayCard blocks play during bidding or pauses", () => {
    expect(
      canPlayCard({
        leadPromptActive: false,
        suitCountPromptActive: false,
        awaitContinue: true,
        handComplete: false,
        isViewingHistory: false,
        biddingActive: false,
        biddingComplete: true,
      })
    ).toBe(false);
    expect(
      canPlayCard({
        leadPromptActive: false,
        suitCountPromptActive: false,
        awaitContinue: false,
        handComplete: false,
        isViewingHistory: false,
        biddingActive: true,
        biddingComplete: false,
      })
    ).toBe(false);
  });

  it("canAdvanceTrick only allows advance while awaiting continue", () => {
    expect(
      canAdvanceTrick({
        awaitContinue: true,
        handComplete: false,
        isViewingHistory: false,
      })
    ).toBe(true);
    expect(
      canAdvanceTrick({
        awaitContinue: false,
        handComplete: false,
        isViewingHistory: false,
      })
    ).toBe(false);
  });

  it("chooses trump when it needs tricks and is leading", () => {
    const decision = chooseCardToPlayForBid(
      {
        seat: "Left",
        hand: [
          { suit: "S", rank: 2, id: "S2" },
          { suit: "H", rank: 14, id: "H14" },
        ],
        legalIds: new Set(["S2", "H14"]),
        trick: [],
        leader: "Left",
        trump: { enabled: true, suit: "S", mustBreak: true },
        tricksWon: { Left: 0, Across: 0, Right: 0, Me: 0 },
        bid: 2,
      },
      () => 0
    );
    expect(decision?.cardId).toBe("H14");
  });

  it("avoids trump when it has already met the bid", () => {
    const decision = chooseCardToPlayForBid(
      {
        seat: "Left",
        hand: [
          { suit: "S", rank: 2, id: "S2" },
          { suit: "H", rank: 3, id: "H3" },
        ],
        legalIds: new Set(["S2", "H3"]),
        trick: [],
        leader: "Left",
        trump: { enabled: true, suit: "S", mustBreak: true },
        tricksWon: { Left: 1, Across: 0, Right: 0, Me: 0 },
        bid: 1,
      },
      () => 0
    );
    expect(decision?.cardId).toBe("H3");
  });

  it("leads the shortest non-trump suit when it needs tricks", () => {
    const decision = chooseCardToPlayForBid(
      {
        seat: "Left",
        hand: [
          { suit: "H", rank: 2, id: "H2" },
          { suit: "D", rank: 3, id: "D3" },
          { suit: "D", rank: 9, id: "D9" },
          { suit: "S", rank: 5, id: "S5" },
        ],
        legalIds: new Set(["H2", "D3", "D9", "S5"]),
        trick: [],
        leader: "Left",
        trump: { enabled: true, suit: "S", mustBreak: true },
        tricksWon: { Left: 0, Across: 0, Right: 0, Me: 0 },
        bid: 2,
      },
      () => 0
    );
    expect(decision?.cardId).toBe("H2");
  });

  it("leads the highest card in the strongest non-trump suit when not short", () => {
    const decision = chooseCardToPlayForBid(
      {
        seat: "Left",
        hand: [
          { suit: "H", rank: 9, id: "H9" },
          { suit: "H", rank: 12, id: "H12" },
          { suit: "H", rank: 3, id: "H3" },
          { suit: "D", rank: 11, id: "D11" },
          { suit: "D", rank: 10, id: "D10" },
          { suit: "D", rank: 4, id: "D4" },
          { suit: "C", rank: 2, id: "C2" },
          { suit: "C", rank: 3, id: "C3" },
          { suit: "C", rank: 4, id: "C4" },
          { suit: "S", rank: 5, id: "S5" },
        ],
        legalIds: new Set([
          "H9",
          "H12",
          "H3",
          "D11",
          "D10",
          "D4",
          "C2",
          "C3",
          "C4",
          "S5",
        ]),
        trick: [],
        leader: "Left",
        trump: { enabled: true, suit: "S", mustBreak: true },
        tricksWon: { Left: 0, Across: 0, Right: 0, Me: 0 },
        bid: 2,
      },
      () => 0
    );
    expect(decision?.cardId).toBe("H12");
  });

  it("leads the highest trump when only trump remains and it holds the ace", () => {
    const decision = chooseCardToPlayForBid(
      {
        seat: "Left",
        hand: [
          { suit: "S", rank: 14, id: "S14" },
          { suit: "S", rank: 2, id: "S2" },
        ],
        legalIds: new Set(["S14", "S2"]),
        trick: [],
        leader: "Left",
        trump: { enabled: true, suit: "S", mustBreak: true },
        tricksWon: { Left: 0, Across: 0, Right: 0, Me: 0 },
        bid: 1,
      },
      () => 0
    );
    expect(decision?.cardId).toBe("S14");
  });

  it("leads the lowest trump when only trump remains without the ace", () => {
    const decision = chooseCardToPlayForBid(
      {
        seat: "Left",
        hand: [
          { suit: "S", rank: 12, id: "S12" },
          { suit: "S", rank: 3, id: "S3" },
        ],
        legalIds: new Set(["S12", "S3"]),
        trick: [],
        leader: "Left",
        trump: { enabled: true, suit: "S", mustBreak: true },
        tricksWon: { Left: 0, Across: 0, Right: 0, Me: 0 },
        bid: 1,
      },
      () => 0
    );
    expect(decision?.cardId).toBe("S3");
  });

  it("dumps the highest losing card when it has met the bid", () => {
    const decision = chooseCardToPlayForBid(
      {
        seat: "Left",
        hand: [
          { suit: "S", rank: 7, id: "S7" },
          { suit: "S", rank: 10, id: "S10" },
        ],
        legalIds: new Set(["S7", "S10"]),
        trick: [
          { seat: "Across", card: { suit: "S", rank: 14, id: "S14" } },
          { seat: "Right", card: { suit: "S", rank: 9, id: "S9" } },
        ],
        leader: "Across",
        trump: { enabled: true, suit: "S", mustBreak: true },
        tricksWon: { Left: 3, Across: 0, Right: 0, Me: 0 },
        bid: 3,
      },
      () => 0
    );
    expect(decision?.cardId).toBe("S10");
  });

  it("plays the lowest card when it still needs tricks", () => {
    const decision = chooseCardToPlayForBid(
      {
        seat: "Left",
        hand: [
          { suit: "S", rank: 6, id: "S6" },
          { suit: "S", rank: 10, id: "S10" },
        ],
        legalIds: new Set(["S6", "S10"]),
        trick: [
          { seat: "Across", card: { suit: "C", rank: 6, id: "C6" } },
          { seat: "Right", card: { suit: "C", rank: 4, id: "C4" } },
          { seat: "Me", card: { suit: "S", rank: 12, id: "S12" } },
        ],
        leader: "Across",
        trump: { enabled: true, suit: "S", mustBreak: true },
        tricksWon: { Left: 2, Across: 0, Right: 0, Me: 0 },
        bid: 3,
      },
      () => 0
    );
    expect(decision?.cardId).toBe("S6");
  });

  it("uses the highest winning card when it safely completes the bid", () => {
    const decision = chooseCardToPlayForBid(
      {
        seat: "Left",
        hand: [
          { suit: "S", rank: 6, id: "S6" },
          { suit: "S", rank: 10, id: "S10" },
        ],
        legalIds: new Set(["S6", "S10"]),
        trick: [
          { seat: "Across", card: { suit: "C", rank: 6, id: "C6" } },
          { seat: "Right", card: { suit: "C", rank: 4, id: "C4" } },
          { seat: "Me", card: { suit: "S", rank: 2, id: "S2" } },
        ],
        leader: "Across",
        trump: { enabled: true, suit: "S", mustBreak: true },
        tricksWon: { Left: 2, Across: 0, Right: 0, Me: 0 },
        bid: 3,
      },
      () => 0
    );
    expect(decision?.cardId).toBe("S10");
  });

  it("uses honor history to safely win and shed a high card", () => {
    const decision = chooseCardToPlayForBid(
      {
        seat: "Left",
        hand: [
          { suit: "S", rank: 6, id: "S6" },
          { suit: "S", rank: 10, id: "S10" },
        ],
        legalIds: new Set(["S6", "S10"]),
        trick: [
          { seat: "Across", card: { suit: "S", rank: 5, id: "S5" } },
          { seat: "Right", card: { suit: "S", rank: 4, id: "S4" } },
        ],
        trickHistory: [
          [
            { seat: "Me", card: { suit: "S", rank: 14, id: "S14" } },
            { seat: "Left", card: { suit: "S", rank: 13, id: "S13" } },
            { seat: "Across", card: { suit: "S", rank: 12, id: "S12" } },
            { seat: "Right", card: { suit: "S", rank: 11, id: "S11" } },
          ],
        ],
        leader: "Across",
        trump: { enabled: true, suit: "S", mustBreak: true },
        tricksWon: { Left: 2, Across: 0, Right: 0, Me: 0 },
        bid: 3,
      },
      () => 0
    );
    expect(decision?.cardId).toBe("S10");
  });

  it("falls back to lowest winning card when honors are still unknown", () => {
    const decision = chooseCardToPlayForBid(
      {
        seat: "Left",
        hand: [
          { suit: "S", rank: 6, id: "S6" },
          { suit: "S", rank: 10, id: "S10" },
        ],
        legalIds: new Set(["S6", "S10"]),
        trick: [
          { seat: "Across", card: { suit: "S", rank: 5, id: "S5" } },
          { seat: "Right", card: { suit: "S", rank: 4, id: "S4" } },
        ],
        trickHistory: [
          [
            { seat: "Me", card: { suit: "S", rank: 14, id: "S14" } },
            { seat: "Left", card: { suit: "S", rank: 13, id: "S13" } },
            { seat: "Across", card: { suit: "S", rank: 12, id: "S12" } },
            { seat: "Right", card: { suit: "S", rank: 11, id: "S11" } },
          ],
        ],
        leader: "Across",
        trump: { enabled: true, suit: "S", mustBreak: true },
        tricksWon: { Left: 0, Across: 0, Right: 0, Me: 0 },
        bid: 2,
      },
      () => 0
    );
    expect(decision?.cardId).toBe("S6");
  });

  it("treats trump honors as unsafe when higher trump is unknown", () => {
    const decision = chooseCardToPlayForBid(
      {
        seat: "Left",
        hand: [
          { suit: "S", rank: 6, id: "S6" },
          { suit: "S", rank: 10, id: "S10" },
        ],
        legalIds: new Set(["S6", "S10"]),
        trick: [
          { seat: "Across", card: { suit: "S", rank: 5, id: "S5" } },
          { seat: "Right", card: { suit: "S", rank: 4, id: "S4" } },
        ],
        trickHistory: [
          [
            { seat: "Me", card: { suit: "S", rank: 14, id: "S14" } },
            { seat: "Left", card: { suit: "S", rank: 13, id: "S13" } },
            { seat: "Across", card: { suit: "S", rank: 12, id: "S12" } },
          ],
        ],
        leader: "Across",
        trump: { enabled: true, suit: "S", mustBreak: true },
        tricksWon: { Left: 1, Across: 0, Right: 0, Me: 0 },
        bid: 2,
      },
      () => 0
    );
    expect(decision?.cardId).toBe("S6");
  });

  it("treats lead-suit honors as unsafe when higher lead cards are unknown", () => {
    const decision = chooseCardToPlayForBid(
      {
        seat: "Left",
        hand: [
          { suit: "H", rank: 10, id: "H10" },
          { suit: "H", rank: 6, id: "H6" },
        ],
        legalIds: new Set(["H6", "H10"]),
        trick: [
          { seat: "Across", card: { suit: "H", rank: 5, id: "H5" } },
          { seat: "Right", card: { suit: "H", rank: 4, id: "H4" } },
        ],
        trickHistory: [
          [
            { seat: "Me", card: { suit: "H", rank: 14, id: "H14" } },
            { seat: "Left", card: { suit: "H", rank: 13, id: "H13" } },
          ],
        ],
        leader: "Across",
        trump: { enabled: false, suit: "S", mustBreak: true },
        tricksWon: { Left: 1, Across: 0, Right: 0, Me: 0 },
        bid: 2,
      },
      () => 0
    );
    expect(decision?.cardId).toBe("H6");
  });

  it("treats lead-suit honors as unsafe when trump cards are still unknown", () => {
    const decision = chooseCardToPlayForBid(
      {
        seat: "Left",
        hand: [
          { suit: "H", rank: 10, id: "H10" },
          { suit: "H", rank: 6, id: "H6" },
        ],
        legalIds: new Set(["H6", "H10"]),
        trick: [
          { seat: "Across", card: { suit: "H", rank: 5, id: "H5" } },
          { seat: "Right", card: { suit: "H", rank: 4, id: "H4" } },
        ],
        trickHistory: [
          [
            { seat: "Me", card: { suit: "H", rank: 14, id: "H14" } },
            { seat: "Left", card: { suit: "H", rank: 13, id: "H13" } },
            { seat: "Across", card: { suit: "H", rank: 12, id: "H12" } },
            { seat: "Right", card: { suit: "H", rank: 11, id: "H11" } },
          ],
        ],
        leader: "Across",
        trump: { enabled: true, suit: "S", mustBreak: true },
        tricksWon: { Left: 1, Across: 0, Right: 0, Me: 0 },
        bid: 2,
      },
      () => 0
    );
    expect(decision?.cardId).toBe("H6");
  });

  it("treats off-suit cards as unsafe for honor-safe wins", () => {
    const decision = chooseCardToPlayForBid(
      {
        seat: "Left",
        hand: [
          { suit: "D", rank: 12, id: "D12" },
          { suit: "D", rank: 2, id: "D2" },
        ],
        legalIds: new Set(["D12", "D2"]),
        trick: [
          { seat: "Across", card: { suit: "H", rank: 10, id: "H10" } },
          { seat: "Right", card: { suit: "H", rank: 9, id: "H9" } },
        ],
        trickHistory: [
          [
            { seat: "Me", card: { suit: "D", rank: 14, id: "D14" } },
            { seat: "Left", card: { suit: "D", rank: 13, id: "D13" } },
            { seat: "Across", card: { suit: "D", rank: 11, id: "D11" } },
            { seat: "Right", card: { suit: "D", rank: 10, id: "D10" } },
          ],
        ],
        leader: "Across",
        trump: { enabled: false, suit: "S", mustBreak: true },
        tricksWon: { Left: 1, Across: 0, Right: 0, Me: 0 },
        bid: 2,
      },
      () => 0
    );
    expect(decision?.cardId).toBe("D2");
  });

  it("dumps the highest card when forced to win as last to act", () => {
    const decision = chooseCardToPlayForBid(
      {
        seat: "Left",
        hand: [
          { suit: "S", rank: 11, id: "S11" },
          { suit: "S", rank: 12, id: "S12" },
        ],
        legalIds: new Set(["S11", "S12"]),
        trick: [
          { seat: "Across", card: { suit: "S", rank: 9, id: "S9" } },
          { seat: "Right", card: { suit: "S", rank: 10, id: "S10" } },
          { seat: "Me", card: { suit: "S", rank: 8, id: "S8" } },
        ],
        leader: "Across",
        trump: { enabled: true, suit: "S", mustBreak: true },
        tricksWon: { Left: 2, Across: 0, Right: 0, Me: 0 },
        bid: 2,
      },
      () => 0
    );
    expect(decision?.cardId).toBe("S12");
  });

  it("dumps the highest card early when remaining opponents are void in lead and trump", () => {
    const actualVoid = createVoidGrid();
    actualVoid.Right.S = true;
    const decision = chooseCardToPlayForBid(
      {
        seat: "Me",
        hand: [
          { suit: "S", rank: 10, id: "S10" },
          { suit: "S", rank: 12, id: "S12" },
        ],
        legalIds: new Set(["S10", "S12"]),
        trick: [
          { seat: "Left", card: { suit: "S", rank: 2, id: "S2" } },
          { seat: "Across", card: { suit: "S", rank: 3, id: "S3" } },
        ],
        leader: "Left",
        trump: { enabled: true, suit: "S", mustBreak: true },
        tricksWon: { Left: 0, Across: 0, Right: 0, Me: 2 },
        bid: 2,
        actualVoid,
      },
      () => 0
    );
    expect(decision?.cardId).toBe("S12");
  });

  it("estimates higher bids for stronger hands", () => {
    const strong: CardT[] = [
      { suit: "S", rank: 14, id: "S14" },
      { suit: "S", rank: 13, id: "S13" },
      { suit: "S", rank: 12, id: "S12" },
      { suit: "S", rank: 11, id: "S11" },
      { suit: "S", rank: 10, id: "S10" },
      { suit: "S", rank: 5, id: "S5" },
      { suit: "S", rank: 4, id: "S4" },
      { suit: "S", rank: 3, id: "S3" },
      { suit: "S", rank: 2, id: "S2" },
    ];
    const weak: CardT[] = [
      { suit: "S", rank: 2, id: "S2" },
      { suit: "H", rank: 3, id: "H3" },
      { suit: "D", rank: 4, id: "D4" },
      { suit: "C", rank: 5, id: "C5" },
      { suit: "S", rank: 6, id: "S6" },
      { suit: "H", rank: 7, id: "H7" },
    ];
    const trump: TrumpConfig = { enabled: true, suit: "S", mustBreak: true };
    expect(estimateBid(strong, trump)).toBeGreaterThanOrEqual(estimateBid(weak, trump));
  });

  it("scores non-trump honors with sacrifice logic", () => {
    const noTrump: TrumpConfig = { enabled: false, suit: "S", mustBreak: true };
    const aqDoubleton: CardT[] = [
      { suit: "H", rank: 14, id: "H14" },
      { suit: "H", rank: 12, id: "H12" },
    ];
    const aqx: CardT[] = [
      { suit: "H", rank: 14, id: "H14" },
      { suit: "H", rank: 12, id: "H12" },
      { suit: "H", rank: 3, id: "H3" },
    ];
    const kqDoubleton: CardT[] = [
      { suit: "H", rank: 13, id: "H13" },
      { suit: "H", rank: 12, id: "H12" },
    ];
    const kqx: CardT[] = [
      { suit: "H", rank: 13, id: "H13" },
      { suit: "H", rank: 12, id: "H12" },
      { suit: "H", rank: 4, id: "H4" },
    ];
    expect(estimateBid(aqDoubleton, noTrump)).toBe(1);
    expect(estimateBid(aqx, noTrump)).toBe(2);
    expect(estimateBid(kqDoubleton, noTrump)).toBe(1);
    expect(estimateBid(kqx, noTrump)).toBe(2);
  });

  it("counts trump honors and caps short-suit bonus by leftover sacrifices", () => {
    const trump: TrumpConfig = { enabled: true, suit: "S", mustBreak: true };
    const hand: CardT[] = [
      { suit: "S", rank: 10, id: "S10" },
      { suit: "S", rank: 6, id: "S6" },
      { suit: "S", rank: 5, id: "S5" },
      { suit: "S", rank: 4, id: "S4" },
      { suit: "S", rank: 3, id: "S3" },
      { suit: "S", rank: 2, id: "S2" },
      { suit: "H", rank: 2, id: "H2" }, // singleton
      { suit: "C", rank: 3, id: "C3" }, // doubleton
      { suit: "C", rank: 4, id: "C4" },
    ];
    expect(estimateBid(hand, trump)).toBe(3);
  });
});
