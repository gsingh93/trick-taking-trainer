import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import { X } from "lucide-react";

type SettingsPanelProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function SettingsPanel(props: SettingsPanelProps) {
  const { open, onClose, children } = props;
  return (
    <div
      className={
        "fixed right-0 top-0 z-40 h-full w-[90vw] max-w-[420px] border-l bg-background shadow-lg transition-transform duration-200 " +
        (open ? "translate-x-0" : "translate-x-full")
      }
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-sm font-semibold">Settings</div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close settings panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="h-full overflow-y-auto p-3">{children}</div>
    </div>
  );
}
