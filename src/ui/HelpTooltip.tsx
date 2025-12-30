export function HelpTooltip({ text }: { text: string }) {
  return (
    <span
      className="inline-flex h-4 w-4 cursor-pointer select-none items-center justify-center rounded-full border text-[10px] font-semibold text-muted-foreground"
      title={text}
    >
      ?
    </span>
  );
}
