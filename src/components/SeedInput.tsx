import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

type SeedInputProps = {
  value: string;
  seedHistory: number[];
  onChange: (value: string) => void;
  onApply: () => void;
  onClearError: () => void;
};

export function SeedInput(props: SeedInputProps) {
  const { value, seedHistory, onChange, onApply, onClearError } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onClearError();
        }}
        onFocus={() => {
          if (seedHistory.length) setMenuOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onApply();
          if (e.key === "Escape") setMenuOpen(false);
        }}
        className="h-8 w-32 rounded-md border bg-background px-2 pr-6 text-xs"
      />
      <button
        type="button"
        className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
        onClick={() => setMenuOpen((open) => !open)}
        aria-label="Toggle seed history"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {menuOpen ? (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-background text-xs shadow">
          {seedHistory.length ? (
            <div className="max-h-40 overflow-auto py-1">
              {seedHistory.map((seed) => (
                <button
                  key={seed}
                  type="button"
                  className="block w-full px-2 py-1 text-left hover:bg-accent"
                  onClick={() => {
                    onChange(String(seed));
                    onClearError();
                    setMenuOpen(false);
                  }}
                >
                  {seed}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-2 py-1 text-muted-foreground">No recent seeds</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
