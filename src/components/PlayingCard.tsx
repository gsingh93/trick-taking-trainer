import type { CardT } from "@/engine/types";
import { rankGlyph, suitColorClass, suitGlyph } from "@/ui/cardUtils";

export function PlayingCard({
  c,
  rotateClass,
  onClick,
  disabled,
  selected,
  highlight,
  title,
  suitStyleMode,
}: {
  c: CardT;
  rotateClass?: string;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  highlight?: boolean;
  title?: string;
  suitStyleMode: "classic" | "distinct";
}) {
  const base =
    "flex h-14 w-10 items-center justify-center rounded-xl border bg-card text-sm shadow-sm";
  const inter = onClick
    ? disabled
      ? " opacity-40 cursor-not-allowed"
      : " cursor-pointer hover:ring-2 hover:ring-foreground/30"
    : "";
  const sel = selected ? " ring-2 ring-foreground/60" : "";
  const win = highlight ? " ring-2 ring-amber-400" : "";

  return (
    <div
      title={title}
      onClick={disabled ? undefined : onClick}
      className={base + inter + sel + win + (rotateClass ? " " + rotateClass : "")}
    >
      <span className={`font-semibold ${suitColorClass(c.suit, suitStyleMode)}`}>
        {rankGlyph(c.rank)}
        {suitGlyph(c.suit)}
      </span>
    </div>
  );
}
