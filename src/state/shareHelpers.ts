import { buildSnapshotText, type SnapshotBuildArgs } from "@/debug/snapshot";
import { encodeSharePayload, type SharePayload } from "@/debug/share";
import type { BidState } from "@/engine/phase/bidding";
import type { GameState } from "@/engine/state";
import type { Seat, TrumpConfig } from "@/engine/types";

export function buildSnapshotTextPayload(args: SnapshotBuildArgs) {
  return buildSnapshotText(args);
}

export async function copyShareLink(payload: SharePayload, onError: (message: string) => void) {
  try {
    const encoded = await encodeSharePayload(payload);
    const url = `${window.location.origin}${window.location.pathname}#state=${encoded}`;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        return;
      } catch {
        // Fallback to execCommand below.
      }
    }
    const textarea = document.createElement("textarea");
    textarea.value = url;
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.left = "-1000px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    if (!ok) {
      onError("Unable to copy share link");
    }
  } catch {
    onError("Unable to build share link");
  }
}

export type ShareApplyActions = {
  cancelResolveTimer: () => void;
  setDealSeed: (value: number) => void;
  setSeedInput: (value: string) => void;
  setGame: (value: GameState) => void;
  setBidState: (value: BidState | null) => void;
  setTrump: (value: TrumpConfig) => void;
  setAiModeLocked: (value: "random" | "bidding") => void;
  setViewedTrickIndex: (value: number | null) => void;
  setViewedTrickStep: (value: number) => void;
  setHistoryPlaying: (value: boolean) => void;
  resetWinIntentPrompt: () => void;
  resetVoidPrompt: () => void;
  resetSuitCountPrompt: () => void;
  setReveal: (value: Record<Seat, boolean>) => void;
  setIsResolving: (value: boolean) => void;
  setAwaitContinue: (value: boolean) => void;
};

export function applySharePayload(payload: SharePayload, actions: ShareApplyActions) {
  actions.cancelResolveTimer();
  actions.setDealSeed(payload.seed);
  actions.setSeedInput(String(payload.seed));
  actions.setGame(payload.game);
  actions.setBidState(payload.bidState);
  actions.setTrump(payload.trump);
  actions.setAiModeLocked(payload.aiMode);
  actions.setViewedTrickIndex(null);
  actions.setViewedTrickStep(0);
  actions.setHistoryPlaying(false);
  actions.resetWinIntentPrompt();
  actions.resetVoidPrompt();
  actions.resetSuitCountPrompt();
  actions.setReveal({ Left: false, Across: false, Right: false, Me: true });
  actions.setIsResolving(false);
  actions.setAwaitContinue(payload.game.trick.length === 4 && !payload.game.handComplete);
}
