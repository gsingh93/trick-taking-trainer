import type { Opp, Seat, Suit, CardT, PlayT } from "@/engine/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { suitColorClass, suitGlyph } from "@/ui/cardUtils";
import { trickLeadSuit } from "@/engine/rules";

type VoidSelections = Record<Opp, boolean>;

type PromptOverlaysProps = {
  biddingActive: boolean;
  bidStateActive: boolean;
  biddingComplete: boolean;
  currentBidder: Seat | null;
  bidInput: string;
  setBidInput: (value: string) => void;
  onSubmitBid: (bid: number) => void;
  suitCountPromptEnabled: boolean;
  suitCountPromptActive: boolean;
  suitCountPromptSuit: Suit | null;
  suitCountAnswer: string;
  setSuitCountAnswer: (value: string) => void;
  suitCountMismatch: boolean;
  setSuitCountMismatch: (value: boolean) => void;
  onResumeSuitCount: () => void;
  onSkipSuitCount: () => void;
  trickHistory: PlayT[][];
  suitStyleMode: "classic" | "distinct";
  supportsHover: boolean;
  peekPrompt: "bid" | "suit" | "void" | "intent" | null;
  onPeekToggle: (promptId: "bid" | "suit" | "void" | "intent") => void;
  voidTrackingEnabled: boolean;
  leadPromptActive: boolean;
  leadPromptSuit: Suit | null;
  leadPromptLeader: Opp | null;
  leadSelections: VoidSelections;
  leadMismatch: VoidSelections;
  leadWarning: string | null;
  onToggleLeadSelection: (seat: Opp) => void;
  onResumeLeadPrompt: () => void;
  onSkipLeadPrompt: () => void;
  seatLabels: Record<Seat, string>;
  isResolving: boolean;
  awaitContinue: boolean;
  isViewingHistory: boolean;
  pendingIntentCard: CardT | null;
  intentWarning: string | null;
  intentDetails: string[];
  onIntentDecision: (intentToWin: boolean) => void;
  onConfirmIntentPlay: () => void;
  onCancelIntentPrompt: () => void;
};

