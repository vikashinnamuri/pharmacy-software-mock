import { useState } from "react";
import { Ban, CheckCircle2, FileQuestion, GitCommitVertical } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PillArt } from "@/components/common/pill-art";
import { RxBadge } from "@/components/common/status-badge";
import { PERIOD_META } from "@/components/common/ui";
import { DAY_NAMES, fmtDate, fmtDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { Medicine, Prescription, PrescriptionLine } from "@/types";

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

const MEAL_TEXT = { none: "", "before-food": "before food", "with-food": "with food", "after-food": "after food" } as const;

/** One line in words: dose, frequency, periods, days and meal relation. */
export function lineSummary(l: PrescriptionLine) {
  const times = l.times.length ? `: ${l.times.map((t) => PERIOD_META[t].label.toLowerCase()).join(", ")}` : "";
  const days = l.days?.length && l.days.length < 7 ? ` on ${l.days.map((d) => DAY_NAMES[d]).join(", ")}` : "";
  const meal = l.mealRelation && l.mealRelation !== "none" ? `, ${MEAL_TEXT[l.mealRelation]}` : "";
  return `${l.dosage}, ${FREQUENCY_LABEL[l.frequency].toLowerCase()}${times}${days}${meal}`;
}

/** What an amended prescription changes compared with the version it replaces. */
export function rxChanges(prev: Prescription, next: Prescription, medicines: Medicine[]) {
  const name = (id: string) => { const m = medicines.find((x) => x.id === id); return `${m?.brand ?? id}`; };
  const out: string[] = [];
  next.lines.forEach((l) => {
    const old = prev.lines.find((x) => x.medicineId === l.medicineId);
    if (!old) out.push(`Added ${name(l.medicineId)} ${l.strength}: ${lineSummary(l)}`);
    else if (lineSummary(old) !== lineSummary(l) || old.strength !== l.strength || old.endDate !== l.endDate) out.push(`Changed ${name(l.medicineId)}: ${old.strength} ${lineSummary(old)} → ${l.strength} ${lineSummary(l)}`);
  });
  prev.lines.forEach((l) => { if (!next.lines.some((x) => x.medicineId === l.medicineId)) out.push(`Removed ${name(l.medicineId)} ${l.strength}`); });
  return out;
}

export function RxLineRow({ line, highlight }: { line: PrescriptionLine; highlight?: boolean }) {
  const med = useAppStore((s) => s.medicines.find((m) => m.id === line.medicineId));
  return (
    <div className={`flex gap-3 rounded-lg border p-3 ${highlight ? "border-primary bg-accent/40" : "border-border"}`}>
      {med && <PillArt medicine={med} size={38} />}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{med?.brand ?? line.medicineId} {line.strength} <span className="font-normal text-muted-foreground">({med?.generic}, {med?.formulation.toLowerCase()})</span></p>
        <p className="text-[13px]">{lineSummary(line)}</p>
        {line.instructions && <p className="text-[13px] text-muted-foreground">{line.instructions}</p>}
        <p className="text-xs text-muted-foreground">{fmtDate(line.startDate)} to {fmtDate(line.endDate)}{line.durationDays ? `, ${line.durationDays} days` : ""}{line.quantity ? `. Quantity ${line.quantity}` : ""}</p>
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

/** Every version of a prescription, oldest first. Earlier versions are never overwritten. */
export function versionChain(all: Prescription[], rx: Prescription) {
  const chain: Prescription[] = [rx];
  let back = rx.supersedes ? all.find((p) => p.id === rx.supersedes) : undefined;
  while (back) { chain.unshift(back); back = back.supersedes ? all.find((p) => p.id === back!.supersedes) : undefined; }
  let fwd = rx.supersededBy ? all.find((p) => p.id === rx.supersededBy) : undefined;
  while (fwd) { chain.push(fwd); fwd = fwd.supersededBy ? all.find((p) => p.id === fwd!.supersededBy) : undefined; }
  return chain;
}

export function VersionChain({ rx, onPick }: { rx: Prescription; onPick: (id: string) => void }) {
  const all = useAppStore((s) => s.prescriptions);
  const chain = versionChain(all, rx);
  if (chain.length < 2) return <p className="text-[13px] text-muted-foreground">This is the only version.</p>;
  return (
    <ol className="space-y-1">
      {chain.map((p) => (
        <li key={p.id}>
          <button type="button" onClick={() => onPick(p.id)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted", p.id === rx.id && "bg-accent font-semibold")}>
            <GitCommitVertical className="size-4 text-muted-foreground" /> {p.id} <span className="text-muted-foreground">v{p.version}, {fmtDate(p.issuedOn)}</span>
            <span className="ml-auto"><RxBadge status={p.status} /></span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export function RxChangeList({ rx }: { rx: Prescription }) {
  const prev = useAppStore((s) => s.prescriptions.find((p) => p.id === rx.supersedes));
  const medicines = useAppStore((s) => s.medicines);
  if (!prev) return null;
  const changes = rxChanges(prev, rx, medicines);
  return (
    <div className="rounded-lg border border-violet/30 bg-violet-bg p-3 text-[13px]">
      <p className="font-semibold text-violet">Changes from {prev.id} (v{prev.version})</p>
      {changes.length ? <ul className="mt-1 list-disc space-y-0.5 pl-5">{changes.map((c) => <li key={c}>{c}</li>)}</ul> : <p className="mt-1 text-muted-foreground">No medicine changes. Details only.</p>}
    </div>
  );
}

export function RxDetailDialog({ id, onClose, highlightLineId }: { id: string | null; onClose: () => void; highlightLineId?: string }) {
  const [override, setOverride] = useState<string | null>(null);
  const shown = override ?? id;
  const rx = useAppStore((s) => s.prescriptions.find((p) => p.id === shown));
  const patient = useAppStore((s) => s.patients.find((p) => p.id === rx?.patientId));
  return (
    <Dialog open={!!id} onOpenChange={(o) => { if (!o) { setOverride(null); onClose(); } }}>
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
            <RxChangeList rx={rx} />
            <div className="space-y-2">{rx.lines.map((l) => <RxLineRow key={l.id} line={l} highlight={l.id === highlightLineId} />)}</div>
            {rx.review?.note && <p className="rounded-lg bg-muted p-3 text-[13px]"><strong>Review note:</strong> {rx.review.note}</p>}
            <div>
              <p className="mb-1 text-[13px] font-semibold">Versions</p>
              <VersionChain rx={rx} onPick={setOverride} />
            </div>
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
