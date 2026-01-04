import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Bug, X } from "lucide-react";
import { suitColorClass, suitGlyph, rankGlyph } from "@/ui/cardUtils";
import { sortHand } from "@/engine/rules";
import { SEATS, SUITS, type CardT, type Hands, type Rank, type Seat, type Suit, type TrumpConfig } from "@/engine/types";
import type { BidState } from "@/engine/phase/bidding";
import type { BidBreakdown } from "@/engine/ai/bidHeuristic";
import { parseSnapshotText, type SnapshotData } from "@/debug/snapshot";

type DebugPanelProps = {
  debugAutoPlay: boolean;
  onToggleAutoPlay: () => void;
  onShowVoidPrompt: () => void;
  onShowSuitCountPrompt: () => void;
  onShowWinIntent: () => void;
  onShowWinIntentWarn: () => void;
  onClearPrompts: () => void;
  buildSnapshotText: () => string;
  snapshotFileName: string;
  onApplySnapshot: (snapshot: SnapshotData) => void;
  seatLabels: Record<Seat, string>;
  mustBreak: boolean;
  bidBreakdowns: Record<Seat, BidBreakdown>;
  bidState: BidState | null;
  hands: Hands;
  suitOrder: Suit[];
  sortAscending: boolean;
  suitStyleMode: "classic" | "distinct";
  trump: TrumpConfig;
};