function formatOrdinal(value: number): string {
  const abs = Math.abs(value);
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  switch (abs % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

function formatCardCount(value: number): string {
  return `${value} ${value === 1 ? "card" : "cards"}`;
}

export function PromptOverlays(props: PromptOverlaysProps) {
  const {
    biddingActive,
    bidStateActive,
    biddingComplete,
    currentBidder,
    bidInput,
    setBidInput,
    onSubmitBid,
    suitCountPromptEnabled,
    suitCountPromptActive,
    suitCountPromptSuit,
    suitCountAnswer,
    setSuitCountAnswer,
    suitCountMismatch,
    setSuitCountMismatch,
    onResumeSuitCount,
    onSkipSuitCount,
    trickHistory,
    suitStyleMode,
    supportsHover,
    peekPrompt,
    onPeekToggle,
    voidTrackingEnabled,
    leadPromptActive,
    leadPromptSuit,
    leadPromptLeader,
    leadSelections,
    leadMismatch,
    leadWarning,
    onToggleLeadSelection,
    onResumeLeadPrompt,
    onSkipLeadPrompt,
    seatLabels,
    isResolving,
    awaitContinue,
    isViewingHistory,
    pendingIntentCard,
    intentWarning,
    intentDetails,
    onIntentDecision,
    onConfirmIntentPlay,
    onCancelIntentPrompt,
  } = props;

  const renderPeekToggle = (promptId: "bid" | "suit" | "void" | "intent") => {
    const isPeeking = peekPrompt === promptId;
    return (
      <button
        type="button"
        className="peer order-2 cursor-pointer rounded-full border bg-background/80 px-2 py-0.5 text-[10px] text-foreground/70"
        onClick={() => onPeekToggle(promptId)}
      >
        {supportsHover ? "Hover to peek" : isPeeking ? "Tap to unpeek" : "Tap to peek"}
      </button>
    );
  };

  const renderBidPrompt = () => {
    if (!biddingActive || !bidStateActive) return null;
    if (biddingComplete) return null;
    if (currentBidder !== "Me") {
      return (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
          <div className="w-[200px] rounded-lg border bg-card px-3 py-3 text-sm shadow-lg">
            <div className="text-sm font-medium">Waiting for other bids</div>
          </div>
        </div>
      );
    }
    return (
      <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
        <div className="w-[170px] space-y-3 rounded-lg border bg-card px-3 py-3 text-sm shadow-lg">
          <div className="text-sm font-medium">Enter your bid</div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <Select value={bidInput} onValueChange={(v) => setBidInput(v)}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 14 }, (_, i) => String(i)).map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => onSubmitBid(Number(bidInput))}
            >
              Bid
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderSuitCountPrompt = () => {
    if (!suitCountPromptEnabled || !suitCountPromptActive) return null;
    const suitLeadCount = suitCountPromptSuit
      ? trickHistory.filter((t) => trickLeadSuit(t) === suitCountPromptSuit).length
      : 0;
    const offSuitCount = trickHistory.reduce((sum, t) => {
      const lead = trickLeadSuit(t);
      if (!lead) return sum;
      const offSuit = t.filter((play) => play.card.suit !== lead).length;
      return sum + offSuit;
    }, 0);
    const isPeeking = peekPrompt === "suit";
    const hoverPeekClass = supportsHover ? " peer-hover:pointer-events-none peer-hover:opacity-20" : "";
    return (
      <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
        <div className="flex flex-col items-center gap-2">
          {renderPeekToggle("suit")}
          <div
            className={
              "order-1 w-[220px] space-y-3 rounded-lg border bg-card px-3 py-3 text-sm shadow-lg transition-opacity" +
              hoverPeekClass +
              (isPeeking ? " pointer-events-none opacity-20" : "")
            }
          >
            <div className="text-sm font-medium">
              How many{" "}
              <span className={suitCountPromptSuit ? suitColorClass(suitCountPromptSuit, suitStyleMode) : undefined}>
                {suitCountPromptSuit ? suitGlyph(suitCountPromptSuit) : "cards"}
              </span>{" "}
              remain outside your hand?
            </div>
            <Select
              value={suitCountAnswer}
              onValueChange={(v) => {
                setSuitCountAnswer(v);
                setSuitCountMismatch(false);
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 14 }, (_, i) => String(i)).map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {suitCountMismatch ? <div className="text-xs text-destructive">Suit count is incorrect</div> : null}
            <details className="rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none font-medium text-foreground">Hint</summary>
              <div className="mt-1">
                This is the {formatOrdinal(suitLeadCount)} time this suit has been led and this hand{" "}
                {formatCardCount(offSuitCount)} {offSuitCount === 1 ? "was" : "were"} played off-suit.
                This gives an upper bound on the number of cards left in this suit.
              </div>
            </details>
            <div className="flex gap-2">
              <Button className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700" onClick={onResumeSuitCount}>
                Resume
              </Button>
              <Button variant="outline" className="flex-1" onClick={onSkipSuitCount}>
                Skip
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderVoidPrompt = () => {
    if (!voidTrackingEnabled || !leadPromptActive || !leadPromptSuit) return null;
    if (isViewingHistory) return null;
    const isPeeking = peekPrompt === "void";
    const hoverPeekClass = supportsHover ? " peer-hover:pointer-events-none peer-hover:opacity-20" : "";
    return (
      <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
        <div className="flex flex-col items-center gap-2">
          {renderPeekToggle("void")}
          <div
            className={
              "order-1 w-[240px] space-y-3 rounded-lg border bg-card px-3 py-3 text-sm shadow-lg transition-opacity" +
              hoverPeekClass +
              (isPeeking ? " pointer-events-none opacity-20" : "")
            }
          >
            <div className="text-sm font-medium">Which opponents are void in the lead suit?</div>
            <div className={"text-sm " + suitColorClass(leadPromptSuit, suitStyleMode)}>
              Lead suit: {suitGlyph(leadPromptSuit)}
            </div>
            <div className="grid grid-cols-3 grid-rows-3 place-items-center gap-2 text-xs">
              {(
                [
                  { seat: "Across", col: 2, row: 1 },
                  { seat: "Left", col: 1, row: 2 },
                  { seat: "Right", col: 3, row: 2 },
                ] as const
              ).map(({ seat, col, row }) => {
                const isLeader = leadPromptLeader === seat;
                const mismatch = leadMismatch[seat];
                const disabled = isLeader;
                return (
                  <label
                    key={seat}
                    className={
                      "flex flex-col items-center gap-1 rounded-md border px-2 py-1 " +
                      (mismatch ? "border-destructive" : "border-border") +
                      (disabled ? " opacity-60" : "")
                    }
                    style={{ gridColumn: col, gridRow: row }}
                  >
                    <span>{seatLabels[seat]}</span>
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={leadSelections[seat]}
                      onChange={() => onToggleLeadSelection(seat)}
                      disabled={disabled}
                    />
                  </label>
                );
              })}
            </div>
            {leadWarning ? <div className="text-xs text-destructive">{leadWarning}</div> : null}
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={onResumeLeadPrompt}
                disabled={isResolving || awaitContinue}
              >
                Resume
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={onSkipLeadPrompt}
                disabled={isResolving || awaitContinue}
              >
                Skip
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderWinIntentPrompt = () => {
    if (!pendingIntentCard) return null;
    const isPeeking = peekPrompt === "intent";
    const hoverPeekClass = supportsHover ? " peer-hover:pointer-events-none peer-hover:opacity-20" : "";
    return (
      <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
        <div className="flex flex-col items-center gap-2">
          {renderPeekToggle("intent")}
          <div
            className={
              "order-1 w-[200px] space-y-3 rounded-lg border bg-card px-3 py-3 text-sm shadow-lg transition-opacity" +
              hoverPeekClass +
              (isPeeking ? " pointer-events-none opacity-20" : "")
            }
          >
            {!intentWarning ? (
              <>
                <div className="text-sm font-medium">Do you intend to win this trick?</div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => onIntentDecision(true)}
                  >
                    Yes
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => onIntentDecision(false)}>
                    No
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-medium text-destructive">{intentWarning}</div>
                {intentDetails.length ? (
                  <details className="rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground">
                    <summary className="cursor-pointer select-none font-medium text-foreground">Details</summary>
                    <div className="mt-1 space-y-1">
                      {intentDetails.map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                    </div>
                  </details>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={onConfirmIntentPlay}
                  >
                    Play
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={onCancelIntentPrompt}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {renderBidPrompt()}
      {renderVoidPrompt()}
      {renderSuitCountPrompt()}
      {renderWinIntentPrompt()}
    </>
  );
}
