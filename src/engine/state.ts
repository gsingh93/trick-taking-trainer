import type { Hands, Opp, PlayT, Seat, Suit, TrumpConfig } from "./types";
import { determineTrickWinner, isLegalPlay, isTrump, nextSeat, sameTrick, trickLeadSuit, cloneHands } from "./rules";
import { createRng, dealNewHands } from "./deck";

export type GameState = {
  hands: Hands;
  tricksWon: Record<Seat, number>;
  leader: Seat;
  turn: Seat;
  trick: PlayT[];
  trickHistory: PlayT[][];
  trickNo: number;
  handComplete: boolean;
  trumpBroken: boolean;
  trickStartLeader: Seat;
  trickStartTurn: Seat;
};

export type ReplayState = {
  hands: Hands;
  tricksWon: Record<Seat, number>;
  leader: Seat;
  turn: Seat;
  trumpBroken: boolean;
  trickNo: number;
  handComplete: boolean;
  trick: PlayT[];
  awaitContinue: boolean;
};

export type HistorySnapshot = ReplayState & {
  historySlice: PlayT[][];
  trickStartLeader: Seat;
  trickStartTurn: Seat;
};

export function initGameState(seed: number): GameState {
  return {
    hands: dealNewHands(createRng(seed)),
    tricksWon: { Left: 0, Across: 0, Right: 0, Me: 0 },
    leader: "Me",
    turn: "Me",
    trick: [],
    trickHistory: [],
    trickNo: 1,
    handComplete: false,
    trumpBroken: false,
    trickStartLeader: "Me",
    trickStartTurn: "Me",
  };
}

export function applyPlay(state: GameState, play: PlayT, trump: TrumpConfig): GameState {
  const hands = cloneHands(state.hands);
  const hand = hands[play.seat];
  const idx = hand.findIndex((c) => c.id === play.card.id);
  if (idx >= 0) hand.splice(idx, 1);

  const trick = state.trick.slice();
  const nextTrick = [...trick, play];

  let trickStartLeader = state.trickStartLeader;
  let trickStartTurn = state.trickStartTurn;
  if (trick.length === 0) {
    trickStartLeader = state.leader;
    trickStartTurn = state.leader;
  }

  const trumpBroken = state.trumpBroken || isTrump(play.card, trump);
  const turn = nextTrick.length < 4 ? nextSeat(play.seat) : state.turn;

  return {
    ...state,
    hands,
    trick: nextTrick,
    turn,
    trumpBroken,
    trickStartLeader,
    trickStartTurn,
  };
}

export function resolveTrick(state: GameState, trump: TrumpConfig): GameState {
  if (state.trick.length !== 4) return state;
  const winner = determineTrickWinner(state.trick, trump);
  const tricksWon = { ...state.tricksWon, [winner]: state.tricksWon[winner] + 1 };
  const trickHistory = [...state.trickHistory, state.trick];
  const handComplete = state.trickNo >= 13;
  return {
    ...state,
    tricksWon,
    leader: winner,
    turn: winner,
    trickHistory,
    handComplete,
  };
}

export function advanceToNextTrick(state: GameState): GameState {
  return {
    ...state,
    trick: [],
    trickNo: state.trickNo + 1,
  };
}

export function resetTrick(state: GameState, trump: TrumpConfig): GameState {
  const hands = cloneHands(state.hands);
  for (const p of state.trick) {
    hands[p.seat].push(p.card);
  }

  let tricksWon = state.tricksWon;
  let trickHistory = state.trickHistory;
  if (state.trick.length === 4) {
    const winner = determineTrickWinner(state.trick, trump);
    tricksWon = { ...state.tricksWon, [winner]: Math.max(0, state.tricksWon[winner] - 1) };
    trickHistory =
      state.trickHistory.length && sameTrick(state.trickHistory[state.trickHistory.length - 1], state.trick)
        ? state.trickHistory.slice(0, -1)
        : state.trickHistory;
  }
  const trumpBroken = trump.enabled
    ? trickHistory.some((t) => t.some((play) => isTrump(play.card, trump)))
    : false;

  return {
    ...state,
    hands,
    tricksWon,
    trickHistory,
    trick: [],
    leader: state.trickStartLeader,
    turn: state.trickStartTurn,
    trumpBroken,
    handComplete: false,
  };
}

export function replayStateFromHistory(
  history: PlayT[][],
  seed: number,
  trump: TrumpConfig,
  pauseBeforeNextTrick: boolean
): ReplayState {
  const hands = dealNewHands(createRng(seed));
  const tricksWon: Record<Seat, number> = { Left: 0, Across: 0, Right: 0, Me: 0 };
  let leader: Seat = "Me";
  let trumpBroken = false;

  for (const t of history) {
    for (const play of t) {
      const hand = hands[play.seat];
      const idx = hand.findIndex((c) => c.id === play.card.id);
      if (idx >= 0) {
        hand.splice(idx, 1);
      }
      if (isTrump(play.card, trump)) trumpBroken = true;
    }
    if (t.length === 4) {
      const winner = determineTrickWinner(t, trump);
      tricksWon[winner] += 1;
      leader = winner;
    }
  }

  const completedTricks = history.length;
  const handComplete = completedTricks >= 13;
  let awaitContinue = false;
  let trick: PlayT[] = [];
  let trickNo = completedTricks + 1;

  if (completedTricks > 0) {
    if (handComplete) {
      trickNo = 13;
      trick = history[completedTricks - 1];
    } else if (pauseBeforeNextTrick) {
      awaitContinue = true;
      trickNo = completedTricks;
      trick = history[completedTricks - 1];
    }
  }

  return {
    hands,
    tricksWon,
    leader,
    turn: leader,
    trumpBroken,
    trickNo,
    handComplete,
    trick,
    awaitContinue,
  };
}

