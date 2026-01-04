import type { CardT, Hands, PlayT, Rank, Seat, Suit, TrumpConfig } from "@/engine/types";

type SnapshotParseSuccess = {
  ok: true;
  value: {
    seed: number;
    trickNo: number;
    leader: Seat;
    turn: Seat;
    trump: TrumpConfig;
    trumpBroken: boolean;
    bids: Record<Seat, number | null>;
    tricksWon: Record<Seat, number>;
    trick: PlayT[];
    hands: Hands;
  };
};

type SnapshotParseFailure = {
  ok: false;
  error: string;
};

export type SnapshotParseResult = SnapshotParseSuccess | SnapshotParseFailure;

function parseSeatLabel(value: string, seatLabels: Record<Seat, string>): Seat | null {
  const trimmed = value.trim();
  const entries = Object.entries(seatLabels) as [Seat, string][];
  for (const [seat, label] of entries) {
    if (label.toLowerCase() === trimmed.toLowerCase()) return seat;
  }
  return null;
}

function parseSnapshotSuit(value: string): Suit | null {
  const trimmed = value.trim();
  switch (trimmed) {
    case "♠":
    case "S":
      return "S";
    case "♥":
    case "H":
      return "H";
    case "♦":
    case "D":
      return "D";
    case "♣":
    case "C":
      return "C";
    default:
      return null;
  }
}

function parseCardToken(token: string): CardT | null {
  if (!token) return null;
  const suitChar = token.slice(-1);
  const rankStr = token.slice(0, -1);
  const suit = parseSnapshotSuit(suitChar);
  if (!suit) return null;
  let rank: Rank | null = null;
  switch (rankStr.toUpperCase()) {
    case "A":
      rank = 14;
      break;
    case "K":
      rank = 13;
      break;
    case "Q":
      rank = 12;
      break;
    case "J":
      rank = 11;
      break;
    default: {
      const parsed = Number(rankStr);
      if (Number.isFinite(parsed) && parsed >= 2 && parsed <= 10) {
        rank = parsed as Rank;
      }
      break;
    }
  }
  if (!rank) return null;
  return { suit, rank, id: `${suit}${rank}` };
}

function parseSectionLines(lines: string[], header: string): string[] {
  const start = lines.findIndex((line) => line.trim() === header);
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) break;
    out.push(line);
  }
  return out;
}

