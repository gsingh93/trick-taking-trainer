import type { Seat } from "../types";

export type AiGate = {
  aiEnabled: boolean;
  biddingActive: boolean;
  biddingComplete: boolean;
  isResolving: boolean;
  handComplete: boolean;
  awaitContinue: boolean;
  isViewingHistory: boolean;
  turn: Seat;
  aiPlayMe: boolean;
  leadPromptActive: boolean;
  suitCountPromptActive: boolean;
  trickLength: number;
  leader: Seat;
};

export function shouldRunAi(args: AiGate): boolean {
  if (!args.aiEnabled) return false;
  if (args.biddingActive && !args.biddingComplete) return false;
  if (args.isResolving) return false;
  if (args.handComplete) return false;
  if (args.awaitContinue) return false;
  if (args.isViewingHistory) return false;
  if (args.turn === "Me" && !args.aiPlayMe) return false;
  if (args.leadPromptActive) return false;
  if (args.suitCountPromptActive) return false;
  if (args.trickLength === 0 && args.turn !== args.leader) return false;
  return true;
}
