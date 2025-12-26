import type { CardT, Hands, Rank } from "./types";
import { SEATS, SUITS } from "./types";

export function buildDeck(): CardT[] {
  const ranks: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const deck: CardT[] = [];
  for (const suit of SUITS) {
    for (const rank of ranks) {
      deck.push({ suit, rank, id: `${suit}${rank}` });
    }
  }
  return deck;
}

export function createRng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function dealNewHands(rng: () => number): Hands {
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
