import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { Rank, Suit, TrumpConfig } from "@/engine/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HelpTooltip } from "@/ui/HelpTooltip";
import { suitColorClass, suitGlyph } from "@/ui/cardUtils";

type SwitchRow = {
  key: string;
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
  tooltip?: string;
  className?: string;
};

type SelectRow = {
  key: string;
  label: string;
  tooltip?: string;
  className?: string;
  select: ReactNode;
};

type SuitToggleRow = {
  key: string;
  label: string;
  selectedSuits: Suit[];
  onToggle: (suit: Suit) => void;
  disabled?: boolean;
  className?: string;
};

function renderSwitchRow(row: SwitchRow) {
  return (
    <div key={row.key} className={"flex justify-between " + (row.className ?? "")}>
      {row.tooltip ? (
        <div className="flex items-center gap-2">
          <span className="text-sm">{row.label}</span>
          <HelpTooltip text={row.tooltip} />
        </div>
      ) : (
        <span className="text-sm">{row.label}</span>
      )}
      <Switch checked={row.checked} onCheckedChange={row.onCheckedChange} disabled={row.disabled} />
    </div>
  );
}

function renderSelectRow(row: SelectRow) {
  return (
    <div key={row.key} className={"grid grid-cols-[minmax(0,1fr)_auto] gap-2 " + (row.className ?? "")}>
      {row.tooltip ? (
        <div className="flex items-center gap-2 text-sm">
          <span>{row.label}</span>
          <HelpTooltip text={row.tooltip} />
        </div>
      ) : (
        <span className="text-sm">{row.label}</span>
      )}
      {row.select}
    </div>
  );
}