export function parseSnapshotText(
  text: string,
  seatLabels: Record<Seat, string>,
  mustBreak: boolean
): SnapshotParseResult {
  const lines = text.split("\n").map((line) => line.trimEnd());
  if (!lines.length || lines[0].trim() !== "Trick Taking Trainer Snapshot") {
    return { ok: false, error: "Missing snapshot header." };
  }

  const findLine = (prefix: string) => lines.find((line) => line.startsWith(prefix));
  const seedLine = findLine("Seed:");
  const trickLine = findLine("Trick:");
  const leaderLine = findLine("Leader:");
  const turnLine = findLine("Turn:");
  const trumpLine = findLine("Trump:");

  if (!seedLine || !trickLine || !leaderLine || !turnLine || !trumpLine) {
    return { ok: false, error: "Snapshot is missing Seed, Trick, Leader, Turn, or Trump." };
  }

  const seedValue = Number(seedLine.split(":")[1]?.trim());
  const trickValue = Number(trickLine.split(":")[1]?.trim());
  const leaderValue = parseSeatLabel(leaderLine.split(":")[1] ?? "", seatLabels);
  const turnValue = parseSeatLabel(turnLine.split(":")[1] ?? "", seatLabels);
  const trumpValue = trumpLine.split(":")[1]?.trim() ?? "";

  if (!Number.isFinite(seedValue) || seedValue < 0) {
    return { ok: false, error: "Seed must be a valid non-negative number." };
  }
  if (!Number.isFinite(trickValue) || trickValue < 1) {
    return { ok: false, error: "Trick must be a positive number." };
  }
  if (!leaderValue || !turnValue) {
    return { ok: false, error: "Leader or Turn does not match current seat labels." };
  }

  let parsedTrump: TrumpConfig = { enabled: false, suit: "S", mustBreak };
  let parsedTrumpBroken = false;
  if (trumpValue.toLowerCase() !== "none") {
    const match = trumpValue.match(/([♠♥♦♣SHDC])\s*\((broken|not broken)\)/i);
    if (!match) {
      return { ok: false, error: 'Trump must look like "♠ (broken)" or "♠ (not broken)".' };
    }
    const suit = parseSnapshotSuit(match[1]);
    if (!suit) {
      return { ok: false, error: "Trump suit is invalid." };
    }
    parsedTrump = { enabled: true, suit, mustBreak };
    parsedTrumpBroken = match[2].toLowerCase() === "broken";
  }

  const bids = { Left: null, Across: null, Right: null, Me: null } as Record<Seat, number | null>;
  for (const line of parseSectionLines(lines, "Bids:")) {
    const [labelPart, valuePart] = line.split(":");
    if (!valuePart) continue;
    const seat = parseSeatLabel(labelPart.replace("-", "").trim(), seatLabels);
    if (!seat) {
      return { ok: false, error: "Bids section has an unknown seat label." };
    }
    const trimmedValue = valuePart.trim();
    if (trimmedValue === "?") {
      bids[seat] = null;
      continue;
    }
    const value = Number(trimmedValue);
    if (!Number.isFinite(value)) {
      return { ok: false, error: "Bids section must include numeric values or '?'." };
    }
    bids[seat] = value;
  }

  const tricksWon = { Left: 0, Across: 0, Right: 0, Me: 0 } as Record<Seat, number>;
  for (const line of parseSectionLines(lines, "Tricks Won:")) {
    const [labelPart, valuePart] = line.split(":");
    if (!valuePart) continue;
    const seat = parseSeatLabel(labelPart.replace("-", "").trim(), seatLabels);
    if (!seat) {
      return { ok: false, error: "Tricks Won section has an unknown seat label." };
    }
    const value = Number(valuePart.trim());
    if (!Number.isFinite(value)) {
      return { ok: false, error: "Tricks Won values must be numeric." };
    }
    tricksWon[seat] = value;
  }

  const trick: PlayT[] = [];
  for (const line of parseSectionLines(lines, "Current Trick:")) {
    if (line.trim() === "(none)") break;
    const [labelPart, cardPart] = line.split(":");
    if (!cardPart) continue;
    const seat = parseSeatLabel(labelPart.replace("-", "").trim(), seatLabels);
    if (!seat) {
      return { ok: false, error: "Current Trick section has an unknown seat label." };
    }
    const card = parseCardToken(cardPart.trim());
    if (!card) {
      return { ok: false, error: "Current Trick cards must be formatted like A♠." };
    }
    trick.push({ seat, card });
  }

  const hands = { Left: [], Across: [], Right: [], Me: [] } as Hands;
  for (const line of parseSectionLines(lines, "Hands:")) {
    const [labelPart, cardsPart] = line.split(":");
    if (!cardsPart) continue;
    const seat = parseSeatLabel(labelPart.replace("-", "").trim(), seatLabels);
    if (!seat) {
      return { ok: false, error: "Hands section has an unknown seat label." };
    }
    const tokens = cardsPart.trim().split(/\s+/).filter(Boolean);
    const cards: CardT[] = [];
    for (const token of tokens) {
      const card = parseCardToken(token);
      if (!card) {
        return { ok: false, error: "Hands must list cards like A♠." };
      }
      cards.push(card);
    }
    hands[seat] = cards;
  }

  return {
    ok: true,
    value: {
      seed: Math.floor(seedValue) >>> 0,
      trickNo: trickValue,
      leader: leaderValue,
      turn: turnValue,
      trump: parsedTrump,
      trumpBroken: parsedTrumpBroken,
      bids,
      tricksWon,
      trick,
      hands,
    },
  };
}
