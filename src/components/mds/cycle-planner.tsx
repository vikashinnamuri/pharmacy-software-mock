import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  AlertTriangle, CalendarPlus, Check, ClipboardCheck, Eye, FileText, HandHelping, History, PackageOpen, Pencil, Receipt, RefreshCw, Send, Store, Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { PillArt } from "@/components/common/pill-art";
import { Badge, TrayBadge } from "@/components/common/status-badge";
import { Card, CardTitle, EmptyState, Field, GuardedButton, notify, Pick } from "@/components/common/ui";
import { lineSummary } from "@/components/tray/rx-detail-dialog";
import { addDays, fmtDate, fmtDateTime, fmtShort, mondayOf, today, weekLabel } from "@/lib/dates";
import { enrolmentFor, stockByMedicine } from "@/lib/selectors";
import { trayProgress, unitsByMedicine } from "@/lib/tray-engine";
import { useAppStore } from "@/store/app-store";
import type { Tray } from "@/types";

export function BillWeekDialog({ tray, onClose }: { tray: Tray | null; onClose: () => void }) {
  const bill = useAppStore((s) => s.billMdsWeek);
  const settings = useAppStore((s) => s.settings);
  const [meds, setMeds] = useState(true);
  const [own, setOwn] = useState(false);
  if (!tray) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Bill MDS service for {tray.id}</DialogTitle><DialogDescription>Week {weekLabel(tray.weekStart)}. Weekly service fee ₹{settings.mdsWeeklyFee} plus {settings.serviceGstRate}% GST (sample).</DialogDescription></DialogHeader>
        <Label className="flex items-start gap-2 text-[13px] font-normal"><Checkbox checked={own} onCheckedChange={(v) => { setOwn(!!v); if (v) setMeds(false); }} className="mt-0.5" /> Patient has already lawfully purchased or obtained these medicines. Charge the medication-management service only.</Label>
        {own && <p className="rounded-lg bg-warn-bg p-2.5 text-xs text-warn">This is an accounting distinction only. It does not skip any pharmacist check and does not imply regulatory authorisation for repackaging.</p>}
        <Label className="flex items-center gap-2 text-[13px] font-normal"><Checkbox checked={meds} disabled={own} onCheckedChange={(v) => setMeds(!!v)} /> Add medicine charges for this week's units</Label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <GuardedButton perm="billing.edit" what="bill MDS services" onClick={() => { if (notify(bill(tray.id, { includeMedicines: meds, ownMedicinesDeclared: own }))) onClose(); }}><Receipt /> Create invoice</GuardedButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditWeekDialog({ tray, onClose }: { tray: Tray | null; onClose: () => void }) {
  const state = useAppStore();
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!tray) return null;
  const lines = state.prescriptions.filter((p) => p.patientId === tray.patientId && p.status === "verified").flatMap((p) => p.lines.map((l) => ({ rx: p, l })));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Edit proposed schedule, week {tray.cycleWeek ?? ""} ({tray.id})</DialogTitle><DialogDescription>A pharmacist can leave a medicine out of this week only. Doses and times change through a prescription amendment. Every edit keeps the previous version.</DialogDescription></DialogHeader>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {lines.map(({ rx, l }) => {
            const med = state.medicines.find((m) => m.id === l.medicineId);
            const excluded = tray.exclusions.find((x) => x.lineId === l.id);
            const flag = tray.flags.find((f) => f.lineId === l.id);
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-[13px]">
                {med && <PillArt medicine={med} size={28} />}
                <span className="min-w-[200px] flex-1"><strong>{med?.brand} {l.strength}</strong> <span className="text-muted-foreground">({rx.id})</span><span className="block text-muted-foreground">{lineSummary(l)}</span>{flag && !excluded && <span className="block text-warn">{flag.reason}</span>}{excluded && <span className="block text-danger">Left out: {excluded.note}</span>}</span>
                {excluded ? (
                  <GuardedButton size="sm" variant="outline" perm="tray.approveSchedule" what="edit schedules" onClick={() => notify(state.setWeekExclusion(tray.id, l.id, false, ""))}>Return to week</GuardedButton>
                ) : !flag ? (
                  <span className="flex items-center gap-1.5">
                    <Input className="h-8 w-[170px]" placeholder="Reason" value={notes[l.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [l.id]: e.target.value }))} />
                    <GuardedButton size="sm" variant="outline" perm="tray.approveSchedule" what="edit schedules" disabled={!notes[l.id]?.trim()} onClick={() => notify(state.setWeekExclusion(tray.id, l.id, true, notes[l.id]))}>Leave out</GuardedButton>
                  </span>
                ) : <Badge tone="warn">Not placed</Badge>}
              </li>
            );
          })}
        </ul>
        <DialogFooter><Button onClick={onClose}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VersionsDialog({ tray, onClose }: { tray: Tray | null; onClose: () => void }) {
  const medicines = useAppStore((s) => s.medicines);
  const markVisit = useAppStore((s) => s.markVisit);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tray) markVisit("tray-versions"); }, [tray?.id]);
  if (!tray) return null;
  const current = (() => {
    const map = new Map<string, string>();
    tray.compartments.forEach((c) => c.items.forEach((i) => map.set(i.lineId, `${medicines.find((m) => m.id === i.medicineId)?.brand} ${i.strength}`)));
    return [...map.values()];
  })();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Schedule versions for {tray.id}</DialogTitle><DialogDescription>Earlier versions are kept whenever the week is rebuilt or edited. Nothing is overwritten.</DialogDescription></DialogHeader>
        <div className="space-y-2">
          <div className="rounded-lg border border-primary/40 bg-accent/40 p-3 text-[13px]">
            <p className="font-semibold">Current version <TrayBadge status={tray.status} /></p>
            <p className="text-muted-foreground">{current.join(", ") || "Empty"}</p>
          </div>
          {[...tray.revisions].reverse().map((r, i) => (
            <div key={r.id} className="rounded-lg border border-border p-3 text-[13px]">
              <p className="font-semibold">Version {tray.revisions.length - i} <span className="font-normal text-muted-foreground">replaced {fmtDateTime(r.at)} by {r.by}</span></p>
              <p className="text-muted-foreground">{r.reason}</p>
              <ul className="mt-1 list-disc pl-5">{r.lines.map((l) => <li key={l}>{l}</li>)}</ul>
              <p className="text-xs text-muted-foreground">From {r.prescriptionIds.join(", ") || "no prescription"}. Status then: {r.statusBefore.replace(/-/g, " ")}</p>
            </div>
          ))}
          {!tray.revisions.length && <p className="text-[13px] text-muted-foreground">No earlier versions. This week has not been rebuilt.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WeekCard({ tray, onEdit, onVersions, onBill }: { tray: Tray; onEdit: () => void; onVersions: () => void; onBill: () => void }) {
  const state = useAppStore();
  const p = trayProgress(tray);
  const approved = [...tray.events].reverse().find((e) => e.type === "approved");
  const sched = [...tray.events].reverse().find((e) => e.type === "schedule-approved");
  const units = unitsByMedicine(tray);
  const billed = state.invoices.find((i) => i.trayId === tray.id && i.status !== "cancelled");
  const open = !["supplied", "rejected", "cancelled"].includes(tray.status);
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="text-lg font-bold">Week {tray.cycleWeek}</p>
          <p className="text-[13px] text-muted-foreground">{fmtDate(tray.weekStart)} to {fmtDate(addDays(tray.weekStart, 6))}</p>
          <p className="text-xs text-muted-foreground">{tray.id}{tray.assignedTo ? `, ${tray.assignedTo}` : ""}</p>
        </div>
        <TrayBadge status={tray.status} />
      </div>
      <div className="flex-1 space-y-2.5 px-4 py-3 text-[13px]">
        {tray.needsRegeneration && open && (
          <div className="rounded-lg border border-danger/30 bg-danger-bg p-2.5 text-danger">
            <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="size-3.5" /> Prescription change flagged</p>
            <ul className="mt-1 list-disc pl-4 text-xs">{(tray.pendingChanges ?? ["Source changed"]).map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        )}
        <div>
          <div className="flex justify-between"><span className="font-medium">Preparation</span><span className="text-muted-foreground">{p.prepared} of {p.total}</span></div>
          <Progress value={p.pct} className="mt-1" aria-label={`Week ${tray.cycleWeek} preparation`} />
        </div>
        <p><span className="font-medium">Schedule:</span> <span className="text-muted-foreground">{sched ? `approved by ${sched.by}, ${fmtShort(sched.at.slice(0, 10))}` : "not approved"}</span></p>
        <p><span className="font-medium">Verification:</span> <span className="text-muted-foreground">{approved && ["approved", "ready", "supplied"].includes(tray.status) ? `${approved.by}, ${fmtShort(approved.at.slice(0, 10))}` : "not verified"}</span></p>
        <div>
          <p className="font-medium">Estimated requirements</p>
          <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
            {Object.entries(units).map(([id, n]) => { const m = state.medicines.find((x) => x.id === id); return <li key={id} className="flex justify-between"><span>{m?.brand} {m?.strength}</span><span>{n}</span></li>; })}
            {!Object.keys(units).length && <li>Nothing placed</li>}
          </ul>
        </div>
        {tray.flags.length > 0 && <p className="text-xs text-warn">{tray.flags.length} line{tray.flags.length > 1 ? "s" : ""} kept out of this week</p>}
        <details>
          <summary className="cursor-pointer text-xs font-medium">Activity ({tray.events.length})</summary>
          <ol className="mt-1 space-y-1 text-xs text-muted-foreground">{[...tray.events].reverse().slice(0, 8).map((e) => <li key={e.id}>{e.type.replace(/-/g, " ")}, {e.by}, {fmtDateTime(e.at)}</li>)}</ol>
        </details>
      </div>
      <div className="flex flex-wrap gap-1.5 border-t border-border px-4 py-3">
        {tray.needsRegeneration && open && <GuardedButton size="sm" perm="tray.generate" what="regenerate weeks" onClick={() => notify(state.generateTray(tray.patientId, tray.weekStart))}><RefreshCw /> Rebuild for review</GuardedButton>}
        {tray.status === "scheduled" && !tray.needsRegeneration && <GuardedButton size="sm" perm="tray.generate" what="release weeks" onClick={() => notify(state.releaseWeek(tray.id))}><Send /> Release for review</GuardedButton>}
        {tray.status === "proposed" && <GuardedButton size="sm" perm="tray.approveSchedule" what="approve schedules" onClick={() => notify(state.approveSchedule(tray.id))}><Check /> Approve week {tray.cycleWeek}</GuardedButton>}
        {["scheduled", "proposed", "awaiting-rx-validation"].includes(tray.status) && <GuardedButton size="sm" variant="outline" perm="tray.approveSchedule" what="edit schedules" onClick={onEdit}><Pencil /> Edit</GuardedButton>}
        {["awaiting-preparation", "in-preparation", "correction-requested"].includes(tray.status) && <Button size="sm" render={<Link to={`/preparation?tray=${tray.id}`} />}><HandHelping /> Prepare</Button>}
        {tray.status === "awaiting-verification" && <Button size="sm" render={<Link to={`/verification?tray=${tray.id}`} />}><ClipboardCheck /> Verify</Button>}
        {tray.status === "approved" && <GuardedButton size="sm" perm="tray.supply" what="mark trays ready" onClick={() => notify(state.markTrayReady(tray.id, new Date(addDays(tray.weekStart, -1) + "T17:00:00").toISOString()))}><PackageOpen /> Mark ready</GuardedButton>}
        {tray.status === "ready" && <Button size="sm" variant="outline" render={<Link to={tray.fulfilment?.method === "delivery" ? "/collection?tab=delivery" : "/collection"} />}>{tray.fulfilment?.method === "delivery" ? <Truck /> : <Store />} {tray.fulfilment?.method === "delivery" ? "Delivery" : "Collection"}</Button>}
        <Button size="sm" variant="ghost" render={<Link to={`/trays?tray=${tray.id}`} />}><Eye /> View week</Button>
        <Button size="sm" variant="ghost" render={<Link to={`/documents?type=backing&tray=${tray.id}`} />}><FileText /> Backing sheet</Button>
        <Button size="sm" variant="ghost" onClick={onVersions}><History /> Versions ({tray.revisions.length})</Button>
        {billed ? <Badge tone="ok">Billed {billed.id}</Badge> : <GuardedButton size="sm" variant="ghost" perm="billing.edit" what="bill MDS services" onClick={onBill}><Receipt /> Bill service</GuardedButton>}
      </div>
    </Card>
  );
}

/** Four-week MDS planning. Planning never approves dispensing; each week is approved on its own. */
export function CyclePlanner({ patientId }: { patientId: string }) {
  const state = useAppStore();
  const { cycles, trays, medicines, batches, orders } = state;
  const enrolment = enrolmentFor(state, patientId);
  const patientCycles = cycles.filter((c) => c.patientId === patientId).sort((a, b) => b.startWeek.localeCompare(a.startWeek));
  const [cycleId, setCycleId] = useState(patientCycles[0]?.id ?? "");
  const [start, setStart] = useState(mondayOf(today()));
  const [editing, setEditing] = useState<Tray | null>(null);
  const [versions, setVersions] = useState<Tray | null>(null);
  const [billing, setBilling] = useState<Tray | null>(null);
  const markVisit = state.markVisit;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { markVisit(`mds-plan-${patientId}`); setCycleId(patientCycles[0]?.id ?? ""); }, [patientId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { if (!cycleId && patientCycles[0]) setCycleId(patientCycles[0].id); }, [patientCycles.length]);

  const cycle = patientCycles.find((c) => c.id === cycleId) ?? patientCycles[0];
  const weeks = (cycle?.trayIds.map((id) => trays.find((t) => t.id === id)).filter(Boolean) ?? []) as Tray[];
  const stock = useMemo(() => stockByMedicine({ batches, trays, orders }), [batches, trays, orders]);
  const flagged = weeks.filter((t) => t.needsRegeneration && !["supplied", "rejected", "cancelled"].includes(t.status));
  const meds = [...new Set(weeks.flatMap((t) => Object.keys(unitsByMedicine(t))))];

  if (!enrolment || enrolment.status !== "active") {
    return <Card><EmptyState icon={<CalendarPlus className="size-5" />} title="Four-week planning needs an active MDS enrolment" body={enrolment?.status === "pending-review" ? "The enrolment is waiting for the pharmacist's suitability review." : "Register the patient for MDS from their record first."} action={<Button render={<Link to={`/patients/${patientId}?tab=mds-enrolment`} />}>Open MDS enrolment</Button>} /></Card>;
  }

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        {patientCycles.length > 0 && (
          <Field label="Cycle" className="w-[260px]"><Pick value={cycle?.id ?? ""} onChange={setCycleId} options={patientCycles.map((c) => ({ value: c.id, label: `${c.id}, from ${fmtDate(c.startWeek)} (${c.status})` }))} /></Field>
        )}
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <Field label="Start week (Monday)"><Input type="date" value={start} onChange={(e) => e.target.value && setStart(mondayOf(e.target.value))} /></Field>
          <GuardedButton perm="tray.generate" what="plan cycles" onClick={() => { const r = state.generateCycle(patientId, start); if (notify(r) && r.id) setCycleId(r.id); }}><CalendarPlus /> Generate Four-Week Plan</GuardedButton>
        </div>
        <p className="w-full text-xs text-muted-foreground">Planning builds four weekly proposals from verified prescriptions. It never approves dispensing. Each week is released, approved, prepared and verified on its own. Preparation day: {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][enrolment.prepDay]}.</p>
      </Card>

      {!cycle && <Card><EmptyState icon={<CalendarPlus className="size-5" />} title="No four-week plan yet" body="Choose a start week and generate a plan." /></Card>}

      {cycle && flagged.length > 0 && (
        <Card className="border-danger/40 p-4">
          <p className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle className="size-4" /> A prescription change affects {flagged.length} week{flagged.length > 1 ? "s" : ""} of {cycle.id}</p>
          <ul className="mt-2 space-y-2 text-[13px]">
            {flagged.map((t) => (
              <li key={t.id} className="rounded-lg bg-danger-bg/60 p-2.5">
                <strong>Week {t.cycleWeek} ({weekLabel(t.weekStart)}, {t.id})</strong>: <TrayBadge status={t.status} />
                <ul className="mt-1 list-disc pl-5">{(t.pendingChanges ?? []).map((c) => <li key={c}>{c}</li>)}</ul>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Earlier weeks that are already complete are not changed. Rebuilding a week keeps its previous version and sends it back for pharmacist approval.</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => markVisit("cycle-changes")}><Check /> I have reviewed these changes</Button>
        </Card>
      )}

      {cycle && (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
          {weeks.map((t) => <WeekCard key={t.id} tray={t} onEdit={() => setEditing(t)} onVersions={() => setVersions(t)} onBill={() => setBilling(t)} />)}
        </div>
      )}

      {cycle && meds.length > 0 && (
        <Card>
          <CardTitle title="Review medication quantities" hint="Units needed per week against free stock today. Stock is only reserved when a week's schedule is approved." />
          <div className="overflow-x-auto px-5 pb-4">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-[13px] text-muted-foreground"><th className="py-1.5 font-semibold">Medicine</th>{weeks.map((t) => <th key={t.id} className="px-2 text-right font-semibold">Week {t.cycleWeek}</th>)}<th className="px-2 text-right font-semibold">Total</th><th className="px-2 text-right font-semibold">Free stock</th></tr></thead>
              <tbody>
                {meds.map((id) => {
                  const m = medicines.find((x) => x.id === id);
                  const per = weeks.map((t) => unitsByMedicine(t)[id] ?? 0);
                  const total = per.reduce((a, b) => a + b, 0);
                  const free = stock[id]?.free ?? 0;
                  return (
                    <tr key={id} className="border-b border-border/60">
                      <td className="py-1.5"><span className="flex items-center gap-2">{m && <PillArt medicine={m} size={22} />}{m?.brand} {m?.strength}</span></td>
                      {per.map((n, i) => <td key={i} className="px-2 text-right">{n}</td>)}
                      <td className="px-2 text-right font-semibold">{total}</td>
                      <td className="px-2 text-right">{free >= total ? free : <Badge tone="danger">{free}, short by {total - free}</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <EditWeekDialog tray={editing ? trays.find((t) => t.id === editing.id) ?? null : null} onClose={() => setEditing(null)} />
      <VersionsDialog tray={versions ? trays.find((t) => t.id === versions.id) ?? null : null} onClose={() => setVersions(null)} />
      <BillWeekDialog tray={billing} onClose={() => setBilling(null)} />
    </div>
  );
}
