import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { Grid3X3, RefreshCw, Eye, EyeOff } from "lucide-react";

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

type Suit = "S" | "H" | "D" | "C";
const SUITS: Suit[] = ["S", "H", "D", "C"];

type Opp = "Left" | "Across" | "Right";
const OPPONENTS: Opp[] = ["Left", "Across", "Right"];

type Seat = Opp | "Me";
const SEATS: Seat[] = ["Left", "Across", "Right", "Me"];

type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J,12=Q,13=K,14=A

type CardT = { suit: Suit; rank: Rank; id: string };

type Hands = Record<Seat, CardT[]>;

type VoidGrid = Record<Opp, Record<Suit, boolean>>;

type PlayT = { seat: Seat; card: CardT };

type TrumpConfig = {
  enabled: boolean;
  suit: Suit;
  mustBreak: boolean;
};

const SETTINGS_KEY = "trick-taking-trainer:settings";

type Settings = {
  dealSeed: number;
  seedInput: string;
  modeOpenHandVerify: boolean;
  voidTrackingEnabled: boolean;
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

function buildDeck(): CardT[] {
  const ranks: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const deck: CardT[] = [];
  for (const suit of SUITS) {
    for (const rank of ranks) {
      deck.push({ suit, rank, id: `${suit}${rank}` });
    }
  }
  return deck;
}

function createRng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dealNewHands(rng: () => number): Hands {
  const deck = shuffle(buildDeck(), rng);
  const hands: Hands = { Left: [], Across: [], Right: [], Me: [] };
  let idx = 0;
  for (let round = 0; round < 13; round++) {
    for (const seat of SEATS) {
      hands[seat].push(deck[idx++]);
    }
  }
  return hands;
}

function createVoidGrid(): VoidGrid {
  return {
    Left: { S: false, H: false, D: false, C: false },
    Across: { S: false, H: false, D: false, C: false },
    Right: { S: false, H: false, D: false, C: false },
  };
}

function sortHand(hand: CardT[], suitOrder: Suit[], sortAscending: boolean): CardT[] {
  const suitIndex = new Map<Suit, number>(suitOrder.map((s, i) => [s, i]));
  const rankFactor = sortAscending ? 1 : -1;
  return hand
    .slice()
    .sort(
      (a, b) =>
        (suitIndex.get(a.suit) ?? 0) - (suitIndex.get(b.suit) ?? 0) ||
        (a.rank - b.rank) * rankFactor
    );
}

function nextSeat(seat: Seat): Seat {
  const i = SEATS.indexOf(seat);
  return SEATS[(i + 1) % SEATS.length];
}

function trickLeadSuit(trick: PlayT[]): Suit | null {
  return trick.length ? trick[0].card.suit : null;
}

function canFollowSuit(hand: CardT[], suit: Suit): boolean {
  return hand.some((c) => c.suit === suit);
}

function isTrump(card: CardT, trump: TrumpConfig): boolean {
  return trump.enabled && card.suit === trump.suit;
}

function isLegalPlay(args: {
  hand: CardT[];
  card: CardT;
  trick: PlayT[];
  isLeader: boolean;
  trump: TrumpConfig;
  trumpBroken: boolean;
}): boolean {
  const { hand, card, trick, isLeader, trump, trumpBroken } = args;

  // Card must be in hand
  if (!hand.some((c) => c.id === card.id)) return false;

  const lead = trickLeadSuit(trick);

  // If leading and mustBreak is enabled, restrict leading trump until broken (unless only trump in hand)
  if (
    isLeader &&
    trick.length === 0 &&
    trump.enabled &&
    trump.mustBreak &&
    !trumpBroken &&
    isTrump(card, trump)
  ) {
    const hasNonTrump = hand.some((c) => !isTrump(c, trump));
    if (hasNonTrump) return false;
  }

  // Must-follow lead suit
  if (lead) {
    const hasLead = canFollowSuit(hand, lead);
    if (hasLead && card.suit !== lead) return false;
  }

  return true;
}

function compareCardsInTrick(a: CardT, b: CardT, lead: Suit, trump: TrumpConfig): number {
  // return +1 if a wins over b, -1 if b wins over a
  const aTrump = isTrump(a, trump);
  const bTrump = isTrump(b, trump);

  if (aTrump && !bTrump) return 1;
  if (!aTrump && bTrump) return -1;

  // both trump or both non-trump
  const aFollow = a.suit === lead;
  const bFollow = b.suit === lead;

  if (aTrump && bTrump) {
    return a.rank === b.rank ? 0 : a.rank > b.rank ? 1 : -1;
  }

  // neither trump
  if (aFollow && !bFollow) return 1;
  if (!aFollow && bFollow) return -1;

  // both same category (both lead suit, or both off-suit) -> compare rank only if same suit
  if (a.suit === b.suit) {
    return a.rank === b.rank ? 0 : a.rank > b.rank ? 1 : -1;
  }

  // off-suit incomparable: earlier winner stays
  return 0;
}

function determineTrickWinner(trick: PlayT[], trump: TrumpConfig): Seat {
  const lead = trickLeadSuit(trick);
  if (!lead) throw new Error("Cannot determine winner of empty trick");

  let best = trick[0];
  for (let i = 1; i < trick.length; i++) {
    const challenger = trick[i];
    const cmp = compareCardsInTrick(challenger.card, best.card, lead, trump);
    if (cmp === 1) best = challenger;
  }
  return best.seat;
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
  const win = highlight ? " ring-2 ring-emerald-500" : "";

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
  return (
    <div className={"mt-3 flex " + (align === "end" ? "justify-end" : "justify-start")}>
      <div className={"flex flex-col gap-0 " + (align === "end" ? "items-end" : "items-start")}>
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
  const initialSettings = useMemo(() => loadSettings(), []);
  const initialSeed = initialSettings.dealSeed ?? Math.floor(Math.random() * 1_000_000_000);

  const [modeOpenHandVerify, setModeOpenHandVerify] = useState(
    () => initialSettings.modeOpenHandVerify ?? false
  );
  const [voidTrackingEnabled, setVoidTrackingEnabled] = useState(
    () => initialSettings.voidTrackingEnabled ?? true
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
  const [trumpBroken, setTrumpBroken] = useState(false);

  const [dealSeed, setDealSeed] = useState(() => initialSeed);
  const [seedInput, setSeedInput] = useState(() => initialSettings.seedInput ?? String(initialSeed));
  const [seedError, setSeedError] = useState<string | null>(null);
  const [hands, setHands] = useState<Hands>(() => dealNewHands(createRng(initialSeed)));
  const [trickHistory, setTrickHistory] = useState<PlayT[][]>([]);
  const [voidGrid, setVoidGrid] = useState<VoidGrid>(() => createVoidGrid());
  const [voidMismatch, setVoidMismatch] = useState<VoidGrid | null>(null);
  const [voidWarning, setVoidWarning] = useState<string | null>(null);
  const [voidNeedsValidation, setVoidNeedsValidation] = useState(false);
  const [trickReady, setTrickReady] = useState(true);

  const [reveal, setReveal] = useState<Record<Seat, boolean>>({
    Left: false,
    Across: false,
    Right: false,
    Me: true,
  });

  const [leader, setLeader] = useState<Seat>("Me");
  const [trickStartLeader, setTrickStartLeader] = useState<Seat>("Me");
  const [trickStartTurn, setTrickStartTurn] = useState<Seat>("Me");
  const resolveTimerRef = useRef<number | null>(null);

  const [tricksWon, setTricksWon] = useState<Record<Seat, number>>({
    Left: 0,
    Across: 0,
    Right: 0,
    Me: 0,
  });

  const [turn, setTurn] = useState<Seat>("Me");
  const [trick, setTrick] = useState<PlayT[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [trickNo, setTrickNo] = useState(1);

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
    for (const t of trickHistory) {
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
  }, [trickHistory]);

  useEffect(() => {
    const settings: Settings = {
      dealSeed,
      seedInput,
      modeOpenHandVerify,
      voidTrackingEnabled,
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

  const trickWinner = useMemo<Seat | null>(() => {
    if (trick.length !== 4) return null;
    return determineTrickWinner(trick, trump);
  }, [trick, trump]);

  const canPlay = voidTrackingEnabled ? trickReady : true;

  useEffect(() => {
    if (!voidTrackingEnabled) {
      setTrickReady(true);
      setVoidNeedsValidation(false);
      setVoidWarning(null);
      setVoidMismatch(null);
      return;
    }
    if (trick.length === 0 && trickNo > 1) {
      setTrickReady(false);
      setVoidNeedsValidation(true);
    }
  }, [voidTrackingEnabled, trick.length, trickNo]);

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
    setTricksWon({ Left: 0, Across: 0, Right: 0, Me: 0 });
    setHands(dealNewHands(createRng(seed)));
    setTrickHistory([]);
    setVoidGrid(createVoidGrid());
    setVoidMismatch(null);
    setVoidWarning(null);
    setVoidNeedsValidation(false);
    setTrickReady(true);
    setReveal({ Left: false, Across: false, Right: false, Me: true });
    setLeader("Me");
    setTurn("Me");
    setTrickStartLeader("Me");
    setTrickStartTurn("Me");
    setTrick([]);
    setTrickNo(1);
    setTrumpBroken(false);
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

  function toggleVoidCell(o: Opp, s: Suit) {
    setVoidGrid((g) => ({
      ...g,
      [o]: { ...g[o], [s]: !g[o][s] },
    }));
    setVoidMismatch(null);
    setVoidWarning(null);
    setVoidNeedsValidation(true);
    setTrickReady(false);
  }

  function validateVoidGrid() {
    const mismatch = createVoidGrid();
    let hasMismatch = false;
    for (const o of OPPONENTS) {
      for (const s of SUITS) {
        if (voidGrid[o][s] !== actualVoid[o][s]) {
          mismatch[o][s] = true;
          hasMismatch = true;
        }
      }
    }
    if (hasMismatch) {
      setVoidMismatch(mismatch);
      setVoidWarning("Void grid does not match played suits");
      setVoidNeedsValidation(true);
      return;
    }
    setVoidMismatch(null);
    setVoidWarning(null);
    setVoidNeedsValidation(false);
    setTrickReady(true);
  }

  function toggleRevealSeat(seat: Seat) {
    setReveal((r) => ({ ...r, [seat]: !r[seat] }));
  }

  function resolveTrickAfterDelay(finalTrick: PlayT[]) {
    setIsResolving(true);
    cancelResolveTimer();

    resolveTimerRef.current = window.setTimeout(() => {
      const winner = determineTrickWinner(finalTrick, trump);
      setTrickHistory((h) => [...h, finalTrick]);
      setTricksWon((tw) => ({ ...tw, [winner]: tw[winner] + 1 }));
      setLeader(winner);
      setTurn(winner);
      setTrickReady(false);
      setVoidNeedsValidation(true);

      if (aiEnabled && pauseBeforeNextTrick) {
        // Keep the completed trick visible; wait for user input.
        setIsResolving(false);
        setAwaitContinue(true);
        resolveTimerRef.current = null;
        return;
      }

      // Default: advance after the delay.
      setTrick([]);
      setTrickNo((n) => n + 1);
      setIsResolving(false);
      setAwaitContinue(false);
      resolveTimerRef.current = null;
    }, aiDelayMs);
  }

  function tryPlay(seat: Seat, card: CardT, source: "human" | "ai" = "human") {
    if (isResolving) return;

    // Only the leader may lead a new trick.
    if (trick.length === 0 && seat !== leader) return;

    // Require void grid validation before any play.
    if (voidTrackingEnabled && !trickReady) return;

    // Capture start-of-trick state on the first play.
    if (trick.length === 0) {
      setTrickStartLeader(leader);
      setTrickStartTurn(leader);
    }

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

    // Remove from hand
    setHands((h) => ({
      ...h,
      [seat]: h[seat].filter((c) => c.id !== card.id),
    }));

    // Append to trick
    const nextTrick = [...trick, { seat, card }];
    setTrick(nextTrick);

    // Trump gets broken if a trump card is played when trump enabled.
    if (isTrump(card, trump)) setTrumpBroken(true);

    // Advance turn or resolve
    if (nextTrick.length < 4) {
      setTurn(nextSeat(seat));
      return;
    }

    // Final card played: keep the trick visible, then resolve after the configured delay.
    resolveTrickAfterDelay(nextTrick);
  }

  function resetTrickOnly() {
    // Undo the in-progress trick: return played cards to hands, cancel resolution, restore turn/leader.
    cancelResolveTimer();
    setIsResolving(false);
    setAwaitContinue(false);
    setTrickReady(false);

    setHands((h) => {
      const next: Hands = {
        Left: h.Left.slice(),
        Across: h.Across.slice(),
        Right: h.Right.slice(),
        Me: h.Me.slice(),
      };
      for (const p of trick) {
        next[p.seat].push(p.card);
      }
      return next;
    });

    setTrick([]);
    setLeader(trickStartLeader);
    setTurn(trickStartTurn);
    setVoidNeedsValidation(true);
  }

  // Basic AI: players play a random valid card when it's their turn.
  useEffect(() => {
    if (!aiEnabled) return;
    if (isResolving) return;
    if (awaitContinue) return;
    if (turn === "Me" && !aiPlayMe) return;
    if (voidTrackingEnabled && !trickReady) return;

    // If trick is empty, only the leader may lead.
    if (trick.length === 0 && turn !== leader) return;

    const legal = legalBySeat[turn];
    if (!legal || legal.size === 0) return;

    const ids = Array.from(legal);
    const pickId = ids[Math.floor(Math.random() * ids.length)];
    const card = hands[turn].find((c) => c.id === pickId);
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
    trickReady,
  ]);

  // If paused after a completed trick, advance on any key.
  useEffect(() => {
    if (!awaitContinue) return;
    const advance = () => {
      setTrick([]);
      setTrickNo((n) => n + 1);
      setAwaitContinue(false);
      setVoidNeedsValidation(true);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " " || e.code === "Space") {
        e.preventDefault();
        advance();
      }
    };
    const onClick = () => {
      advance();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("click", onClick);
    };
  }, [awaitContinue]);

  // Cleanup any pending timers on unmount.
  useEffect(() => {
    return () => cancelResolveTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Grid3X3 className="h-5 w-5" />
            <h1 className="text-xl font-semibold">Trick Taking Trainer</h1>
          </div>
          <div className="flex flex-wrap items-start gap-4">
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* TABLE */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex flex-col">
                  <div className="flex items-center gap-3">
                    <span>Table</span>
                    <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={resetTrickOnly}>
                      Reset trick
                    </Button>
                  </div>
                  <div className="pl-0.5 text-xs text-muted-foreground">Trick {trickNo}</div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 grid-rows-[auto_1fr_auto] gap-3">
                {/* Across spans full width */}
                <div className="col-span-3 rounded-xl border p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">
                      Across <span className="text-xs text-muted-foreground">({tricksWon.Across})</span>
                    </div>
                    <Badge variant="outline">{hands.Across.length}</Badge>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => toggleRevealSeat("Across")}
                      disabled={modeOpenHandVerify}
                    >
                      {shownHands.Across ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      {shownHands.Across ? "Hide" : "Reveal"}
                    </Button>
                    {turn === "Across" ? <Badge>To play</Badge> : null}
                  </div>
                  {shownHands.Across ? (
                    <HandRow
                      seat="Across"
                      hand={hands.Across}
                      legal={legalBySeat.Across}
                      onPlay={(s, c) => tryPlay(s, c, "human")}
                      currentTurn={turn}
                      suitOrder={suitOrder}
                      sortAscending={sortAscending}
                      canPlay={canPlay}
                    />
                  ) : null}
                </div>

                {/* Left spans rows */}
                <div className="row-span-2 rounded-xl border p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">
                      Left <span className="text-xs text-muted-foreground">({tricksWon.Left})</span>
                    </div>
                    <Badge variant="outline">{hands.Left.length}</Badge>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => toggleRevealSeat("Left")}
                      disabled={modeOpenHandVerify}
                    >
                      {shownHands.Left ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      {shownHands.Left ? "Hide" : "Reveal"}
                    </Button>
                    {turn === "Left" ? <Badge>To play</Badge> : null}
                  </div>
                  {shownHands.Left ? (
                    <HandCol
                      seat="Left"
                      hand={hands.Left}
                      cardRotateClass="rotate-90 origin-center"
                      align="start"
                      legal={legalBySeat.Left}
                      onPlay={(s, c) => tryPlay(s, c, "human")}
                      currentTurn={turn}
                      suitOrder={suitOrder}
                      sortAscending={sortAscending}
                      canPlay={canPlay}
                    />
                  ) : null}
                </div>

                {/* Current trick stays fixed size */}
                <div className="w-full max-w-[240px] aspect-square rounded-xl border bg-emerald-600/80 p-3 shadow-inner self-center justify-self-center flex flex-col">
                  <div className="flex items-center justify-end text-white">
                    <Badge className="bg-white/20 text-white hover:bg-white/20" variant="secondary">
                      {trick.length}/4
                    </Badge>
                  </div>

                  <div className="flex-1 flex items-center justify-center">
                    {/* Diamond layout */}
                    <div className="relative h-40 w-40">
                      {/* Across (top) */}
                      <div className="absolute left-1/2 top-0 -translate-x-1/2">
                        {(() => {
                          const p = trick.find((t) => t.seat === "Across");
                          return p ? (
                            <PlayingCard c={p.card} highlight={trickWinner === "Across"} />
                          ) : (
                            <div className="h-14 w-10 opacity-20" />
                          );
                        })()}
                      </div>

                      {/* Left */}
                      <div className="absolute left-0 top-1/2 -translate-y-1/2">
                        {(() => {
                          const p = trick.find((t) => t.seat === "Left");
                          return p ? (
                            <PlayingCard c={p.card} rotateClass="rotate-90" highlight={trickWinner === "Left"} />
                          ) : (
                            <div className="h-10 w-14 opacity-20" />
                          );
                        })()}
                      </div>

                      {/* Right */}
                      <div className="absolute right-0 top-1/2 -translate-y-1/2">
                        {(() => {
                          const p = trick.find((t) => t.seat === "Right");
                          return p ? (
                            <PlayingCard c={p.card} rotateClass="-rotate-90" highlight={trickWinner === "Right"} />
                          ) : (
                            <div className="h-10 w-14 opacity-20" />
                          );
                        })()}
                      </div>

                      {/* Me (bottom) */}
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
                        {(() => {
                          const p = trick.find((t) => t.seat === "Me");
                          return p ? (
                            <PlayingCard c={p.card} highlight={trickWinner === "Me"} />
                          ) : (
                            <div className="h-14 w-10 opacity-20" />
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  <div className="min-h-[2rem] text-center text-xs text-white/80">
                    {awaitContinue ? "Press Enter/Space or click to continue" : ""}
                  </div>
                </div>

                {/* Right spans rows */}
                <div className="row-span-2 rounded-xl border p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">
                      Right <span className="text-xs text-muted-foreground">({tricksWon.Right})</span>
                    </div>
                    <Badge variant="outline">{hands.Right.length}</Badge>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => toggleRevealSeat("Right")}
                      disabled={modeOpenHandVerify}
                    >
                      {shownHands.Right ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      {shownHands.Right ? "Hide" : "Reveal"}
                    </Button>
                    {turn === "Right" ? <Badge>To play</Badge> : null}
                  </div>
                  {shownHands.Right ? (
                    <HandCol
                      seat="Right"
                      hand={hands.Right}
                      cardRotateClass="-rotate-90 origin-center"
                      align="end"
                      legal={legalBySeat.Right}
                      onPlay={(s, c) => tryPlay(s, c, "human")}
                      currentTurn={turn}
                      suitOrder={suitOrder}
                      sortAscending={sortAscending}
                      canPlay={canPlay}
                    />
                  ) : null}
                </div>

                {/* Me spans full width */}
                <div className="col-span-3 rounded-xl border p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">
                      Me <span className="text-xs text-muted-foreground">({tricksWon.Me})</span>
                    </div>
                    <Badge variant="outline">{hands.Me.length}</Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {turn === "Me" ? <Badge>To play</Badge> : null}
                  </div>
                  <HandRow
                    seat="Me"
                    hand={hands.Me}
                    legal={legalBySeat.Me}
                    onPlay={(s, c) => tryPlay(s, c, "human")}
                    currentTurn={turn}
                    suitOrder={suitOrder}
                    sortAscending={sortAscending}
                    canPlay={canPlay}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* TRAINING COLUMN */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Void tracking</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-xs text-muted-foreground">
                  Mark a suit as void when an opponent fails to follow. Assume not void until proven otherwise.
                </div>
                <div className="grid grid-cols-5 gap-2 text-xs">
                  <div />
                  {SUITS.map((s) => (
                    <div key={s} className={"text-center " + suitColorClass(s)}>
                      {suitGlyph(s)}
                    </div>
                  ))}
                  {OPPONENTS.map((o) => (
                    <React.Fragment key={o}>
                      <div className="font-medium">{o}</div>
                      {SUITS.map((s) => {
                        const mismatch = voidMismatch ? voidMismatch[o][s] : false;
                        const disableVoidEdit = !voidTrackingEnabled || trickReady || trick.length > 0;
                        return (
                          <label
                            key={o + s}
                            className={
                              "flex h-8 items-center justify-center rounded-md border " +
                              (mismatch ? "border-destructive" : "border-border") +
                              (disableVoidEdit ? " opacity-60" : "")
                            }
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={voidGrid[o][s]}
                              onChange={() => toggleVoidCell(o, s)}
                              disabled={disableVoidEdit}
                            />
                          </label>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
                <div className="text-xs">
                  {!voidTrackingEnabled ? (
                    <span className="text-muted-foreground">Void tracking disabled</span>
                  ) : voidWarning ? (
                    <span className="text-destructive">{voidWarning}</span>
                  ) : voidNeedsValidation ? (
                    <span className="text-amber-600">Click "Start Trick" to validate</span>
                  ) : (
                    <span className="text-emerald-600">Void grid matches played suits</span>
                  )}
                </div>
                <Button
                  onClick={validateVoidGrid}
                  disabled={
                    !voidTrackingEnabled ||
                    trickReady ||
                    trick.length > 0 ||
                    isResolving ||
                    awaitContinue ||
                    (trickNo === 1 && trick.length === 0)
                  }
                  className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-600/50"
                >
                  Start trick
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-sm">Open-hand verify</span>
                  <Switch checked={modeOpenHandVerify} onCheckedChange={setModeOpenHandVerify} />
                </div>

                <Separator />

                <div className="flex justify-between">
                  <span className="text-sm">Void tracking</span>
                  <Switch checked={voidTrackingEnabled} onCheckedChange={setVoidTrackingEnabled} />
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-2">
                  <span className="text-xs">Suit order</span>
                  <Select value={suitOrderMode} onValueChange={(v) => setSuitOrderMode(v as "bridge" | "poker")}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bridge">Bridge (S H D C)</SelectItem>
                      <SelectItem value="poker">Poker (C D H S)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-between">
                  <span className="text-sm">Sort ascending</span>
                  <Switch
                    checked={sortAscending}
                    onCheckedChange={setSortAscending}
                  />
                </div>
                <Separator />

                <div className="flex justify-between">
                  <span className="text-sm">Basic AI (opponents)</span>
                  <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
                </div>

                <div className={"flex justify-between " + (!aiEnabled ? "opacity-50" : "")}>
                  <span className="text-sm">AI for me</span>
                  <Switch checked={aiPlayMe} onCheckedChange={setAiPlayMe} disabled={!aiEnabled} />
                </div>

                <div className={"grid grid-cols-2 gap-2 " + (!aiEnabled ? "opacity-50" : "")}>
                  <span className="text-xs">AI delay (ms)</span>
                  <input
                    type="number"
                    min={0}
                    step={250}
                    value={aiDelayMs}
                    disabled={!aiEnabled}
                    onChange={(e) => setAiDelayMs(Number(e.target.value) || 0)}
                    className="h-8 rounded-md border bg-background px-2 text-sm"
                  />
                </div>

                <div className={"flex justify-between " + (!aiEnabled ? "opacity-50" : "")}>
                  <span className="text-sm">Pause before next trick</span>
                  <Switch
                    checked={pauseBeforeNextTrick}
                    onCheckedChange={setPauseBeforeNextTrick}
                    disabled={!aiEnabled}
                  />
                </div>

                <Separator />

                <div className="flex justify-between">
                  <span className="text-sm">Trump enabled</span>
                  <Switch checked={trump.enabled} onCheckedChange={(v) => setTrump((t) => ({ ...t, enabled: v }))} />
                </div>

                <div className={"grid grid-cols-2 gap-2 " + (!trump.enabled ? "opacity-50" : "")}>
                  <span className="text-xs">Trump suit</span>
                  <Select value={trump.suit} onValueChange={(v) => setTrump((t) => ({ ...t, suit: v as Suit }))} disabled={!trump.enabled}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUITS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {suitGlyph(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className={"flex justify-between " + (!trump.enabled ? "opacity-50" : "")}>
                  <span className="text-sm">Must break</span>
                  <Switch checked={trump.mustBreak} onCheckedChange={(v) => setTrump((t) => ({ ...t, mustBreak: v }))} disabled={!trump.enabled} />
                </div>

              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

// Sanity tests (runtime assertions)
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
