import { describe, expect, it } from "vitest";
import { chooseCardToPlay } from "../ai/random";
import { shouldRunAi } from "../ai/logic";
import { canAdvanceTrick, canPlayCard } from "../flow";
import { chooseCardToPlayForBid } from "../ai/bidFocus";
import { estimateBid } from "../ai/bidHeuristic";
import type { CardT, TrumpConfig } from "../types";

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

  it("blocks AI when bidding is active and incomplete", () => {
    const should = shouldRunAi({
      aiEnabled: true,
      biddingActive: true,
      biddingComplete: false,
      isResolving: false,
      handComplete: false,
      awaitContinue: false,
      isViewingHistory: false,
      turn: "Left",
      aiPlayMe: false,
      leadPromptActive: false,
      suitCountPromptActive: false,
      trickLength: 0,
      leader: "Left",
    });
    expect(should).toBe(false);
  });

  it("allows AI when bidding is complete and other gates are clear", () => {
    const should = shouldRunAi({
      aiEnabled: true,
      biddingActive: true,
      biddingComplete: true,
      isResolving: false,
      handComplete: false,
      awaitContinue: false,
      isViewingHistory: false,
      turn: "Left",
      aiPlayMe: false,
      leadPromptActive: false,
      suitCountPromptActive: false,
      trickLength: 0,
      leader: "Left",
    });
    expect(should).toBe(true);
  });

  it("blocks AI when it is my turn and aiPlayMe is off", () => {
    const should = shouldRunAi({
      aiEnabled: true,
      biddingActive: false,
      biddingComplete: true,
      isResolving: false,
      handComplete: false,
      awaitContinue: false,
      isViewingHistory: false,
      turn: "Me",
      aiPlayMe: false,
      leadPromptActive: false,
      suitCountPromptActive: false,
      trickLength: 1,
      leader: "Me",
    });
    expect(should).toBe(false);
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
    expect(decision?.cardId).toBe("S2");
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

  it("estimates higher bids for stronger hands", () => {
    const strong: CardT[] = [
      { suit: "S", rank: 14, id: "S14" },
      { suit: "H", rank: 13, id: "H13" },
      { suit: "D", rank: 12, id: "D12" },
      { suit: "C", rank: 11, id: "C11" },
      { suit: "S", rank: 10, id: "S10" },
      { suit: "S", rank: 9, id: "S9" },
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
});
