import type { Rank, Suit } from "@/engine/types";

export function suitGlyph(s: Suit) {
  if (s === "S") return "♠";
  if (s === "H") return "♥";
  if (s === "D") return "♦";
  return "♣";
}

export function suitColorClass(s: Suit, mode: "classic" | "distinct") {
  if (mode === "distinct") {
    if (s === "S") return "text-slate-900 dark:text-slate-100";
    if (s === "C") return "text-emerald-700 dark:text-emerald-300";
    if (s === "H") return "text-red-600 dark:text-red-400";
    return "text-blue-600 dark:text-blue-400";
  }
  return s === "H" || s === "D" ? "text-red-600" : "text-foreground";
}

export function rankGlyph(n: Rank) {
  if (n === 14) return "A";
  if (n === 13) return "K";
  if (n === 12) return "Q";
  if (n === 11) return "J";
  return String(n);
}