function renderSuitToggleRow(row: SuitToggleRow, suits: Suit[], suitStyleMode: "classic" | "distinct") {
  return (
    <div key={row.key} className={"grid grid-cols-[minmax(0,1fr)_auto] gap-2 " + (row.className ?? "")}>
      <span className="text-sm">{row.label}</span>
      <div className={"flex gap-1 " + (row.disabled ? "opacity-50" : "")}>
        {suits.map((s) => {
          const selected = row.selectedSuits.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => row.onToggle(s)}
              disabled={row.disabled}
              className={
                "h-8 w-8 rounded-md border text-sm transition " +
                (selected ? "border-emerald-500 bg-emerald-500/10" : "border-border") +
                (row.disabled ? " cursor-not-allowed" : " hover:bg-accent")
              }
            >
              <span className={suitColorClass(s, suitStyleMode)}>{suitGlyph(s)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type SettingsCardProps = {
  modeOpenHandVerify: boolean;
  setModeOpenHandVerify: (value: boolean) => void;
  voidTrackingEnabled: boolean;
  setVoidTrackingEnabled: (value: boolean) => void;
  voidPromptOnlyWhenLeading: boolean;
  setVoidPromptOnlyWhenLeading: (value: boolean) => void;
  voidTrackingSuits: Suit[];
  toggleVoidTrackingSuit: (suit: Suit) => void;
  voidPromptScope: "global" | "per-suit";
  setVoidPromptScope: (value: "global" | "per-suit") => void;
  suitCountPromptEnabled: boolean;
  setSuitCountPromptEnabled: (value: boolean) => void;
  suitCountPromptSuits: Suit[];
  toggleSuitCountPromptSuit: (suit: Suit) => void;
  winIntentPromptEnabled: boolean;
  setWinIntentPromptEnabled: (value: boolean) => void;
  winIntentMinRank: Rank;
  setWinIntentMinRank: (value: Rank) => void;
  winIntentWarnHonorsOnly: boolean;
  setWinIntentWarnHonorsOnly: (value: boolean) => void;
  winIntentWarnTrump: boolean;
  setWinIntentWarnTrump: (value: boolean) => void;
  checkErrorsEnabled: boolean;
  setCheckErrorsEnabled: (value: boolean) => void;
  aiEnabled: boolean;
  setAiEnabled: (value: boolean) => void;
  aiMode: "random" | "bidding";
  setAiMode: (value: "random" | "bidding") => void;
  aiPlayMe: boolean;
  setAiPlayMe: (value: boolean) => void;
  aiDelayInput: string;
  setAiDelayInput: (value: string) => void;
  setAiDelayMs: (value: number) => void;
  commitAiDelayInput: (value: string) => void;
  pauseBeforeNextTrick: boolean;
  setPauseBeforeNextTrick: (value: boolean) => void;
  handInProgress: boolean;
  biddingActive: boolean;
  trump: TrumpConfig;
  setTrump: Dispatch<SetStateAction<TrumpConfig>>;
  suitOrderMode: "bridge" | "poker";
  setSuitOrderMode: (value: "bridge" | "poker") => void;
  suitStyleMode: "classic" | "distinct";
  setSuitStyleMode: (value: "classic" | "distinct") => void;
  sortAscending: boolean;
  setSortAscending: (value: boolean) => void;
  seatLabelMode: "relative" | "compass";
  setSeatLabelMode: (value: "relative" | "compass") => void;
  suits: Suit[];
};

export function SettingsCard(props: SettingsCardProps) {
  const {
    modeOpenHandVerify,
    setModeOpenHandVerify,
    voidTrackingEnabled,
    setVoidTrackingEnabled,
    voidPromptOnlyWhenLeading,
    setVoidPromptOnlyWhenLeading,
    voidTrackingSuits,
    toggleVoidTrackingSuit,
    voidPromptScope,
    setVoidPromptScope,
    suitCountPromptEnabled,
    setSuitCountPromptEnabled,
    suitCountPromptSuits,
    toggleSuitCountPromptSuit,
    winIntentPromptEnabled,
    setWinIntentPromptEnabled,
    winIntentMinRank,
    setWinIntentMinRank,
    winIntentWarnHonorsOnly,
    setWinIntentWarnHonorsOnly,
    winIntentWarnTrump,
    setWinIntentWarnTrump,
    checkErrorsEnabled,
    setCheckErrorsEnabled,
    aiEnabled,
    setAiEnabled,
    aiMode,
    setAiMode,
    aiPlayMe,
    setAiPlayMe,
    aiDelayInput,
    setAiDelayInput,
    setAiDelayMs,
    commitAiDelayInput,
    pauseBeforeNextTrick,
    setPauseBeforeNextTrick,
    handInProgress,
    biddingActive,
    trump,
    setTrump,
    suitOrderMode,
    setSuitOrderMode,
    suitStyleMode,
    setSuitStyleMode,
    sortAscending,
    setSortAscending,
    seatLabelMode,
    setSeatLabelMode,
    suits,
  } = props;

  const settingsRows = {
    training: [
      {
        key: "open-hand-verify",
        label: "Open-hand verify",
        checked: modeOpenHandVerify,
        onCheckedChange: setModeOpenHandVerify,
      },
    ] satisfies SwitchRow[],
    voidTracking: [
      {
        key: "void-tracking",
        label: "Void tracking",
        checked: voidTrackingEnabled,
        onCheckedChange: setVoidTrackingEnabled,
        tooltip: "Require confirming which opponents are void in the lead suit",
      },
    ] satisfies SwitchRow[],
    voidSuitFilter: [
      {
        key: "void-tracking-suits",
        label: "Void tracking suits",
        selectedSuits: voidTrackingSuits,
        onToggle: toggleVoidTrackingSuit,
        disabled: !voidTrackingEnabled,
        className: !voidTrackingEnabled ? "opacity-50" : "",
      },
    ] satisfies SuitToggleRow[],
    voidOptions: [
      {
        key: "void-leading-only",
        label: "Void prompts only when leading",
        checked: voidPromptOnlyWhenLeading,
        onCheckedChange: setVoidPromptOnlyWhenLeading,
        disabled: !voidTrackingEnabled,
        className: !voidTrackingEnabled ? "opacity-50" : "",
      },
    ] satisfies SwitchRow[],
    voidSelects: [
      {
        key: "void-prompt-scope",
        label: "Prompt after first void",
        tooltip: "Global: after any off-suit, prompt on every lead\nPer suit: only prompt after off-suit in that suit",
        className: !voidTrackingEnabled ? "opacity-50" : "",
        select: (
          <Select
            value={voidPromptScope}
            onValueChange={(v) => setVoidPromptScope(v as "global" | "per-suit")}
            disabled={!voidTrackingEnabled}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Global</SelectItem>
              <SelectItem value="per-suit">Per suit</SelectItem>
            </SelectContent>
          </Select>
        ),
      },
    ] satisfies SelectRow[],
    suitCount: [
      {
        key: "suit-count",
        label: "Suit count prompt",
        checked: suitCountPromptEnabled,
        onCheckedChange: setSuitCountPromptEnabled,
        tooltip: "After the first off-suit in a suit, ask how many of that suit remain outside your hand",
      },
    ] satisfies SwitchRow[],
    suitCountSuitFilter: [
      {
        key: "suit-count-suits",
        label: "Suit count suits",
        selectedSuits: suitCountPromptSuits,
        onToggle: toggleSuitCountPromptSuit,
        disabled: !suitCountPromptEnabled,
        className: !suitCountPromptEnabled ? "opacity-50" : "",
      },
    ] satisfies SuitToggleRow[],
    winIntent: [
      {
        key: "win-intent",
        label: "Win intent prompt",
        checked: winIntentPromptEnabled,
        onCheckedChange: setWinIntentPromptEnabled,
        tooltip:
          "When you play a card at or above the win intent minimum rank, ask if you intend to win the trick and warn if it can be beaten",
      },
    ] satisfies SwitchRow[],
    winIntentWarn: [
      {
        key: "win-intent-honors",
        label: "Warn about higher honors only",
        checked: winIntentWarnHonorsOnly,
        onCheckedChange: setWinIntentWarnHonorsOnly,
        disabled: !winIntentPromptEnabled,
        className: !winIntentPromptEnabled ? "opacity-50" : "",
        tooltip: "When enabled, only warn if higher honors remain instead of any higher card",
      },
      {
        key: "win-intent-trump",
        label: "Warn about trump voids",
        checked: winIntentWarnTrump,
        onCheckedChange: setWinIntentWarnTrump,
        disabled: !winIntentPromptEnabled,
        className: !winIntentPromptEnabled ? "opacity-50" : "",
        tooltip: "Warn if an opponent may be void in the lead suit and able to trump",
      },
    ] satisfies SwitchRow[],
    winIntentSelects: [
      {
        key: "win-intent-min-rank",
        label: "Win intent minimum rank",
        tooltip: "Only prompt when playing this rank or higher",
        className: !winIntentPromptEnabled ? "opacity-50" : "",
        select: (
          <Select
            value={String(winIntentMinRank)}
            onValueChange={(v) => setWinIntentMinRank(Number(v) as Rank)}
            disabled={!winIntentPromptEnabled}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                { label: "2", value: 2 },
                { label: "3", value: 3 },
                { label: "4", value: 4 },
                { label: "5", value: 5 },
                { label: "6", value: 6 },
                { label: "7", value: 7 },
                { label: "8", value: 8 },
                { label: "9", value: 9 },
                { label: "10", value: 10 },
                { label: "J", value: 11 },
                { label: "Q", value: 12 },
                { label: "K", value: 13 },
                { label: "A", value: 14 },
              ].map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
      },
    ] satisfies SelectRow[],
    errors: [
      {
        key: "show-errors",
        label: "Show errors",
        checked: checkErrorsEnabled,
        onCheckedChange: setCheckErrorsEnabled,
        tooltip: "When enabled, highlight incorrect selections in red",
      },
    ] satisfies SwitchRow[],
    ai: [
      {
        key: "ai-enabled",
        label: "AI opponents",
        checked: aiEnabled,
        onCheckedChange: setAiEnabled,
      },
      {
        key: "ai-play-me",
        label: "AI for me",
        checked: aiPlayMe,
        onCheckedChange: setAiPlayMe,
        disabled: !aiEnabled,
        className: !aiEnabled ? "opacity-50" : "",
      },
      {
        key: "pause-before",
        label: "Pause before next trick",
        checked: pauseBeforeNextTrick,
        onCheckedChange: setPauseBeforeNextTrick,
      },
    ] satisfies SwitchRow[],
    aiSelects: [
      {
        key: "ai-mode",
        label: "AI mode",
        className: handInProgress || biddingActive ? "opacity-50" : "",
        select: (
          <Select
            value={aiMode}
            onValueChange={(v) => setAiMode(v as "random" | "bidding")}
            disabled={handInProgress || biddingActive}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="random">Random</SelectItem>
              <SelectItem value="bidding">Bidding</SelectItem>
            </SelectContent>
          </Select>
        ),
      },
    ] satisfies SelectRow[],
    trump: [
      {
        key: "trump-enabled",
        label: "Trump enabled",
        checked: trump.enabled,
        onCheckedChange: (v) => setTrump((t) => ({ ...t, enabled: v })),
      },
      {
        key: "must-break",
        label: "Must break",
        checked: trump.mustBreak,
        onCheckedChange: (v) => setTrump((t) => ({ ...t, mustBreak: v })),
        disabled: !trump.enabled,
        className: !trump.enabled ? "opacity-50" : "",
        tooltip: "Prevents leading trump until trump has been played (unless you only have trump)",
      },
    ] satisfies SwitchRow[],
    trumpSelects: [
      {
        key: "trump-suit",
        label: "Trump suit",
        className: !trump.enabled ? "opacity-50" : "",
        select: (
          <Select
            value={trump.suit}
            onValueChange={(v) => setTrump((t) => ({ ...t, suit: v as Suit }))}
            disabled={!trump.enabled}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {suits.map((s) => (
                <SelectItem key={s} value={s}>
                  <span className={suitColorClass(s, suitStyleMode)}>{suitGlyph(s)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
      },
    ] satisfies SelectRow[],
    ui: [
      {
        key: "sort-ascending",
        label: "Sort ascending",
        checked: sortAscending,
        onCheckedChange: setSortAscending,
      },
    ] satisfies SwitchRow[],
    uiSelects: [
      {
        key: "suit-order",
        label: "Suit order",
        select: (
          <Select value={suitOrderMode} onValueChange={(v) => setSuitOrderMode(v as "bridge" | "poker")}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bridge">
                Bridge (
                <span className="inline-flex gap-1">
                  {["S", "H", "D", "C"].map((s) => (
                    <span key={s} className={suitColorClass(s as Suit, suitStyleMode)}>
                      {suitGlyph(s as Suit)}
                    </span>
                  ))}
                </span>
                )
              </SelectItem>
              <SelectItem value="poker">
                Poker (
                <span className="inline-flex gap-1">
                  {["C", "D", "H", "S"].map((s) => (
                    <span key={s} className={suitColorClass(s as Suit, suitStyleMode)}>
                      {suitGlyph(s as Suit)}
                    </span>
                  ))}
                </span>
                )
              </SelectItem>
            </SelectContent>
          </Select>
        ),
      },
      {
        key: "suit-colors",
        label: "Suit colors",
        select: (
          <Select value={suitStyleMode} onValueChange={(v) => setSuitStyleMode(v as "classic" | "distinct")}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="classic">
                Classic (
                <span className="inline-flex gap-1">
                  {["S", "C"].map((s) => (
                    <span key={s} className={suitColorClass(s as Suit, "classic")}>
                      {suitGlyph(s as Suit)}
                    </span>
                  ))}
                  {["H", "D"].map((s) => (
                    <span key={s} className={suitColorClass(s as Suit, "classic")}>
                      {suitGlyph(s as Suit)}
                    </span>
                  ))}
                </span>
                )
              </SelectItem>
              <SelectItem value="distinct">
                Distinct (
                <span className="inline-flex gap-1">
                  {["S", "C", "H", "D"].map((s) => (
                    <span key={s} className={suitColorClass(s as Suit, "distinct")}>
                      {suitGlyph(s as Suit)}
                    </span>
                  ))}
                </span>
                )
              </SelectItem>
            </SelectContent>
          </Select>
        ),
      },
      {
        key: "seat-labels",
        label: "Seat labels",
        select: (
          <Select value={seatLabelMode} onValueChange={(v) => setSeatLabelMode(v as "relative" | "compass")}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relative">Left / Across / Right / Me</SelectItem>
              <SelectItem value="compass">North / South / East / West</SelectItem>
            </SelectContent>
          </Select>
        ),
      },
    ] satisfies SelectRow[],
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Training Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {settingsRows.training.map(renderSwitchRow)}

        <Separator />

        <div className="space-y-3">
          {settingsRows.voidTracking.map(renderSwitchRow)}
          {settingsRows.voidSuitFilter.map((row) => renderSuitToggleRow(row, suits, suitStyleMode))}
          {settingsRows.voidSelects.map(renderSelectRow)}
        </div>

        {settingsRows.voidOptions.map(renderSwitchRow)}

        <Separator />

        {settingsRows.suitCount.map(renderSwitchRow)}
        {settingsRows.suitCountSuitFilter.map((row) => renderSuitToggleRow(row, suits, suitStyleMode))}

        <Separator />

        {settingsRows.winIntent.map(renderSwitchRow)}
        {settingsRows.winIntentSelects.map(renderSelectRow)}

        {settingsRows.winIntentWarn.map(renderSwitchRow)}

        <Separator />

        {settingsRows.errors.map(renderSwitchRow)}

        <div className="h-1" />
        <CardTitle>Gameplay &amp; UI Settings</CardTitle>

        {settingsRows.ai.slice(0, 1).map(renderSwitchRow)}
        {settingsRows.aiSelects.map(renderSelectRow)}

        {settingsRows.ai.slice(1, 2).map(renderSwitchRow)}

        <div className={"grid grid-cols-[minmax(0,1fr)_auto] gap-2 " + (!aiEnabled ? "opacity-50" : "")}>
          <span className="text-sm">AI delay (ms)</span>
          <input
            type="number"
            min={0}
            step={250}
            value={aiDelayInput}
            disabled={!aiEnabled}
            onChange={(e) => {
              const raw = e.target.value;
              setAiDelayInput(raw);
              if (raw.trim() === "") return;
              const n = Number(raw);
              if (Number.isFinite(n) && n >= 0) {
                setAiDelayMs(Math.floor(n));
              }
            }}
            onBlur={() => {
              commitAiDelayInput(aiDelayInput);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitAiDelayInput(aiDelayInput);
              }
            }}
            className="h-8 w-20 rounded-md border bg-background px-2 text-sm"
          />
        </div>

        {settingsRows.ai.slice(2).map(renderSwitchRow)}

        <Separator />

        {settingsRows.trump.slice(0, 1).map(renderSwitchRow)}
        {settingsRows.trumpSelects.map(renderSelectRow)}

        {settingsRows.trump.slice(1).map(renderSwitchRow)}

        <Separator />

        {settingsRows.uiSelects.slice(0, 2).map(renderSelectRow)}

        {settingsRows.ui.map(renderSwitchRow)}

        <Separator />

        {settingsRows.uiSelects.slice(2).map(renderSelectRow)}
      </CardContent>
    </Card>
  );
}
