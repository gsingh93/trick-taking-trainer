import { describe, expect, it } from "vitest";
import { createVoidGrid } from "../state";
import { anyRemainingVoidInSuit, remainingOpponentSeats, remainingPlayersVoidInSuit } from "../voids";
import type { PlayT, Suit } from "../types";

function makePlay(seat: "Left" | "Across" | "Right" | "Me", suit: Suit): PlayT {
  return { seat, card: { suit, rank: 2, id: `${suit}2-${seat}` } };
}

describe("void helpers", () => {
  it("detects when all remaining opponents are void", () => {
    const actualVoid = createVoidGrid();
    actualVoid.Left.H = true;
    actualVoid.Right.H = true;
    const trick = [makePlay("Across", "H")] as PlayT[];
    expect(remainingPlayersVoidInSuit("H", "Me", trick, actualVoid, false)).toBe(true);
  });

  it("detects when any remaining opponent is void", () => {
    const actualVoid = createVoidGrid();
    actualVoid.Left.S = true;
    const trick = [makePlay("Across", "S")] as PlayT[];
    expect(anyRemainingVoidInSuit("S", "Me", trick, actualVoid, false)).toBe(true);
  });

  it("treats remaining self as a void when includeMe is true", () => {
    const actualVoid = createVoidGrid();
    const trick = [makePlay("Left", "H")] as PlayT[];
    expect(anyRemainingVoidInSuit("H", "Across", trick, actualVoid, true)).toBe(true);
    expect(anyRemainingVoidInSuit("H", "Across", trick, actualVoid, false)).toBe(false);
  });

  it("lists remaining opponent seats based on current trick", () => {
    const trick = [makePlay("Left", "D"), makePlay("Across", "D")];
    expect(remainingOpponentSeats(trick)).toEqual(["Right"]);
  });
});
