"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle, Ban, Check, ChevronLeft, ChevronRight, ChevronsUpDown, ClipboardCheck, CopyPlus, FileText, HandHelping, PackageCheck, RefreshCw, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/common/data-table";
import { PillArt } from "@/components/common/pill-art";
import { MdsBadge, TrayBadge } from "@/components/common/status-badge";
import { Card, ClinicalNotice, ConfirmDialog, GuardedButton, notify, Pick, SearchInput } from "@/components/common/ui";
import { CompartmentDrawer } from "@/components/tray/compartment-drawer";
import { TrayLifecycle } from "@/components/tray/lifecycle";
import { TrayGrid, TrayLegend } from "@/components/tray/tray-grid";
import { addDays, fmtDateTime, mondayOf, today, weekLabel } from "@/lib/dates";
import { lineBlockReason, trayProgress } from "@/lib/tray-engine";
import { useAppStore } from "@/store/app-store";
import type { Compartment, Tray } from "@/types";
import { PERIODS } from "@/types";

function emptyCompartments(): Compartment[] {
  return Array.from({ length: 7 }).flatMap((_, day) => PERIODS.map((period) => ({ id: `ghost-${day}-${period}`, day, period, items: [], status: "empty" as const })));
}

function PatientPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const patients = useAppStore((s) => s.patients);
  const [open, setOpen] = useState(false);
  const current = patients.find((p) => p.id === value);
  const list = [...patients].sort((a, b) => Number(b.mdsStatus === "active") - Number(a.mdsStatus === "active"));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={
        <Button variant="outline" className="h-11 w-full justify-between gap-2 bg-card px-3 sm:w-[270px]">
          <span className="min-w-0 text-left leading-tight">
            <span className="block truncate font-semibold">{current?.name ?? "Select a patient"}</span>
            <span className="block text-xs font-normal text-muted-foreground">{current?.id}</span>
          </span>
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      } />
      <PopoverContent align="start" className="w-[320px] p-0">
        <Command>
          <CommandInput placeholder="Search patients" />
          <CommandList>
            <CommandEmpty>No patient found.</CommandEmpty>
            <CommandGroup>
              {list.map((p) => (
                <CommandItem key={p.id} value={`${p.name} ${p.id}`} onSelect={() => { onChange(p.id); setOpen(false); }}>
                  <span className="flex-1">{p.name}</span>
                  <MdsBadge status={p.mdsStatus} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function WeekPicker({ value, onChange }: { value: string; onChange: (w: string) => void }) {
  const thisWeek = mondayOf(today());
  return (
    <div className="flex h-11 items-center gap-1 rounded-lg border border-input bg-card px-1">
      <Button variant="ghost" size="icon-sm" aria-label="Previous week" onClick={() => onChange(addDays(value, -7))}><ChevronLeft /></Button>
      <span className="min-w-[132px] text-center leading-tight">
        <span className="block text-[13px] font-semibold">{weekLabel(value)}</span>
        <span className="block text-xs text-muted-foreground">{value === thisWeek ? "This week" : value === addDays(thisWeek, 7) ? "Next week" : value === addDays(thisWeek, -7) ? "Last week" : "Selected week"}</span>
      </span>
      <Button variant="ghost" size="icon-sm" aria-label="Next week" onClick={() => onChange(addDays(value, 7))}><ChevronRight /></Button>
      {value !== thisWeek && <Button variant="ghost" size="sm" onClick={() => onChange(thisWeek)}>This week</Button>}
    </div>
  );
}

/** The one thing to do next on this tray. */
function NextAction({ tray, onSupply, onRegenerate }: { tray: Tray; onSupply: () => void; onRegenerate: () => void }) {
  const router = useRouter();
  const approveSchedule = useAppStore((s) => s.approveSchedule);
  const createReplacement = useAppStore((s) => s.createReplacement);
  const resend = useAppStore((s) => s.resendForVerification);
  const backing = <Button variant="outline" onClick={() => router.push(`/documents?type=backing&tray=${tray.id}`)}><FileText /> View backing sheet</Button>;

  if (tray.needsRegeneration && tray.status !== "supplied" && tray.status !== "rejected") {
    return <GuardedButton perm="tray.generate" what="regenerate schedules" onClick={onRegenerate}><RefreshCw /> Regenerate schedule</GuardedButton>;
  }
  switch (tray.status) {
    case "proposed":
      return <GuardedButton perm="tray.approveSchedule" what="approve schedules" onClick={() => notify(approveSchedule(tray.id))}><Check /> Approve schedule</GuardedButton>;
    case "awaiting-preparation":
    case "in-preparation":
    case "correction-requested":
      return <Button onClick={() => router.push(`/preparation?tray=${tray.id}`)}><HandHelping /> {tray.status === "correction-requested" ? "Fix and resubmit" : "Open preparation"}</Button>;
    case "awaiting-verification":
      return <Button onClick={() => router.push(`/verification?tray=${tray.id}`)}><ClipboardCheck /> Open verification</Button>;
    case "approved":
      return <div className="flex flex-wrap gap-2">{backing}<GuardedButton perm="tray.supply" what="supply trays" onClick={onSupply}><PackageCheck /> Mark supplied</GuardedButton></div>;
    case "approval-invalidated":
      return <GuardedButton perm="tray.verify" what="resubmit trays" onClick={() => notify(resend(tray.id))}><ClipboardCheck /> Send back for verification</GuardedButton>;
    case "rejected":
      return <GuardedButton perm="tray.generate" what="create replacement trays" onClick={() => { const r = createReplacement(tray.id); if (notify(r) && r.id) router.push(`/trays?tray=${r.id}`); }}><CopyPlus /> Create replacement tray</GuardedButton>;
    case "supplied":
      return backing;
  }
}

function GeneratePanel({ patientId, weekStart, onGenerated }: { patientId: string; weekStart: string; onGenerated: (id: string) => void }) {
  const prescriptions = useAppStore((s) => s.prescriptions);
  const medicines = useAppStore((s) => s.medicines);
  const generateTray = useAppStore((s) => s.generateTray);
  const verified = prescriptions.filter((p) => p.patientId === patientId && p.status === "verified");
  const lines = verified.flatMap((p) => p.lines.map((l) => {
    const med = medicines.find((m) => m.id === l.medicineId);
    return { l, med, reason: lineBlockReason(l, med) };
  }));
  const pending = prescriptions.filter((p) => p.patientId === patientId && p.status === "pending").length;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">No tray for this week yet</h2>
          <p className="text-[13px] text-muted-foreground">The generator reads verified prescriptions only. It never guesses a time, a dose or a medicine&apos;s suitability.</p>
        </div>
        <GuardedButton perm="tray.generate" what="generate schedules" disabled={!verified.length} onClick={() => { const r = generateTray(patientId, weekStart); if (notify(r) && r.id) onGenerated(r.id); }}>
          <Sparkles /> Generate Proposed Weekly Schedule
        </GuardedButton>
      </div>
      {lines.length > 0 ? (
        <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {lines.map(({ l, med, reason }) => (
            <li key={l.id} className={`flex items-center gap-2 rounded-lg border p-2 text-[13px] ${reason ? "border-warn/30 bg-warn-bg" : "border-border"}`}>
              {med && <PillArt medicine={med} size={28} />}
              <span className="min-w-0">
                <span className="block font-semibold">{med?.brand} {l.strength}</span>
                <span className={`block text-xs ${reason ? "text-warn" : "text-muted-foreground"}`}>{reason ?? `Goes in: ${l.times.join(", ")}`}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-warn-bg p-3 text-[13px] text-warn">
          <Ban className="size-4 shrink-0" />
          <span>This patient has no verified prescription, so a schedule cannot be generated. <Link className="font-semibold underline" href={`/prescriptions?new=${patientId}`}>Add a prescription</Link></span>
        </p>
      )}
      {pending > 0 && <p className="mt-2 text-[13px] text-muted-foreground">{pending} prescription{pending > 1 ? "s are" : " is"} still pending review and will not be used.</p>}
    </Card>
  );
}

function TrayBoard() {
  const params = useSearchParams();
  const trays = useAppStore((s) => s.trays);
  const medicines = useAppStore((s) => s.medicines);
  const batches = useAppStore((s) => s.batches);
  const patients = useAppStore((s) => s.patients);
  const generateTray = useAppStore((s) => s.generateTray);
  const supplyTray = useAppStore((s) => s.supplyTray);

  const paramTray = params.get("tray");
  const fromParam = trays.find((t) => t.id === paramTray);
  const [patientId, setPatientId] = useState(fromParam?.patientId ?? params.get("patient") ?? "PT-1001");
  const [weekStart, setWeekStart] = useState(fromParam?.weekStart ?? mondayOf(today()));
  const [picked, setPicked] = useState<string | null>(paramTray);
  const [selected, setSelected] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [drop, setDrop] = useState(false);
  const [supplyOpen, setSupplyOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);

  useEffect(() => {
    if (fromParam) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setPatientId(fromParam.patientId);
      setWeekStart(fromParam.weekStart);
      setPicked(fromParam.id);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
    // Follow links only when the URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTray]);

  const weekTrays = trays.filter((t) => t.patientId === patientId && t.weekStart === weekStart).sort((a, b) => b.id.localeCompare(a.id));
  const tray = weekTrays.find((t) => t.id === picked) ?? weekTrays.find((t) => t.status !== "rejected") ?? weekTrays[0];
  const patient = patients.find((p) => p.id === patientId);
  const compartment = tray?.compartments.find((c) => c.id === selected) ?? null;
  const progress = tray ? trayProgress(tray) : null;
  const batchNumber = (id: string | null) => batches.find((b) => b.id === id)?.batchNumber ?? "unallocated";
  const lastApproval = tray?.events.filter((e) => e.type === "approved").at(-1);
  const scheduleApproval = tray?.events.filter((e) => e.type === "schedule-approved").at(-1);

  const startDrop = () => { setDrop(true); window.setTimeout(() => setDrop(false), 1200); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <PatientPicker value={patientId} onChange={(id) => { setPatientId(id); setPicked(null); setSelected(null); setHighlight(null); }} />
        <WeekPicker value={weekStart} onChange={(w) => { setWeekStart(w); setPicked(null); setSelected(null); setHighlight(null); }} />
        {weekTrays.length > 1 && (
          <div className="flex gap-1">
            {weekTrays.map((t) => (
              <Button key={t.id} size="sm" variant={t.id === tray?.id ? "secondary" : "ghost"} onClick={() => { setPicked(t.id); setSelected(null); }}>
                {t.id}{t.type === "replacement" ? " (replacement)" : ""}
              </Button>
            ))}
          </div>
        )}
        {patient && patient.allergies.length > 0 && (
          <span className="ml-auto flex items-center gap-1 rounded-lg bg-danger-bg px-2.5 py-1.5 text-[13px] font-semibold text-danger">
            <AlertTriangle className="size-3.5" /> Allergy: {patient.allergies.join(", ")}
          </span>
        )}
      </div>

      {!tray && <GeneratePanel patientId={patientId} weekStart={weekStart} onGenerated={(id) => { setPicked(id); startDrop(); }} />}

      {tray && progress && (
        <Card className="space-y-2 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <TrayBadge status={tray.status} />
              <span className="text-[13px] text-muted-foreground">
                {tray.id}{tray.type === "replacement" && `, replaces ${tray.replacementOf}`}
              </span>
            </div>
            <div className="hidden 2xl:block"><TrayLifecycle tray={tray} /></div>
            <NextAction tray={tray} onSupply={() => setSupplyOpen(true)} onRegenerate={() => setRegenOpen(true)} />
          </div>
          <div className="2xl:hidden"><TrayLifecycle tray={tray} /></div>
          <div className="grid gap-4 border-t border-border pt-2.5 md:grid-cols-3">
            <div>
              <div className="flex justify-between text-[13px]"><span className="font-semibold">Preparation progress</span><span className="text-muted-foreground">{progress.prepared} of {progress.total}</span></div>
              <Progress value={progress.pct} className="mt-1.5" aria-label="Preparation progress" />
            </div>
            <div className="text-[13px]">
              <p className="font-semibold">Pharmacist verification</p>
              <p className="text-muted-foreground">
                {lastApproval && (tray.status === "approved" || tray.status === "supplied")
                  ? `Approved by ${lastApproval.by}, ${fmtDateTime(lastApproval.at)}`
                  : tray.status === "approval-invalidated" ? "Previous approval no longer stands"
                  : tray.status === "rejected" ? "Rejected" : "Not verified yet"}
              </p>
            </div>
            <div className="text-[13px]">
              <p className="font-semibold">Proposed schedule</p>
              <p className="text-muted-foreground">{scheduleApproval ? `Approved by ${scheduleApproval.by}, ${fmtDateTime(scheduleApproval.at)}` : "Waiting for a pharmacist"}</p>
            </div>
          </div>
        </Card>
      )}

      {tray?.needsRegeneration && tray.status !== "supplied" && tray.status !== "rejected" && (
        <div className="flex gap-2 rounded-lg border border-danger/30 bg-danger-bg p-3 text-[13px] text-danger">
          <AlertTriangle className="size-4 shrink-0" />
          <span><strong>A source prescription or medicine changed.</strong> {tray.invalidatedReason ?? "This tray no longer matches the verified prescriptions."} Regenerate it before going further.</span>
        </div>
      )}
      {tray?.status === "approval-invalidated" && !tray.needsRegeneration && (
        <div className="flex gap-2 rounded-lg border border-danger/30 bg-danger-bg p-3 text-[13px] text-danger">
          <AlertTriangle className="size-4 shrink-0" /><span><strong>Approval invalidated.</strong> {tray.invalidatedReason} Send it back for verification.</span>
        </div>
      )}
      {tray?.status === "rejected" && (
        <div className="flex gap-2 rounded-lg border border-danger/30 bg-danger-bg p-3 text-[13px] text-danger">
          <Ban className="size-4 shrink-0" /><span><strong>Rejected:</strong> {tray.events.filter((e) => e.type === "rejected").at(-1)?.note}</span>
        </div>
      )}
      {tray && tray.flags.length > 0 && (
        <div className="rounded-lg border border-warn/30 bg-warn-bg p-3">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-warn"><AlertTriangle className="size-4" /> Not placed in this tray ({tray.flags.length})</p>
          <ul className="mt-2 grid gap-1.5 md:grid-cols-2">
            {tray.flags.map((f) => {
              const med = medicines.find((m) => m.id === f.medicineId);
              return (
                <li key={f.lineId} className="flex items-center gap-2 text-[13px]">
                  {med && <PillArt medicine={med} size={24} />}
                  <span><strong>{med?.brand}</strong>: {f.reason}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {tray ? (
        <>
          <TrayGrid key={tray.id} tray={tray} medicines={medicines} selectedId={selected} onSelect={(c) => setSelected(c.id)} highlightMedicineId={highlight} drop={drop} />
          <TrayLegend tray={tray} medicines={medicines} highlight={highlight} onHighlight={setHighlight} batchNumber={batchNumber} />
          <CompartmentDrawer tray={tray} compartment={compartment} onClose={() => setSelected(null)} onNavigate={(c) => setSelected(c.id)} />
          <ConfirmDialog
            open={supplyOpen}
            onOpenChange={setSupplyOpen}
            title="Mark this tray as supplied?"
            description={`Deducts the units in ${tray.id} from stock once. This simulates handing the tray over and cannot be repeated.`}
            confirmLabel="Mark supplied"
            onConfirm={() => notify(supplyTray(tray.id))}
          />
          <ConfirmDialog
            open={regenOpen}
            onOpenChange={setRegenOpen}
            title="Regenerate this tray?"
            description="Clears all preparation on this tray and rebuilds it from the current verified prescriptions. A pharmacist must approve the new schedule."
            confirmLabel="Regenerate"
            destructive
            onConfirm={() => { if (notify(generateTray(tray.patientId, tray.weekStart))) startDrop(); }}
          />
        </>
      ) : (
        <div className="opacity-70"><TrayGrid tray={{ compartments: emptyCompartments(), weekStart }} medicines={medicines} ghost /></div>
      )}
    </div>
  );
}

const STATUS_OPTIONS = ["proposed", "awaiting-preparation", "in-preparation", "awaiting-verification", "correction-requested", "approved", "approval-invalidated", "rejected", "supplied"];

function AllTrays({ onOpen, initialStatus }: { onOpen: (t: Tray) => void; initialStatus?: string }) {
  const trays = useAppStore((s) => s.trays);
  const patients = useAppStore((s) => s.patients);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(initialStatus ?? "all");
  const name = (id: string) => patients.find((p) => p.id === id)?.name ?? id;
  const rows = useMemo(
    () => trays.filter((t) => (status === "all" || t.status === status) && `${t.id} ${name(t.patientId)}`.toLowerCase().includes(q.toLowerCase())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trays, q, status, patients],
  );
  const columns: ColumnDef<Tray>[] = [
    { accessorKey: "id", header: "Tray", cell: ({ row }) => <span className="font-semibold">{row.original.id}</span> },
    { id: "patient", accessorFn: (t) => name(t.patientId), header: "Patient" },
    { accessorKey: "weekStart", header: "Week", cell: ({ row }) => weekLabel(row.original.weekStart) },
    { accessorKey: "type", header: "Type", cell: ({ row }) => (row.original.type === "replacement" ? `Replacement of ${row.original.replacementOf}` : "Standard") },
    { id: "progress", accessorFn: (t) => trayProgress(t).pct, header: "Prepared", cell: ({ row }) => { const p = trayProgress(row.original); return `${p.prepared} of ${p.total}`; } },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <TrayBadge status={row.original.status} /> },
  ];
  return (
    <Card>
      <div className="flex flex-wrap gap-2 p-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search by tray or patient" />
        <Pick
          className="h-9 w-[220px]"
          value={status}
          onChange={setStatus}
          options={[{ value: "all", label: "All statuses" }, ...STATUS_OPTIONS.map((s) => ({ value: s, label: s.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()) }))]}
        />
      </div>
      <DataTable data={rows} columns={columns} pageSize={12} initialSort={[{ id: "weekStart", desc: true }]} onRowClick={onOpen} />
    </Card>
  );
}

function TraysInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initialStatus = params.get("status") ?? undefined;
  const [tab, setTab] = useState(initialStatus ? "all" : "board");
  const paramTray = params.get("tray");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (paramTray) setTab("board"); }, [paramTray]);
  return (
    <>
      <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[26px] leading-tight font-bold tracking-tight">MDS Weekly Trays</h1>
          <TabsList><TabsTrigger value="board">Tray view</TabsTrigger><TabsTrigger value="all">All trays</TabsTrigger></TabsList>
        </div>
        <ClinicalNotice>Schedules are proposals built from mock prescriptions. A simulated pharmacist approves every step.</ClinicalNotice>
        <TabsContent value="board"><TrayBoard /></TabsContent>
        <TabsContent value="all"><AllTrays initialStatus={initialStatus} onOpen={(t) => { router.push(`/trays?tray=${t.id}`); setTab("board"); }} /></TabsContent>
      </Tabs>
    </>
  );
}

export default function TraysPage() {
  return <Suspense><TraysInner /></Suspense>;
}
