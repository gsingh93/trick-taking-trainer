import { Button } from "@/components/ui/button";
import { SeedInput } from "@/components/SeedInput";
import { Link, Moon, RefreshCw, Settings, Sun } from "lucide-react";

type HeaderBarProps = {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  onResetHand: () => void;
  onNewHand: () => void;
  seedInput: string;
  seedHistory: number[];
  onSeedInputChange: (value: string) => void;
  onApplySeed: () => void;
  onClearSeedError: () => void;
  seedError: string | null;
  shareError: string | null;
  onCopyShareLink: () => void;
};

export function HeaderBar(props: HeaderBarProps) {
  const {
    darkMode,
    onToggleDarkMode,
    settingsOpen,
    onToggleSettings,
    onResetHand,
    onNewHand,
    seedInput,
    seedHistory,
    onSeedInputChange,
    onApplySeed,
    onClearSeedError,
    seedError,
    shareError,
    onCopyShareLink,
  } = props;

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex w-full items-center justify-between sm:w-auto sm:gap-4">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none text-black dark:text-white">♠</span>
          <h1 className="text-xl font-semibold">Trick Taking Trainer</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Toggle dark mode"
            onClick={onToggleDarkMode}
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-400/30"
            aria-label={settingsOpen ? "Close settings panel" : "Open settings panel"}
            onClick={onToggleSettings}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="space-y-2 rounded-lg border bg-card/50 p-3 sm:ml-auto">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Deal</div>
        <div className="flex flex-wrap items-start gap-2">
          <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={onResetHand}>
            Reset hand
          </Button>
          <Button className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700" onClick={onNewHand}>
            <RefreshCw className="h-4 w-4" />
            New hand
          </Button>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Seed</span>
              <SeedInput
                value={seedInput}
                seedHistory={seedHistory}
                onChange={onSeedInputChange}
                onApply={onApplySeed}
                onClearError={onClearSeedError}
              />
              <Button type="button" variant="outline" size="sm" onClick={onApplySeed}>
                Apply
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onCopyShareLink} aria-label="Copy share link">
                <Link className="h-4 w-4" />
              </Button>
            </div>
            {seedError ? <div className="mt-1 text-xs text-destructive">{seedError}</div> : null}
            {shareError ? <div className="mt-1 text-xs text-destructive">{shareError}</div> : null}
          </div>
        </div>
      </div>
    </header>
  );
}
