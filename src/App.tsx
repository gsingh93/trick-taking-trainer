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
import {
  sortHand,
  trickLeadSuit,
  isLegalPlay,
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
  type GameState,
} from "@/engine/state";
import {
  SUITS,
  OPPONENTS,
  SEATS,
  type Suit,
  type Opp,
  type Seat,
  type CardT,
  type Hands,
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

type VoidGrid = Record<Opp, Record<Suit, boolean>>;
type VoidSelections = Record<Opp, boolean>;

const SETTINGS_KEY = "trick-taking-trainer:settings";

type Settings = {
  dealSeed: number;
  seedInput: string;
  modeOpenHandVerify: boolean;
  voidTrackingEnabled: boolean;
  darkMode: boolean;
  leadCountPromptEnabled: boolean;
  checkErrorsEnabled: boolean;
  voidPromptScope: "global" | "per-suit";
  suitOrderMode: "bridge" | "poker";
  sortAscending: boolean;
  aiEnabled: boolean;
  aiDelayMs: number;
  pauseBeforeNextTrick: boolean;
  aiPlayMe: boolean;
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
    if (typeof data.leadCountPromptEnabled === "boolean") next.leadCountPromptEnabled = data.leadCountPromptEnabled;
    if (typeof data.checkErrorsEnabled === "boolean") next.checkErrorsEnabled = data.checkErrorsEnabled;
    if (data.voidPromptScope === "global" || data.voidPromptScope === "per-suit") {
      next.voidPromptScope = data.voidPromptScope;
    }
    if (data.suitOrderMode === "bridge" || data.suitOrderMode === "poker") {
      next.suitOrderMode = data.suitOrderMode;
    }
    if (typeof data.sortAscending === "boolean") next.sortAscending = data.sortAscending;
    if (typeof data.aiEnabled === "boolean") next.aiEnabled = data.aiEnabled;
    if (typeof data.aiDelayMs === "number" && Number.isFinite(data.aiDelayMs) && data.aiDelayMs >= 0) {
      next.aiDelayMs = Math.floor(data.aiDelayMs);
    }
    if (typeof data.pauseBeforeNextTrick === "boolean") {
      next.pauseBeforeNextTrick = data.pauseBeforeNextTrick;
    }
    if (typeof data.aiPlayMe === "boolean") next.aiPlayMe = data.aiPlayMe;
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

function suitColorClass(s: Suit) {
  return s === "H" || s === "D" ? "text-red-600" : "text-foreground";
}

function rankGlyph(n: Rank) {
  if (n === 14) return "A";
  if (n === 13) return "K";
  if (n === 12) return "Q";
  if (n === 11) return "J";
  return String(n);
}

 

function createVoidGrid(): VoidGrid {
  return {
    Left: { S: false, H: false, D: false, C: false },
    Across: { S: false, H: false, D: false, C: false },
    Right: { S: false, H: false, D: false, C: false },
  };
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
}: {
  c: CardT;
  rotateClass?: string;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  highlight?: boolean;
  title?: string;
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
      <span className={`font-semibold ${suitColorClass(c.suit)}`}>
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
}) {
  const isTurn = seat === currentTurn;
  return (
    <div className={"mt-3 " + (rotateClass ?? "")}>
      <div className="flex flex-wrap gap-px">
        {sortHand(hand, suitOrder, sortAscending).map((c) => (
          <PlayingCard
            key={c.id}
            c={c}
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
  const [leadCountPromptEnabled, setLeadCountPromptEnabled] = useState(
    () => initialSettings.leadCountPromptEnabled ?? false
  );
  const [checkErrorsEnabled, setCheckErrorsEnabled] = useState(
    () => initialSettings.checkErrorsEnabled ?? true
  );
  const [voidPromptScope, setVoidPromptScope] = useState<"global" | "per-suit">(
    () => initialSettings.voidPromptScope ?? "global"
  );
  const [suitOrderMode, setSuitOrderMode] = useState<"bridge" | "poker">(
    () => initialSettings.suitOrderMode ?? "bridge"
  );
  const [sortAscending, setSortAscending] = useState(() => initialSettings.sortAscending ?? true);

  const [aiEnabled, setAiEnabled] = useState(() => initialSettings.aiEnabled ?? true);
  const [aiDelayMs, setAiDelayMs] = useState(() => initialSettings.aiDelayMs ?? 1000);
  const [pauseBeforeNextTrick, setPauseBeforeNextTrick] = useState(
    () => initialSettings.pauseBeforeNextTrick ?? true
  );
  const [aiPlayMe, setAiPlayMe] = useState(() => initialSettings.aiPlayMe ?? false);
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
  const [leadCountAnswer, setLeadCountAnswer] = useState("0");
  const [leadCountMismatch, setLeadCountMismatch] = useState(false);

  const [reveal, setReveal] = useState<Record<Seat, boolean>>({
    Left: false,
    Across: false,
    Right: false,
    Me: true,
  });

  const resolveTimerRef = useRef<number | null>(null);
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

  const suitOrder = useMemo<Suit[]>(() => {
    return suitOrderMode === "bridge" ? ["S", "H", "D", "C"] : ["C", "D", "H", "S"];
  }, [suitOrderMode]);

  const actualVoid = useMemo<VoidGrid>(() => {
    const out = createVoidGrid();
    const observedTricks = trick.length > 1 ? [...trickHistory, trick] : trickHistory;
    for (const t of observedTricks) {
      const lead = trickLeadSuit(t);
      if (!lead) continue;
      for (let i = 1; i < t.length; i++) {
        const play = t[i];
        if (play.card.suit !== lead && play.seat !== "Me") {
          out[play.seat][lead] = true;
        }
      }
    }
    return out;
  }, [trickHistory, trick]);

  const anyVoidObserved = useMemo(() => {
    return OPPONENTS.some((o) => SUITS.some((s) => actualVoid[o][s]));
  }, [actualVoid]);

  const leadSuitCount = useMemo(() => {
    if (!leadPromptSuit) return 0;
    return trickHistory.reduce((acc, t) => {
      const lead = trickLeadSuit(t);
      return lead === leadPromptSuit ? acc + 1 : acc;
    }, 0);
  }, [leadPromptSuit, trickHistory]);

  useEffect(() => {
    const settings: Settings = {
      dealSeed,
      seedInput,
      modeOpenHandVerify,
      voidTrackingEnabled,
      darkMode,
      leadCountPromptEnabled,
      checkErrorsEnabled,
      voidPromptScope,
      suitOrderMode,
      sortAscending,
      aiEnabled,
      aiDelayMs,
      pauseBeforeNextTrick,
      aiPlayMe,
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
    leadCountPromptEnabled,
    checkErrorsEnabled,
    voidPromptScope,
    suitOrderMode,
    sortAscending,
    aiEnabled,
    aiDelayMs,
    pauseBeforeNextTrick,
    aiPlayMe,
    trump,
  ]);

  const legalBySeat = useMemo(() => {
    const out: Record<Seat, Set<string>> = {
      Left: new Set(),
      Across: new Set(),
      Right: new Set(),
      Me: new Set(),
    };
    for (const s of SEATS) {
      const isLeaderNow = s === leader && trick.length === 0;
      for (const c of hands[s]) {
        if (
          isLegalPlay({
            hand: hands[s],
            card: c,
            trick,
            isLeader: isLeaderNow,
            trump,
            trumpBroken,
          })
        ) {
          out[s].add(c.id);
        }
      }
    }
    return out;
  }, [hands, trick, leader, trump, trumpBroken]);

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

  const canPlay = !leadPromptActive && !awaitContinue && !handComplete && !isViewingHistory;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

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
      setLeadPromptActive(false);
      setLeadPromptSuit(null);
      setLeadPromptLeader(null);
      setLeadWarning(null);
      setLeadMismatch(createVoidSelections());
      setLeadCountAnswer("0");
      setLeadCountMismatch(false);
      return;
    }
    if (trick.length === 0) {
      setLeadPromptActive(false);
      setLeadPromptSuit(null);
      setLeadPromptLeader(null);
      setLeadWarning(null);
      setLeadMismatch(createVoidSelections());
      setLeadCountAnswer("0");
      setLeadCountMismatch(false);
    }
  }, [voidTrackingEnabled, trick.length]);

  useEffect(() => {
    if (!voidTrackingEnabled) return;
    if (trick.length !== 1) return;
    if (trickNo === 1) return;
    const leadSeat = trick[0].seat;
    const leadSuit = trick[0].card.suit;
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
    setLeadCountAnswer("0");
    setLeadCountMismatch(false);
  }, [voidTrackingEnabled, trick, trickNo, actualVoid, anyVoidObserved, voidPromptScope]);

  function cancelResolveTimer() {
    if (resolveTimerRef.current != null) {
      clearTimeout(resolveTimerRef.current);
      resolveTimerRef.current = null;
    }
  }

  function resetForDeal(seed: number) {
    cancelResolveTimer();
    setDealSeed(seed);
    setSeedInput(String(seed));
    setGame(initGameState(seed));
    setViewedTrickIndex(null);
    setViewedTrickStep(0);
    setHistoryPlaying(false);
    setLeadPromptActive(false);
    setLeadPromptSuit(null);
    setLeadPromptLeader(null);
    setLeadSelections(createVoidSelections());
    setLeadMismatch(createVoidSelections());
    setLeadWarning(null);
    setLeadCountAnswer("0");
    setLeadCountMismatch(false);
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
    if (leadCountPromptEnabled) {
      const answer = Number(leadCountAnswer);
      if (!Number.isFinite(answer) || answer !== leadSuitCount) {
        setLeadCountMismatch(true);
        return;
      }
      setLeadCountMismatch(false);
    }
    setLeadPromptActive(false);
    setLeadPromptSuit(null);
    setLeadPromptLeader(null);
    setLeadWarning(null);
    setLeadMismatch(createVoidSelections());
    setLeadCountAnswer("0");
    setLeadCountMismatch(false);
  }

  function toggleRevealSeat(seat: Seat) {
    setReveal((r) => ({ ...r, [seat]: !r[seat] }));
  }

  function resolveTrickAfterDelay() {
    setIsResolving(true);
    cancelResolveTimer();

    resolveTimerRef.current = window.setTimeout(() => {
      let resolvedState: GameState | null = null;
      setGame((g) => {
        const next = resolveTrick(g, trump);
        resolvedState = next;
        return next;
      });

      if (!resolvedState) return;
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

  function tryPlay(seat: Seat, card: CardT, source: "human" | "ai" = "human") {
    if (isResolving) return;
    if (isViewingHistory) return;
    if (awaitContinue) return;
    if (handComplete) return;

    // Only the leader may lead a new trick.
    if (trick.length === 0 && seat !== leader) return;

    // Require void tracking prompt to be resolved before any play.
    if (voidTrackingEnabled && leadPromptActive) return;

    if (seat !== turn) return;

    // If a human is trying to play an opponent hand, require it to be revealed.
    if (source === "human" && seat !== "Me" && !shownHands[seat]) return;

    const isLeaderNow = seat === leader && trick.length === 0;
    if (
      !isLegalPlay({
        hand: hands[seat],
        card,
        trick,
        isLeader: isLeaderNow,
        trump,
        trumpBroken,
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
    setLeadPromptActive(false);
    setLeadPromptSuit(null);
    setLeadPromptLeader(null);
    setLeadSelections(createVoidSelections());
    setLeadMismatch(createVoidSelections());
    setLeadWarning(null);
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
    setLeadPromptActive(false);
    setLeadPromptSuit(null);
    setLeadPromptLeader(null);
    setLeadSelections(createVoidSelections());
    setLeadMismatch(createVoidSelections());
    setLeadWarning(null);
    setLeadCountAnswer("0");
    setLeadCountMismatch(false);
    setViewedTrickIndex(null);
    setViewedTrickStep(0);
    setHistoryPlaying(false);
  }

  // Basic AI: players play a random valid card when it's their turn.
  useEffect(() => {
    if (!aiEnabled) return;
    if (isResolving) return;
    if (handComplete) return;
    if (awaitContinue) return;
    if (isViewingHistory) return;
    if (turn === "Me" && !aiPlayMe) return;
    if (voidTrackingEnabled && leadPromptActive) return;

    // If trick is empty, only the leader may lead.
    if (trick.length === 0 && turn !== leader) return;

    const legal = legalBySeat[turn];
    if (!legal || legal.size === 0) return;

    const decision = chooseCardToPlay(hands[turn], legal);
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
  ]);

  // If paused after a completed trick, advance on any key.
  useEffect(() => {
    if (!awaitContinue || handComplete || isViewingHistory) return;
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

  const TableCard = () => (
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
                  Across <span className="text-xs text-muted-foreground">({displayTricksWon.Across})</span>
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
                  Left <span className="text-xs text-muted-foreground">({displayTricksWon.Left})</span>
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
              />
            ) : null}
          </div>

          {/* Current trick stays fixed size */}
          <div
            className="relative flex h-[200px] w-[200px] items-center justify-center rounded-xl border bg-emerald-600/80 p-2 shadow-inner self-center justify-self-center sm:h-[240px] sm:w-[240px] sm:p-3"
            onClick={
              awaitContinue && !handComplete && !isViewingHistory
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
                    <PlayingCard c={p.card} highlight={displayTrickWinner === "Across"} />
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
                    <PlayingCard c={p.card} highlight={displayTrickWinner === "Me"} />
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
                  Right <span className="text-xs text-muted-foreground">({displayTricksWon.Right})</span>
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
                  Me <span className="text-xs text-muted-foreground">({displayTricksWon.Me})</span>
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
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const VoidTrackingCard = () => (
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
            <div className={"text-sm " + suitColorClass(leadPromptSuit)}>
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
                  <span>{o}</span>
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

        {leadCountPromptEnabled ? (
          <div className="space-y-2">
            <div className="text-sm font-medium">
              How many times has this suit been led before this trick?
            </div>
            <Select
              value={leadCountAnswer}
              onValueChange={(v) => {
                setLeadCountAnswer(v);
                setLeadCountMismatch(false);
              }}
              disabled={!leadPromptActive || !voidTrackingEnabled}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 13 }, (_, i) => String(i)).map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {leadCountMismatch ? <div className="text-xs text-destructive">Lead count is incorrect</div> : null}
          </div>
        ) : null}

        <div className="space-y-2">
          {leadWarning ? <div className="text-xs text-destructive">{leadWarning}</div> : null}
          <Button
            onClick={resumeAfterLeadPrompt}
            disabled={
              !voidTrackingEnabled || isViewingHistory || !leadPromptActive || isResolving || awaitContinue
            }
            className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-600/50"
          >
            Resume
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const TrickHistoryCard = () => (
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
              const leadSeat = t[0]?.seat ?? "-";
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
                    {leadSuit ? <span className={suitColorClass(leadSuit)}>{suitGlyph(leadSuit)}</span> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span>Lead: {leadSeat}</span>
                    {winner ? <span>Winner: {winner}</span> : null}
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
                Replay from this point
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );

  const SettingsCard = () => (
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
            <span className="text-sm">Void tracking</span>
            <Switch checked={voidTrackingEnabled} onCheckedChange={setVoidTrackingEnabled} />
          </div>

          <div className={"flex items-center justify-between gap-2 " + (!voidTrackingEnabled ? "opacity-50" : "")}>
            <div className="flex items-center gap-2 text-sm">
              <span>Prompt after first void</span>
              <span
                className="inline-flex h-4 w-4 cursor-pointer select-none items-center justify-center rounded-full border text-[10px] font-semibold text-muted-foreground"
                title={"Global: after any off-suit, prompt on every lead\nPer suit: only prompt after off-suit in that suit"}
              >
                ?
              </span>
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

        <Separator />

        <div className="flex justify-between">
          <span className="text-sm">Lead count tracking</span>
          <Switch checked={leadCountPromptEnabled} onCheckedChange={setLeadCountPromptEnabled} />
        </div>

        <Separator />

        <div className="flex justify-between">
          <span className="text-sm">Check errors</span>
          <Switch checked={checkErrorsEnabled} onCheckedChange={setCheckErrorsEnabled} />
        </div>

        <div className="h-1" />
        <CardTitle>Gameplay &amp; UI Settings</CardTitle>

        <div className="flex justify-between">
          <span className="text-sm">Basic AI (opponents)</span>
          <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
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
            value={aiDelayMs}
            disabled={!aiEnabled}
            onChange={(e) => setAiDelayMs(Number(e.target.value) || 0)}
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
                  <span className={suitColorClass(s)}>{suitGlyph(s)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={"flex justify-between " + (!trump.enabled ? "opacity-50" : "")}>
          <div className="flex items-center gap-2">
            <span className="text-sm">Must break</span>
            <span
              className="inline-flex h-4 w-4 cursor-pointer select-none items-center justify-center rounded-full border text-[10px] font-semibold text-muted-foreground"
              title="Prevents leading trump until trump has been played (unless you only have trump)"
            >
              ?
            </span>
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
                    <span key={s} className={suitColorClass(s as Suit)}>
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
                    <span key={s} className={suitColorClass(s as Suit)}>
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
              <TableCard />
              <div className="w-full md:max-w-[330px] md:justify-self-end md:self-center">
                <VoidTrackingCard />
              </div>
            </div>
            <div className="space-y-6 md:max-w-[330px] md:justify-self-end">
              <TrickHistoryCard />
              <SettingsCard />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:gap-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <TableCard />
            <div className="space-y-6 w-full md:max-w-[330px] md:justify-self-end">
              <VoidTrackingCard />
              <TrickHistoryCard />
              <SettingsCard />
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
  console.assert(
    isLegalPlay({
      hand: _handFollow,
      card: { suit: "S", rank: 14, id: "S14" },
      trick: _leadTrick,
      isLeader: false,
      trump: _tNoTrump,
      trumpBroken: false,
    }) === false,
    "Must-follow should reject off-suit when holding lead suit"
  );
}
