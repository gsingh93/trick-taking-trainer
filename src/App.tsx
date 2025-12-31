import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { chooseCardToPlay } from "@/engine/ai/random";
import { shouldRunAi } from "@/engine/ai/logic";
import { canAdvanceTrick, canPlayCard } from "@/engine/flow";
import { chooseCardToPlayForBid } from "@/engine/ai/bidFocus";
import { estimateBid } from "@/engine/ai/bidHeuristic";
import { remainingHonorsInSuit } from "@/engine/training";
import { evaluateWinIntent } from "@/engine/winIntent";
import { trickLeadSuit, determineTrickWinner } from "@/engine/rules";
import { getVoidPromptLead, shouldPromptWinIntent } from "@/engine/prompts";
import { buildDeck, createRng, dealNewHands } from "@/engine/deck";
import {
  initGameState,
  applyPlay,
  resolveTrick,
  advanceToNextTrick,
  resetTrick,
  buildHistorySnapshot,
  computeLegalBySeat,
  computeActualVoid,
  isPlayLegal,
  isHandInProgress,
  shouldPromptSuitCount,
  type GameState,
  type VoidGrid,
} from "@/engine/state";
import {
  currentBidder,
  initBidState,
  isBiddingComplete,
  submitBid,
  evaluateExactBids,
  type BidState,
} from "@/engine/phase/bidding";
import {
  SUITS,
  OPPONENTS,
  SEATS,
  type Suit,
  type Opp,
  type Seat,
  type Rank,
  type CardT,
  type PlayT,
  type TrumpConfig,
} from "@/engine/types";
import { RefreshCw, Moon, Sun } from "lucide-react";
import { rankGlyph, suitColorClass, suitGlyph } from "@/ui/cardUtils";
import { SettingsCard } from "@/components/SettingsCard";
import { TrickHistoryCard } from "@/components/TrickHistoryCard";
import { TableCard } from "@/components/TableCard";
import { HelpCard } from "@/components/HelpCard";

/**
 * Generic trick engine (v1)
 * - Standard must-follow: if you can follow lead suit, you must.
 * - Optional trump with:
 *   - Trump suit
 *   - Must break (cannot lead trump until broken, unless only trump remains)
 * - Winner of last trick leads next.
 *
 * Reset trick behavior (implemented):
 * - Cancels any pending resolution timer
 * - Returns played trick cards to their owners' hands
 * - Restores leader/turn to the state at the start of the trick
 */

type VoidSelections = Record<Opp, boolean>;

const SETTINGS_KEY = "trick-taking-trainer:settings";

type Settings = {
  dealSeed: number;
  seedInput: string;
  modeOpenHandVerify: boolean;
  voidTrackingEnabled: boolean;
  voidTrackingSuits: Suit[];
  voidPromptSkipLowImpact: boolean;
  darkMode: boolean;
  suitCountPromptEnabled: boolean;
  suitCountPromptSuits: Suit[];
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
  winIntentPromptEnabled: boolean;
  winIntentWarnTrump: boolean;
  winIntentWarnHonorsOnly: boolean;
  winIntentMinRank: Rank;
  voidPromptOnlyWhenLeading: boolean;
  trump: TrumpConfig;
};

