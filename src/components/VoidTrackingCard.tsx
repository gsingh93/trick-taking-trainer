import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OPPONENTS, type Opp, type Seat, type Suit } from "@/engine/types";
import { suitColorClass, suitGlyph } from "@/ui/cardUtils";

type VoidTrackingCardProps = {
  voidTrackingEnabled: boolean;
  isViewingHistory: boolean;
  leadPromptActive: boolean;
  trickLength: number;
  anyVoidObserved: boolean;
  leadPromptSuit: Suit | null;
  suitStyleMode: "classic" | "distinct";
  seatLabels: Record<Seat, string>;
  leadPromptLeader: Opp | null;
  leadMismatch: Record<Opp, boolean>;
  leadSelections: Record<Opp, boolean>;
  toggleLeadSelection: (opp: Opp) => void;
  leadWarning: string | null;
  resumeAfterLeadPrompt: () => void;
  skipLeadPrompt: () => void;
  isResolving: boolean;
  awaitContinue: boolean;
};

export function VoidTrackingCard(props: VoidTrackingCardProps) {
  const {
    voidTrackingEnabled,
    isViewingHistory,
    leadPromptActive,
    trickLength,
    anyVoidObserved,
    leadPromptSuit,
    suitStyleMode,
    seatLabels,
    leadPromptLeader,
    leadMismatch,
    leadSelections,
    toggleLeadSelection,
    leadWarning,
    resumeAfterLeadPrompt,
    skipLeadPrompt,
    isResolving,
    awaitContinue,
  } = props;

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Void tracking</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            After a lead, confirm which opponents are void in the lead suit.
          </div>
          <div className="text-sm font-medium">
            {!voidTrackingEnabled
              ? "Void tracking is disabled"
              : isViewingHistory
                ? "Viewing trick history"
                : leadPromptActive
                  ? "Which opponents are void in the lead suit?"
                  : trickLength === 0
                    ? "Waiting for a card to be led..."
                    : anyVoidObserved
                      ? "Trick in progress..."
                      : "Waiting for first off-suit..."}
          </div>
          {leadPromptSuit ? (
            <div className={"text-sm " + suitColorClass(leadPromptSuit, suitStyleMode)}>
              Lead suit: {suitGlyph(leadPromptSuit)}
            </div>
          ) : null}
          <div className="space-y-2 text-sm">
            {OPPONENTS.map((o) => {
              const isLeader = leadPromptLeader === o;
              const mismatch = leadMismatch[o];
              const disabled = !voidTrackingEnabled || isViewingHistory || !leadPromptActive || isLeader;
              return (
                <label
                  key={o}
                  className={
                    "flex items-center justify-between rounded-md border px-2 py-1 " +
                    (mismatch ? "border-destructive" : "border-border") +
                    (disabled ? " opacity-60" : "")
                  }
                >
                  <span>{seatLabels[o]}</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={leadSelections[o]}
                    onChange={() => toggleLeadSelection(o)}
                    disabled={disabled}
                  />
                </label>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          {leadWarning ? <div className="text-xs text-destructive">{leadWarning}</div> : null}
          <div className="flex gap-2">
            <Button
              onClick={resumeAfterLeadPrompt}
              disabled={
                isViewingHistory ||
                !leadPromptActive ||
                isResolving ||
                awaitContinue ||
                (leadPromptActive && !voidTrackingEnabled)
              }
              className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-600/50"
            >
              Resume
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={skipLeadPrompt}
              disabled={isViewingHistory || !leadPromptActive || isResolving || awaitContinue}
            >
              Skip
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
