"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, RotateCcw, ScrollText, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ConfirmDialog, GuardedButton, notify, PERIOD_META, Pick } from "@/components/common/ui";
import { PillArt } from "@/components/common/pill-art";
import { Badge, SuitabilityBadge } from "@/components/common/status-badge";
import { DAY_FULL, addDays, daysBetween, fmtDate, fmtDateTime, fmtShort, today } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { isExpired, reservedByBatch } from "@/lib/tray-engine";
import { useAppStore } from "@/store/app-store";
import type { Compartment, Tray } from "@/types";
import { RxDetailDialog } from "./rx-detail-dialog";

export function BatchFacts({ batchId }: { batchId: string | null }) {
  const batch = useAppStore((s) => s.batches.find((b) => b.id === batchId));
  const trays = useAppStore((s) => s.trays);
  if (!batch) return <p className="flex items-center gap-1 text-[13px] font-medium text-danger"><AlertTriangle className="size-3.5" /> No batch allocated. Add stock, then assign one.</p>;
  const reserved = reservedByBatch(trays)[batch.id] ?? 0;
  const expired = isExpired(batch, today());
  const soon = !expired && daysBetween(today(), batch.expiryDate) <= 60;
  return (
    <dl className="grid grid-cols-3 gap-2 text-[13px]">
      <div><dt className="text-xs text-muted-foreground">Batch</dt><dd className="font-semibold">{batch.batchNumber}</dd></div>
      <div>
        <dt className="text-xs text-muted-foreground">Expiry</dt>
        <dd className={expired ? "font-semibold text-danger" : soon ? "font-semibold text-warn" : "font-semibold"}>{fmtDate(batch.expiryDate)}{expired && " (expired)"}</dd>
      </div>
      <div><dt className="text-xs text-muted-foreground">Mock stock</dt><dd className="font-semibold">{batch.available} on hand, {reserved} reserved</dd></div>
    </dl>
  );
}

