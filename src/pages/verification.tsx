"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Eye, FileText, Lock, RotateCcw, ScrollText, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PillArt } from "@/components/common/pill-art";
import { RxBadge, SuitabilityBadge, TrayBadge } from "@/components/common/status-badge";
import { Card, ClinicalNotice, ConfirmDialog, EmptyState, Field, GuardedButton, notify, PageHeader, PERIOD_META, useGuard } from "@/components/common/ui";
import { BatchFacts } from "@/components/tray/compartment-drawer";
import { RxDetailDialog, RxLineRow } from "@/components/tray/rx-detail-dialog";
import { TrayGrid, TrayLegend } from "@/components/tray/tray-grid";
import { ageFrom, DAY_FULL, fmtDate, fmtDateTime, weekLabel } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { trayProgress } from "@/lib/tray-engine";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { Tray } from "@/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CHECKS = [
  "Correct patient",
  "Correct medication",
  "Correct strength",
  "Correct administration schedule",
  "Correct quantity",
  "MDS suitability reviewed",
  "Batch and expiry reviewed",
  "Discrepancies resolved",
] as const;

const EVENT_LABEL: Record<string, string> = {
  generated: "Schedule generated",
  "schedule-approved": "Schedule approved",
  submitted: "Submitted for verification",
  approved: "Tray approved",
  rejected: "Tray rejected",
  "correction-requested": "Correction requested",
  invalidated: "Approval invalidated",
  supplied: "Marked supplied",
  "replacement-created": "Replacement created",
};