export function buildHistorySnapshot(
  history: PlayT[][],
  trickIndex: number,
  step: number,
  seed: number,
  trump: TrumpConfig
): HistorySnapshot {
  const prior = history.slice(0, trickIndex);
  const base = replayStateFromHistory(prior, seed, trump, false);
  const trickPlays = history[trickIndex] ?? [];
  const maxStep = Math.min(step, trickPlays.length);

  const hands = cloneHands(base.hands);
  const trick: PlayT[] = [];
  let leader = base.leader;
  let turn = base.leader;
  let trumpBroken = base.trumpBroken;
  let tricksWon = { ...base.tricksWon };

  for (let i = 0; i < maxStep; i++) {
    const play = trickPlays[i];
    const hand = hands[play.seat];
    const idx = hand.findIndex((c) => c.id === play.card.id);
    if (idx >= 0) hand.splice(idx, 1);
    trick.push(play);
    if (isTrump(play.card, trump)) trumpBroken = true;
    turn = nextSeat(play.seat);
  }

  let awaitContinue = false;
  let handComplete = false;
  let historySlice = prior;

  if (maxStep >= 4 && trickPlays.length === 4) {
    const winner = determineTrickWinner(trickPlays, trump);
    tricksWon = { ...tricksWon, [winner]: tricksWon[winner] + 1 };
    leader = winner;
    turn = winner;
    awaitContinue = true;
    historySlice = history.slice(0, trickIndex + 1);
    handComplete = trickIndex >= 12;
  }

  return {
    hands,
    tricksWon,
    leader,
    turn,
    trumpBroken,
    trickNo: trickIndex + 1,
    handComplete,
    trick,
    awaitContinue,
    historySlice,
    trickStartLeader: base.leader,
    trickStartTurn: base.leader,
  };
}

export function trickLeadCount(trickHistory: PlayT[][], suit: Suit): number {
  return trickHistory.reduce((acc, t) => {
    const lead = trickLeadSuit(t);
    return lead === suit ? acc + 1 : acc;
  }, 0);
}

function hasOffSuit(trick: PlayT[]): boolean {
  const lead = trickLeadSuit(trick);
  if (!lead) return false;
  return trick.some((play, idx) => idx > 0 && play.card.suit !== lead);
}

function historyHasOffSuitForSuit(trickHistory: PlayT[][], suit: Suit): boolean {
  return trickHistory.some((t) => {
    const lead = trickLeadSuit(t);
    if (lead !== suit) return false;
    return t.some((play, idx) => idx > 0 && play.card.suit !== lead);
  });
}

export function shouldPromptSuitCount(trickHistory: PlayT[][], trick: PlayT[]): Suit | null {
  const lead = trickLeadSuit(trick);
  if (!lead) return null;
  if (!hasOffSuit(trick)) return null;
  if (historyHasOffSuitForSuit(trickHistory, lead)) return null;
  return lead;
}

export function computeLegalBySeat(state: GameState, trump: TrumpConfig): Record<Seat, Set<string>> {
  const out: Record<Seat, Set<string>> = {
    Left: new Set(),
    Across: new Set(),
    Right: new Set(),
    Me: new Set(),
  };
  for (const seat of Object.keys(state.hands) as Seat[]) {
    const isLeaderNow = seat === state.leader && state.trick.length === 0;
    for (const c of state.hands[seat]) {
      if (
        isLegalPlay({
          hand: state.hands[seat],
          card: c,
          trick: state.trick,
          isLeader: isLeaderNow,
          trump,
          trumpBroken: state.trumpBroken,
        })
      ) {
        out[seat].add(c.id);
      }
    }
  }
  return out;
}

export type VoidGrid = Record<Opp, Record<Suit, boolean>>;

export function createVoidGrid(): VoidGrid {
  return {
    Left: { S: false, H: false, D: false, C: false },
    Across: { S: false, H: false, D: false, C: false },
    Right: { S: false, H: false, D: false, C: false },
  };
}

export function computeActualVoid(trickHistory: PlayT[][], currentTrick: PlayT[]): VoidGrid {
  const out = createVoidGrid();
  const observedTricks = currentTrick.length > 1 ? [...trickHistory, currentTrick] : trickHistory;
  for (const t of observedTricks) {
    const lead = trickLeadSuit(t);
    if (!lead) continue;
    for (let i = 1; i < t.length; i++) {
      const play = t[i];
      if (play.card.suit !== lead && play.seat !== "Me") {
        out[play.seat as Opp][lead] = true;
      }
    }
  }
  return out;
}

export function isPlayLegal(args: {
  state: GameState;
  seat: Seat;
  card: PlayT["card"];
  trump: TrumpConfig;
}): boolean {
  const { state, seat, card, trump } = args;
  const isLeaderNow = seat === state.leader && state.trick.length === 0;
  return isLegalPlay({
    hand: state.hands[seat],
    card,
    trick: state.trick,
    isLeader: isLeaderNow,
    trump,
    trumpBroken: state.trumpBroken,
  });
}

export function isHandInProgress(state: GameState): boolean {
  return state.trickHistory.length > 0 || state.trick.length > 0;
}