/** Detail drawer for one compartment. Actions depend on tray state and demo role. */
export function CompartmentDrawer({
  tray, compartment, onClose, onNavigate,
}: {
  tray: Tray;
  compartment: Compartment | null;
  onClose: () => void;
  onNavigate: (c: Compartment) => void;
}) {
  const medicines = useAppStore((s) => s.medicines);
  const batches = useAppStore((s) => s.batches);
  const role = useAppStore((s) => s.role);
  const markPrepared = useAppStore((s) => s.markPrepared);
  const undoPrepared = useAppStore((s) => s.undoPrepared);
  const reportDiscrepancy = useAppStore((s) => s.reportDiscrepancy);
  const resolveDiscrepancy = useAppStore((s) => s.resolveDiscrepancy);
  const changeBatch = useAppStore((s) => s.changeBatch);
  const [discOpen, setDiscOpen] = useState(false);
  const [rxId, setRxId] = useState<string | null>(null);
  const [pendingBatch, setPendingBatch] = useState<{ itemId: string; batchId: string } | null>(null);

  const filled = tray.compartments.filter((c) => c.items.length);
  const idx = compartment ? filled.findIndex((c) => c.id === compartment.id) : -1;
  const meta = compartment ? PERIOD_META[compartment.period] : null;
  const prepOpen = ["awaiting-preparation", "in-preparation", "correction-requested"].includes(tray.status);
  const canChangeBatch = !["supplied", "rejected"].includes(tray.status) && (can(role, "tray.prepare") || can(role, "tray.verify"));

  return (
    <>
      <Sheet open={!!compartment} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-[460px]">
          {compartment && meta && (
            <>
              <SheetHeader className="border-b border-border pr-12">
                <SheetTitle className="flex items-center gap-2 text-lg">
                  <meta.icon className={`size-5 ${meta.tint}`} /> {DAY_FULL[compartment.day]} {meta.label.toLowerCase()}
                </SheetTitle>
                <SheetDescription>
                  {fmtShort(addDays(tray.weekStart, compartment.day))}, about {meta.time}. {tray.id}. Compartment {idx + 1} of {filled.length}.
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 space-y-3 p-4">
                <div className="flex items-center gap-2">
                  {compartment.status === "prepared" && <Badge tone="ok" icon={Check}>Prepared</Badge>}
                  {compartment.status === "pending" && <Badge tone="info">To prepare</Badge>}
                  {compartment.status === "discrepancy" && <Badge tone="warn" icon={AlertTriangle}>Discrepancy</Badge>}
                  {compartment.preparedBy && <span className="text-xs text-muted-foreground">{compartment.preparedBy}, {fmtDateTime(compartment.preparedAt)}</span>}
                </div>
                {compartment.correctionNote && (
                  <p className="flex gap-2 rounded-lg bg-danger-bg p-3 text-[13px] text-danger"><RotateCcw className="mt-0.5 size-4 shrink-0" /> Pharmacist asked for a correction: {compartment.correctionNote}</p>
                )}
                {compartment.discrepancy && (
                  <div className="rounded-lg bg-warn-bg p-3 text-[13px] text-warn">
                    <p className="font-semibold">Discrepancy reported by {compartment.discrepancy.by}</p>
                    <p>{compartment.discrepancy.note}</p>
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => notify(resolveDiscrepancy(tray.id, compartment.id))}>Resolve discrepancy</Button>
                  </div>
                )}
                {compartment.items.map((item) => {
                  const med = medicines.find((m) => m.id === item.medicineId);
                  const options = batches
                    .filter((b) => b.medicineId === item.medicineId && !isExpired(b, today()))
                    .map((b) => ({ value: b.id, label: `${b.batchNumber}, expires ${fmtShort(b.expiryDate)}` }));
                  return (
                    <div key={item.id} className="rounded-xl border border-border p-3">
                      <div className="flex gap-3">
                        <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted">{med && <PillArt medicine={med} size={48} />}</div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{med?.brand} {item.strength}</p>
                          <p className="text-[13px] text-muted-foreground">{med?.generic}, {med?.form.toLowerCase()}</p>
                          <p className="mt-0.5 text-[15px] font-bold text-primary">Quantity: {item.qty}</p>
                        </div>
                      </div>
                      {med && <div className="mt-2"><SuitabilityBadge status={med.suitability} /></div>}
                      <div className="mt-3"><BatchFacts batchId={item.batchId} /></div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setRxId(item.prescriptionId)}><ScrollText /> View Prescription</Button>
                        {canChangeBatch && options.length > 0 && (
                          <div className="min-w-[210px] flex-1">
                            <Pick
                              size="sm"
                              value={item.batchId ?? ""}
                              options={options}
                              placeholder="Choose batch"
                              onChange={(v) => {
                                if (v === item.batchId) return;
                                if (tray.status === "approved") setPendingBatch({ itemId: item.id, batchId: v });
                                else notify(changeBatch(tray.id, compartment.id, item.id, v));
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="sticky bottom-0 space-y-2 border-t border-border bg-card p-4">
                {prepOpen && (
                  <div className="flex flex-wrap gap-2">
                    {compartment.status === "prepared" ? (
                      <GuardedButton perm="tray.prepare" what="change preparation" variant="outline" onClick={() => notify(undoPrepared(tray.id, compartment.id))}><Undo2 /> Undo prepared</GuardedButton>
                    ) : (
                      <GuardedButton perm="tray.prepare" what="prepare compartments" onClick={() => {
                        if (notify(markPrepared(tray.id, compartment.id))) {
                          const next = filled.slice(idx + 1).find((c) => c.status !== "prepared");
                          if (next) onNavigate(next);
                        }
                      }}><Check /> Mark Prepared</GuardedButton>
                    )}
                    <GuardedButton perm="tray.prepare" what="report discrepancies" variant="outline" onClick={() => setDiscOpen(true)}><AlertTriangle /> Report Discrepancy</GuardedButton>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <Button size="sm" variant="ghost" disabled={idx <= 0} onClick={() => onNavigate(filled[idx - 1])}><ChevronLeft /> Previous</Button>
                  <Button size="sm" variant="ghost" disabled={idx >= filled.length - 1} onClick={() => onNavigate(filled[idx + 1])}>Next Compartment <ChevronRight /></Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      {compartment && (
        <>
          <ConfirmDialog
            open={discOpen}
            onOpenChange={setDiscOpen}
            title="Report a discrepancy"
            description={`Blocks this compartment from being prepared until it is resolved.`}
            reasonLabel="What is wrong?"
            reasonRequired
            placeholder="For example: 2 tablets short in the pack"
            confirmLabel="Report Discrepancy"
            onConfirm={(note) => notify(reportDiscrepancy(tray.id, compartment.id, note))}
          />
          <ConfirmDialog
            open={!!pendingBatch}
            onOpenChange={(o) => !o && setPendingBatch(null)}
            title="Change a batch on an approved tray?"
            description="Tray contents would no longer match what the pharmacist approved. The approval will be invalidated and the tray must be verified again."
            confirmLabel="Change batch and invalidate"
            destructive
            onConfirm={() => { if (pendingBatch) notify(changeBatch(tray.id, compartment.id, pendingBatch.itemId, pendingBatch.batchId)); setPendingBatch(null); }}
          />
        </>
      )}
      <RxDetailDialog id={rxId} onClose={() => setRxId(null)} />
    </>
  );
}