export function DebugPanel(props: DebugPanelProps) {
  const {
    debugAutoPlay,
    onToggleAutoPlay,
    onShowVoidPrompt,
    onShowSuitCountPrompt,
    onShowWinIntent,
    onShowWinIntentWarn,
    onClearPrompts,
    buildSnapshotText,
    snapshotFileName,
    onApplySnapshot,
    seatLabels,
    mustBreak,
    bidBreakdowns,
    bidState,
    hands,
    suitOrder,
    sortAscending,
    suitStyleMode,
    trump,
  } = props;
  const [open, setOpen] = useState(false);
  const [snapshotInput, setSnapshotInput] = useState("");
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const handleDownloadSnapshot = () => {
    const text = buildSnapshotText();
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = snapshotFileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleCopySnapshot = async () => {
    const text = buildSnapshotText();
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.left = "-1000px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  };

  const handleLoadSnapshot = () => {
    const result = parseSnapshotText(snapshotInput, seatLabels, mustBreak);
    if (!result.ok) {
      setSnapshotError(result.error);
      return;
    }
    setSnapshotError(null);
    onApplySnapshot(result.value);
  };

  const formatRanks = (ranks: number[]) =>
    ranks
      .slice()
      .sort((a, b) => b - a)
      .map((r) => rankGlyph(r as Rank))
      .join(" ");
  const formatMissing = (entry: Record<number, number>) =>
    Object.entries(entry)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([rank, missing]) => `${rankGlyph(Number(rank) as Rank)}:${missing}`)
      .join(" ");
  const formatWinners = (entry: Record<number, number>) =>
    Object.entries(entry)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([rank, value]) => `${rankGlyph(Number(rank) as Rank)}:${value}`)
      .join(" ");
  const formatHand = (cards: CardT[]) =>
    sortHand(cards, suitOrder, sortAscending).map((card) => (
      <span key={card.id} className={"mr-1 inline-flex " + suitColorClass(card.suit, suitStyleMode)}>
        {rankGlyph(card.rank)}
        {suitGlyph(card.suit)}
      </span>
    ));
  const renderLabeled = (label: string, value: ReactNode) => (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
  const renderSuitTotals = (breakdown: BidBreakdown) => (
    <div className="flex flex-wrap items-center gap-2 text-foreground">
      {suitOrder.map((suit) => {
        if (trump.enabled && suit === trump.suit) return null;
        const suitInfo = breakdown.suits[suit];
        return (
          <span key={suit} className={suitColorClass(suit, suitStyleMode)}>
            {suitGlyph(suit)} {suitInfo.cappedPoints.toFixed(1)}
          </span>
        );
      })}
      {breakdown.trump ? (
        <span className={suitColorClass(breakdown.trump.suit, suitStyleMode)}>
          {suitGlyph(breakdown.trump.suit)} {breakdown.trump.points.toFixed(1)}
        </span>
      ) : null}
    </div>
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="fixed bottom-4 right-4 z-50 shadow"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close debug panel" : "Open debug panel"}
      >
        <Bug className="h-4 w-4" />
      </Button>
      <div
        className={
          "fixed right-0 top-0 z-50 h-full w-[90vw] max-w-[380px] border-l bg-background shadow-lg transition-transform duration-200 " +
          (open ? "translate-x-0" : "translate-x-full")
        }
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-semibold">Debug</div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            aria-label="Close debug panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="h-full overflow-y-auto p-3">
          <div className="rounded-lg border bg-card p-3 text-sm shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Debug</div>
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={onShowVoidPrompt}>
                  Void prompt
                </Button>
                <Button variant="outline" onClick={onShowSuitCountPrompt}>
                  Suit count prompt
                </Button>
                <Button variant="outline" onClick={onShowWinIntent}>
                  Win intent
                </Button>
                <Button variant="outline" onClick={onShowWinIntentWarn}>
                  Win intent warn
                </Button>
              </div>
              <Button variant="outline" className="w-full" onClick={onClearPrompts}>
                Clear prompts
              </Button>
              <Button variant="outline" className="w-full" onClick={handleDownloadSnapshot}>
                Download snapshot
              </Button>
              <Button variant="outline" className="w-full" onClick={handleCopySnapshot}>
                Copy snapshot
              </Button>
              <div className="space-y-2 rounded-md border border-dashed p-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Load snapshot
                </div>
                <textarea
                  value={snapshotInput}
                  onChange={(event) => {
                    setSnapshotInput(event.target.value);
                    if (snapshotError) setSnapshotError(null);
                  }}
                  placeholder="Paste snapshot text here"
                  className="h-28 w-full resize-none rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {snapshotError ? <div className="text-xs text-destructive">{snapshotError}</div> : null}
                <Button variant="outline" className="w-full" onClick={handleLoadSnapshot}>
                  Load snapshot
                </Button>
              </div>
              <Button variant={debugAutoPlay ? "default" : "outline"} className="w-full" onClick={onToggleAutoPlay}>
                {debugAutoPlay ? "Stop auto-play hand" : "Auto-play hand"}
              </Button>
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Bid breakdown
                </div>
                {SEATS.map((seat) => {
                  const breakdown = bidBreakdowns[seat];
                  const bidValue = bidState?.bids[seat];
                  return (
                    <details key={seat} className="rounded-md border px-2 py-1 text-[11px]">
                      <summary className="cursor-pointer select-none">
                        {seatLabels[seat]} • bid {bidValue ?? "?"} • est {breakdown.bid} (total{" "}
                        {breakdown.total.toFixed(1)})
                      </summary>
                      <div className="mt-2 space-y-2">
                        {renderLabeled("Hand", formatHand(hands[seat]) || "-")}
                        {renderLabeled("Suit totals", renderSuitTotals(breakdown))}
                        {SUITS.map((suit) => {
                          if (trump.enabled && suit === trump.suit) return null;
                          const suitInfo = breakdown.suits[suit];
                          return (
                            <div key={suit} className="space-y-0.5">
                              <div className={"font-medium " + suitColorClass(suit, suitStyleMode)}>
                                {suitGlyph(suit)} suit
                              </div>
                              {renderLabeled("Length", suitInfo.length)}
                              {renderLabeled("Honors", formatRanks(suitInfo.honorsHeld) || "-")}
                              {renderLabeled("Sacrifices", suitInfo.sacrifices)}
                              {renderLabeled("Missing higher", formatMissing(suitInfo.missingHigherByHonor) || "-")}
                              {renderLabeled("Honor winners", formatWinners(suitInfo.winnerPointsByHonor) || "-")}
                              {renderLabeled("Suit points", suitInfo.points.toFixed(1))}
                              {renderLabeled("Cap", suitInfo.cap)}
                              {renderLabeled("Final suit points", suitInfo.cappedPoints.toFixed(1))}
                            </div>
                          );
                        })}
                        {breakdown.trump ? (
                          <div className="space-y-0.5">
                            <div className="font-medium text-foreground">
                              Trump suit:{" "}
                              <span className={suitColorClass(breakdown.trump.suit, suitStyleMode)}>
                                {suitGlyph(breakdown.trump.suit)}
                              </span>
                            </div>
                            {renderLabeled("Trump points", breakdown.trump.points.toFixed(1))}
                            {renderLabeled("Trump sacrifices", breakdown.trump.sacrifices)}
                            {renderLabeled("Trump effective sacrifices", breakdown.trump.effectiveSacrifices)}
                            {renderLabeled("Trump max missing higher", breakdown.trump.maxMissingHigher)}
                            {renderLabeled("Trump leftover sacrifices", breakdown.trump.leftover)}
                            {renderLabeled("Short-suit bonus", breakdown.trump.shortBonus.toFixed(1))}
                            {renderLabeled("Short-suit bonus applied", breakdown.trump.shortBonusApplied.toFixed(1))}
                            {renderLabeled("Remaining trump", breakdown.trump.remainingTrump.toFixed(1))}
                            {renderLabeled("Remaining trump bonus", breakdown.trump.remainingTrumpBonus.toFixed(1))}
                            {renderLabeled("Singletons", breakdown.trump.singletons)}
                            {renderLabeled("Doubletons", breakdown.trump.doubletons)}
                          </div>
                        ) : null}
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
