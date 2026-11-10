
import { Link, useNavigate, useSearchParams } from "react-router";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, ChevronLeft, ChevronRight, ClipboardCheck, HandHelping, RefreshCw, RotateCcw, ScrollText, Send, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { PillArt } from "@/components/common/pill-art";
import { Badge, TrayBadge } from "@/components/common/status-badge";
import { STAFF } from "@/data/staff";
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
  const navigate = useNavigate();
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
        <Button variant="ghost" size="icon" aria-label="Back to the preparation queue" onClick={() => navigate("/preparation")}><ArrowLeft /></Button>
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
          You are viewing as {ROLE_LABEL[role]}. Only Pharmacy Staff or MDS Preparation Staff can prepare compartments in this demo.
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
                <GuardedButton perm="tray.prepare" what="submit trays" disabled={!allDone || !open} onClick={() => { if (notify(submitTray(tray.id))) navigate("/preparation"); }}><Send /> Submit for verification</GuardedButton>
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
  const enrolments = useAppStore((s) => s.enrolments);
  const assignTray = useAppStore((s) => s.assignTray);
  const [filter, setFilter] = useState("open");
  const STAFF_PREP = STAFF.filter((u) => u.role === "mds" || u.role === "dispenser").map((u) => u.name);
  const PENDING = ["scheduled", "awaiting-rx-validation", "proposed"];
  const list = trays
    .filter((t) => (filter === "open" ? OPEN.includes(t.status) : filter === "upcoming" ? PENDING.includes(t.status) : filter === "check" ? t.status === "awaiting-verification" : [...OPEN, ...PENDING, "awaiting-verification"].includes(t.status)))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const exceptions = (t: Tray) => {
    const out: string[] = [];
    const p = trayProgress(t);
    if (p.issues) out.push(`${p.issues} discrepanc${p.issues > 1 ? "ies" : "y"}`);
    if (t.compartments.some((c) => c.correctionNote && c.status !== "prepared")) out.push("Correction requested");
    if (t.needsRegeneration) out.push("Prescription changed");
    if (t.compartments.some((c) => c.items.some((i) => !i.batchId))) out.push("No stock allocated");
    if (t.flags.length) out.push(`${t.flags.length} kept out`);
    return out;
  };
  const counts = { open: trays.filter((t) => OPEN.includes(t.status)).length, upcoming: trays.filter((t) => PENDING.includes(t.status)).length, check: trays.filter((t) => t.status === "awaiting-verification").length };
  return (
    <>
      <PageHeader title="MDS Preparation Queue" description="Every weekly tray waiting for preparation, with its cycle, staff, progress and exceptions." />
      <ClinicalNotice>Preparation steps are simulated. Staff identity and timestamps come from the demo role, not a real login.</ClinicalNotice>
      <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Queue filter">
        {[["open", `To prepare (${counts.open})`], ["upcoming", `Planned and in review (${counts.upcoming})`], ["check", `With pharmacist (${counts.check})`], ["all", "All open work"]].map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={filter === v} onClick={() => setFilter(v)} className={cn("rounded-lg px-3 py-1.5 text-[13px] font-medium", filter === v ? "bg-sidebar text-white" : "text-muted-foreground hover:bg-muted")}>{l}</button>
        ))}
      </div>
      {list.length === 0 && (
        <Card><EmptyState icon={<HandHelping className="size-5" />} title="Nothing in this part of the queue" body="A tray appears here after a pharmacist approves its proposed schedule." action={<Button render={<Link to="/mds" />}>Open MDS management</Button>} /></Card>
      )}
      {list.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[13px] text-muted-foreground">
                {["Patient", "MDS cycle", "Week", "Assigned staff", "Responsible pharmacist", "Progress", "Status", "Last update", "Exceptions", ""].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {list.map((t) => {
                const p = trayProgress(t);
                const patient = patients.find((x) => x.id === t.patientId);
                const enrol = enrolments.find((e) => e.patientId === t.patientId);
                const ex = exceptions(t);
                const last = t.compartments.map((c) => c.preparedAt).filter(Boolean).sort().at(-1) ?? t.events.at(-1)?.at;
                return (
                  <tr key={t.id} className="border-b border-border/60 align-top last:border-0">
                    <td className="px-3 py-2.5"><Link to={`/patients/${t.patientId}`} className="font-semibold hover:underline">{patient?.name}</Link><span className="block text-xs text-muted-foreground">{t.id}</span></td>
                    <td className="px-3 py-2.5">{t.cycleId ?? <span className="text-muted-foreground">Single week</span>}</td>
                    <td className="px-3 py-2.5">{t.cycleWeek ? `Week ${t.cycleWeek}` : ""}<span className="block text-xs text-muted-foreground">{weekLabel(t.weekStart)}</span></td>
                    <td className="px-3 py-2.5">
                      <select aria-label={`Assign ${t.id}`} className="h-8 rounded-md border border-input bg-card px-2 text-[13px]" value={t.assignedTo ?? ""} onChange={(e) => e.target.value && notify(assignTray(t.id, e.target.value))}>
                        <option value="">Unassigned</option>
                        {STAFF_PREP.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">{enrol?.responsiblePharmacist ?? "Not set"}</td>
                    <td className="w-[140px] px-3 py-2.5"><span className="text-xs">{p.prepared} of {p.total}</span><Progress value={p.pct} className="mt-1" aria-label={`Progress for ${t.id}`} /></td>
                    <td className="px-3 py-2.5"><TrayBadge status={t.status} /></td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{last ? fmtDateTime(last) : ""}</td>
                    <td className="px-3 py-2.5">{ex.length ? <span className="flex flex-col gap-1">{ex.map((e) => <Badge key={e} tone={/discrepanc|changed|Correction|No stock/.test(e) ? "danger" : "warn"}>{e}</Badge>)}</span> : <span className="text-xs text-muted-foreground">None</span>}</td>
                    <td className="px-3 py-2.5">
                      {OPEN.includes(t.status) ? <Button size="sm" render={<Link to={`/preparation?tray=${t.id}`} />}>Prepare</Button>
                        : t.status === "awaiting-verification" ? <Button size="sm" variant="outline" render={<Link to={`/verification?tray=${t.id}`} />}>Verify</Button>
                        : <Button size="sm" variant="outline" render={<Link to={t.cycleId ? `/mds?patient=${t.patientId}` : `/trays?tray=${t.id}`} />}>Open</Button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

function Inner() {
  const [params] = useSearchParams();
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