function loadSettings(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as Record<string, unknown>;
    const next: Partial<Settings> = {};
    if (typeof data.dealSeed === "number" && Number.isFinite(data.dealSeed) && data.dealSeed >= 0) {
      next.dealSeed = Math.floor(data.dealSeed) >>> 0;
    }
    if (typeof data.seedInput === "string") next.seedInput = data.seedInput;
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

function formatWinIntentDetails(args: {
  higherRanks: Rank[];
  warnHonorsOnly: boolean;
  trumpSuit: Suit;
  trumpThreatLabels: string[];
}): string[] {
  const { higherRanks, warnHonorsOnly, trumpSuit, trumpThreatLabels } = args;
  const details: string[] = [];
  if (higherRanks.length) {
    const label = warnHonorsOnly ? "Higher honors remaining" : "Higher cards remaining";
    details.push(`${label}: ${higherRanks.map(rankGlyph).join(", ")}`);
  }
  if (trumpThreatLabels.length) {
    const who = trumpThreatLabels.length ? ` (${trumpThreatLabels.join(", ")})` : "";
    details.push(`Trump threat: an opponent may trump with ${suitGlyph(trumpSuit)}${who}`);
  }
  return details;
}

function formatOrdinal(value: number): string {
  const abs = Math.abs(value);
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  switch (abs % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

function formatCardCount(value: number): string {
  return `${value} ${value === 1 ? "card" : "cards"}`;
}

function createVoidSelections(): VoidSelections {
  return { Left: false, Across: false, Right: false };
}


export default function App() {
  const initialSettings = useMemo(() => loadSettings(), []);
  const initialSeed = initialSettings.dealSeed ?? Math.floor(Math.random() * 1_000_000_000);

  const [modeOpenHandVerify, setModeOpenHandVerify] = useState(
    () => initialSettings.modeOpenHandVerify ?? false
  );
  const [voidTrackingEnabled, setVoidTrackingEnabled] = useState(
    () => initialSettings.voidTrackingEnabled ?? true
  );
  const [voidTrackingSuits, setVoidTrackingSuits] = useState<Suit[]>(
    () => initialSettings.voidTrackingSuits ?? [...SUITS]
  );
  const [voidPromptSkipLowImpact, setVoidPromptSkipLowImpact] = useState(
    () => initialSettings.voidPromptSkipLowImpact ?? true
  );
  const [darkMode, setDarkMode] = useState(() => initialSettings.darkMode ?? false);
  const [suitCountPromptEnabled, setSuitCountPromptEnabled] = useState(
    () => initialSettings.suitCountPromptEnabled ?? false
  );
  const [suitCountPromptSuits, setSuitCountPromptSuits] = useState<Suit[]>(
    () => initialSettings.suitCountPromptSuits ?? [...SUITS]
  );
  const [checkErrorsEnabled, setCheckErrorsEnabled] = useState(
    () => initialSettings.checkErrorsEnabled ?? true
  );
  const [voidPromptScope, setVoidPromptScope] = useState<"global" | "per-suit">(
    () => initialSettings.voidPromptScope ?? "per-suit"
  );
  const [suitOrderMode, setSuitOrderMode] = useState<"bridge" | "poker">(
    () => initialSettings.suitOrderMode ?? "poker"
  );
  const [sortAscending, setSortAscending] = useState(() => initialSettings.sortAscending ?? true);
  const [suitStyleMode, setSuitStyleMode] = useState<"classic" | "distinct">(
    () => initialSettings.suitStyleMode ?? "classic"
  );
  const [aiEnabled, setAiEnabled] = useState(() => initialSettings.aiEnabled ?? true);
  const [aiMode, setAiMode] = useState<"random" | "bidding">(
    () => initialSettings.aiMode ?? "bidding"
  );
  const [aiDelayMs, setAiDelayMs] = useState(() => initialSettings.aiDelayMs ?? 500);
  const [aiDelayInput, setAiDelayInput] = useState(() =>
    String(initialSettings.aiDelayMs ?? 500)
  );
  const [pauseBeforeNextTrick, setPauseBeforeNextTrick] = useState(
    () => initialSettings.pauseBeforeNextTrick ?? true
  );
  const [aiPlayMe, setAiPlayMe] = useState(() => initialSettings.aiPlayMe ?? false);
  const [aiModeLocked, setAiModeLocked] = useState<"random" | "bidding">(
    () => initialSettings.aiMode ?? "bidding"
  );
  const [bidState, setBidState] = useState<BidState | null>(null);
  const [bidInput, setBidInput] = useState("0");
  const [peekPrompt, setPeekPrompt] = useState<null | "bid" | "suit" | "void" | "intent">(null);
  const [supportsHover, setSupportsHover] = useState(true);
  const [winIntentPromptEnabled, setWinIntentPromptEnabled] = useState(
    () => initialSettings.winIntentPromptEnabled ?? false
  );
  const [winIntentWarnTrump, setWinIntentWarnTrump] = useState(
    () => initialSettings.winIntentWarnTrump ?? true
  );
  const [winIntentWarnHonorsOnly, setWinIntentWarnHonorsOnly] = useState(
    () => initialSettings.winIntentWarnHonorsOnly ?? true
  );
  const [winIntentMinRank, setWinIntentMinRank] = useState<Rank>(
    () => initialSettings.winIntentMinRank ?? 10
  );
  const [voidPromptOnlyWhenLeading, setVoidPromptOnlyWhenLeading] = useState(
    () => initialSettings.voidPromptOnlyWhenLeading ?? true
  );
  const [seatLabelMode, setSeatLabelMode] = useState<"relative" | "compass">(
    () => initialSettings.seatLabelMode ?? "compass"
  );
  const [awaitContinue, setAwaitContinue] = useState(false);

  const [trump, setTrump] = useState<TrumpConfig>(() => {
    return (
      initialSettings.trump ?? {
        enabled: false,
        suit: "S",
        mustBreak: true,
      }
    );
  });

  const [dealSeed, setDealSeed] = useState(() => initialSeed);
  const [seedInput, setSeedInput] = useState(() => initialSettings.seedInput ?? String(initialSeed));
  const [seedError, setSeedError] = useState<string | null>(null);
  const [game, setGame] = useState<GameState>(() => initGameState(initialSeed));
  const [viewedTrickIndex, setViewedTrickIndex] = useState<number | null>(null);
  const [viewedTrickStep, setViewedTrickStep] = useState(0);
  const [historyPlaying, setHistoryPlaying] = useState(false);
  const [leadPromptActive, setLeadPromptActive] = useState(false);
  const [leadPromptSuit, setLeadPromptSuit] = useState<Suit | null>(null);
  const [leadPromptLeader, setLeadPromptLeader] = useState<Opp | null>(null);
  const [leadSelections, setLeadSelections] = useState<VoidSelections>(() => createVoidSelections());
  const [leadMismatch, setLeadMismatch] = useState<VoidSelections>(() => createVoidSelections());
  const [leadWarning, setLeadWarning] = useState<string | null>(null);
  const [suitCountPromptActive, setSuitCountPromptActive] = useState(false);
  const [suitCountPromptSuit, setSuitCountPromptSuit] = useState<Suit | null>(null);
  const [suitCountAnswer, setSuitCountAnswer] = useState("0");
  const [suitCountMismatch, setSuitCountMismatch] = useState(false);
  const [pendingIntentCard, setPendingIntentCard] = useState<CardT | null>(null);
  const [intentWarning, setIntentWarning] = useState<string | null>(null);
  const [intentDetails, setIntentDetails] = useState<string[]>([]);

  const [reveal, setReveal] = useState<Record<Seat, boolean>>({
    Left: false,
    Across: false,
    Right: false,
    Me: true,
  });

  const resolveTimerRef = useRef<number | null>(null);
  const commitAiDelayInput = (rawValue: string) => {
    const parsed = Number(rawValue);
    const normalized = Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
    setAiDelayMs(normalized);
    setAiDelayInput(String(normalized));
  };
  const [isResolving, setIsResolving] = useState(false);

  const {
    hands,
    trickHistory,
    leader,
    turn,
    trick,
    trickNo,
    handComplete,
    tricksWon,
  } = game;
  const handInProgress = isHandInProgress(game);
  const activeAiMode = handInProgress ? aiModeLocked : aiMode;
  const biddingActive = activeAiMode === "bidding";
  const biddingComplete = !biddingActive || (bidState && isBiddingComplete(bidState));
  const bidResults = useMemo(() => {
    if (!bidState || !biddingComplete) return null;
    return evaluateExactBids(bidState.bids, tricksWon);
  }, [bidState, biddingComplete, tricksWon]);
  const bidResultDisplay = useMemo(() => {
    if (!handComplete || !biddingActive || !bidResults) return null;
    return SEATS.reduce(
      (acc, seat) => {
        const result = bidResults[seat];
        const label = result.bid == null ? "No bid" : result.made ? "Made" : "Missed";
        const className = result.made ? "text-emerald-700 dark:text-emerald-300" : "text-destructive";
        acc[seat] = { label, className };
        return acc;
      },
      {} as Record<Seat, { label: string; className: string }>
    );
  }, [handComplete, biddingActive, bidResults]);

  const honorRemainingBySuit = useMemo(() => {
    const out: Record<Suit, Rank[]> = { S: [], H: [], D: [], C: [] };
    for (const suit of SUITS) {
      out[suit] = remainingHonorsInSuit(trickHistory, trick, suit);
    }
    return out;
  }, [trickHistory, trick]);

  const shownHands = useMemo(() => {
    const visible: Record<Seat, boolean> = { ...reveal };
    if (modeOpenHandVerify) {
      visible.Left = true;
      visible.Across = true;
      visible.Right = true;
    }
    visible.Me = true;
    return visible;
  }, [reveal, modeOpenHandVerify]);

  const seatLabels = useMemo<Record<Seat, string>>(() => {
    return seatLabelMode === "compass"
      ? { Left: "West", Across: "North", Right: "East", Me: "South" }
      : { Left: "Left", Across: "Across", Right: "Right", Me: "Me" };
  }, [seatLabelMode]);

  const bidDisplay = useMemo<Record<Seat, string> | null>(() => {
    if (!bidState) return null;
    return {
      Left: bidState.revealed.Left && bidState.bids.Left != null ? String(bidState.bids.Left) : "?",
      Across:
        bidState.revealed.Across && bidState.bids.Across != null ? String(bidState.bids.Across) : "?",
      Right: bidState.revealed.Right && bidState.bids.Right != null ? String(bidState.bids.Right) : "?",
      Me: bidState.revealed.Me && bidState.bids.Me != null ? String(bidState.bids.Me) : "?",
    };
  }, [bidState]);

  const suitOrder = useMemo<Suit[]>(() => {
    return suitOrderMode === "bridge" ? ["S", "H", "D", "C"] : ["C", "D", "H", "S"];
  }, [suitOrderMode]);

  const actualVoid = useMemo<VoidGrid>(() => {
    return computeActualVoid(trickHistory, trick);
  }, [trickHistory, trick]);

  const anyVoidObserved = useMemo(() => {
    return OPPONENTS.some((o) => SUITS.some((s) => actualVoid[o][s]));
  }, [actualVoid]);

  useEffect(() => {
    const settings: Settings = {
      dealSeed,
      seedInput,
      modeOpenHandVerify,
      voidTrackingEnabled,
      voidTrackingSuits,
      voidPromptSkipLowImpact,
      darkMode,
      suitCountPromptEnabled,
      suitCountPromptSuits,
      checkErrorsEnabled,
      voidPromptScope,
      suitOrderMode,
      suitStyleMode,
      sortAscending,
      aiEnabled,
      aiMode,
      aiDelayMs,
      pauseBeforeNextTrick,
      aiPlayMe,
      seatLabelMode,
      winIntentPromptEnabled,
      winIntentWarnTrump,
      winIntentWarnHonorsOnly,
      winIntentMinRank,
      voidPromptOnlyWhenLeading,
      trump,
    };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage errors (quota, private mode).
    }
  }, [
    dealSeed,
    seedInput,
    modeOpenHandVerify,
    voidTrackingEnabled,
    voidTrackingSuits,
    voidPromptSkipLowImpact,
    darkMode,
    suitCountPromptEnabled,
    suitCountPromptSuits,
    checkErrorsEnabled,
    voidPromptScope,
    suitOrderMode,
    suitStyleMode,
    sortAscending,
    aiEnabled,
    aiMode,
    aiDelayMs,
    pauseBeforeNextTrick,
    aiPlayMe,
    seatLabelMode,
    winIntentPromptEnabled,
    winIntentWarnTrump,
    winIntentWarnHonorsOnly,
    winIntentMinRank,
    voidPromptOnlyWhenLeading,
    trump,
  ]);

  const legalBySeat = useMemo(() => {
    return computeLegalBySeat(game, trump);
  }, [game, trump]);

  const isViewingHistory =
    viewedTrickIndex != null && viewedTrickIndex >= 0 && viewedTrickIndex < trickHistory.length;
  const historySnapshot = useMemo(() => {
    if (!isViewingHistory || viewedTrickIndex == null) return null;
    return buildHistorySnapshot(trickHistory, viewedTrickIndex, viewedTrickStep, dealSeed, trump);
  }, [isViewingHistory, viewedTrickIndex, viewedTrickStep, trickHistory, dealSeed, trump]);

  const displayHands = historySnapshot?.hands ?? hands;
  const displayTurn = historySnapshot?.turn ?? turn;
  const displayTricksWon = historySnapshot?.tricksWon ?? tricksWon;
  const displayTrick = historySnapshot?.trick ?? trick;
  const displayTrickNo = historySnapshot?.trickNo ?? trickNo;
  const displayHandComplete = historySnapshot?.handComplete ?? handComplete;
  const displayTrickWinner = useMemo<Seat | null>(() => {
    if (displayTrick.length !== 4) return null;
    return determineTrickWinner(displayTrick, trump);
  }, [displayTrick, trump]);

  const canPlay = canPlayCard({
    leadPromptActive,
    suitCountPromptActive,
    awaitContinue,
    handComplete,
    isViewingHistory,
    biddingActive,
    biddingComplete: !!biddingComplete,
  }) && !pendingIntentCard;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    setAiDelayInput(String(aiDelayMs));
  }, [aiDelayMs]);

  useEffect(() => {
    if (!handInProgress) {
      setAiModeLocked(aiMode);
    }
  }, [handInProgress, aiMode]);

  useEffect(() => {
    if (biddingActive) {
      setBidState((prev) => prev ?? initBidState("Me"));
      setBidInput("0");
    } else if (bidState) {
      setBidState(null);
    }
  }, [biddingActive, bidState]);

  useEffect(() => {
    if (viewedTrickIndex != null && viewedTrickIndex >= trickHistory.length) {
      setViewedTrickIndex(null);
    }
  }, [viewedTrickIndex, trickHistory.length]);

  useEffect(() => {
    if (viewedTrickIndex == null) {
      setHistoryPlaying(false);
      setViewedTrickStep(0);
    }
  }, [viewedTrickIndex]);

  useEffect(() => {
    if (!isViewingHistory || !historyPlaying || viewedTrickIndex == null) return;
    const maxStep = trickHistory[viewedTrickIndex]?.length ?? 0;
    if (viewedTrickStep >= maxStep) {
      setHistoryPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setViewedTrickStep((s) => Math.min(s + 1, maxStep));
    }, 600);
    return () => clearTimeout(timer);
  }, [isViewingHistory, historyPlaying, viewedTrickIndex, viewedTrickStep, trickHistory]);

  useEffect(() => {
    if (!voidTrackingEnabled) {
      resetVoidPrompt();
      return;
    }
    if (trick.length === 0) {
      resetVoidPrompt();
    }
  }, [voidTrackingEnabled, trick.length]);

  useEffect(() => {
    if (!leadPromptActive || !leadPromptSuit) return;
    if (!voidTrackingSuits.includes(leadPromptSuit)) {
      resetVoidPrompt();
    }
  }, [leadPromptActive, leadPromptSuit, voidTrackingSuits]);

  useEffect(() => {
    if (!suitCountPromptEnabled) {
      resetSuitCountPrompt();
    }
  }, [suitCountPromptEnabled]);

  useEffect(() => {
    if (!suitCountPromptActive || !suitCountPromptSuit) return;
    if (!suitCountPromptSuits.includes(suitCountPromptSuit)) {
      resetSuitCountPrompt();
    }
  }, [suitCountPromptActive, suitCountPromptSuit, suitCountPromptSuits]);

  useEffect(() => {
    const leadInfo = getVoidPromptLead({
      voidTrackingEnabled,
      voidTrackingSuits,
      voidPromptSkipLowImpact,
      voidPromptOnlyWhenLeading,
      voidPromptScope,
      trick,
      trickNo,
      hands,
      trump,
      anyVoidObserved,
      actualVoid,
    });
    if (!leadInfo) {
      if (leadPromptActive) resetVoidPrompt();
      return;
    }
    setLeadPromptActive(true);
    setLeadPromptSuit(leadInfo.leadSuit);
    setLeadPromptLeader(leadInfo.leadSeat === "Me" ? null : leadInfo.leadSeat);
    setLeadSelections(createVoidSelections());
    setLeadMismatch(createVoidSelections());
    setLeadWarning(null);
  }, [
    voidTrackingEnabled,
    voidTrackingSuits,
    voidPromptSkipLowImpact,
    voidPromptOnlyWhenLeading,
    trick,
    trickNo,
    actualVoid,
    anyVoidObserved,
    voidPromptScope,
    hands.Me,
    trump,
  ]);

  function cancelResolveTimer() {
    if (resolveTimerRef.current != null) {
      clearTimeout(resolveTimerRef.current);
      resolveTimerRef.current = null;
    }
  }

  function resetVoidPrompt() {
    setLeadPromptActive(false);
    setLeadPromptSuit(null);
    setLeadPromptLeader(null);
    setLeadSelections(createVoidSelections());
    setLeadMismatch(createVoidSelections());
    setLeadWarning(null);
  }

  function resetSuitCountPrompt() {
    setSuitCountPromptActive(false);
    setSuitCountPromptSuit(null);
    setSuitCountAnswer("0");
    setSuitCountMismatch(false);
  }

  function resetWinIntentPrompt() {
    setPendingIntentCard(null);
    setIntentWarning(null);
    setIntentDetails([]);
  }

  function resetForDeal(seed: number) {
    cancelResolveTimer();
    setDealSeed(seed);
    setSeedInput(String(seed));
    setGame(initGameState(seed));
    setViewedTrickIndex(null);
    setViewedTrickStep(0);
    setHistoryPlaying(false);
    setBidState(aiMode === "bidding" ? initBidState("Me") : null);
    setBidInput("0");
    resetWinIntentPrompt();
    resetVoidPrompt();
    resetSuitCountPrompt();
    setReveal({ Left: false, Across: false, Right: false, Me: true });
    setIsResolving(false);
    setAwaitContinue(false);
  }

  function parseSeed(value: string): number | null {
    if (!value.trim()) return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const seed = Math.floor(n);
    if (seed < 0) return null;
    return seed >>> 0;
  }

  function applySeedFromInput() {
    const parsed = parseSeed(seedInput);
    if (parsed == null) {
      setSeedError("Enter a non-negative whole number");
      return;
    }
    setSeedError(null);
    resetForDeal(parsed);
  }

  function newSeed() {
    resetForDeal(Math.floor(Math.random() * 1_000_000_000));
  }

  function resetHand() {
    resetForDeal(dealSeed);
  }

  function toggleLeadSelection(o: Opp) {
    setLeadSelections((s) => ({ ...s, [o]: !s[o] }));
    setLeadMismatch(createVoidSelections());
    setLeadWarning(null);
  }

  function resumeAfterLeadPrompt() {
    if (isViewingHistory) return;
    if (!leadPromptActive || !leadPromptSuit) return;
    const mismatch = createVoidSelections();
    let hasMismatch = false;
    for (const o of OPPONENTS) {
      if (leadPromptLeader && o === leadPromptLeader) continue;
      if (leadSelections[o] !== actualVoid[o][leadPromptSuit]) {
        mismatch[o] = true;
        hasMismatch = true;
      }
    }
    if (hasMismatch) {
      setLeadMismatch(checkErrorsEnabled ? mismatch : createVoidSelections());
      setLeadWarning("Selections do not match void status");
      return;
    }
    resetVoidPrompt();
  }

  function skipLeadPrompt() {
    if (isViewingHistory) return;
    if (!leadPromptActive) return;
    resetVoidPrompt();
  }

  function remainingSuitCountNotInHand(suit: Suit, state?: GameState): number {
    const hand = state ? state.hands.Me : hands.Me;
    const history = state ? state.trickHistory : trickHistory;
    const inHand = hand.reduce((acc, card) => acc + (card.suit === suit ? 1 : 0), 0);
    const played = history.reduce(
      (acc, t) => acc + t.reduce((inner, play) => inner + (play.card.suit === suit ? 1 : 0), 0),
      0
    );
    return Math.max(0, 13 - inHand - played);
  }

  function resumeAfterSuitCountPrompt() {
    if (isViewingHistory) return;
    if (!suitCountPromptActive || !suitCountPromptSuit) return;
    const expected = remainingSuitCountNotInHand(suitCountPromptSuit);
    const answer = Number(suitCountAnswer);
    if (!Number.isFinite(answer) || answer !== expected) {
      setSuitCountMismatch(true);
      return;
    }
    resetSuitCountPrompt();
    setAwaitContinue(false);
    if (!handComplete) {
      setGame((g) => advanceToNextTrick(g));
    }
  }

  function skipSuitCountPrompt() {
    if (isViewingHistory) return;
    if (!suitCountPromptActive) return;
    resetSuitCountPrompt();
    setAwaitContinue(false);
    if (!handComplete) {
      setGame((g) => advanceToNextTrick(g));
    }
  }


  function handleWinIntentDecision(intentToWin: boolean) {
    if (!pendingIntentCard) return;
    if (!intentToWin) {
      const card = pendingIntentCard;
      resetWinIntentPrompt();
      tryPlay("Me", card, "human", { skipIntentPrompt: true });
      return;
    }
    const assessment = evaluateWinIntent({
      card: pendingIntentCard,
      trickHistory,
      trick,
      hand: hands.Me,
      trump,
      winIntentWarnTrump,
      winIntentWarnHonorsOnly,
      actualVoid,
    });
    if (!assessment.warning) {
      const card = pendingIntentCard;
      resetWinIntentPrompt();
      tryPlay("Me", card, "human", { skipIntentPrompt: true });
      return;
    }
    const details = formatWinIntentDetails({
      higherRanks: assessment.higherRanks,
      warnHonorsOnly: winIntentWarnHonorsOnly,
      trumpSuit: trump.suit,
      trumpThreatLabels: assessment.trumpThreats.map((s) => seatLabels[s]),
    });
    setIntentWarning(assessment.warning);
    setIntentDetails(details);
  }

  function confirmIntentPlay() {
    if (!pendingIntentCard) return;
    const card = pendingIntentCard;
    resetWinIntentPrompt();
    tryPlay("Me", card, "human", { skipIntentPrompt: true });
  }

  function cancelIntentPrompt() {
    resetWinIntentPrompt();
  }

  function submitBidForSeat(seat: Seat, bid: number) {
    setBidState((prev) => (prev ? submitBid(prev, seat, bid) : prev));
  }

  function toggleRevealSeat(seat: Seat) {
    setReveal((r) => ({ ...r, [seat]: !r[seat] }));
  }

  function toggleSuitSelection(
    setter: (value: Suit[] | ((prev: Suit[]) => Suit[])) => void,
    suit: Suit
  ) {
    setter((prev) => {
      const next = prev.includes(suit) ? prev.filter((s) => s !== suit) : [...prev, suit];
      return SUITS.filter((s) => next.includes(s));
    });
  }

  function resolveTrickAfterDelay() {
    setIsResolving(true);
    cancelResolveTimer();
    const promptSuit =
      suitCountPromptEnabled && !isViewingHistory ? shouldPromptSuitCount(trickHistory, trick) : null;
    const filteredPromptSuit =
      promptSuit && suitCountPromptSuits.includes(promptSuit) ? promptSuit : null;

    resolveTimerRef.current = window.setTimeout(() => {
      let resolvedState: GameState | null = null;
      setGame((g) => {
        const next = resolveTrick(g, trump);
        resolvedState = next;
        return next;
      });

      const nextState = resolvedState as GameState | null;
      if (!nextState) return;
      if (filteredPromptSuit) {
        setSuitCountPromptActive(true);
        setSuitCountPromptSuit(filteredPromptSuit);
        setSuitCountAnswer("0");
        setSuitCountMismatch(false);
        setIsResolving(false);
        setAwaitContinue(false);
        resolveTimerRef.current = null;
        return;
      }
      if (nextState.handComplete) {
        setIsResolving(false);
        setAwaitContinue(false);
        resolveTimerRef.current = null;
        return;
      }

      if (pauseBeforeNextTrick) {
        // Keep the completed trick visible; wait for user input.
        setIsResolving(false);
        setAwaitContinue(true);
        resolveTimerRef.current = null;
        return;
      }

      // Default: advance after the delay.
      setGame((g) => advanceToNextTrick(g));
      setIsResolving(false);
      setAwaitContinue(false);
      resolveTimerRef.current = null;
    }, aiDelayMs);
  }

  function tryPlay(
    seat: Seat,
    card: CardT,
    source: "human" | "ai" = "human",
    opts?: { skipIntentPrompt?: boolean }
  ) {
    if (isResolving) return;
    if (isViewingHistory) return;
    if (awaitContinue) return;
    if (handComplete) return;
    if (biddingActive && !biddingComplete) return;
    if (pendingIntentCard && source === "human" && !opts?.skipIntentPrompt) return;

    // Only the leader may lead a new trick.
    if (trick.length === 0 && seat !== leader) return;

    // Require void tracking prompt to be resolved before any play.
    if (voidTrackingEnabled && leadPromptActive) return;
    if (suitCountPromptActive) return;

    if (seat !== turn) return;

    // If a human is trying to play an opponent hand, require it to be revealed.
    if (source === "human" && seat !== "Me" && !shownHands[seat]) return;

    if (
      source === "human" &&
      seat === "Me" &&
      !pendingIntentCard &&
      !opts?.skipIntentPrompt &&
      shouldPromptWinIntent({
        card,
        seat,
        trick,
        trickNo,
        winIntentPromptEnabled,
        winIntentMinRank,
        aiPlayMe,
        honorRemainingBySuit,
        hands,
        trump,
        actualVoid,
      })
    ) {
      setPendingIntentCard(card);
      setIntentWarning(null);
      setIntentDetails([]);
      return;
    }

    if (
      !isPlayLegal({
        state: game,
        seat,
        card,
        trump,
      })
    ) {
      return;
    }

    const nextTrick = [...trick, { seat, card }];
    setGame((g) => applyPlay(g, { seat, card }, trump));

    // Advance turn or resolve
    if (nextTrick.length < 4) {
      return;
    }

    // Final card played: keep the trick visible, then resolve after the configured delay.
    resolveTrickAfterDelay();
  }

  function resetTrickOnly() {
    if (isViewingHistory) return;
    // Undo the in-progress trick: return played cards to hands, cancel resolution, restore turn/leader.
    cancelResolveTimer();
    setIsResolving(false);
    setAwaitContinue(false);
    resetVoidPrompt();
    resetSuitCountPrompt();
    resetWinIntentPrompt();
    setGame((g) => resetTrick(g, trump));
  }

  function resumeFromHistory(index: number, step: number) {
    if (index < 0 || index >= trickHistory.length) return;
    cancelResolveTimer();
    const snapshot = buildHistorySnapshot(trickHistory, index, step, dealSeed, trump);
    setGame((g) => ({
      ...g,
      hands: snapshot.hands,
      tricksWon: snapshot.tricksWon,
      leader: snapshot.leader,
      turn: snapshot.turn,
      trumpBroken: snapshot.trumpBroken,
      trickNo: snapshot.trickNo,
      trick: snapshot.trick,
      handComplete: snapshot.handComplete,
      trickHistory: snapshot.historySlice,
      trickStartLeader: snapshot.trickStartLeader,
      trickStartTurn: snapshot.trickStartTurn,
    }));
    setAwaitContinue(snapshot.awaitContinue);
    setIsResolving(false);
    resetVoidPrompt();
    resetSuitCountPrompt();
    resetWinIntentPrompt();
    setViewedTrickIndex(null);
    setViewedTrickStep(0);
    setHistoryPlaying(false);
  }

  // Basic AI: players play a random valid card when it's their turn.
  useEffect(() => {
    if (
      !shouldRunAi({
        aiEnabled,
        biddingActive,
        biddingComplete: !!biddingComplete,
        isResolving,
        handComplete,
        awaitContinue,
        isViewingHistory,
        turn,
        aiPlayMe,
        leadPromptActive: voidTrackingEnabled && leadPromptActive,
        suitCountPromptActive,
        trickLength: trick.length,
        leader,
      })
    ) {
      return;
    }

    const legal = legalBySeat[turn];
    if (!legal || legal.size === 0) return;

    const decision =
      activeAiMode === "bidding"
        ? chooseCardToPlayForBid({
            seat: turn,
            hand: hands[turn],
            legalIds: legal,
            trick,
            leader,
            trump,
            tricksWon,
            bid: bidState?.bids[turn] ?? null,
          })
        : chooseCardToPlay(hands[turn], legal);
    if (!decision) return;
    const card = hands[turn].find((c) => c.id === decision.cardId);
    if (!card) return;

    const timer = window.setTimeout(() => {
      tryPlay(turn, card, "ai");
    }, aiDelayMs);

    return () => clearTimeout(timer);
  }, [
    aiEnabled,
    aiPlayMe,
    aiDelayMs,
    turn,
    legalBySeat,
    hands,
    isResolving,
    trick,
    leader,
    awaitContinue,
    voidTrackingEnabled,
    leadPromptActive,
    isViewingHistory,
    biddingActive,
    biddingComplete,
  ]);

  // Bidding phase: auto-bid for non-user seats in order.
  useEffect(() => {
    if (!biddingActive || !bidState) return;
    if (isBiddingComplete(bidState)) return;
    const seat = currentBidder(bidState);
    if (!seat || seat === "Me") return;

    const timer = window.setTimeout(() => {
      const bid = estimateBid(hands[seat], trump);
      submitBidForSeat(seat, bid);
    }, aiDelayMs);

    return () => clearTimeout(timer);
  }, [biddingActive, bidState, aiDelayMs, hands, trump]);

  // If paused after a completed trick, advance on any key.
  useEffect(() => {
    if (!canAdvanceTrick({ awaitContinue, handComplete, isViewingHistory })) return;
    const advance = () => {
      setGame((g) => advanceToNextTrick(g));
      setAwaitContinue(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " " || e.code === "Space") {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [awaitContinue, handComplete, isViewingHistory]);

  // Cleanup any pending timers on unmount.
  useEffect(() => {
    return () => cancelResolveTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(any-hover: hover)");
    const update = () => setSupportsHover(query.matches);
    update();
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", update);
      return () => query.removeEventListener("change", update);
    }
    query.addListener(update);
    return () => query.removeListener(update);
  }, []);

  const togglePeekPrompt = (promptId: "bid" | "suit" | "void" | "intent") => {
    setPeekPrompt((current) => (current === promptId ? null : promptId));
  };

  const handlePeekClick = (promptId: "bid" | "suit" | "void" | "intent") => {
    if (supportsHover) return;
    togglePeekPrompt(promptId);
  };

  const renderBidPrompt = () => {
    if (!biddingActive || !bidState) return null;
    if (currentBidder(bidState) !== "Me" || isBiddingComplete(bidState)) return null;
    return (
      <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
        <div className="w-[170px] space-y-3 rounded-lg border bg-card px-3 py-3 text-sm shadow-lg">
          <div className="text-sm font-medium">Enter your bid</div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <Select value={bidInput} onValueChange={(v) => setBidInput(v)}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 14 }, (_, i) => String(i)).map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => submitBidForSeat("Me", Number(bidInput))}
            >
              Bid
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderSuitCountPrompt = () => {
    if (!suitCountPromptEnabled || !suitCountPromptActive) return null;
    const suitLeadCount = suitCountPromptSuit
      ? trickHistory.filter((t) => trickLeadSuit(t) === suitCountPromptSuit).length
      : 0;
    const offSuitCount = trickHistory.reduce((sum, t) => {
      const lead = trickLeadSuit(t);
      if (!lead) return sum;
      const offSuit = t.filter((play) => play.card.suit !== lead).length;
      return sum + offSuit;
    }, 0);
    const isPeeking = peekPrompt === "suit";
    const hoverPeekClass = supportsHover ? " peer-hover:pointer-events-none peer-hover:opacity-20" : "";
    return (
      <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            className="peer order-2 cursor-pointer rounded-full border bg-background/80 px-2 py-0.5 text-[10px] text-foreground/70"
            onClick={() => handlePeekClick("suit")}
          >
            {supportsHover ? "Hover to peek" : isPeeking ? "Tap to unpeek" : "Tap to peek"}
          </button>
          <div
            className={
              "order-1 w-[220px] space-y-3 rounded-lg border bg-card px-3 py-3 text-sm shadow-lg transition-opacity" +
              hoverPeekClass +
              (isPeeking ? " pointer-events-none opacity-20" : "")
            }
          >
            <div className="text-sm font-medium">
              How many{" "}
              <span className={suitCountPromptSuit ? suitColorClass(suitCountPromptSuit, suitStyleMode) : undefined}>
                {suitCountPromptSuit ? suitGlyph(suitCountPromptSuit) : "cards"}
              </span>{" "}
              remain outside your hand?
            </div>
            <Select
              value={suitCountAnswer}
              onValueChange={(v) => {
                setSuitCountAnswer(v);
                setSuitCountMismatch(false);
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 14 }, (_, i) => String(i)).map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {suitCountMismatch ? <div className="text-xs text-destructive">Suit count is incorrect</div> : null}
            <details className="rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none font-medium text-foreground">Hint</summary>
              <div className="mt-1">
                This is the {formatOrdinal(suitLeadCount)} time this suit has been led and this hand{" "}
                {formatCardCount(offSuitCount)} {offSuitCount === 1 ? "was" : "were"} played off-suit.
                This gives an upper bound on the number of cards left in this suit.
              </div>
            </details>
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={resumeAfterSuitCountPrompt}
              >
                Resume
              </Button>
              <Button variant="outline" className="flex-1" onClick={skipSuitCountPrompt}>
                Skip
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderVoidPrompt = () => {
    if (!voidTrackingEnabled || !leadPromptActive || !leadPromptSuit) return null;
    if (isViewingHistory) return null;
    const isPeeking = peekPrompt === "void";
    const hoverPeekClass = supportsHover ? " peer-hover:pointer-events-none peer-hover:opacity-20" : "";
    return (
      <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            className="peer order-2 cursor-pointer rounded-full border bg-background/80 px-2 py-0.5 text-[10px] text-foreground/70"
            onClick={() => handlePeekClick("void")}
          >
            {supportsHover ? "Hover to peek" : isPeeking ? "Tap to unpeek" : "Tap to peek"}
          </button>
          <div
            className={
              "order-1 w-[240px] space-y-3 rounded-lg border bg-card px-3 py-3 text-sm shadow-lg transition-opacity" +
              hoverPeekClass +
              (isPeeking ? " pointer-events-none opacity-20" : "")
            }
          >
            <div className="text-sm font-medium">Which opponents are void in the lead suit?</div>
            <div className={"text-sm " + suitColorClass(leadPromptSuit, suitStyleMode)}>
              Lead suit: {suitGlyph(leadPromptSuit)}
            </div>
            <div className="grid grid-cols-3 grid-rows-3 place-items-center gap-2 text-xs">
              {(
                [
                  { seat: "Across", col: 2, row: 1 },
                  { seat: "Left", col: 1, row: 2 },
                  { seat: "Right", col: 3, row: 2 },
                ] as const
              ).map(({ seat, col, row }) => {
                const isLeader = leadPromptLeader === seat;
                const mismatch = leadMismatch[seat];
                const disabled = isLeader;
                return (
                  <label
                    key={seat}
                    className={
                      "flex flex-col items-center gap-1 rounded-md border px-2 py-1 " +
                      (mismatch ? "border-destructive" : "border-border") +
                      (disabled ? " opacity-60" : "")
                    }
                    style={{ gridColumn: col, gridRow: row }}
                  >
                    <span>{seatLabels[seat]}</span>
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={leadSelections[seat]}
                      onChange={() => toggleLeadSelection(seat)}
                      disabled={disabled}
                    />
                  </label>
                );
              })}
            </div>
            {leadWarning ? <div className="text-xs text-destructive">{leadWarning}</div> : null}
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={resumeAfterLeadPrompt}
                disabled={isResolving || awaitContinue}
              >
                Resume
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={skipLeadPrompt}
                disabled={isResolving || awaitContinue}
              >
                Skip
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderWinIntentPrompt = () => {
    if (!pendingIntentCard) return null;
    const isPeeking = peekPrompt === "intent";
    const hoverPeekClass = supportsHover ? " peer-hover:pointer-events-none peer-hover:opacity-20" : "";
    return (
      <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            className="peer order-2 cursor-pointer rounded-full border bg-background/80 px-2 py-0.5 text-[10px] text-foreground/70"
            onClick={() => handlePeekClick("intent")}
          >
            {supportsHover ? "Hover to peek" : isPeeking ? "Tap to unpeek" : "Tap to peek"}
          </button>
          <div
            className={
              "order-1 w-[200px] space-y-3 rounded-lg border bg-card px-3 py-3 text-sm shadow-lg transition-opacity" +
              hoverPeekClass +
              (isPeeking ? " pointer-events-none opacity-20" : "")
            }
          >
            {!intentWarning ? (
              <>
                <div className="text-sm font-medium">Do you intend to win this trick?</div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => handleWinIntentDecision(true)}
                  >
                    Yes
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => handleWinIntentDecision(false)}>
                    No
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-medium text-destructive">{intentWarning}</div>
                {intentDetails.length ? (
                  <details className="rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground">
                    <summary className="cursor-pointer select-none font-medium text-foreground">Details</summary>
                    <div className="mt-1 space-y-1">
                      {intentDetails.map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                    </div>
                  </details>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={confirmIntentPlay}
                  >
                    Play
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={cancelIntentPrompt}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const canAdvance = canAdvanceTrick({ awaitContinue, handComplete, isViewingHistory });
  const handleAdvanceTrick = () => {
    setGame((g) => advanceToNextTrick(g));
    setAwaitContinue(false);
  };

  const tableCard = (
    <TableCard
      seatLabels={seatLabels}
      displayHands={displayHands}
      displayTricksWon={displayTricksWon}
      displayTurn={displayTurn}
      displayHandComplete={displayHandComplete}
      displayTrick={displayTrick}
      displayTrickWinner={displayTrickWinner}
      displayTrickNo={displayTrickNo}
      trickNo={trickNo}
      bidDisplay={bidDisplay}
      bidResultDisplay={bidResultDisplay}
      shownHands={shownHands}
      toggleRevealSeat={toggleRevealSeat}
      modeOpenHandVerify={modeOpenHandVerify}
      isViewingHistory={isViewingHistory}
      legalBySeat={legalBySeat}
      onPlayCard={(s, c) => tryPlay(s, c, "human")}
      suitOrder={suitOrder}
      sortAscending={sortAscending}
      canPlay={canPlay}
      suitStyleMode={suitStyleMode}
      awaitContinue={awaitContinue}
      handComplete={handComplete}
      canAdvance={canAdvance}
      onAdvanceTrick={handleAdvanceTrick}
      onResetTrick={resetTrickOnly}
      bidPrompt={renderBidPrompt()}
      voidPrompt={renderVoidPrompt()}
      suitCountPrompt={renderSuitCountPrompt()}
      winIntentPrompt={renderWinIntentPrompt()}
    />
  );

  const settingsCard = (
    <SettingsCard
      modeOpenHandVerify={modeOpenHandVerify}
      setModeOpenHandVerify={setModeOpenHandVerify}
      voidTrackingEnabled={voidTrackingEnabled}
      setVoidTrackingEnabled={setVoidTrackingEnabled}
      voidPromptOnlyWhenLeading={voidPromptOnlyWhenLeading}
      setVoidPromptOnlyWhenLeading={setVoidPromptOnlyWhenLeading}
      voidTrackingSuits={voidTrackingSuits}
      toggleVoidTrackingSuit={(s) => toggleSuitSelection(setVoidTrackingSuits, s)}
      voidPromptSkipLowImpact={voidPromptSkipLowImpact}
      setVoidPromptSkipLowImpact={setVoidPromptSkipLowImpact}
      voidPromptScope={voidPromptScope}
      setVoidPromptScope={setVoidPromptScope}
      suitCountPromptEnabled={suitCountPromptEnabled}
      setSuitCountPromptEnabled={setSuitCountPromptEnabled}
      suitCountPromptSuits={suitCountPromptSuits}
      toggleSuitCountPromptSuit={(s) => toggleSuitSelection(setSuitCountPromptSuits, s)}
      winIntentPromptEnabled={winIntentPromptEnabled}
      setWinIntentPromptEnabled={setWinIntentPromptEnabled}
      winIntentMinRank={winIntentMinRank}
      setWinIntentMinRank={setWinIntentMinRank}
      winIntentWarnHonorsOnly={winIntentWarnHonorsOnly}
      setWinIntentWarnHonorsOnly={setWinIntentWarnHonorsOnly}
      winIntentWarnTrump={winIntentWarnTrump}
      setWinIntentWarnTrump={setWinIntentWarnTrump}
      checkErrorsEnabled={checkErrorsEnabled}
      setCheckErrorsEnabled={setCheckErrorsEnabled}
      aiEnabled={aiEnabled}
      setAiEnabled={setAiEnabled}
      aiMode={aiMode}
      setAiMode={setAiMode}
      aiPlayMe={aiPlayMe}
      setAiPlayMe={setAiPlayMe}
      aiDelayInput={aiDelayInput}
      setAiDelayInput={setAiDelayInput}
      setAiDelayMs={setAiDelayMs}
      commitAiDelayInput={commitAiDelayInput}
      pauseBeforeNextTrick={pauseBeforeNextTrick}
      setPauseBeforeNextTrick={setPauseBeforeNextTrick}
      handInProgress={handInProgress}
      trump={trump}
      setTrump={setTrump}
      suitOrderMode={suitOrderMode}
      setSuitOrderMode={setSuitOrderMode}
      suitStyleMode={suitStyleMode}
      setSuitStyleMode={setSuitStyleMode}
      sortAscending={sortAscending}
      setSortAscending={setSortAscending}
      seatLabelMode={seatLabelMode}
      setSeatLabelMode={setSeatLabelMode}
      suits={SUITS}
    />
  );

  const trickHistoryCard = (
    <TrickHistoryCard
      trickHistory={trickHistory}
      viewedTrickIndex={viewedTrickIndex}
      viewedTrickStep={viewedTrickStep}
      setViewedTrickIndex={setViewedTrickIndex}
      setViewedTrickStep={setViewedTrickStep}
      historyPlaying={historyPlaying}
      setHistoryPlaying={setHistoryPlaying}
      resumeFromHistory={resumeFromHistory}
      seatLabels={seatLabels}
      isViewingHistory={isViewingHistory}
      trump={trump}
      suitStyleMode={suitStyleMode}
    />
  );

  const helpCard = <HelpCard />;

  const debugCard = import.meta.env.DEV ? (
    <div className="rounded-lg border bg-card p-3 text-sm shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Debug</div>
      <div className="mt-2 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setLeadPromptSuit("S");
              setLeadPromptLeader("Left");
              setLeadSelections(createVoidSelections());
              setLeadMismatch(createVoidSelections());
              setLeadWarning(null);
              setLeadPromptActive(true);
              setPeekPrompt(null);
            }}
          >
            Void prompt
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setSuitCountPromptSuit("H");
              setSuitCountAnswer("0");
              setSuitCountMismatch(false);
              setSuitCountPromptActive(true);
              setPeekPrompt(null);
            }}
          >
            Suit count prompt
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setPendingIntentCard({ suit: "D", rank: 11, id: "D11" });
              setIntentWarning(null);
              setIntentDetails([]);
              setPeekPrompt(null);
            }}
          >
            Win intent
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setPendingIntentCard({ suit: "D", rank: 11, id: "D11" });
              setIntentWarning("This card can be beaten by a higher card");
              setIntentDetails(["Higher diamond(s): Q, K, A", "Trump possible: West, North"]);
              setPeekPrompt(null);
            }}
          >
            Win intent warn
          </Button>
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setLeadPromptActive(false);
            setSuitCountPromptActive(false);
            setPendingIntentCard(null);
            setIntentWarning(null);
            setIntentDetails([]);
            setPeekPrompt(null);
          }}
        >
          Clear prompts
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <div className="min-h-screen bg-background p-3 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none text-black dark:text-white">♠</span>
            <h1 className="text-xl font-semibold">Trick Taking Trainer</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Toggle dark mode"
              onClick={() => setDarkMode((v) => !v)}
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <div className="space-y-2 rounded-lg border bg-card/50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Deal</div>
              <div className="flex flex-wrap items-start gap-2">
                <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={resetHand}>
                  Reset hand
                </Button>
                <Button className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700" onClick={newSeed}>
                  <RefreshCw className="h-4 w-4" />
                  New hand
                </Button>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Seed</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={seedInput}
                      onChange={(e) => {
                        setSeedInput(e.target.value);
                        setSeedError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applySeedFromInput();
                      }}
                      className="h-8 w-32 rounded-md border bg-background px-2 text-xs"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={applySeedFromInput}>
                      Apply
                    </Button>
                  </div>
                  {seedError ? <div className="mt-1 text-xs text-destructive">{seedError}</div> : null}
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 min-[750px]:grid-cols-[minmax(0,1fr)_auto] min-[750px]:gap-1">
            {tableCard}
            <div className="h-full w-full min-[750px]:w-[330px] min-[750px]:justify-self-end">
              {trickHistoryCard}
            </div>
          </div>
          <div className="grid grid-cols-1 items-start gap-6 min-[750px]:grid-cols-[minmax(0,1fr)_auto] min-[750px]:gap-1">
            <div className="w-full">{helpCard}</div>
            <div className="w-full min-[750px]:w-[330px] min-[750px]:justify-self-end">
              <div className="space-y-4">
                {settingsCard}
                {debugCard}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Sanity tests (runtime assertions)
if (import.meta.env.DEV) {
  const _deck = buildDeck();
  console.assert(_deck.length === 52, "Deck should have 52 cards");
  console.assert(new Set(_deck.map((c) => c.id)).size === 52, "Deck ids should be unique");
  console.assert(
    SUITS.every((s) => _deck.filter((c) => c.suit === s).length === 13),
    "Each suit should have 13 cards"
  );

  const _hands = dealNewHands(createRng(1));
  console.assert(SEATS.every((s) => _hands[s].length === 13), "Each seat should be dealt 13 cards");

  const _dealtIds = SEATS.reduce<string[]>((acc, s) => acc.concat(_hands[s].map((c) => c.id)), []);
  console.assert(_dealtIds.length === 52, "Dealt hands should have 52 total cards");
  console.assert(new Set(_dealtIds).size === 52, "Dealt hands should cover all 52 unique cards");

  // Trick winner tests (generic)
  const _tNoTrump: TrumpConfig = { enabled: false, suit: "S", mustBreak: true };
  const _tTrumpS: TrumpConfig = { enabled: true, suit: "S", mustBreak: true };

  const _trick1: PlayT[] = [
    { seat: "Me", card: { suit: "H", rank: 10, id: "H10" } },
    { seat: "Left", card: { suit: "H", rank: 12, id: "H12" } },
    { seat: "Across", card: { suit: "H", rank: 3, id: "H3" } },
    { seat: "Right", card: { suit: "H", rank: 14, id: "H14" } },
  ];
  console.assert(determineTrickWinner(_trick1, _tNoTrump) === "Right", "Highest of lead suit should win");

  const _trick2: PlayT[] = [
    { seat: "Me", card: { suit: "H", rank: 10, id: "H10" } },
    { seat: "Left", card: { suit: "S", rank: 2, id: "S2" } },
    { seat: "Across", card: { suit: "H", rank: 14, id: "H14" } },
    { seat: "Right", card: { suit: "S", rank: 11, id: "S11" } },
  ];
  console.assert(determineTrickWinner(_trick2, _tTrumpS) === "Right", "Highest trump should win when trump played");

  // Legality tests: must-follow
  const _handFollow: CardT[] = [
    { suit: "H", rank: 2, id: "H2" },
    { suit: "S", rank: 14, id: "S14" },
  ];
  const _leadTrick: PlayT[] = [{ seat: "Me", card: { suit: "H", rank: 10, id: "H10" } }];
  const _base = initGameState(1);
  const _state: GameState = {
    ..._base,
    hands: { ..._base.hands, Me: _handFollow },
    leader: "Left",
    turn: "Me",
    trick: _leadTrick,
  };
  console.assert(
    isPlayLegal({
      state: _state,
      seat: "Me",
      card: { suit: "S", rank: 14, id: "S14" },
      trump: _tNoTrump,
    }) === false,
    "Must-follow should reject off-suit when holding lead suit"
  );
}
