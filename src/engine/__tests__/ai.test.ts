import { describe, expect, it } from "vitest";
import { chooseCardToPlay } from "../ai/random";
import { shouldRunAi } from "../ai/logic";
import { canAdvanceTrick, canPlayCard } from "../flow";

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
      trickLength: 1,
      leader: "Me",
    });
    expect(should).toBe(false);
  });

  it("canPlayCard blocks play during bidding or pauses", () => {
    expect(
      canPlayCard({
        leadPromptActive: false,
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
});
