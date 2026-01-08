import { SEATS, SUITS, type Rank, type Seat, type Suit, type TrumpConfig } from "@/engine/types";

export type Settings = {
  dealSeed: number;
  seedInput: string;
  seedHistory: number[];
  modeOpenHandVerify: boolean;
  voidTrackingEnabled: boolean;
  voidTrackingSuits: Suit[];
  voidPromptSkipLowImpact: boolean;
  darkMode: boolean;
  suitCountPromptEnabled: boolean;
  suitCountPromptSuits: Suit[];
  suitCountSkipSelfOffSuit: boolean;
  checkErrorsEnabled: boolean;
  voidPromptScope: "global" | "per-suit";
  suitOrderMode: "bridge" | "poker";
  sortAscending: boolean;
  suitStyleMode: "classic" | "distinct";
  aiEnabled: boolean;
  aiMode: "random" | "bidding";
  aiDelayMs: number;
  pauseBeforeNextTrick: boolean;
  aiPlayMe: boolean;
  seatLabelMode: "relative" | "compass";
  firstSeat: Seat;
  firstSeatRandom: boolean;
  winIntentPromptEnabled: boolean;
  winIntentWarnTrump: boolean;
  winIntentWarnHonorsOnly: boolean;
  winIntentMinRank: Rank;
  voidPromptOnlyWhenLeading: boolean;
  settingsOpen: boolean;
  trump: TrumpConfig;
};

export function loadSettings(storageKey: string): Partial<Settings> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const data = JSON.parse(raw) as Record<string, unknown>;
    const next: Partial<Settings> = {};
    if (typeof data.dealSeed === "number" && Number.isFinite(data.dealSeed) && data.dealSeed >= 0) {
      next.dealSeed = Math.floor(data.dealSeed) >>> 0;
    }
    if (typeof data.seedInput === "string") next.seedInput = data.seedInput;
    if (Array.isArray(data.seedHistory)) {
      next.seedHistory = data.seedHistory.filter(
        (value): value is number => typeof value === "number" && Number.isFinite(value)
      );
    }
    if (typeof data.modeOpenHandVerify === "boolean") next.modeOpenHandVerify = data.modeOpenHandVerify;
    if (typeof data.voidTrackingEnabled === "boolean") next.voidTrackingEnabled = data.voidTrackingEnabled;
    if (Array.isArray(data.voidTrackingSuits)) {
      next.voidTrackingSuits = data.voidTrackingSuits.filter((s): s is Suit => SUITS.includes(s as Suit));
    }
    if (typeof data.voidPromptSkipLowImpact === "boolean") {
      next.voidPromptSkipLowImpact = data.voidPromptSkipLowImpact;
    }
    if (typeof data.darkMode === "boolean") next.darkMode = data.darkMode;
    if (typeof data.suitCountPromptEnabled === "boolean") next.suitCountPromptEnabled = data.suitCountPromptEnabled;
    if (Array.isArray(data.suitCountPromptSuits)) {
      next.suitCountPromptSuits = data.suitCountPromptSuits.filter((s): s is Suit => SUITS.includes(s as Suit));
    }
    if (typeof data.suitCountSkipSelfOffSuit === "boolean") {
      next.suitCountSkipSelfOffSuit = data.suitCountSkipSelfOffSuit;
    }
    if (typeof data.checkErrorsEnabled === "boolean") next.checkErrorsEnabled = data.checkErrorsEnabled;
    if (data.voidPromptScope === "global" || data.voidPromptScope === "per-suit") {
      next.voidPromptScope = data.voidPromptScope;
    }
    if (data.suitOrderMode === "bridge" || data.suitOrderMode === "poker") {
      next.suitOrderMode = data.suitOrderMode;
    }
    if (data.suitStyleMode === "classic" || data.suitStyleMode === "distinct") {
      next.suitStyleMode = data.suitStyleMode;
    }
    if (typeof data.sortAscending === "boolean") next.sortAscending = data.sortAscending;
    if (typeof data.aiEnabled === "boolean") next.aiEnabled = data.aiEnabled;
    if (data.aiMode === "random" || data.aiMode === "bidding") next.aiMode = data.aiMode;
    if (typeof data.aiDelayMs === "number" && Number.isFinite(data.aiDelayMs) && data.aiDelayMs >= 0) {
      next.aiDelayMs = Math.floor(data.aiDelayMs);
    }
    if (typeof data.pauseBeforeNextTrick === "boolean") {
      next.pauseBeforeNextTrick = data.pauseBeforeNextTrick;
    }
    if (typeof data.aiPlayMe === "boolean") next.aiPlayMe = data.aiPlayMe;
    if (data.seatLabelMode === "relative" || data.seatLabelMode === "compass") {
      next.seatLabelMode = data.seatLabelMode;
    }
    if (typeof data.firstSeat === "string" && SEATS.includes(data.firstSeat as Seat)) {
      next.firstSeat = data.firstSeat as Seat;
    }
    if (typeof data.firstSeatRandom === "boolean") {
      next.firstSeatRandom = data.firstSeatRandom;
    }
    if (typeof data.winIntentPromptEnabled === "boolean") {
      next.winIntentPromptEnabled = data.winIntentPromptEnabled;
    }
    if (typeof data.winIntentWarnTrump === "boolean") {
      next.winIntentWarnTrump = data.winIntentWarnTrump;
    }
    if (typeof data.winIntentWarnHonorsOnly === "boolean") {
      next.winIntentWarnHonorsOnly = data.winIntentWarnHonorsOnly;
    }
    if (typeof data.winIntentMinRank === "number") {
      const value = Math.floor(data.winIntentMinRank) as Rank;
      if (value >= 2 && value <= 14) next.winIntentMinRank = value;
    }
    if (typeof data.voidPromptOnlyWhenLeading === "boolean") {
      next.voidPromptOnlyWhenLeading = data.voidPromptOnlyWhenLeading;
    }
    if (typeof data.settingsOpen === "boolean") {
      next.settingsOpen = data.settingsOpen;
    }
    if (typeof data.trump === "object" && data.trump) {
      const t = data.trump as Record<string, unknown>;
      if (
        typeof t.enabled === "boolean" &&
        typeof t.mustBreak === "boolean" &&
        typeof t.suit === "string" &&
        SUITS.includes(t.suit as Suit)
      ) {
        next.trump = { enabled: t.enabled, mustBreak: t.mustBreak, suit: t.suit as Suit };
      }
    }
    return next;
  } catch {
    return {};
  }
}

export function persistSettings(storageKey: string, settings: Settings) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch {
    // Ignore storage errors (quota, private mode).
  }
}
