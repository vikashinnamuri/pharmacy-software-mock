import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tray, TrayStatus } from "@/types";

const STEPS = ["Schedule proposed", "Schedule approved", "Compartments prepared", "Pharmacist verified", "Supplied"];
const REACHED: Record<TrayStatus, number> = {
  proposed: 1,
  "awaiting-preparation": 2,
  "in-preparation": 2,
  "correction-requested": 2,
  "awaiting-verification": 3,
  rejected: 3,
  "approval-invalidated": 3,
  approved: 4,
  supplied: 5,
};

/** Five real stages a tray moves through. */
export function TrayLifecycle({ tray }: { tray: Pick<Tray, "status"> }) {
  const reached = REACHED[tray.status];
  const broken = tray.status === "rejected" || tray.status === "approval-invalidated" || tray.status === "correction-requested";
  return (
    <ol className="flex items-center gap-1 overflow-x-auto py-1">
      {STEPS.map((s, i) => {
        const done = i < reached;
        const current = i === reached;
        return (
          <li key={s} className="flex shrink-0 items-center gap-1">
            <span className={cn(
              "flex size-[22px] items-center justify-center rounded-full border text-xs font-bold",
              done ? "border-primary bg-primary text-white" : current ? (broken ? "border-danger text-danger" : "border-primary text-primary") : "border-input text-muted-foreground",
            )}>
              {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span className={cn("text-[13px]", current ? "font-semibold" : done ? "text-foreground" : "text-muted-foreground")}>{s}</span>
            {i < STEPS.length - 1 && <span className={cn("mx-1 h-px w-5", done ? "bg-primary" : "bg-input")} />}
          </li>
        );
      })}
    </ol>
  );
}
