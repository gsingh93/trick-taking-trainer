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
  sizeClass,
  textClass,
}: {
  c: CardT;
  rotateClass?: string;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  highlight?: boolean;
  title?: string;
  suitStyleMode: "classic" | "distinct";
  sizeClass?: string;
  textClass?: string;
}) {
  const base = "flex items-center justify-center rounded-xl border bg-card shadow-sm [container-type:inline-size]";
  const textSize = textClass ?? "text-[clamp(16px,30cqw,24px)]";
  const size = sizeClass ?? "h-14 w-10";
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
      className={
        base +
        " " +
        size +
        inter +
        sel +
        win +
        (rotateClass ? " " + rotateClass : "")
      }
    >
      <span className={`font-semibold ${suitColorClass(c.suit, suitStyleMode)} ${textSize}`}>
        {rankGlyph(c.rank)}
        {suitGlyph(c.suit)}
      </span>
    </div>
  );
}
