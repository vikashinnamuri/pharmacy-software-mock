"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, ChevronLeft, ChevronRight, ClipboardCheck, HandHelping, RefreshCw, RotateCcw, ScrollText, Send, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { PillArt } from "@/components/common/pill-art";
import { Badge, TrayBadge } from "@/components/common/status-badge";
import { Card, ClinicalNotice, ConfirmDialog, EmptyState, GuardedButton, notify, PageHeader, PERIOD_META, useGuard } from "@/components/common/ui";
import { BatchFacts } from "@/components/tray/compartment-drawer";
import { RxDetailDialog } from "@/components/tray/rx-detail-dialog";
import { TrayGrid } from "@/components/tray/tray-grid";
import { addDays, DAY_FULL, fmtDateTime, fmtShort, weekLabel } from "@/lib/dates";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { trayProgress } from "@/lib/tray-engine";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { staffFor } from "@/data/staff";
import type { Compartment, Medicine, Tray, TrayItem } from "@/types";

const OPEN = ["awaiting-preparation", "in-preparation", "correction-requested"];

/** Each unit is tappable, so staff can count into the well on screen as they do by hand. */
function CountingPills({ item, med, resetKey }: { item: TrayItem; med: Medicine; resetKey: string }) {
  const [counted, setCounted] = useState<number[]>([]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setCounted([]), [resetKey]);
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={`Count ${item.qty} units of ${med.brand}`}>
      {Array.from({ length: item.qty }, (_, n) => {
        const on = counted.includes(n);
        return (
          <button
            key={n}
            type="button"
            aria-pressed={on}
            aria-label={`Unit ${n + 1} of ${item.qty}${on ? ", counted" : ""}`}
            data-counted={on}
            onClick={() => setCounted((c) => (on ? c.filter((x) => x !== n) : [...c, n]))}
            className="count-pill relative flex size-[76px] items-center justify-center rounded-xl bg-muted focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
          >
            <PillArt medicine={med} size={58} />
            {on && <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary text-white"><Check className="size-3.5" strokeWidth={3} /></span>}
          </button>
        );
      })}
    </div>
  );
}

function Key({ children }: { children: string }) {
  return <kbd className="ml-1 rounded border border-current/30 px-1 text-[11px] font-semibold opacity-75">{children}</kbd>;
}

