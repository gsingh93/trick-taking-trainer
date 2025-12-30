import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { determineTrickWinner, trickLeadSuit } from "@/engine/rules";
import type { PlayT, Seat, TrumpConfig } from "@/engine/types";
import { suitColorClass, suitGlyph } from "@/ui/cardUtils";
import { SkipBack, SkipForward, StepBack, StepForward, Play, Pause } from "lucide-react";

type TrickHistoryCardProps = {
  trickHistory: PlayT[][];
  viewedTrickIndex: number | null;
  viewedTrickStep: number;
  setViewedTrickIndex: (value: number | null) => void;
  setViewedTrickStep: (value: number | ((prev: number) => number)) => void;
  historyPlaying: boolean;
  setHistoryPlaying: (value: boolean | ((prev: boolean) => boolean)) => void;
  resumeFromHistory: (trickIndex: number, trickStep: number) => void;
  seatLabels: Record<Seat, string>;
  isViewingHistory: boolean;
  trump: TrumpConfig;
  suitStyleMode: "classic" | "distinct";
};

export function TrickHistoryCard(props: TrickHistoryCardProps) {
  const {
    trickHistory,
    viewedTrickIndex,
    viewedTrickStep,
    setViewedTrickIndex,
    setViewedTrickStep,
    historyPlaying,
    setHistoryPlaying,
    resumeFromHistory,
    seatLabels,
    isViewingHistory,
    trump,
    suitStyleMode,
  } = props;

  return (
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
              const leadSeat = t[0]?.seat ? seatLabels[t[0].seat] : "-";
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
                    {leadSuit ? <span className={suitColorClass(leadSuit, suitStyleMode)}>{suitGlyph(leadSuit)}</span> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span>Lead: {leadSeat}</span>
                    {winner ? <span>Winner: {seatLabels[winner]}</span> : null}
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
                Play from this point
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
