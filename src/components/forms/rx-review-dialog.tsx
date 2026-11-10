
import { useEffect, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, GuardedButton, notify } from "@/components/common/ui";
import { PillArt } from "@/components/common/pill-art";
import { SuitabilityBadge } from "@/components/common/status-badge";
import { lineSummary, RxChangeList } from "@/components/tray/rx-detail-dialog";
import { enrolmentFor } from "@/lib/selectors";
import { fmtDate } from "@/lib/dates";
import { lineBlockReason } from "@/lib/tray-engine";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { TrayDecision } from "@/types";

/** Pharmacist review. Each line needs an explicit tray decision; nothing is assumed. */
export function RxReviewDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const rx = useAppStore((s) => s.prescriptions.find((p) => p.id === id));
  const patient = useAppStore((s) => s.patients.find((p) => p.id === rx?.patientId));
  const medicines = useAppStore((s) => s.medicines);
  const enrolment = useAppStore((s) => (rx ? enrolmentFor(s, rx.patientId) : undefined));
  const reviewRx = useAppStore((s) => s.reviewRx);
  const [decisions, setDecisions] = useState<Record<string, { decision: TrayDecision; note?: string }>>({});
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setDecisions({}); setNote(""); setRejecting(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [id]);

  if (!rx) return <Dialog open={false} />;

  const rows = rx.lines.map((l) => {
    const med = medicines.find((m) => m.id === l.medicineId);
    const decision = decisions[l.id]?.decision ?? "undecided";
    const structural = lineBlockReason({ ...l, trayDecision: "include" }, med, enrolment?.approvedPeriods ?? []);
    return { l, med, decision, structural, allergyHit: patient?.allergies.find((a) => med && (med.generic.toLowerCase().includes(a.toLowerCase()) || a.toLowerCase().includes(med.generic.toLowerCase().split(" ")[0]))) };
  });
  const undecided = rows.filter((r) => r.decision === "undecided").length;

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review {rx.id} for {patient?.name}</DialogTitle>
          <DialogDescription>{rx.prescriber}, {rx.clinic}. Issued {fmtDate(rx.issuedOn)}. Entered by {rx.createdBy}.{rx.supersedes && ` Amends ${rx.supersedes}.`} Simulated review only.</DialogDescription>
        </DialogHeader>
        {patient && patient.allergies.length > 0 && (
          <p className="flex items-center gap-1.5 rounded-lg bg-danger-bg px-3 py-2 text-[13px] font-semibold text-danger"><AlertTriangle className="size-4" /> Allergy on record: {patient.allergies.join(", ")}</p>
        )}
        <RxChangeList rx={rx} />
        {!enrolment || enrolment.status !== "active" ? (
          <p className="rounded-lg bg-info-bg px-3 py-2 text-[13px] text-info">{patient?.name} is not on active MDS. Choose Keep out for lines dispensed in original packs.</p>
        ) : null}
        <div className="space-y-2.5">
          {rows.map(({ l, med, decision, structural, allergyHit }) => (
            <div key={l.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap gap-3">
                {med && <PillArt medicine={med} size={44} />}
                <div className="min-w-[220px] flex-1">
                  <p className="font-semibold">{med?.brand} {l.strength} <span className="font-normal text-muted-foreground">({med?.generic})</span></p>
                  <p className="text-[13px]">{lineSummary(l)}</p>
                  {l.quantity && <p className="text-xs text-muted-foreground">Quantity {l.quantity}{l.durationDays ? ` for ${l.durationDays} days` : ""}</p>}
                  {l.instructions && <p className="text-[13px] text-muted-foreground">{l.instructions}</p>}
                  <div className="mt-1.5">{med && <SuitabilityBadge status={med.suitability} />}</div>
                  {med && med.suitability !== "suitable" && <p className="mt-1 text-xs text-muted-foreground">{med.suitabilityNote}</p>}
                  {allergyHit && <p className="mt-1 flex items-center gap-1 text-[13px] font-semibold text-danger"><AlertTriangle className="size-3.5" /> Check this against the recorded {allergyHit} allergy.</p>}
                  {structural && <p className="mt-1 flex items-start gap-1 text-[13px] font-medium text-warn"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {structural}</p>}
                </div>
                <div className="w-full sm:w-[220px]">
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">Tray decision</p>
                  <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label={`Tray decision for ${med?.brand}`}>
                    <button
                      type="button" role="radio" aria-checked={decision === "include"} disabled={!!structural}
                      onClick={() => setDecisions((d) => ({ ...d, [l.id]: { decision: "include", note: d[l.id]?.note } }))}
                      className={cn("flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-40", decision === "include" ? "border-primary bg-accent text-accent-foreground" : "border-input hover:bg-muted")}
                    ><CheckCircle2 className="size-3.5" /> In tray</button>
                    <button
                      type="button" role="radio" aria-checked={decision === "keep-out"}
                      onClick={() => setDecisions((d) => ({ ...d, [l.id]: { decision: "keep-out", note: d[l.id]?.note } }))}
                      className={cn("flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[13px] font-medium", decision === "keep-out" ? "border-danger bg-danger-bg text-danger" : "border-input hover:bg-muted")}
                    ><Ban className="size-3.5" /> Keep out</button>
                  </div>
                  {decision === "keep-out" && (
                    <Input className="mt-1.5 h-8 text-[13px]" placeholder="Reason (optional)" aria-label="Reason for keeping out" value={decisions[l.id]?.note ?? ""} onChange={(e) => setDecisions((d) => ({ ...d, [l.id]: { decision: "keep-out", note: e.target.value } }))} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        {rejecting && (
          <Field label="Reason for rejection"><Textarea rows={2} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: dose not readable, confirm with the prescriber" /></Field>
        )}
        <DialogFooter className="sm:items-center">
          <span className="mr-auto text-[13px] text-muted-foreground">{undecided ? `${undecided} line${undecided > 1 ? "s" : ""} still need a tray decision` : "All lines decided"}</span>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {rejecting ? (
            <GuardedButton perm="rx.review" what="reject prescriptions" variant="destructive" disabled={!note.trim()} onClick={() => { if (notify(reviewRx(rx.id, "rejected", decisions, note))) onClose(); }}><XCircle /> Confirm rejection</GuardedButton>
          ) : (
            <GuardedButton perm="rx.review" what="reject prescriptions" variant="destructive" onClick={() => setRejecting(true)}><XCircle /> Reject</GuardedButton>
          )}
          <GuardedButton perm="rx.review" what="verify prescriptions" disabled={undecided > 0} onClick={() => { if (notify(reviewRx(rx.id, "verified", decisions))) onClose(); }}><CheckCircle2 /> Verify prescription</GuardedButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
