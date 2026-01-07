import type { Seat } from "../types";

export type AiSettings = {
  enabled: boolean;
  playMe: boolean;
};

export type AiDecisionContext = {
  biddingActive: boolean;
  biddingComplete: boolean;
  isResolving: boolean;
  handComplete: boolean;
  awaitContinue: boolean;
  isViewingHistory: boolean;
  turn: Seat;
  leadPromptActive: boolean;
  suitCountPromptActive: boolean;
  trickLength: number;
  leader: Seat;
};

export function shouldRunAi(args: { context: AiDecisionContext; settings: AiSettings }): boolean {
  const { context, settings } = args;
  if (!settings.enabled) return false;
  if (context.biddingActive && !context.biddingComplete) return false;
  if (context.isResolving) return false;
  if (context.handComplete) return false;
  if (context.awaitContinue) return false;
  if (context.isViewingHistory) return false;
  if (context.turn === "Me" && !settings.playMe) return false;
  if (context.leadPromptActive) return false;
  if (context.suitCountPromptActive) return false;
  if (context.trickLength === 0 && context.turn !== context.leader) return false;
  return true;
}
