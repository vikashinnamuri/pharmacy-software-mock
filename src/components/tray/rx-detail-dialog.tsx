"use client";

import { Ban, CheckCircle2, FileQuestion } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PillArt } from "@/components/common/pill-art";
import { RxBadge } from "@/components/common/status-badge";
import { PERIOD_META } from "@/components/common/ui";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { useAppStore } from "@/store/app-store";
import type { Prescription, PrescriptionLine } from "@/types";

export const FREQUENCY_LABEL: Record<PrescriptionLine["frequency"], string> = {
  "once-daily": "Once a day",
  "twice-daily": "Twice a day",
  "three-times-daily": "Three times a day",
  "four-times-daily": "Four times a day",
  "at-bedtime": "At bedtime",
  weekly: "Once a week",
  "as-required": "As required",
  unclear: "Unclear",
};

export function RxLineRow({ line, highlight }: { line: PrescriptionLine; highlight?: boolean }) {
  const med = useAppStore((s) => s.medicines.find((m) => m.id === line.medicineId));
  return (
    <div className={`flex gap-3 rounded-lg border p-3 ${highlight ? "border-primary bg-accent/40" : "border-border"}`}>
      {med && <PillArt medicine={med} size={38} />}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{med?.brand ?? line.medicineId} {line.strength} <span className="font-normal text-muted-foreground">({med?.generic})</span></p>
        <p className="text-[13px]">{line.dosage}, {FREQUENCY_LABEL[line.frequency].toLowerCase()}{line.times.length ? `: ${line.times.map((t) => PERIOD_META[t].label.toLowerCase()).join(", ")}` : ""}</p>
        {line.instructions && <p className="text-[13px] text-muted-foreground">{line.instructions}</p>}
        <p className="text-xs text-muted-foreground">{fmtDate(line.startDate)} to {fmtDate(line.endDate)}</p>
        {line.changeNote && <p className="mt-1 text-xs font-medium text-violet">{line.changeNote}</p>}
        <p className="mt-1 flex items-center gap-1 text-xs font-medium">
          {line.trayDecision === "include" && <><CheckCircle2 className="size-3.5 text-ok" /> Pharmacist: goes in tray</>}
          {line.trayDecision === "keep-out" && <><Ban className="size-3.5 text-danger" /> Pharmacist: kept out of tray{line.decisionNote ? `. ${line.decisionNote}` : ""}</>}
          {line.trayDecision === "undecided" && <><FileQuestion className="size-3.5 text-warn" /> Tray decision not made yet</>}
        </p>
      </div>
    </div>
  );
}

export function RxHistory({ rx }: { rx: Prescription }) {
  return (
    <ol className="space-y-2 border-l-2 border-border pl-3">
      {[...rx.history].reverse().map((h, i) => (
        <li key={i} className="text-[13px]">
          <span className="font-medium">{h.action}</span>
          <span className="text-muted-foreground"> by {h.by}, {fmtDateTime(h.at)}</span>
          {h.note && <p className="text-muted-foreground">{h.note}</p>}
        </li>
      ))}
    </ol>
  );
}

export function RxDetailDialog({ id, onClose, highlightLineId }: { id: string | null; onClose: () => void; highlightLineId?: string }) {
  const rx = useAppStore((s) => s.prescriptions.find((p) => p.id === id));
  const patient = useAppStore((s) => s.patients.find((p) => p.id === rx?.patientId));
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        {rx && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">{rx.id} <RxBadge status={rx.status} /></DialogTitle>
              <DialogDescription>
                {patient?.name}. {rx.prescriber}, {rx.clinic}. Issued {fmtDate(rx.issuedOn)}. Version {rx.version}.
                {rx.supersedes && ` Amends ${rx.supersedes}.`}{rx.supersededBy && ` Replaced by ${rx.supersededBy}.`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">{rx.lines.map((l) => <RxLineRow key={l.id} line={l} highlight={l.id === highlightLineId} />)}</div>
            {rx.review?.note && <p className="rounded-lg bg-muted p-3 text-[13px]"><strong>Review note:</strong> {rx.review.note}</p>}
            <div>
              <p className="mb-2 text-[13px] font-semibold">History</p>
              <RxHistory rx={rx} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
