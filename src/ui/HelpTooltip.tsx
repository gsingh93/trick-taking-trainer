import { useEffect, useRef, useState } from "react";

export function HelpTooltip({ text }: { text: string }) {
  const [canHover, setCanHover] = useState(true);
  const [open, setOpen] = useState(false);
  const autoCloseRef = useRef<number | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setCanHover(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => {
      media.removeEventListener?.("change", update);
    };
  }, []);

  useEffect(() => {
    if (autoCloseRef.current != null) {
      window.clearTimeout(autoCloseRef.current);
      autoCloseRef.current = null;
    }
    if (!canHover && open) {
      autoCloseRef.current = window.setTimeout(() => {
        setOpen(false);
      }, 5000);
    }
    return () => {
      if (autoCloseRef.current != null) {
        window.clearTimeout(autoCloseRef.current);
        autoCloseRef.current = null;
      }
    };
  }, [canHover, open]);

  return (
    <span
      className="relative inline-flex"
      onMouseLeave={() => {
        if (canHover) setOpen(false);
      }}
    >
      <button
        type="button"
        className="inline-flex h-4 w-4 cursor-pointer select-none items-center justify-center rounded-full border text-[10px] font-semibold text-muted-foreground"
        onClick={() => {
          if (!canHover) setOpen((prev) => !prev);
        }}
        onMouseEnter={() => {
          if (canHover) setOpen(true);
        }}
        aria-label="Help"
      >
        ?
      </button>
      {open ? (
        <span className="absolute left-1/2 top-full z-10 mt-1 w-max max-w-xs -translate-x-1/2 whitespace-pre-line rounded-md border bg-background px-2 py-1 text-[11px] text-foreground shadow">
          {text}
        </span>
      ) : null}
    </span>
  );
}