function Review({ tray }: { tray: Tray }) {
  const router = useRouter();
  const patient = useAppStore((s) => s.patients.find((p) => p.id === tray.patientId));
  const medicines = useAppStore((s) => s.medicines);
  const batches = useAppStore((s) => s.batches);
  const prescriptions = useAppStore((s) => s.prescriptions);
  const role = useAppStore((s) => s.role);
  const approveTray = useAppStore((s) => s.approveTray);
  const rejectTray = useAppStore((s) => s.rejectTray);
  const requestCorrection = useAppStore((s) => s.requestCorrection);
  const guard = useGuard();

  const filled = useMemo(() => tray.compartments.filter((c) => c.items.length), [tray.compartments]);
  const [selectedId, setSelectedId] = useState(filled[0]?.id ?? "");
  const [inspected, setInspected] = useState<Set<string>>(new Set(filled[0] ? [filled[0].id] : []));
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [highlight, setHighlight] = useState<string | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [correctNote, setCorrectNote] = useState("");
  const [rxId, setRxId] = useState<string | null>(null);

  const reviewable = tray.status === "awaiting-verification";
  const progress = trayProgress(tray);
  const issues = progress.issues > 0;
  const allChecked = CHECKS.every((c) => checks[c]);
  const canReview = can(role, "tray.verify");
  const selected = filled.find((c) => c.id === selectedId);
  const rxs = prescriptions.filter((p) => tray.prescriptionIds.includes(p.id));
  const batchNumber = (id: string | null) => batches.find((b) => b.id === id)?.batchNumber ?? "unallocated";

  return (
    <div className="grid gap-3 xl:grid-cols-[290px_minmax(0,1fr)_320px]">
      {/* Left: who and what was prescribed */}
      <div className="space-y-3">
        <Card className="p-4">
          <p className="text-lg font-bold">{patient?.name}</p>
          <p className="text-[13px] text-muted-foreground">{patient?.id}. {patient && `${ageFrom(patient.dob)} years, ${patient.gender.toLowerCase()}`}. Born {fmtDate(patient?.dob)}</p>
          <p className="mt-2 text-[13px]"><strong>Doctor:</strong> {patient?.doctor.name}</p>
          <p className="text-[13px]"><strong>Conditions:</strong> {patient?.conditions.join(", ") || "None recorded"}</p>
          <div className={cn("mt-3 rounded-lg p-2.5 text-[13px]", patient?.allergies.length ? "bg-danger-bg text-danger" : "bg-muted text-muted-foreground")}>
            <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="size-3.5" /> Allergies</p>
            <p>{patient?.allergies.join(", ") || "None recorded"}</p>
          </div>
        </Card>
        <Card className="p-4">
          <p className="mb-2 font-semibold">Verified prescription</p>
          <div className="space-y-2">
            {rxs.map((rx) => (
              <div key={rx.id}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <button type="button" className="text-[13px] font-semibold text-primary hover:underline" onClick={() => setRxId(rx.id)}>{rx.id}</button>
                  <RxBadge status={rx.status} />
                </div>
                <div className="space-y-1.5">{rx.lines.map((l) => <RxLineRow key={l.id} line={l} />)}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <p className="mb-2 font-semibold">Approval history</p>
          <ol className="space-y-2 border-l-2 border-border pl-3">
            {[...tray.events].reverse().map((e) => (
              <li key={e.id} className="text-[13px]">
                <span className="font-medium">{EVENT_LABEL[e.type]}</span>
                <span className="block text-xs text-muted-foreground">{e.by}, {fmtDateTime(e.at)}</span>
                {e.note && <span className="block text-xs">{e.note}</span>}
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {/* Centre: the tray and the decision */}
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-muted-foreground"><strong className="text-foreground">{tray.id}</strong>, {weekLabel(tray.weekStart)}. {inspected.size} of {filled.length} compartments opened.</p>
          <TrayBadge status={tray.status} />
        </div>
        <TrayGrid
          tray={tray}
          medicines={medicines}
          density="compact"
          selectedId={selectedId}
          inspected={inspected}
          highlightMedicineId={highlight}
          onSelect={(c) => { setSelectedId(c.id); setInspected((s) => new Set(s).add(c.id)); }}
        />
        <TrayLegend tray={tray} medicines={medicines} highlight={highlight} onHighlight={setHighlight} batchNumber={batchNumber} />
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Review checklist</p>
            <p className="text-[13px] text-muted-foreground">{CHECKS.filter((c) => checks[c]).length} of {CHECKS.length}</p>
          </div>
          <ul className="mt-2 grid gap-x-4 gap-y-1 md:grid-cols-2">
            {CHECKS.map((c) => {
              const blocked = c === "Discrepancies resolved" && issues;
              return (
                <li key={c}>
                  <Label className={cn("flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-[13.5px] font-normal hover:bg-muted", checks[c] && "font-medium")}>
                    <Checkbox
                      checked={!!checks[c]}
                      disabled={!reviewable || blocked}
                      onCheckedChange={(v) => {
                        if (!guard("tray.verify", "complete the review checklist")) return;
                        setChecks((s) => ({ ...s, [c]: !!v }));
                      }}
                    />
                    {c}
                    {blocked && <span className="text-xs text-warn">({progress.issues} open)</span>}
                  </Label>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {reviewable ? (
              <>
                <GuardedButton perm="tray.verify" what="approve trays" disabled={!allChecked || issues} onClick={() => setApproveOpen(true)}><ShieldCheck /> Approve Tray</GuardedButton>
                <GuardedButton perm="tray.verify" what="request corrections" variant="outline" onClick={() => setCorrectOpen(true)}><RotateCcw /> Request Correction</GuardedButton>
                <GuardedButton perm="tray.verify" what="reject trays" variant="destructive" onClick={() => setRejectOpen(true)}><XCircle /> Reject Tray</GuardedButton>
                {canReview && !allChecked && <span className="flex items-center gap-1 text-[13px] text-muted-foreground"><Lock className="size-3.5" /> Tick all eight checks to approve.</span>}
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-muted-foreground">This tray is not waiting for verification.</span>
                <Button size="sm" variant="outline" onClick={() => router.push(`/trays?tray=${tray.id}`)}>Open in weekly trays</Button>
                {(tray.status === "approved" || tray.status === "supplied") && (
                  <Button size="sm" variant="outline" onClick={() => router.push(`/documents?type=backing&tray=${tray.id}`)}><FileText /> Backing sheet</Button>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Right: selected compartment */}
      <div className="space-y-3 xl:sticky xl:top-0 xl:self-start">
        <Card className="p-4">
          {selected ? (
            <div key={selected.id} className="fade-in">
              <p className="flex items-center gap-2 font-bold">
                {(() => { const M = PERIOD_META[selected.period].icon; return <M className={cn("size-5", PERIOD_META[selected.period].tint)} />; })()}
                {DAY_FULL[selected.day]} {PERIOD_META[selected.period].label.toLowerCase()}
              </p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Eye className="size-3" /> {selected.preparedBy ? `Prepared by ${selected.preparedBy}, ${fmtDateTime(selected.preparedAt)}` : "Not prepared"}
              </p>
              {selected.discrepancy && <p className="mt-2 rounded-lg bg-warn-bg p-2.5 text-[13px] text-warn"><strong>Discrepancy:</strong> {selected.discrepancy.note}</p>}
              <div className="mt-3 space-y-3">
                {selected.items.map((item) => {
                  const med = medicines.find((m) => m.id === item.medicineId);
                  return (
                    <div key={item.id} className="rounded-lg border border-border p-3">
                      <div className="flex gap-3">
                        <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted">{med && <PillArt medicine={med} size={42} />}</div>
                        <div className="min-w-0">
                          <p className="font-semibold">{med?.brand} {item.strength}</p>
                          <p className="text-[13px] text-muted-foreground">{med?.generic}</p>
                          <p className="font-bold text-primary">Quantity: {item.qty}</p>
                        </div>
                      </div>
                      {med && <div className="mt-2"><SuitabilityBadge status={med.suitability} /></div>}
                      <div className="mt-2.5"><BatchFacts batchId={item.batchId} /></div>
                      <Button size="sm" variant="ghost" className="mt-1.5 -ml-2" onClick={() => setRxId(item.prescriptionId)}><ScrollText /> {item.prescriptionId}</Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : <p className="text-[13px] text-muted-foreground">Select a compartment to see its medicines and batches.</p>}
        </Card>
      </div>

      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="Approve this tray?"
        description={`Recorded against ${"the simulated pharmacist"}. The approval lapses automatically if the prescription or tray contents change.`}
        reasonLabel="Note (optional)"
        confirmLabel="Approve Tray"
        onConfirm={(note) => { if (notify(approveTray(tray.id, note || undefined))) router.push(`/trays?tray=${tray.id}`); }}
      />
      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Reject this tray?"
        description="The tray is taken out of the workflow. A replacement tray can be created from the weekly tray view."
        reasonLabel="Reason for rejection"
        reasonRequired
        destructive
        confirmLabel="Reject Tray"
        onConfirm={(note) => { if (notify(rejectTray(tray.id, note))) router.push(`/trays?tray=${tray.id}`); }}
      />
      <Dialog open={correctOpen} onOpenChange={setCorrectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request a correction</DialogTitle>
            <DialogDescription>
              {selected ? `Sends ${DAY_FULL[selected.day]} ${PERIOD_META[selected.period].label.toLowerCase()} back to preparation.` : "Select a compartment first."} Other compartments stay prepared.
            </DialogDescription>
          </DialogHeader>
          <Field label="What needs correcting?">
            <Textarea rows={3} value={correctNote} onChange={(e) => setCorrectNote(e.target.value)} placeholder="For example: count looks short" autoFocus />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectOpen(false)}>Cancel</Button>
            <Button
              disabled={!correctNote.trim() || !selected}
              onClick={() => {
                if (selected && notify(requestCorrection(tray.id, [selected.id], correctNote))) { setCorrectOpen(false); setCorrectNote(""); router.push("/verification"); }
              }}
            >
              Request Correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RxDetailDialog id={rxId} onClose={() => setRxId(null)} />
    </div>
  );
}

function Inner() {
  const params = useSearchParams();
  const trays = useAppStore((s) => s.trays);
  const patients = useAppStore((s) => s.patients);
  const tray = trays.find((t) => t.id === params.get("tray"));
  const queue = trays.filter((t) => t.status === "awaiting-verification");
  const recent = trays
    .filter((t) => t.events.some((e) => ["approved", "rejected", "correction-requested"].includes(e.type)))
    .flatMap((t) => t.events.filter((e) => ["approved", "rejected", "correction-requested"].includes(e.type)).map((e) => ({ t, e })))
    .sort((a, b) => b.e.at.localeCompare(a.e.at))
    .slice(0, 8);
  const name = (id: string) => patients.find((p) => p.id === id)?.name;

  return (
    <>
      <PageHeader title="Pharmacist Verification" description="Check every compartment against the verified prescription before a tray can be supplied." />
      <ClinicalNotice>Approvals here are simulated and recorded against a mock user. They carry no clinical or regulatory weight.</ClinicalNotice>
      {tray ? (
        <>
          {queue.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              <Button size="sm" variant="ghost" render={<Link href="/verification" />}>All trays in queue</Button>
              {queue.map((t) => (
                <Button key={t.id} size="sm" variant={t.id === tray.id ? "secondary" : "ghost"} render={<Link href={`/verification?tray=${t.id}`} />}>{name(t.patientId)}</Button>
              ))}
            </div>
          )}
          <Review key={tray.id + tray.events.length} tray={tray} />
        </>
      ) : (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Card>
            <p className="px-5 pt-4 pb-2 font-semibold">Waiting for verification ({queue.length})</p>
            {queue.length === 0 && <EmptyState icon={<ClipboardCheck className="size-5" />} title="The queue is clear" body="A tray appears here when preparation staff submit it." />}
            <ul>
              {queue.map((t) => {
                const p = trayProgress(t);
                return (
                  <li key={t.id} className="border-t border-border">
                    <Link href={`/verification?tray=${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-accent/50">
                      <span className="flex-1">
                        <span className="block font-semibold">{name(t.patientId)}</span>
                        <span className="block text-[13px] text-muted-foreground">{t.id}, {weekLabel(t.weekStart)}, {p.total} compartments</span>
                      </span>
                      {p.issues > 0 && <span className="flex items-center gap-1 text-[13px] font-medium text-warn"><AlertTriangle className="size-3.5" /> {p.issues} discrepancy</span>}
                      <Button size="sm" variant="outline">Review</Button>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card>
            <p className="px-5 pt-4 pb-2 font-semibold">Recent decisions</p>
            <ul>
              {recent.map(({ t, e }) => (
                <li key={e.id} className="border-t border-border">
                  <Link href={`/verification?tray=${t.id}`} className="flex items-start gap-2.5 px-5 py-2.5 text-[13px] hover:bg-accent/50">
                    {e.type === "approved" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : e.type === "rejected" ? <XCircle className="mt-0.5 size-4 shrink-0 text-danger" /> : <RotateCcw className="mt-0.5 size-4 shrink-0 text-warn" />}
                    <span>
                      <span className="font-semibold">{EVENT_LABEL[e.type]}</span>: {t.id} for {name(t.patientId)}
                      <span className="block text-xs text-muted-foreground">{e.by}, {fmtDateTime(e.at)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}

export default function VerificationPage() {
  return <Suspense><Inner /></Suspense>;
}