function Workbench({ tray }: { tray: Tray }) {
  const router = useRouter();
  const medicines = useAppStore((s) => s.medicines);
  const patient = useAppStore((s) => s.patients.find((p) => p.id === tray.patientId));
  const role = useAppStore((s) => s.role);
  const autoAdvance = useAppStore((s) => s.settings.autoAdvance);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const markPrepared = useAppStore((s) => s.markPrepared);
  const undoPrepared = useAppStore((s) => s.undoPrepared);
  const reportDiscrepancy = useAppStore((s) => s.reportDiscrepancy);
  const resolveDiscrepancy = useAppStore((s) => s.resolveDiscrepancy);
  const submitTray = useAppStore((s) => s.submitTray);
  const generateTray = useAppStore((s) => s.generateTray);
  const guard = useGuard();
  const staff = staffFor(role);

  const filled = useMemo(() => tray.compartments.filter((c) => c.items.length), [tray.compartments]);
  const firstOpen = filled.find((c) => c.status !== "prepared") ?? filled[0];
  const [currentId, setCurrentId] = useState(firstOpen?.id);
  const [discOpen, setDiscOpen] = useState(false);
  const [rxId, setRxId] = useState<string | null>(null);
  const current = filled.find((c) => c.id === currentId) ?? firstOpen;
  const idx = filled.findIndex((c) => c.id === current?.id);
  const progress = trayProgress(tray);
  const allDone = progress.remaining === 0 && progress.issues === 0;
  const open = OPEN.includes(tray.status);
  const log = filled.filter((c) => c.preparedAt).sort((a, b) => (b.preparedAt! > a.preparedAt! ? 1 : -1));

  const go = (delta: number) => {
    const next = filled[idx + delta];
    if (next) setCurrentId(next.id);
  };
  const seal = () => {
    if (!current || !guard("tray.prepare", "prepare compartments")) return;
    const r = markPrepared(tray.id, current.id);
    if (!r.ok) { notify(r); return; }
    if (autoAdvance) {
      const next = filled.slice(idx + 1).find((c) => c.status !== "prepared") ?? filled.find((c) => c.status !== "prepared" && c.id !== current.id);
      if (next) setCurrentId(next.id);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,[role=dialog],[contenteditable]") || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k === "p" && open) { e.preventDefault(); if (current?.status === "discrepancy") { notify({ ok: false, message: "Resolve the discrepancy on this compartment first." }); } else if (current?.status !== "prepared") seal(); else go(1); }
      if (k === "n") go(1);
      if (k === "b") go(-1);
      if (k === "d" && open && guard("tray.prepare", "report discrepancies")) setDiscOpen(true);
      if (k === "v" && current) setRxId(current.items[0].prescriptionId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!current) return null;
  const meta = PERIOD_META[current.period];

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
        <Button variant="ghost" size="icon" aria-label="Back to the preparation queue" onClick={() => router.push("/preparation")}><ArrowLeft /></Button>
        <div className="min-w-[180px]">
          <p className="font-bold">{patient?.name}</p>
          <p className="text-[13px] text-muted-foreground">{tray.id}, {weekLabel(tray.weekStart)}</p>
        </div>
        <TrayBadge status={tray.status} />
        <div className="min-w-[220px] flex-1">
          <div className="flex justify-between text-[13px]"><span className="font-semibold">{progress.prepared} prepared</span><span className="text-muted-foreground">{progress.remaining} remaining{progress.issues ? `, ${progress.issues} with a discrepancy` : ""}</span></div>
          <Progress value={progress.pct} className="mt-1.5" aria-label="Preparation progress" />
        </div>
        <div className="text-[13px] leading-tight">
          <p className="text-muted-foreground">Preparing as</p>
          <p className="font-semibold">{staff.name}</p>
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <Switch checked={autoAdvance} onCheckedChange={(v) => updateSettings({ autoAdvance: v })} /> Auto-advance
        </label>
      </Card>

      {patient && patient.allergies.length > 0 && (
        <p className="flex items-center gap-1.5 rounded-lg bg-danger-bg px-3 py-2 text-[13px] font-semibold text-danger"><AlertTriangle className="size-4" /> Allergy on record: {patient.allergies.join(", ")}</p>
      )}
      {tray.needsRegeneration && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-danger/30 bg-danger-bg p-3 text-[13px] text-danger">
          <span className="flex gap-2"><AlertTriangle className="size-4 shrink-0" /><strong>A source prescription changed.</strong> Preparation is blocked until this tray is regenerated.</span>
          <GuardedButton size="sm" perm="tray.generate" what="regenerate schedules" variant="outline" onClick={() => notify(generateTray(tray.patientId, tray.weekStart))}><RefreshCw /> Regenerate</GuardedButton>
        </div>
      )}
      {!can(role, "tray.prepare") && (
        <p className="flex items-center gap-2 rounded-lg bg-info-bg px-3 py-2 text-[13px] text-info">
          You are viewing as {ROLE_LABEL[role]}. Only Dispensing Staff can prepare compartments in this demo.
        </p>
      )}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(420px,1fr)]">
        {/* Work card */}
        <Card className="fade-in self-start overflow-hidden" key={current.id}>
          <div className="flex items-center justify-between gap-2 bg-sidebar px-5 py-3 text-white">
            <p className="flex items-center gap-2.5 text-xl font-bold">
              <meta.icon className="size-6 text-sidebar-primary" /> {DAY_FULL[current.day]} {meta.label.toLowerCase()}
            </p>
            <p className="text-[13px] text-[#C9D5E6]">Compartment {idx + 1} of {filled.length}, {fmtShort(addDays(tray.weekStart, current.day))}</p>
          </div>
          <div className="space-y-3 p-5">
            {current.correctionNote && current.status !== "prepared" && (
              <p className="flex gap-2 rounded-lg bg-danger-bg p-3 text-[13px] text-danger"><RotateCcw className="mt-0.5 size-4 shrink-0" /> Pharmacist asked for a correction: {current.correctionNote}</p>
            )}
            {current.discrepancy && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warn-bg p-3 text-[13px] text-warn">
                <span><strong>Discrepancy:</strong> {current.discrepancy.note}</span>
                <Button size="sm" variant="outline" onClick={() => notify(resolveDiscrepancy(tray.id, current.id))}>Resolve discrepancy</Button>
              </div>
            )}
            {current.items.map((item) => {
              const med = medicines.find((m) => m.id === item.medicineId);
              if (!med) return null;
              return (
                <div key={item.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-start gap-4">
                    <CountingPills item={item} med={med} resetKey={current.id} />
                    <div className="min-w-[180px] flex-1">
                      <p className="text-lg leading-tight font-bold">{med.brand} {item.strength}</p>
                      <p className="text-[13px] text-muted-foreground">{med.generic}, {med.form.toLowerCase()}</p>
                      <p className="mt-1 text-2xl font-bold text-primary">{item.qty} <span className="text-[15px] font-semibold">{med.form.toLowerCase()}{item.qty > 1 ? "s" : ""}</span></p>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-border pt-3"><BatchFacts batchId={item.batchId} /></div>
                </div>
              );
            })}
            {current.status === "prepared" && (
              <p className="flex items-center gap-2 rounded-lg bg-accent p-3 text-[13px] text-accent-foreground">
                <Check className="size-4" /> Prepared by {current.preparedBy}, {fmtDateTime(current.preparedAt)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/40 px-5 py-3">
            {current.status === "prepared" ? (
              <GuardedButton perm="tray.prepare" what="change preparation" variant="outline" size="lg" disabled={!open} onClick={() => notify(undoPrepared(tray.id, current.id))}><Undo2 /> Undo prepared</GuardedButton>
            ) : (
              <GuardedButton perm="tray.prepare" what="prepare compartments" size="lg" disabled={!open || current.status === "discrepancy"} onClick={seal}><Check /> Mark Prepared <Key>P</Key></GuardedButton>
            )}
            <GuardedButton perm="tray.prepare" what="report discrepancies" variant="outline" size="lg" disabled={!open} onClick={() => setDiscOpen(true)}><AlertTriangle /> Report Discrepancy <Key>D</Key></GuardedButton>
            <Button variant="outline" size="lg" onClick={() => setRxId(current.items[0].prescriptionId)}><ScrollText /> View Prescription <Key>V</Key></Button>
            <div className="ml-auto flex gap-1">
              <Button variant="ghost" size="lg" disabled={idx === 0} onClick={() => go(-1)}><ChevronLeft /> Back</Button>
              <Button variant="ghost" size="lg" disabled={idx === filled.length - 1} onClick={() => go(1)}>Next Compartment <Key>N</Key><ChevronRight /></Button>
            </div>
          </div>
        </Card>

        {/* Tray map and log */}
        <div className="space-y-3">
          <TrayGrid tray={tray} medicines={medicines} density="compact" selectedId={current.id} onSelect={(c: Compartment) => setCurrentId(c.id)} />
          <div className={cn("rounded-xl border p-4 transition-colors", allDone ? "border-primary bg-accent" : "border-border bg-card")}>
            {tray.status === "awaiting-verification" ? (
              <p className="flex items-center gap-2 text-[13px] font-semibold"><ClipboardCheck className="size-4 text-primary" /> Submitted. Waiting for pharmacist verification.</p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{allDone ? `All ${progress.total} compartments prepared` : "Submit for pharmacist verification"}</p>
                  <p className="text-[13px] text-muted-foreground">{allDone ? "Preparation staff cannot approve a tray. It goes to the pharmacist next." : `Unlocks when all ${progress.total} compartments are prepared and discrepancies resolved.`}</p>
                </div>
                <GuardedButton perm="tray.prepare" what="submit trays" disabled={!allDone || !open} onClick={() => { if (notify(submitTray(tray.id))) router.push("/preparation"); }}><Send /> Submit for verification</GuardedButton>
              </div>
            )}
          </div>
          <Card className="p-4">
            <p className="mb-2 text-[13px] font-semibold">Preparation record</p>
            {log.length === 0 && <p className="text-[13px] text-muted-foreground">Nothing prepared yet. Press P to seal the first compartment.</p>}
            <ul className="max-h-[160px] space-y-1 overflow-y-auto text-[13px]">
              {log.slice(0, 30).map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span>{DAY_FULL[c.day]} {PERIOD_META[c.period].label.toLowerCase()}</span>
                  <span className="text-right text-muted-foreground">{c.preparedBy}, {fmtDateTime(c.preparedAt)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={discOpen}
        onOpenChange={setDiscOpen}
        title="Report a discrepancy"
        description={`${DAY_FULL[current.day]} ${meta.label.toLowerCase()}. Blocks this compartment until it is resolved.`}
        reasonLabel="What is wrong?"
        reasonRequired
        placeholder="For example: 2 tablets short in the pack"
        confirmLabel="Report Discrepancy"
        onConfirm={(note) => notify(reportDiscrepancy(tray.id, current.id, note))}
      />
      <RxDetailDialog id={rxId} onClose={() => setRxId(null)} highlightLineId={current.items[0]?.lineId} />
    </div>
  );
}

function Queue() {
  const trays = useAppStore((s) => s.trays);
  const patients = useAppStore((s) => s.patients);
  const medicines = useAppStore((s) => s.medicines);
  const queue = trays.filter((t) => OPEN.includes(t.status)).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const waiting = trays.filter((t) => t.status === "awaiting-verification");
  return (
    <>
      <PageHeader title="Tray Preparation" description="Pick a tray and work through it one compartment at a time." />
      <ClinicalNotice>Preparation steps are simulated. Staff identity and timestamps come from the demo role, not a real login.</ClinicalNotice>
      {queue.length === 0 && (
        <Card><EmptyState icon={<HandHelping className="size-5" />} title="No trays waiting for preparation" body="A tray appears here after a pharmacist approves its proposed schedule." action={<Button render={<Link href="/trays" />}>Open weekly trays</Button>} /></Card>
      )}
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {queue.map((t) => {
          const p = trayProgress(t);
          const patient = patients.find((x) => x.id === t.patientId);
          return (
            <Link key={t.id} href={`/preparation?tray=${t.id}`} className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{patient?.name}</p>
                  <p className="text-[13px] text-muted-foreground">{t.id}, {weekLabel(t.weekStart)}</p>
                </div>
                <TrayBadge status={t.status} />
              </div>
              <div className="pointer-events-none mt-3"><TrayGrid tray={t} medicines={medicines} density="compact" className="p-2 shadow-none" /></div>
              <div className="mt-3 flex justify-between text-[13px]"><span className="font-semibold">{p.prepared} of {p.total} prepared</span>{t.type === "replacement" && <Badge tone="violet">Replacement</Badge>}</div>
              <Progress value={p.pct} className="mt-1.5" aria-label={`Progress for ${t.id}`} />
            </Link>
          );
        })}
      </div>
      {waiting.length > 0 && (
        <p className="mt-4 text-[13px] text-muted-foreground">{waiting.length} submitted tray{waiting.length > 1 ? "s are" : " is"} with the pharmacist. <Link className="font-medium text-primary hover:underline" href="/verification">See the verification queue</Link></p>
      )}
    </>
  );
}

function Inner() {
  const params = useSearchParams();
  const tray = useAppStore((s) => s.trays.find((t) => t.id === params.get("tray")));
  if (!tray) return <Queue />;
  return (
    <>
      <PageHeader title="Tray Preparation" />
      <ClinicalNotice>Preparation steps are simulated. Staff identity and timestamps come from the demo role, not a real login.</ClinicalNotice>
      <Workbench key={tray.id} tray={tray} />
    </>
  );
}

export default function PreparationPage() {
  return <Suspense><Inner /></Suspense>;
}
