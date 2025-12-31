import type { ReactNode } from "react";
import { Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { sortHand } from "@/engine/rules";
import type { CardT, PlayT, Seat, Suit } from "@/engine/types";
import { PlayingCard } from "@/components/PlayingCard";
import { Eye, EyeOff } from "lucide-react";

function formatSeatStatus(args: {
  label: string;
  tricksWon: number;
  bid: string | null;
  resultLabel: string | null;
  resultClass: string;
}) {
  const { label, tricksWon, bid, resultLabel, resultClass } = args;
  return (
    <span>
      {label}{" "}
      <span className="text-xs text-muted-foreground">
        (
        <span className={resultLabel ? resultClass : ""}>{tricksWon}</span>
        {bid ? `/${bid}` : ""})
      </span>
      {resultLabel ? <span className={"ml-2 text-xs font-medium " + resultClass}>{resultLabel}</span> : null}
    </span>
  );
}

function getCardTitle(args: { canPlay: boolean; isTurn: boolean; isLegal: boolean }) {
  if (!args.canPlay) return "Start trick first";
  if (!args.isTurn) return "Not your turn";
  if (!args.isLegal) return "Illegal (must-follow / must-break)";
  return "Play";
}

function renderPlayingCard(args: {
  card: CardT;
  seat: Seat;
  currentTurn: Seat;
  legal: Set<string>;
  canPlay: boolean;
  suitStyleMode: "classic" | "distinct";
  onPlay: (seat: Seat, card: CardT) => void;
  rotateClass?: string;
}) {
  const { card, seat, currentTurn, legal, canPlay, suitStyleMode, onPlay, rotateClass } = args;
  const isTurn = seat === currentTurn;
  const isLegal = legal.has(card.id);
  return (
    <PlayingCard
      c={card}
      rotateClass={rotateClass}
      suitStyleMode={suitStyleMode}
      disabled={!canPlay || !isTurn || !isLegal}
      onClick={() => onPlay(seat, card)}
      title={getCardTitle({ canPlay, isTurn, isLegal })}
    />
  );
}

function SeatPanel({
  label,
  tricksWon,
  bid,
  resultLabel,
  resultClass,
  isTurn,
  displayHandComplete,
  cardCount,
  showReveal = false,
  isRevealed = false,
  onToggleReveal,
  disableReveal,
  children,
}: {
  label: string;
  tricksWon: number;
  bid: string | null;
  resultLabel: string | null;
  resultClass: string;
  isTurn: boolean;
  displayHandComplete: boolean;
  cardCount: number;
  showReveal?: boolean;
  isRevealed?: boolean;
  onToggleReveal?: () => void;
  disableReveal?: boolean;
  children?: ReactNode;
}) {
  return (
    <>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div
          className={
            "flex items-center gap-2 rounded-md px-1.5 py-0.5 text-sm font-medium leading-none " +
            (isTurn && !displayHandComplete
              ? "bg-emerald-100/70 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
              : "")
          }
        >
          {formatSeatStatus({ label, tricksWon, bid, resultLabel, resultClass })}
        </div>
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          {cardCount}
        </Badge>
      </div>
      {showReveal ? (
        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2 text-emerald-600 border-emerald-600 md:text-foreground md:border-border"
            onClick={onToggleReveal}
            disabled={disableReveal}
          >
            {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <span className="hidden lg:inline">{isRevealed ? "Hide" : "Reveal"}</span>
          </Button>
        </div>
      ) : null}
      {children}
    </>
  );
}

function HandRow({
  seat,
  hand,
  rotateClass,
  legal,
  onPlay,
  currentTurn,
  suitOrder,
  sortAscending,
  canPlay,
  suitStyleMode,
}: {
  seat: Seat;
  hand: CardT[];
  rotateClass?: string;
  legal: Set<string>;
  onPlay: (seat: Seat, card: CardT) => void;
  currentTurn: Seat;
  suitOrder: Suit[];
  sortAscending: boolean;
  canPlay: boolean;
  suitStyleMode: "classic" | "distinct";
}) {
  return (
    <div className={"mt-3 " + (rotateClass ?? "")}>
      <div className="flex flex-wrap gap-px">
        {sortHand(hand, suitOrder, sortAscending).map((c) => (
          <Fragment key={c.id}>
            {renderPlayingCard({
              card: c,
              seat,
              currentTurn,
              legal,
              canPlay,
              suitStyleMode,
              onPlay,
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function HandCol({
  seat,
  hand,
  cardRotateClass,
  align,
  legal,
  onPlay,
  currentTurn,
  suitOrder,
  sortAscending,
  canPlay,
  suitStyleMode,
}: {
  seat: Seat;
  hand: CardT[];
  cardRotateClass: string;
  align: "start" | "end";
  legal: Set<string>;
  onPlay: (seat: Seat, card: CardT) => void;
  currentTurn: Seat;
  suitOrder: Suit[];
  sortAscending: boolean;
  canPlay: boolean;
  suitStyleMode: "classic" | "distinct";
}) {
  const gridAlign = align === "end" ? "justify-items-end" : "justify-items-start";
  return (
    <div className={"mt-3 flex " + (align === "end" ? "justify-end" : "justify-start")}>
      <div className={"grid grid-cols-1 gap-0 lg:grid-cols-2 " + gridAlign}>
        {sortHand(hand, suitOrder, sortAscending).map((c) => (
          <div key={c.id} className="relative h-10 w-14 overflow-visible">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              {renderPlayingCard({
                card: c,
                seat,
                currentTurn,
                legal,
                canPlay,
                suitStyleMode,
                onPlay,
                rotateClass: cardRotateClass,
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type TableCardProps = {
  seatLabels: Record<Seat, string>;
  displayHands: Record<Seat, CardT[]>;
  displayTricksWon: Record<Seat, number>;
  displayTurn: Seat;
  displayHandComplete: boolean;
  displayTrick: PlayT[];
  displayTrickWinner: Seat | null;
  displayTrickNo: number;
  trickNo: number;
  bidDisplay: Record<Seat, string> | null;
  bidResultDisplay: Record<Seat, { label: string; className: string }> | null;
  shownHands: Record<Seat, boolean>;
  toggleRevealSeat: (seat: Seat) => void;
  modeOpenHandVerify: boolean;
  isViewingHistory: boolean;
  legalBySeat: Record<Seat, Set<string>>;
  onPlayCard: (seat: Seat, card: CardT) => void;
  suitOrder: Suit[];
  sortAscending: boolean;
  canPlay: boolean;
  suitStyleMode: "classic" | "distinct";
  awaitContinue: boolean;
  handComplete: boolean;
  canAdvance: boolean;
  onAdvanceTrick: () => void;
  onResetTrick: () => void;
  bidPrompt: ReactNode;
  voidPrompt: ReactNode;
  suitCountPrompt: ReactNode;
  winIntentPrompt: ReactNode;
};

export function TableCard(props: TableCardProps) {
  const {
    seatLabels,
    displayHands,
    displayTricksWon,
    displayTurn,
    displayHandComplete,
    displayTrick,
    displayTrickWinner,
    displayTrickNo,
    trickNo,
    bidDisplay,
    bidResultDisplay,
    shownHands,
    toggleRevealSeat,
    modeOpenHandVerify,
    isViewingHistory,
    legalBySeat,
    onPlayCard,
    suitOrder,
    sortAscending,
    canPlay,
    suitStyleMode,
    awaitContinue,
    handComplete,
    canAdvance,
    onAdvanceTrick,
    onResetTrick,
    bidPrompt,
    voidPrompt,
    suitCountPrompt,
    winIntentPrompt,
  } = props;

  const playCardBox = "h-[35%] aspect-[5/7]";

  const renderPlayAreaCard = (
    seat: Seat,
    fallbackClass: string,
    rotateClass?: string
  ) => {
    const p = displayTrick.find((t) => t.seat === seat);
    return p ? (
      <PlayingCard
        c={p.card}
        rotateClass={rotateClass}
        highlight={displayTrickWinner === seat}
        suitStyleMode={suitStyleMode}
        sizeClass="h-full w-full"
      />
    ) : (
      <div className={fallbackClass + " opacity-20"} />
    );
  };

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-center gap-3">
              <span>Table</span>
              <Button
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={onResetTrick}
                disabled={isViewingHistory}
              >
                Reset trick
              </Button>
            </div>
            <div className="pl-0.5 text-xs text-muted-foreground">
              {isViewingHistory ? `Viewing trick ${displayTrickNo}` : `Trick ${trickNo}`}
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-1 pb-1.5 px-1.5 sm:pt-2 sm:pb-3 sm:px-3">
        <div className="grid grid-cols-[minmax(0,0.25fr)_minmax(0,0.5fr)_minmax(0,0.25fr)] grid-rows-[auto_1fr_auto] gap-x-0.5 gap-y-2 sm:gap-3">
          <div className="col-span-3 rounded-xl border p-1 sm:p-2">
            <SeatPanel
              label={seatLabels.Across}
              tricksWon={displayTricksWon.Across}
              bid={bidDisplay ? bidDisplay.Across : null}
              resultLabel={bidResultDisplay ? bidResultDisplay.Across.label : null}
              resultClass={bidResultDisplay ? bidResultDisplay.Across.className : ""}
              isTurn={displayTurn === "Across"}
              displayHandComplete={displayHandComplete}
              cardCount={displayHands.Across.length}
              showReveal
              isRevealed={shownHands.Across}
              onToggleReveal={() => toggleRevealSeat("Across")}
              disableReveal={modeOpenHandVerify || isViewingHistory}
            >
              {shownHands.Across ? (
                <HandRow
                  seat="Across"
                  hand={displayHands.Across}
                  legal={legalBySeat.Across}
                  onPlay={onPlayCard}
                  currentTurn={displayTurn}
                  suitOrder={suitOrder}
                  sortAscending={sortAscending}
                  canPlay={canPlay}
                  suitStyleMode={suitStyleMode}
                />
              ) : null}
            </SeatPanel>
          </div>

          <div className={"row-span-2 rounded-xl border p-1 sm:p-2 " + (shownHands.Left ? "min-h-[400px]" : "")}>
            <SeatPanel
              label={seatLabels.Left}
              tricksWon={displayTricksWon.Left}
              bid={bidDisplay ? bidDisplay.Left : null}
              resultLabel={bidResultDisplay ? bidResultDisplay.Left.label : null}
              resultClass={bidResultDisplay ? bidResultDisplay.Left.className : ""}
              isTurn={displayTurn === "Left"}
              displayHandComplete={displayHandComplete}
              cardCount={displayHands.Left.length}
              showReveal
              isRevealed={shownHands.Left}
              onToggleReveal={() => toggleRevealSeat("Left")}
              disableReveal={modeOpenHandVerify || isViewingHistory}
            >
              {shownHands.Left ? (
                <HandCol
                  seat="Left"
                  hand={displayHands.Left}
                  cardRotateClass="rotate-90 origin-center"
                  align="start"
                  legal={legalBySeat.Left}
                  onPlay={onPlayCard}
                  currentTurn={displayTurn}
                  suitOrder={suitOrder}
                  sortAscending={sortAscending}
                  canPlay={canPlay}
                  suitStyleMode={suitStyleMode}
                />
              ) : null}
            </SeatPanel>
          </div>

          <div className="flex w-full items-center justify-center self-center px-0 sm:px-[2px]">
            <div
              className="relative flex aspect-square w-full min-w-[180px] items-center justify-center rounded-xl border bg-emerald-600/80 p-2 shadow-inner sm:p-3"
              onClick={canAdvance ? onAdvanceTrick : undefined}
            >
              <div className="absolute right-2 top-2 text-white">
                <Badge className="bg-white/20 text-white hover:bg-white/20" variant="secondary">
                  {displayTrick.length}/4
                </Badge>
              </div>

              <div className="relative h-[90%] w-[90%]">
              <div className={"absolute left-1/2 top-0 -translate-x-1/2 " + playCardBox}>
                {renderPlayAreaCard("Across", "h-full w-full")}
              </div>

              <div className={"absolute left-0 top-1/2 -translate-y-1/2 " + playCardBox}>
                {renderPlayAreaCard("Left", "h-full w-full", "rotate-90")}
              </div>

              <div className={"absolute right-0 top-1/2 -translate-y-1/2 " + playCardBox}>
                {renderPlayAreaCard("Right", "h-full w-full", "-rotate-90")}
              </div>

              <div className={"absolute bottom-0 left-1/2 -translate-x-1/2 " + playCardBox}>
                {renderPlayAreaCard("Me", "h-full w-full")}
              </div>
            </div>

            <div className="absolute bottom-2 left-1/2 w-[85%] -translate-x-1/2 text-center text-xs text-white/80">
              {awaitContinue && !handComplete && !isViewingHistory ? (
                <>
                  <span className="lg:hidden">Click to continue</span>
                  <span className="hidden lg:inline">Press Enter/Space or click to continue</span>
                </>
              ) : null}
            </div>

            {bidPrompt}
            {voidPrompt}
            {suitCountPrompt}
            {winIntentPrompt}
          </div>
          </div>

          <div className={"row-span-2 rounded-xl border p-1 sm:p-2 " + (shownHands.Right ? "min-h-[400px]" : "")}>
            <SeatPanel
              label={seatLabels.Right}
              tricksWon={displayTricksWon.Right}
              bid={bidDisplay ? bidDisplay.Right : null}
              resultLabel={bidResultDisplay ? bidResultDisplay.Right.label : null}
              resultClass={bidResultDisplay ? bidResultDisplay.Right.className : ""}
              isTurn={displayTurn === "Right"}
              displayHandComplete={displayHandComplete}
              cardCount={displayHands.Right.length}
              showReveal
              isRevealed={shownHands.Right}
              onToggleReveal={() => toggleRevealSeat("Right")}
              disableReveal={modeOpenHandVerify || isViewingHistory}
            >
              {shownHands.Right ? (
                <HandCol
                  seat="Right"
                  hand={displayHands.Right}
                  cardRotateClass="-rotate-90 origin-center"
                  align="end"
                  legal={legalBySeat.Right}
                  onPlay={onPlayCard}
                  currentTurn={displayTurn}
                  suitOrder={suitOrder}
                  sortAscending={sortAscending}
                  canPlay={canPlay}
                  suitStyleMode={suitStyleMode}
                />
              ) : null}
            </SeatPanel>
          </div>

          <div className="col-span-3 rounded-xl border p-1 sm:p-2">
            <SeatPanel
              label={seatLabels.Me}
              tricksWon={displayTricksWon.Me}
              bid={bidDisplay ? bidDisplay.Me : null}
              resultLabel={bidResultDisplay ? bidResultDisplay.Me.label : null}
              resultClass={bidResultDisplay ? bidResultDisplay.Me.className : ""}
              isTurn={displayTurn === "Me"}
              displayHandComplete={displayHandComplete}
              cardCount={displayHands.Me.length}
            >
              <HandRow
                seat="Me"
                hand={displayHands.Me}
                legal={legalBySeat.Me}
                onPlay={onPlayCard}
                currentTurn={displayTurn}
                suitOrder={suitOrder}
                sortAscending={sortAscending}
                canPlay={canPlay}
                suitStyleMode={suitStyleMode}
              />
            </SeatPanel>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
