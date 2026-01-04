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

  it("fails when the header is missing", () => {
    const result = parseSnapshotText("Seed: 1", seatLabels, true);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Missing snapshot header.");
  });
});
