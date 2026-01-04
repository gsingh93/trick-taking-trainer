import { describe, expect, it } from "vitest";
import { parseSnapshotText } from "../snapshot";
import type { Seat } from "@/engine/types";

const seatLabels: Record<Seat, string> = {
  Left: "West",
  Across: "North",
  Right: "East",
  Me: "South",
};

const baseSnapshot = `Trick Taking Trainer Snapshot
Seed: 1
Trick: 2
Leader: South
Turn: West
Trump: ♠ (broken)

Bids:
  West: 2
  North: 3
  East: 1
  South: 4

Tricks Won:
  West: 1
  North: 0
  East: 0
  South: 1

Current Trick:
  (none)

Hands:
  West: 2♠
  North: 3♠
  East: 4♠
  South: 5♠
`;

describe("parseSnapshotText", () => {
  it("parses a complete snapshot", () => {
    const result = parseSnapshotText(baseSnapshot, seatLabels, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.seed).toBe(1);
    expect(result.value.trickNo).toBe(2);
    expect(result.value.leader).toBe("Me");
    expect(result.value.turn).toBe("Left");
    expect(result.value.trump.enabled).toBe(true);
    expect(result.value.trump.suit).toBe("S");
    expect(result.value.trumpBroken).toBe(true);
    expect(result.value.bids.Left).toBe(2);
    expect(result.value.tricksWon.Me).toBe(1);
    expect(result.value.trick).toHaveLength(0);
    expect(result.value.hands.Left[0]?.id).toBe("S2");
  });

  it("accepts incomplete bids with '?'", () => {
    const withUnknown = baseSnapshot.replace("West: 2", "West: ?");
    const result = parseSnapshotText(withUnknown, seatLabels, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bids.Left).toBeNull();
  });

  it("rejects invalid trump formatting", () => {
    const invalidTrump = baseSnapshot.replace("Trump: ♠ (broken)", "Trump: Spades");
    const result = parseSnapshotText(invalidTrump, seatLabels, true);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('Trump must look like "♠ (broken)" or "♠ (not broken)".');
  });

  it("rejects invalid seed values", () => {
    const invalidSeed = baseSnapshot.replace("Seed: 1", "Seed: -5");
    const result = parseSnapshotText(invalidSeed, seatLabels, true);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Seed must be a valid non-negative number.");
  });

  it("rejects invalid trick values", () => {
    const invalidTrick = baseSnapshot.replace("Trick: 2", "Trick: 0");
    const result = parseSnapshotText(invalidTrick, seatLabels, true);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Trick must be a positive number.");
  });

  it("rejects invalid card tokens", () => {
    const invalidHand = baseSnapshot.replace("West: 2♠", "West: 1♠");
    const result = parseSnapshotText(invalidHand, seatLabels, true);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Hands must list cards like A♠.");
  });

  it("rejects invalid bids", () => {
    const invalidBid = baseSnapshot.replace("West: 2", "West: X");
    const result = parseSnapshotText(invalidBid, seatLabels, true);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Bids section must include numeric values or '?'.");
  });

  it("rejects unknown seat labels", () => {
    const invalidSeat = baseSnapshot.replace("West: 2", "Foo: 2");
    const result = parseSnapshotText(invalidSeat, seatLabels, true);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Bids section has an unknown seat label.");
  });

  it("rejects invalid trump suit tokens", () => {
    const invalidTrump = baseSnapshot.replace("Trump: ♠ (broken)", "Trump: X (broken)");
    const result = parseSnapshotText(invalidTrump, seatLabels, true);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('Trump must look like "♠ (broken)" or "♠ (not broken)".');
  });

  it("parses a no-trump snapshot", () => {
    const noTrump = baseSnapshot.replace("Trump: ♠ (broken)", "Trump: None");
    const result = parseSnapshotText(noTrump, seatLabels, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.trump.enabled).toBe(false);
  });

  it("fails when the header is missing", () => {
    const result = parseSnapshotText("Seed: 1", seatLabels, true);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Missing snapshot header.");
  });
});
