import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tray, TrayStatus } from "@/types";

const STEPS = ["Scheduled", "Suitability reviewed", "Prepared", "Pharmacist checked", "Ready", "Completed"];
const REACHED: Record<TrayStatus, number> = {
  scheduled: 0,
  "awaiting-rx-validation": 1,
  proposed: 1,
  "awaiting-preparation": 2,
  "in-preparation": 2,
  "correction-requested": 2,
  "awaiting-verification": 3,
  rejected: 3,
  "approval-invalidated": 3,
  approved: 4,
  ready: 5,
  supplied: 6,
  "on-hold": 0,
  cancelled: 0,
};

/** The stages a weekly tray moves through, from planning to hand-over. */
export function TrayLifecycle({ tray }: { tray: Pick<Tray, "status" | "heldFrom"> }) {
  const status = tray.status === "on-hold" && tray.heldFrom ? tray.heldFrom : tray.status;
  const reached = REACHED[status];
  const broken = ["rejected", "approval-invalidated", "correction-requested", "awaiting-rx-validation", "on-hold", "cancelled"].includes(tray.status);
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
