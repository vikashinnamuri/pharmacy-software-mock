"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, Eye, FilePen, Plus, Send, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataTable } from "@/components/common/data-table";
import { PillArt } from "@/components/common/pill-art";
import { RxBadge } from "@/components/common/status-badge";
import { Card, ClinicalNotice, ConfirmDialog, GuardedButton, notify, PageHeader, Pick, SearchInput, TextLink } from "@/components/common/ui";
import { RxForm } from "@/components/forms/rx-form";
import { RxReviewDialog } from "@/components/forms/rx-review-dialog";
import { RxHistory, RxLineRow } from "@/components/tray/rx-detail-dialog";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { Prescription, RxStatus } from "@/types";

const TABS: { value: RxStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending Review" },
  { value: "verified", label: "Verified" },
  { value: "draft", label: "Draft" },
  { value: "rejected", label: "Rejected" },
  { value: "discontinued", label: "Discontinued" },
];

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const prescriptions = useAppStore((s) => s.prescriptions);
  const patients = useAppStore((s) => s.patients);
  const medicines = useAppStore((s) => s.medicines);
  const submitRx = useAppStore((s) => s.submitRx);
  const discontinueRx = useAppStore((s) => s.discontinueRx);

  const [status, setStatus] = useState<RxStatus | "all">((params.get("status") as RxStatus) ?? "all");
  const [q, setQ] = useState("");
  const [patientFilter, setPatientFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [formPatient, setFormPatient] = useState<string | undefined>();
  const [editing, setEditing] = useState<Prescription | undefined>();
  const [amend, setAmend] = useState<Prescription | undefined>();
  const [reviewId, setReviewId] = useState<string | null>(params.get("review") || null);
  const [viewId, setViewId] = useState<string | null>(params.get("view") || null);
  const [discId, setDiscId] = useState<string | null>(null);

  const newFor = params.get("new");
  const reviewParam = params.get("review");
  const viewParam = params.get("view");
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { if (newFor) { setFormPatient(newFor); setEditing(undefined); setAmend(undefined); setFormOpen(true); } }, [newFor]);
  useEffect(() => { if (reviewParam) setReviewId(reviewParam); }, [reviewParam]);
  useEffect(() => { if (viewParam) setViewId(viewParam); }, [viewParam]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const name = (id: string) => patients.find((p) => p.id === id)?.name ?? id;
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: prescriptions.length };
    prescriptions.forEach((p) => { c[p.status] = (c[p.status] ?? 0) + 1; });
    return c;
  }, [prescriptions]);

  const rows = useMemo(() => prescriptions.filter((p) => {
    if (status !== "all" && p.status !== status) return false;
    if (patientFilter !== "all" && p.patientId !== patientFilter) return false;
    const meds = p.lines.map((l) => { const m = medicines.find((x) => x.id === l.medicineId); return `${m?.brand} ${m?.generic}`; }).join(" ");
    return `${p.id} ${name(p.patientId)} ${p.prescriber} ${meds}`.toLowerCase().includes(q.toLowerCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [prescriptions, status, q, patientFilter, medicines, patients]);

  const view = prescriptions.find((p) => p.id === viewId);

  const openNew = () => { setFormPatient(undefined); setEditing(undefined); setAmend(undefined); setFormOpen(true); };

  const columns: ColumnDef<Prescription>[] = [
    { accessorKey: "id", header: "Prescription", cell: ({ row }) => <span className="font-semibold">{row.original.id}{row.original.version > 1 && <span className="ml-1 text-xs font-normal text-muted-foreground">v{row.original.version}</span>}</span> },
    { id: "patient", accessorFn: (p) => name(p.patientId), header: "Patient" },
    {
      id: "medicines", header: "Medicines", enableSorting: false, cell: ({ row }) => (
        <span className="flex items-center gap-1.5">
          <span className="flex -space-x-1.5">
            {row.original.lines.slice(0, 4).map((l) => { const m = medicines.find((x) => x.id === l.medicineId); return m ? <PillArt key={l.id} medicine={m} size={24} /> : null; })}
          </span>
          <span className="text-[13px] text-muted-foreground">{row.original.lines.length} line{row.original.lines.length > 1 ? "s" : ""}</span>
        </span>
      ),
    },
    { accessorKey: "prescriber", header: "Prescriber" },
    { accessorKey: "issuedOn", header: "Issued", cell: ({ row }) => fmtDate(row.original.issuedOn) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <RxBadge status={row.original.status} /> },
    {
      id: "actions", header: "", enableSorting: false, cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {p.status === "pending" && <GuardedButton size="sm" perm="rx.review" what="review prescriptions" onClick={() => setReviewId(p.id)}><Stethoscope /> Review</GuardedButton>}
            {p.status === "draft" && <GuardedButton size="sm" perm="rx.enter" what="submit prescriptions" variant="outline" onClick={() => notify(submitRx(p.id))}><Send /> Submit</GuardedButton>}
            {(p.status === "draft" || p.status === "rejected") && <GuardedButton size="sm" perm="rx.enter" what="edit prescriptions" variant="outline" onClick={() => { setEditing(p); setAmend(undefined); setFormOpen(true); }}><FilePen /> Edit</GuardedButton>}
            {p.status === "verified" && <GuardedButton size="sm" perm="rx.enter" what="amend prescriptions" variant="outline" onClick={() => { setAmend(p); setEditing(undefined); setFormOpen(true); }}><FilePen /> Amend</GuardedButton>}
            <Button size="icon-sm" variant="ghost" aria-label={`View ${p.id}`} onClick={() => setViewId(p.id)}><Eye /></Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Prescription Management"
        description="Enter scripts, send them for review and keep a full history of every change."
        actions={<GuardedButton perm="rx.enter" what="add prescriptions" onClick={openNew}><Plus /> Add Prescription</GuardedButton>}
      />
      <ClinicalNotice>Reviews are simulated. Prescriptions are never verified automatically, and unclear lines stay out of trays.</ClinicalNotice>
      <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Filter by status">
        {TABS.map((t) => (
          <button key={t.value} type="button" role="tab" aria-selected={status === t.value} onClick={() => setStatus(t.value)}
            className={cn("rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", status === t.value ? "bg-sidebar text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            {t.label} <span className="opacity-70">{counts[t.value] ?? 0}</span>
          </button>
        ))}
      </div>
      <Card>
        <div className="flex flex-wrap gap-2 p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search patient, medicine or prescriber" />
          <Pick className="h-9 w-[240px]" value={patientFilter} onChange={setPatientFilter} options={[{ value: "all", label: "All patients" }, ...patients.map((p) => ({ value: p.id, label: p.name }))]} />
        </div>
        <DataTable data={rows} columns={columns} onRowClick={(p) => setViewId(p.id)} initialSort={[{ id: "issuedOn", desc: true }]} />
      </Card>

      <RxForm
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o && newFor) router.replace("/prescriptions"); }}
        patientId={formPatient}
        editing={editing}
        amend={amend}
      />
      <RxReviewDialog id={reviewId} onClose={() => { setReviewId(null); if (reviewParam) router.replace("/prescriptions"); }} />
      <Sheet open={!!view} onOpenChange={(o) => { if (!o) { setViewId(null); if (viewParam) router.replace("/prescriptions"); } }}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-[520px]">
          {view && (
            <>
              <SheetHeader className="border-b border-border pr-12">
                <SheetTitle className="flex flex-wrap items-center gap-2 text-lg">{view.id} <RxBadge status={view.status} /></SheetTitle>
                <SheetDescription>
                  <TextLink href={`/patients/${view.patientId}`}>{name(view.patientId)}</TextLink>. {view.prescriber}, {view.clinic}. Issued {fmtDate(view.issuedOn)}. Version {view.version}.
                  {view.supersedes && ` Amends ${view.supersedes}.`}{view.supersededBy && ` Replaced by ${view.supersededBy}.`}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 p-4">
                <div className="space-y-2">{view.lines.map((l) => <RxLineRow key={l.id} line={l} />)}</div>
                {view.review?.note && <p className="rounded-lg bg-muted p-3 text-[13px]"><strong>Review note:</strong> {view.review.note}</p>}
                <div><p className="mb-2 text-[13px] font-semibold">History</p><RxHistory rx={view} /></div>
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  {view.status === "pending" && <GuardedButton perm="rx.review" what="review prescriptions" onClick={() => { setViewId(null); setReviewId(view.id); }}><Stethoscope /> Mock Pharmacist Review</GuardedButton>}
                  {view.status === "verified" && <GuardedButton perm="rx.enter" what="amend prescriptions" variant="outline" onClick={() => { setViewId(null); setAmend(view); setEditing(undefined); setFormOpen(true); }}><FilePen /> Amend</GuardedButton>}
                  {view.status === "verified" && <GuardedButton perm="rx.review" what="discontinue prescriptions" variant="destructive" onClick={() => setDiscId(view.id)}><Ban /> Discontinue</GuardedButton>}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={!!discId}
        onOpenChange={(o) => !o && setDiscId(null)}
        title={`Discontinue ${discId}?`}
        description="Any approved tray built from this prescription loses its approval and must be regenerated."
        reasonLabel="Reason"
        reasonRequired
        destructive
        confirmLabel="Discontinue"
        onConfirm={(note) => { if (discId) notify(discontinueRx(discId, note)); setDiscId(null); }}
      />
    </>
  );
}

export default function PrescriptionsPage() {
  return <Suspense><Inner /></Suspense>;
}
