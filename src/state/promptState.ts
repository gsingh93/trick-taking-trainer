import type { Dispatch, SetStateAction } from "react";
import type { GameState } from "@/engine/state";
import type { BidState } from "@/engine/phase/bidding";
import type { CardT, Opp, Seat, Suit } from "@/engine/types";

export type VoidSelections = Record<Opp, boolean>;

export const createVoidSelections = (): VoidSelections => ({
  Left: false,
  Across: false,
  Right: false,
});

export type PromptResetters = {
  setLeadPromptActive: (value: boolean) => void;
  setLeadPromptSuit: (value: Suit | null) => void;
  setLeadPromptLeader: (value: Opp | null) => void;
  setLeadSelections: (value: VoidSelections) => void;
  setLeadMismatch: (value: VoidSelections) => void;
  setLeadWarning: (value: string | null) => void;
  setSuitCountPromptActive: (value: boolean) => void;
  setSuitCountPromptSuit: (value: Suit | null) => void;
  setSuitCountAnswer: (value: string) => void;
  setSuitCountMismatch: (value: boolean) => void;
  setPendingIntentCard: (value: CardT | null) => void;
  setIntentWarning: (value: string | null) => void;
  setIntentDetails: (value: string[]) => void;
};

export function resetVoidPrompt(actions: PromptResetters) {
  actions.setLeadPromptActive(false);
  actions.setLeadPromptSuit(null);
  actions.setLeadPromptLeader(null);
  actions.setLeadSelections(createVoidSelections());
  actions.setLeadMismatch(createVoidSelections());
  actions.setLeadWarning(null);
}

export function resetSuitCountPrompt(actions: PromptResetters) {
  actions.setSuitCountPromptActive(false);
  actions.setSuitCountPromptSuit(null);
  actions.setSuitCountAnswer("0");
  actions.setSuitCountMismatch(false);
}

export function resetWinIntentPrompt(actions: PromptResetters) {
  actions.setPendingIntentCard(null);
  actions.setIntentWarning(null);
  actions.setIntentDetails([]);
}

export type DealResetArgs = {
  setDealSeed: (value: number) => void;
  setSeedInput: (value: string) => void;
  setSeedError: (value: string | null) => void;
  setGame: (value: GameState) => void;
  setBidState: Dispatch<SetStateAction<BidState | null>>;
  setLeadPromptActive: (value: boolean) => void;
  setSuitCountPromptActive: (value: boolean) => void;
  setPendingIntentCard: (value: CardT | null) => void;
  setIntentWarning: (value: string | null) => void;
  setIntentDetails: (value: string[]) => void;
  setPeekPrompt: (value: null) => void;
  setAwaitContinue: (value: boolean) => void;
  setBidInput: (value: string) => void;
  setReveal: (value: Record<Seat, boolean>) => void;
  makeSeededGame: (seed: number) => GameState;
};

export function resetForDeal(seed: number, args: DealResetArgs) {
  args.setDealSeed(seed);
  args.setSeedInput(String(seed));
  args.setSeedError(null);
  args.setGame(args.makeSeededGame(seed));
  args.setBidState(null);
  args.setLeadPromptActive(false);
  args.setSuitCountPromptActive(false);
  args.setPendingIntentCard(null);
  args.setIntentWarning(null);
  args.setIntentDetails([]);
  args.setPeekPrompt(null);
  args.setAwaitContinue(false);
  args.setBidInput("0");
  args.setReveal({ Left: false, Across: false, Right: false, Me: true });
}
