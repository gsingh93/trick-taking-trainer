import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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
import {
  sortHand,
  compareCardsInTrick,
  trickLeadSuit,
  determineTrickWinner,
} from "@/engine/rules";
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
import {
  Grid3X3,
  RefreshCw,
  Eye,
  EyeOff,
  Moon,
  Sun,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Play,
  Pause,
} from "lucide-react";

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
  darkMode: boolean;
  suitCountPromptEnabled: boolean;
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
    if (typeof data.darkMode === "boolean") next.darkMode = data.darkMode;
    if (typeof data.suitCountPromptEnabled === "boolean") next.suitCountPromptEnabled = data.suitCountPromptEnabled;
    if (typeof data.leadCountPromptEnabled === "boolean" && typeof next.suitCountPromptEnabled !== "boolean") {
      next.suitCountPromptEnabled = data.leadCountPromptEnabled;
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
    if (typeof data.winIntentWarnAnyHigher === "boolean" && typeof next.winIntentWarnHonorsOnly !== "boolean") {
      next.winIntentWarnHonorsOnly = !data.winIntentWarnAnyHigher;
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

function suitGlyph(s: Suit) {
  return s === "S" ? "♠" : s === "H" ? "♥" : s === "D" ? "♦" : "♣";
}

function suitColorClass(s: Suit, mode: "classic" | "distinct") {
  if (mode === "distinct") {
    if (s === "S") return "text-slate-900 dark:text-slate-100";
    if (s === "C") return "text-emerald-700 dark:text-emerald-300";
    if (s === "H") return "text-red-600 dark:text-red-400";
    return "text-blue-600 dark:text-blue-400";
  }
  return s === "H" || s === "D" ? "text-red-600" : "text-foreground";
}

function rankGlyph(n: Rank) {
  if (n === 14) return "A";
  if (n === 13) return "K";
  if (n === 12) return "Q";
  if (n === 11) return "J";
  return String(n);
}

function HelpTooltip({ text }: { text: string }) {
  return (
    <span
      className="inline-flex h-4 w-4 cursor-pointer select-none items-center justify-center rounded-full border text-[10px] font-semibold text-muted-foreground"
      title={text}
    >
      ?
    </span>
  );
}

 

function createVoidSelections(): VoidSelections {
  return { Left: false, Across: false, Right: false };
}


function useMediaQuery(query: string) {
  const getMatch = () => (typeof window !== "undefined" ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(getMatch);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    if (mql.addEventListener) {
      mql.addEventListener("change", onChange);
    } else {
      // Safari < 14
      mql.addListener(onChange);
    }
    setMatches(mql.matches);
    return () => {
      if (mql.removeEventListener) {
        mql.removeEventListener("change", onChange);
      } else {
        mql.removeListener(onChange);
      }
    };
  }, [query]);

  return matches;
}

function PlayingCard({
  c,
  rotateClass,
  onClick,
  disabled,
  selected,
  highlight,
  title,
  suitStyleMode,
}: {
  c: CardT;
  rotateClass?: string;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  highlight?: boolean;
  title?: string;
  suitStyleMode: "classic" | "distinct";
}) {
  const base =
    "flex h-14 w-10 items-center justify-center rounded-xl border bg-card text-sm shadow-sm";
  const inter = onClick
    ? disabled
      ? " opacity-40 cursor-not-allowed"
      : " cursor-pointer hover:ring-2 hover:ring-foreground/30"
    : "";
  const sel = selected ? " ring-2 ring-foreground/60" : "";
  const win = highlight ? " ring-2 ring-amber-400" : "";

  return (
    <div
      title={title}
      onClick={disabled ? undefined : onClick}
      className={base + inter + sel + win + (rotateClass ? " " + rotateClass : "")}
    >
      <span className={`font-semibold ${suitColorClass(c.suit, suitStyleMode)}`}>
        {rankGlyph(c.rank)}
        {suitGlyph(c.suit)}
      </span>
    </div>
  );
}

function HandRow({
  seat,
  hand,
  rotateClass,
  legal,
  onPlay,
  currentTurn,
  suitOrder,
  sortAscending,
  canPlay,
  suitStyleMode,
}: {
  seat: Seat;
  hand: CardT[];
  rotateClass?: string;
  legal: Set<string>;
  onPlay: (seat: Seat, card: CardT) => void;
  currentTurn: Seat;
  suitOrder: Suit[];
  sortAscending: boolean;
  canPlay: boolean;
  suitStyleMode: "classic" | "distinct";
}) {
  const isTurn = seat === currentTurn;
  return (
    <div className={"mt-3 " + (rotateClass ?? "")}>
      <div className="flex flex-wrap gap-px">
        {sortHand(hand, suitOrder, sortAscending).map((c) => (
          <PlayingCard
            key={c.id}
            c={c}
            suitStyleMode={suitStyleMode}
            disabled={!canPlay || !isTurn || !legal.has(c.id)}
            onClick={() => onPlay(seat, c)}
            title={
              !canPlay
                ? "Start trick first"
                : !isTurn
                ? "Not your turn"
                : !legal.has(c.id)
                  ? "Illegal (must-follow / must-break)"
                  : "Play"
            }
          />
        ))}
      </div>
    </div>
  );
}

function HandCol({
  seat,
  hand,
  cardRotateClass,
  align,
  legal,
  onPlay,
  currentTurn,
  suitOrder,
  sortAscending,
  canPlay,
  suitStyleMode,
}: {
  seat: Seat;
  hand: CardT[];
  cardRotateClass: string;
  align: "start" | "end";
  legal: Set<string>;
  onPlay: (seat: Seat, card: CardT) => void;
  currentTurn: Seat;
  suitOrder: Suit[];
  sortAscending: boolean;
  canPlay: boolean;
  suitStyleMode: "classic" | "distinct";
}) {
  const isTurn = seat === currentTurn;
  const gridAlign = align === "end" ? "justify-items-end" : "justify-items-start";
  return (
    <div className={"mt-3 flex " + (align === "end" ? "justify-end" : "justify-start")}>
      <div className={"grid grid-cols-1 gap-0 lg:grid-cols-2 " + gridAlign}>
        {sortHand(hand, suitOrder, sortAscending).map((c) => (
          <div key={c.id} className="relative h-10 w-14 overflow-visible">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <PlayingCard
                c={c}
                rotateClass={cardRotateClass}
                suitStyleMode={suitStyleMode}
                disabled={!canPlay || !isTurn || !legal.has(c.id)}
                onClick={() => onPlay(seat, c)}
                title={
                  !canPlay
                    ? "Start trick first"
                    : !isTurn
                    ? "Not your turn"
                    : !legal.has(c.id)
                      ? "Illegal (must-follow / must-break)"
                      : "Play"
                }
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const isShortViewport = useMediaQuery("(max-height: 499px)");
  const initialSettings = useMemo(() => loadSettings(), []);
  const initialSeed = initialSettings.dealSeed ?? Math.floor(Math.random() * 1_000_000_000);

  const [modeOpenHandVerify, setModeOpenHandVerify] = useState(
    () => initialSettings.modeOpenHandVerify ?? false
  );
  const [voidTrackingEnabled, setVoidTrackingEnabled] = useState(
    () => initialSettings.voidTrackingEnabled ?? true
  );
  const [darkMode, setDarkMode] = useState(() => initialSettings.darkMode ?? false);
  const [suitCountPromptEnabled, setSuitCountPromptEnabled] = useState(
    () => initialSettings.suitCountPromptEnabled ?? false
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
    trumpBroken,
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
      darkMode,
      suitCountPromptEnabled,
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
    darkMode,
    suitCountPromptEnabled,
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
    if (!suitCountPromptEnabled) {
      resetSuitCountPrompt();
    }
  }, [suitCountPromptEnabled]);

  useEffect(() => {
    if (!voidTrackingEnabled) return;
    if (trick.length !== 1) return;
    if (trickNo === 1) return;
    const leadSeat = trick[0].seat;
    const leadSuit = trick[0].card.suit;
    if (voidPromptOnlyWhenLeading && leadSeat !== "Me") return;
    const shouldPrompt =
      voidPromptScope === "global"
        ? anyVoidObserved
        : OPPONENTS.some((o) => actualVoid[o][leadSuit]);
    if (!shouldPrompt) return;
    setLeadPromptActive(true);
    setLeadPromptSuit(leadSuit);
    setLeadPromptLeader(leadSeat === "Me" ? null : leadSeat);
    setLeadSelections(createVoidSelections());
    setLeadMismatch(createVoidSelections());
    setLeadWarning(null);
  }, [voidTrackingEnabled, trick, trickNo, actualVoid, anyVoidObserved, voidPromptScope]);

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

  function remainingPlayersVoidInSuit(suit: Suit, currentSeat: Seat): boolean {
    const playedSeats = new Set(trick.map((t) => t.seat));
    const remaining = SEATS.filter((s) => s !== currentSeat && !playedSeats.has(s));
    if (!remaining.length) return true;
    for (const seat of remaining) {
      if (seat === "Me") return false;
      if (!actualVoid[seat][suit]) return false;
    }
    return true;
  }

  function anyRemainingVoidInSuit(suit: Suit, currentSeat: Seat): boolean {
    const playedSeats = new Set(trick.map((t) => t.seat));
    const remaining = SEATS.filter((s) => s !== currentSeat && !playedSeats.has(s));
    for (const seat of remaining) {
      if (seat === "Me") continue;
      if (actualVoid[seat][suit]) return true;
    }
    return false;
  }

  function currentTrickHasAllHigherHonors(card: CardT, suit: Suit): boolean {
    if (card.rank >= 14) return false;
    const ranksInTrick = new Set(
      trick.filter((t) => t.card.suit === suit).map((t) => t.card.rank)
    );
    const higherHonors = [11, 12, 13, 14].filter((r) => r > card.rank);
    return higherHonors.every((r) => ranksInTrick.has(r));
  }

  function higherHonorsAllInHand(card: CardT, suit: Suit): boolean {
    if (card.rank >= 14) return false;
    const remaining = honorRemainingBySuit[suit].filter((r) => r > card.rank);
    if (!remaining.length) return false;
    const handRanks = new Set(hands.Me.filter((c) => c.suit === suit).map((c) => c.rank));
    return remaining.every((r) => handRanks.has(r));
  }

  function alreadyLosingTrick(card: CardT, suit: Suit): boolean {
    if (!trick.length) return false;
    let currentBest = trick[0].card;
    for (let i = 1; i < trick.length; i++) {
      const challenger = trick[i].card;
      if (compareCardsInTrick(challenger, currentBest, suit, trump) === 1) {
        currentBest = challenger;
      }
    }
    return compareCardsInTrick(card, currentBest, suit, trump) === -1;
  }

  function shouldPromptWinIntent(card: CardT, seat: Seat): boolean {
    if (!winIntentPromptEnabled) return false;
    if (seat !== "Me") return false;
    if (aiPlayMe) return false;
    if (trick.length >= 3) return false;
    if (trickNo === 1) return false;
    if (card.rank < winIntentMinRank) return false;
    const leadSuit = trickLeadSuit(trick) ?? card.suit;
    if (card.rank === 14 && !anyRemainingVoidInSuit(leadSuit, seat)) return false;
    if (currentTrickHasAllHigherHonors(card, leadSuit)) return false;
    if (higherHonorsAllInHand(card, leadSuit)) return false;
    if (alreadyLosingTrick(card, leadSuit)) return false;
    if (remainingPlayersVoidInSuit(leadSuit, seat)) return false;
    return true;
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
    const details: string[] = [];
    if (assessment.higherRanks.length) {
      const label = winIntentWarnHonorsOnly ? "Higher honors remaining" : "Higher cards remaining";
      details.push(`${label}: ${assessment.higherRanks.map(rankGlyph).join(", ")}`);
    }
    if (assessment.warning.includes("trump")) {
      const who = assessment.trumpThreats.length
        ? ` (${assessment.trumpThreats.map((s) => seatLabels[s]).join(", ")})`
        : "";
      details.push(`Trump threat: an opponent may trump with ${suitGlyph(trump.suit)}${who}`);
    }
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

  function resolveTrickAfterDelay() {
    setIsResolving(true);
    cancelResolveTimer();
    const promptSuit =
      suitCountPromptEnabled && !isViewingHistory ? shouldPromptSuitCount(trickHistory, trick) : null;

    resolveTimerRef.current = window.setTimeout(() => {
      let resolvedState: GameState | null = null;
      setGame((g) => {
        const next = resolveTrick(g, trump);
        resolvedState = next;
        return next;
      });

      if (!resolvedState) return;
      if (promptSuit) {
        setSuitCountPromptActive(true);
        setSuitCountPromptSuit(promptSuit);
        setSuitCountAnswer("0");
        setSuitCountMismatch(false);
        setIsResolving(false);
        setAwaitContinue(false);
        resolveTimerRef.current = null;
        return;
      }
      if (resolvedState.handComplete) {
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
      shouldPromptWinIntent(card, seat)
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

  const renderTableCard = () => (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-center gap-3">
              <span>Table</span>
              <Button
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={resetTrickOnly}
                disabled={isViewingHistory}
              >
                Reset trick
              </Button>
            </div>
            <div className="pl-0.5 text-xs text-muted-foreground">
              {isViewingHistory ? `Viewing trick ${displayTrickNo}` : `Trick ${trickNo}`}
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-1 pb-3 px-3 sm:pt-3 sm:pb-6 sm:px-6">
        <div className="grid grid-cols-[minmax(0,0.25fr)_minmax(0,0.5fr)_minmax(0,0.25fr)] grid-rows-[auto_1fr_auto] gap-x-0.5 gap-y-2 sm:grid-cols-[minmax(0,0.25fr)_minmax(0,0.5fr)_minmax(0,0.25fr)] sm:gap-3">
          {/* Across spans full width */}
          <div className="col-span-3 rounded-xl border p-2 sm:p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div
                className={
                  "flex items-center gap-2 rounded-md px-1 py-0.5 text-sm font-medium " +
                  (displayTurn === "Across" && !displayHandComplete
                    ? "bg-emerald-100/70 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
                    : "")
                }
              >
                <span>
                  {seatLabels.Across}{" "}
                  <span className="text-xs text-muted-foreground">
                    (
                    <span className={bidResultDisplay ? bidResultDisplay.Across.className : ""}>
                      {displayTricksWon.Across}
                    </span>
                    {bidDisplay ? `/${bidDisplay.Across}` : ""})
                  </span>
                  {bidResultDisplay ? (
                    <span className={"ml-2 text-xs font-medium " + bidResultDisplay.Across.className}>
                      {bidResultDisplay.Across.label}
                    </span>
                  ) : null}
                </span>
              </div>
              <Badge variant="outline">{displayHands.Across.length}</Badge>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2 text-emerald-600 border-emerald-600 md:text-foreground md:border-border"
                onClick={() => toggleRevealSeat("Across")}
                disabled={modeOpenHandVerify || isViewingHistory}
              >
                {shownHands.Across ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="hidden md:inline">{shownHands.Across ? "Hide" : "Reveal"}</span>
              </Button>
            </div>
            {shownHands.Across ? (
              <HandRow
                seat="Across"
                hand={displayHands.Across}
                legal={legalBySeat.Across}
                onPlay={(s, c) => tryPlay(s, c, "human")}
                currentTurn={displayTurn}
                suitOrder={suitOrder}
                sortAscending={sortAscending}
                canPlay={canPlay}
                suitStyleMode={suitStyleMode}
              />
            ) : null}
          </div>

          {/* Left spans rows */}
          <div
            className={
              "row-span-2 rounded-xl border p-2 sm:p-3 " + (shownHands.Left ? "min-h-[400px]" : "")
            }
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div
                className={
                  "flex items-center gap-2 rounded-md px-1 py-0.5 text-sm font-medium " +
                  (displayTurn === "Left" && !displayHandComplete
                    ? "bg-emerald-100/70 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
                    : "")
                }
              >
                <span>
                  {seatLabels.Left}{" "}
                  <span className="text-xs text-muted-foreground">
                    (
                    <span className={bidResultDisplay ? bidResultDisplay.Left.className : ""}>
                      {displayTricksWon.Left}
                    </span>
                    {bidDisplay ? `/${bidDisplay.Left}` : ""})
                  </span>
                  {bidResultDisplay ? (
                    <span className={"ml-2 text-xs font-medium " + bidResultDisplay.Left.className}>
                      {bidResultDisplay.Left.label}
                    </span>
                  ) : null}
                </span>
              </div>
              <Badge variant="outline">{displayHands.Left.length}</Badge>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2 text-emerald-600 border-emerald-600 md:text-foreground md:border-border"
                onClick={() => toggleRevealSeat("Left")}
                disabled={modeOpenHandVerify || isViewingHistory}
              >
                {shownHands.Left ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="hidden md:inline">{shownHands.Left ? "Hide" : "Reveal"}</span>
              </Button>
            </div>
            {shownHands.Left ? (
              <HandCol
                seat="Left"
                hand={displayHands.Left}
                cardRotateClass="rotate-90 origin-center"
                align="start"
                legal={legalBySeat.Left}
                onPlay={(s, c) => tryPlay(s, c, "human")}
                currentTurn={displayTurn}
                suitOrder={suitOrder}
                sortAscending={sortAscending}
                canPlay={canPlay}
                suitStyleMode={suitStyleMode}
              />
            ) : null}
          </div>

          {/* Current trick stays fixed size */}
          <div
            className="relative flex h-[200px] w-[200px] items-center justify-center rounded-xl border bg-emerald-600/80 p-2 shadow-inner self-center justify-self-center sm:h-[240px] sm:w-[240px] sm:p-3"
            onClick={
              canAdvanceTrick({ awaitContinue, handComplete, isViewingHistory })
                ? () => {
                    setGame((g) => advanceToNextTrick(g));
                    setAwaitContinue(false);
                  }
                : undefined
            }
          >
            <div className="absolute right-2 top-2 text-white">
              <Badge className="bg-white/20 text-white hover:bg-white/20" variant="secondary">
                {displayTrick.length}/4
              </Badge>
            </div>

            {/* Diamond layout */}
            <div className="relative h-36 w-36 sm:h-40 sm:w-40">
              {/* Across (top) */}
              <div className="absolute left-1/2 top-0 -translate-x-1/2">
                {(() => {
                  const p = displayTrick.find((t) => t.seat === "Across");
                  return p ? (
                    <PlayingCard c={p.card} highlight={displayTrickWinner === "Across"} suitStyleMode={suitStyleMode} />
                  ) : (
                    <div className="h-14 w-10 opacity-20" />
                  );
                })()}
              </div>

              {/* Left */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2">
                {(() => {
                  const p = displayTrick.find((t) => t.seat === "Left");
                  return p ? (
                    <PlayingCard
                      c={p.card}
                      rotateClass="rotate-90"
                      highlight={displayTrickWinner === "Left"}
                      suitStyleMode={suitStyleMode}
                    />
                  ) : (
                    <div className="h-10 w-14 opacity-20" />
                  );
                })()}
              </div>

              {/* Right */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2">
                {(() => {
                  const p = displayTrick.find((t) => t.seat === "Right");
                  return p ? (
                    <PlayingCard
                      c={p.card}
                      rotateClass="-rotate-90"
                      highlight={displayTrickWinner === "Right"}
                      suitStyleMode={suitStyleMode}
                    />
                  ) : (
                    <div className="h-10 w-14 opacity-20" />
                  );
                })()}
              </div>

              {/* Me (bottom) */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
                {(() => {
                  const p = displayTrick.find((t) => t.seat === "Me");
                  return p ? (
                    <PlayingCard c={p.card} highlight={displayTrickWinner === "Me"} suitStyleMode={suitStyleMode} />
                  ) : (
                    <div className="h-14 w-10 opacity-20" />
                  );
                })()}
              </div>
            </div>

            <div className="absolute bottom-2 left-1/2 w-[190px] -translate-x-1/2 text-center text-xs text-white/80 sm:w-[220px]">
              {awaitContinue && !handComplete && !isViewingHistory ? (
                <>
                  <span className="sm:hidden">Click to continue</span>
                  <span className="hidden sm:inline">Press Enter/Space or click to continue</span>
                </>
              ) : null}
            </div>

            {biddingActive && bidState && currentBidder(bidState) === "Me" && !isBiddingComplete(bidState) ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
                <div className="w-[170px] space-y-3 rounded-lg border bg-card px-3 py-3 text-sm shadow-lg">
                  <div className="text-sm font-medium">Enter your bid</div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
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
            ) : null}

            {suitCountPromptEnabled && suitCountPromptActive ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
                <div className="w-[220px] space-y-3 rounded-lg border bg-card px-3 py-3 text-sm shadow-lg">
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
                  {suitCountMismatch ? (
                    <div className="text-xs text-destructive">Suit count is incorrect</div>
                  ) : null}
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
            ) : null}

            {pendingIntentCard ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
                <div className="w-[200px] space-y-3 rounded-lg border bg-card px-3 py-3 text-sm shadow-lg">
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
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer select-none">Details</summary>
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
            ) : null}
          </div>

          {/* Right spans rows */}
          <div
            className={
              "row-span-2 rounded-xl border p-2 sm:p-3 " + (shownHands.Right ? "min-h-[400px]" : "")
            }
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div
                className={
                  "flex items-center gap-2 rounded-md px-1 py-0.5 text-sm font-medium " +
                  (displayTurn === "Right" && !displayHandComplete
                    ? "bg-emerald-100/70 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
                    : "")
                }
              >
                <span>
                  {seatLabels.Right}{" "}
                  <span className="text-xs text-muted-foreground">
                    (
                    <span className={bidResultDisplay ? bidResultDisplay.Right.className : ""}>
                      {displayTricksWon.Right}
                    </span>
                    {bidDisplay ? `/${bidDisplay.Right}` : ""})
                  </span>
                  {bidResultDisplay ? (
                    <span className={"ml-2 text-xs font-medium " + bidResultDisplay.Right.className}>
                      {bidResultDisplay.Right.label}
                    </span>
                  ) : null}
                </span>
              </div>
              <Badge variant="outline">{displayHands.Right.length}</Badge>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2 text-emerald-600 border-emerald-600 md:text-foreground md:border-border"
                onClick={() => toggleRevealSeat("Right")}
                disabled={modeOpenHandVerify || isViewingHistory}
              >
                {shownHands.Right ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="hidden md:inline">{shownHands.Right ? "Hide" : "Reveal"}</span>
              </Button>
            </div>
            {shownHands.Right ? (
              <HandCol
                seat="Right"
                hand={displayHands.Right}
                cardRotateClass="-rotate-90 origin-center"
                align="end"
                legal={legalBySeat.Right}
                onPlay={(s, c) => tryPlay(s, c, "human")}
                currentTurn={displayTurn}
                suitOrder={suitOrder}
                sortAscending={sortAscending}
                canPlay={canPlay}
                suitStyleMode={suitStyleMode}
              />
            ) : null}
          </div>

          {/* Me spans full width */}
          <div className="col-span-3 rounded-xl border p-2 sm:p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div
                className={
                  "flex items-center gap-2 rounded-md px-1 py-0.5 text-sm font-medium " +
                  (displayTurn === "Me" && !displayHandComplete
                    ? "bg-emerald-100/70 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
                    : "")
                }
              >
                <span>
                  {seatLabels.Me}{" "}
                  <span className="text-xs text-muted-foreground">
                    (
                    <span className={bidResultDisplay ? bidResultDisplay.Me.className : ""}>
                      {displayTricksWon.Me}
                    </span>
                    {bidDisplay ? `/${bidDisplay.Me}` : ""})
                  </span>
                  {bidResultDisplay ? (
                    <span className={"ml-2 text-xs font-medium " + bidResultDisplay.Me.className}>
                      {bidResultDisplay.Me.label}
                    </span>
                  ) : null}
                </span>
              </div>
              <Badge variant="outline">{displayHands.Me.length}</Badge>
            </div>
            <HandRow
              seat="Me"
              hand={displayHands.Me}
              legal={legalBySeat.Me}
              onPlay={(s, c) => tryPlay(s, c, "human")}
              currentTurn={displayTurn}
              suitOrder={suitOrder}
              sortAscending={sortAscending}
              canPlay={canPlay}
              suitStyleMode={suitStyleMode}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderVoidTrackingCard = () => (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Void tracking</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            After a lead, confirm which opponents are void in the lead suit.
          </div>
          <div className="text-sm font-medium">
            {!voidTrackingEnabled
              ? "Void tracking is disabled"
              : isViewingHistory
                ? "Viewing trick history"
                : leadPromptActive
                  ? "Which opponents are void in the lead suit?"
                  : trick.length === 0
                    ? "Waiting for a card to be led..."
                    : anyVoidObserved
                      ? "Trick in progress..."
                      : "Waiting for first off-suit..."}
          </div>
          {leadPromptSuit ? (
            <div className={"text-sm " + suitColorClass(leadPromptSuit, suitStyleMode)}>
              Lead suit: {suitGlyph(leadPromptSuit)}
            </div>
          ) : null}
          <div className="space-y-2 text-sm">
            {OPPONENTS.map((o) => {
              const isLeader = leadPromptLeader === o;
              const mismatch = leadMismatch[o];
              const disabled = !voidTrackingEnabled || isViewingHistory || !leadPromptActive || isLeader;
              return (
                <label
                  key={o}
                  className={
                    "flex items-center justify-between rounded-md border px-2 py-1 " +
                    (mismatch ? "border-destructive" : "border-border") +
                    (disabled ? " opacity-60" : "")
                  }
                >
                  <span>{seatLabels[o]}</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={leadSelections[o]}
                    onChange={() => toggleLeadSelection(o)}
                    disabled={disabled}
                  />
                </label>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          {leadWarning ? <div className="text-xs text-destructive">{leadWarning}</div> : null}
          <div className="flex gap-2">
            <Button
              onClick={resumeAfterLeadPrompt}
              disabled={
                isViewingHistory ||
                !leadPromptActive ||
                isResolving ||
                awaitContinue ||
                (leadPromptActive && !voidTrackingEnabled)
              }
              className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-600/50"
            >
              Resume
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={skipLeadPrompt}
              disabled={isViewingHistory || !leadPromptActive || isResolving || awaitContinue}
            >
              Skip
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderTrickHistoryCard = () => (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Trick history</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {trickHistory.length === 0 ? (
          <div className="text-xs text-muted-foreground">No completed tricks yet</div>
        ) : (
          <div className="space-y-2">
            {trickHistory.map((t, idx) => {
              const leadSuit = trickLeadSuit(t);
              const winner = t.length === 4 ? determineTrickWinner(t, trump) : null;
              const leadSeat = t[0]?.seat ? seatLabels[t[0].seat] : "-";
              const isActive = viewedTrickIndex === idx;
              return (
                <button
                  key={`${idx}-${t[0]?.card.id ?? "trick"}`}
                  type="button"
                  onClick={() => {
                    setViewedTrickIndex(idx);
                    setViewedTrickStep(0);
                    setHistoryPlaying(false);
                  }}
                  className={
                    "w-full rounded-md border px-2 py-2 text-left text-xs transition " +
                    (isActive
                      ? "border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-100"
                      : "border-border hover:bg-accent")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">Trick {idx + 1}</span>
                    {leadSuit ? <span className={suitColorClass(leadSuit, suitStyleMode)}>{suitGlyph(leadSuit)}</span> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span>Lead: {leadSeat}</span>
                    {winner ? <span>Winner: {seatLabels[winner]}</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {isViewingHistory && viewedTrickIndex != null ? (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              Viewing trick {viewedTrickIndex + 1} • Step {Math.min(viewedTrickStep, 4)}/4
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setViewedTrickStep(0);
                  setHistoryPlaying(false);
                }}
                aria-label="Jump to start"
              >
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setViewedTrickStep((s) => Math.max(0, s - 1));
                  setHistoryPlaying(false);
                }}
                aria-label="Step back"
              >
                <StepBack className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const maxStep = trickHistory[viewedTrickIndex]?.length ?? 0;
                  if (viewedTrickStep >= maxStep) {
                    setHistoryPlaying(false);
                    return;
                  }
                  setHistoryPlaying((p) => !p);
                }}
                aria-label={historyPlaying ? "Pause" : "Play"}
              >
                {historyPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const maxStep = trickHistory[viewedTrickIndex]?.length ?? 0;
                  setViewedTrickStep((s) => Math.min(maxStep, s + 1));
                  setHistoryPlaying(false);
                }}
                aria-label="Step forward"
              >
                <StepForward className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const maxStep = trickHistory[viewedTrickIndex]?.length ?? 0;
                  setViewedTrickStep(maxStep);
                  setHistoryPlaying(false);
                }}
                aria-label="Jump to end"
              >
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setViewedTrickIndex(null)}>
                Return to live
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => resumeFromHistory(viewedTrickIndex, viewedTrickStep)}
              >
                Play from this point
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );

  const renderSettingsCard = () => (
    <Card>
      <CardHeader>
        <CardTitle>Training Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between">
          <span className="text-sm">Open-hand verify</span>
          <Switch checked={modeOpenHandVerify} onCheckedChange={setModeOpenHandVerify} />
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">Void tracking</span>
              <HelpTooltip text="Require confirming which opponents are void in the lead suit" />
            </div>
            <Switch checked={voidTrackingEnabled} onCheckedChange={setVoidTrackingEnabled} />
          </div>

          <div className={"flex items-center justify-between gap-2 " + (!voidTrackingEnabled ? "opacity-50" : "")}>
            <div className="flex items-center gap-2 text-sm">
              <span>Prompt after first void</span>
              <HelpTooltip text={"Global: after any off-suit, prompt on every lead\nPer suit: only prompt after off-suit in that suit"} />
            </div>
            <Select
              value={voidPromptScope}
              onValueChange={(v) => setVoidPromptScope(v as "global" | "per-suit")}
              disabled={!voidTrackingEnabled}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global</SelectItem>
                <SelectItem value="per-suit">Per suit</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className={"flex justify-between " + (!voidTrackingEnabled ? "opacity-50" : "")}>
          <span className="text-sm">Void prompts only when leading</span>
          <Switch
            checked={voidPromptOnlyWhenLeading}
            onCheckedChange={setVoidPromptOnlyWhenLeading}
            disabled={!voidTrackingEnabled}
          />
        </div>

        <Separator />

        <div className="flex justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">Suit count prompt</span>
            <HelpTooltip text="After the first off-suit in a suit, ask how many of that suit remain outside your hand" />
          </div>
          <Switch checked={suitCountPromptEnabled} onCheckedChange={setSuitCountPromptEnabled} />
        </div>

        <Separator />

        <div className="flex justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">Win intent prompt</span>
            <HelpTooltip text="When you play a card at or above the win intent minimum rank, ask if you intend to win the trick and warn if it can be beaten" />
          </div>
          <Switch checked={winIntentPromptEnabled} onCheckedChange={setWinIntentPromptEnabled} />
        </div>

        <div className={"grid grid-cols-[minmax(0,1fr)_auto] gap-2 " + (!winIntentPromptEnabled ? "opacity-50" : "")}>
          <div className="flex items-center gap-2 text-sm">
            <span>Win intent minimum rank</span>
            <HelpTooltip text="Only prompt when playing this rank or higher" />
          </div>
          <Select
            value={String(winIntentMinRank)}
            onValueChange={(v) => setWinIntentMinRank(Number(v) as Rank)}
            disabled={!winIntentPromptEnabled}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                { label: "2", value: 2 },
                { label: "3", value: 3 },
                { label: "4", value: 4 },
                { label: "5", value: 5 },
                { label: "6", value: 6 },
                { label: "7", value: 7 },
                { label: "8", value: 8 },
                { label: "9", value: 9 },
                { label: "10", value: 10 },
                { label: "J", value: 11 },
                { label: "Q", value: 12 },
                { label: "K", value: 13 },
                { label: "A", value: 14 },
              ].map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={"flex justify-between " + (!winIntentPromptEnabled ? "opacity-50" : "")}>
          <div className="flex items-center gap-2">
            <span className="text-sm">Warn about higher honors only</span>
            <HelpTooltip text="When enabled, only warn if higher honors remain instead of any higher card" />
          </div>
          <Switch
            checked={winIntentWarnHonorsOnly}
            onCheckedChange={setWinIntentWarnHonorsOnly}
            disabled={!winIntentPromptEnabled}
          />
        </div>

        <div className={"flex justify-between " + (!winIntentPromptEnabled ? "opacity-50" : "")}>
          <div className="flex items-center gap-2">
            <span className="text-sm">Warn about trump voids</span>
            <HelpTooltip text="Warn if an opponent may be void in the lead suit and able to trump" />
          </div>
          <Switch
            checked={winIntentWarnTrump}
            onCheckedChange={setWinIntentWarnTrump}
            disabled={!winIntentPromptEnabled}
          />
        </div>

        <Separator />

        <div className="flex justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">Show errors</span>
            <HelpTooltip text="When enabled, highlight incorrect selections in red" />
          </div>
          <Switch checked={checkErrorsEnabled} onCheckedChange={setCheckErrorsEnabled} />
        </div>

        <div className="h-1" />
        <CardTitle>Gameplay &amp; UI Settings</CardTitle>

        <div className="flex justify-between">
          <span className="text-sm">AI opponents</span>
          <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
        </div>

        <div className={"grid grid-cols-[minmax(0,1fr)_auto] gap-2 " + (handInProgress || biddingActive ? "opacity-50" : "")}>
          <span className="text-sm">AI mode</span>
          <Select
            value={aiMode}
            onValueChange={(v) => setAiMode(v as "random" | "bidding")}
            disabled={handInProgress || biddingActive}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="random">Random</SelectItem>
              <SelectItem value="bidding">Bidding</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className={"flex justify-between " + (!aiEnabled ? "opacity-50" : "")}>
          <span className="text-sm">AI for me</span>
          <Switch checked={aiPlayMe} onCheckedChange={setAiPlayMe} disabled={!aiEnabled} />
        </div>

        <div className={"grid grid-cols-[minmax(0,1fr)_auto] gap-2 " + (!aiEnabled ? "opacity-50" : "")}>
          <span className="text-sm">AI delay (ms)</span>
          <input
            type="number"
            min={0}
            step={250}
            value={aiDelayInput}
            disabled={!aiEnabled}
            onChange={(e) => {
              const raw = e.target.value;
              setAiDelayInput(raw);
              if (raw.trim() === "") return;
              const n = Number(raw);
              if (Number.isFinite(n) && n >= 0) {
                setAiDelayMs(Math.floor(n));
              }
            }}
            onBlur={() => {
              commitAiDelayInput(aiDelayInput);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitAiDelayInput(aiDelayInput);
              }
            }}
            className="h-8 w-20 rounded-md border bg-background px-2 text-sm"
          />
        </div>

        <div className="flex justify-between">
          <span className="text-sm">Pause before next trick</span>
          <Switch checked={pauseBeforeNextTrick} onCheckedChange={setPauseBeforeNextTrick} />
        </div>

        <Separator />

        <div className="flex justify-between">
          <span className="text-sm">Trump enabled</span>
          <Switch checked={trump.enabled} onCheckedChange={(v) => setTrump((t) => ({ ...t, enabled: v }))} />
        </div>

        <div className={"grid grid-cols-[minmax(0,1fr)_auto] gap-2 " + (!trump.enabled ? "opacity-50" : "")}>
          <span className="text-sm">Trump suit</span>
          <Select value={trump.suit} onValueChange={(v) => setTrump((t) => ({ ...t, suit: v as Suit }))} disabled={!trump.enabled}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUITS.map((s) => (
                <SelectItem key={s} value={s}>
                  <span className={suitColorClass(s, suitStyleMode)}>{suitGlyph(s)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={"flex justify-between " + (!trump.enabled ? "opacity-50" : "")}>
          <div className="flex items-center gap-2">
            <span className="text-sm">Must break</span>
            <HelpTooltip text="Prevents leading trump until trump has been played (unless you only have trump)" />
          </div>
          <Switch checked={trump.mustBreak} onCheckedChange={(v) => setTrump((t) => ({ ...t, mustBreak: v }))} disabled={!trump.enabled} />
        </div>

        <Separator />

        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <span className="text-sm">Suit order</span>
          <Select value={suitOrderMode} onValueChange={(v) => setSuitOrderMode(v as "bridge" | "poker")}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bridge">
                Bridge (
                <span className="inline-flex gap-1">
                  {["S", "H", "D", "C"].map((s) => (
                    <span key={s} className={suitColorClass(s as Suit, suitStyleMode)}>
                      {suitGlyph(s as Suit)}
                    </span>
                  ))}
                </span>
                )
              </SelectItem>
              <SelectItem value="poker">
                Poker (
                <span className="inline-flex gap-1">
                  {["C", "D", "H", "S"].map((s) => (
                    <span key={s} className={suitColorClass(s as Suit, suitStyleMode)}>
                      {suitGlyph(s as Suit)}
                    </span>
                  ))}
                </span>
                )
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <span className="text-sm">Suit colors</span>
          <Select value={suitStyleMode} onValueChange={(v) => setSuitStyleMode(v as "classic" | "distinct")}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="classic">
                Classic (
                <span className="inline-flex gap-1">
                  {["S", "C"].map((s) => (
                    <span key={s} className={suitColorClass(s as Suit, "classic")}>
                      {suitGlyph(s as Suit)}
                    </span>
                  ))}
                  {["H", "D"].map((s) => (
                    <span key={s} className={suitColorClass(s as Suit, "classic")}>
                      {suitGlyph(s as Suit)}
                    </span>
                  ))}
                </span>
                )
              </SelectItem>
              <SelectItem value="distinct">
                Distinct (
                <span className="inline-flex gap-1">
                  {["S", "C", "H", "D"].map((s) => (
                    <span key={s} className={suitColorClass(s as Suit, "distinct")}>
                      {suitGlyph(s as Suit)}
                    </span>
                  ))}
                </span>
                )
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-between">
          <span className="text-sm">Sort ascending</span>
          <Switch checked={sortAscending} onCheckedChange={setSortAscending} />
        </div>

        <Separator />

        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <span className="text-sm">Seat labels</span>
          <Select value={seatLabelMode} onValueChange={(v) => setSeatLabelMode(v as "relative" | "compass")}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
          <SelectItem value="relative">Left / Across / Right / Me</SelectItem>
          <SelectItem value="compass">North / South / East / West</SelectItem>
        </SelectContent>
      </Select>
    </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background p-3 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Grid3X3 className="h-5 w-5" />
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
                <Button className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700" onClick={newSeed}>
                  <RefreshCw className="h-4 w-4" />
                  New seed
                </Button>
                <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={resetHand}>
                  Reset hand
                </Button>
              </div>
            </div>
          </div>
        </header>

        {isShortViewport ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-1 md:grid-cols-[minmax(0,1fr)_auto]">
              {renderTableCard()}
              <div className="w-full md:max-w-[330px] md:justify-self-end md:self-center">
                {renderVoidTrackingCard()}
              </div>
            </div>
            <div className="space-y-6 md:max-w-[330px] md:justify-self-end">
              {renderTrickHistoryCard()}
              {renderSettingsCard()}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:gap-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            {renderTableCard()}
            <div className="space-y-6 w-full md:max-w-[330px] md:justify-self-end">
              {renderVoidTrackingCard()}
              {renderTrickHistoryCard()}
              {renderSettingsCard()}
            </div>
          </div>
        )}
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
  const _state = {
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
