import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ShieldQuestion, UserPlus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/common/data-table";
import { PatientFinder } from "@/components/common/patient-finder";
import { EnrolmentBadge, SuitabilityReviewBadge } from "@/components/common/status-badge";
import { Card, ClinicalNotice, EmptyState, GuardedButton, PageHeader, Pick } from "@/components/common/ui";
import { CyclePlanner } from "@/components/mds/cycle-planner";
import { EnrolmentReviewDialog } from "@/components/mds/enrolment";
import { DAY_FULL, fmtDate } from "@/lib/dates";
import { periodName } from "@/lib/tray-engine";
import { useAppStore } from "@/store/app-store";
import type { MdsEnrolment } from "@/types";

export default function MdsPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const enrolments = useAppStore((s) => s.enrolments);
  const patients = useAppStore((s) => s.patients);
  const cycles = useAppStore((s) => s.cycles);
  const pPatient = params.get("patient");
  const [tab, setTab] = useState(pPatient ? "plan" : params.get("tab") ?? "enrolled");
  const active = enrolments.filter((e) => e.status === "active");
  const [planFor, setPlanFor] = useState(pPatient ?? cycles[0]?.patientId ?? active[0]?.patientId ?? "");
  const [reviewing, setReviewing] = useState<MdsEnrolment | null>(null);
  const [finder, setFinder] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { if (pPatient) { setPlanFor(pPatient); setTab("plan"); } }, [pPatient]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const name = (id: string) => patients.find((p) => p.id === id)?.name ?? id;
  const pending = enrolments.filter((e) => e.status === "pending-review");
  const columns: ColumnDef<MdsEnrolment>[] = [
    { id: "patient", accessorFn: (e) => name(e.patientId), header: "Patient", cell: ({ row }) => <span className="font-semibold">{name(row.original.patientId)}</span> },
    { accessorKey: "id", header: "Enrolment" },
    { accessorKey: "status", header: "Service status", cell: ({ row }) => <EnrolmentBadge status={row.original.status} /> },
    { accessorKey: "suitability", header: "Suitability", cell: ({ row }) => <SuitabilityReviewBadge status={row.original.suitability} /> },
    { accessorKey: "prepDay", header: "Preparation day", cell: ({ row }) => DAY_FULL[row.original.prepDay] },
    { accessorKey: "fulfilment", header: "Fulfilment", cell: ({ row }) => (row.original.fulfilment === "delivery" ? "Delivery" : "Collection") },
    { id: "periods", header: "Extra periods", enableSorting: false, cell: ({ row }) => row.original.approvedPeriods.map(periodName).join(", ") || "Standard four" },
    { accessorKey: "enrolledOn", header: "Enrolled", cell: ({ row }) => fmtDate(row.original.enrolledOn) },
  ];

  return (
    <>
      <PageHeader
        title="MDS Management"
        description="Dossett enrolment, suitability reviews and four-week planning. Each week keeps its own approval and preparation record."
        actions={<GuardedButton perm="mds.enrol" what="enrol patients" onClick={() => setFinder(true)}><UserPlus /> Register a patient for MDS</GuardedButton>}
      />
      <ClinicalNotice>Suitability reviews and approvals are simulated pharmacist decisions. Nothing is enrolled or approved automatically.</ClinicalNotice>
      <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
        <TabsList>
          <TabsTrigger value="enrolled">MDS patients ({active.length})</TabsTrigger>
          <TabsTrigger value="reviews">Suitability reviews ({pending.length})</TabsTrigger>
          <TabsTrigger value="plan">Four-week planning</TabsTrigger>
        </TabsList>
        <TabsContent value="enrolled" className="pt-2">
          <Card><DataTable data={enrolments} columns={columns} onRowClick={(e) => navigate(`/patients/${e.patientId}?tab=mds-enrolment`)} initialSort={[{ id: "patient", desc: false }]} getRowId={(e) => e.id} /></Card>
        </TabsContent>
        <TabsContent value="reviews" className="pt-2">
          <Card>
            {pending.length === 0 && <EmptyState icon={<ShieldQuestion className="size-5" />} title="No enrolments waiting for review" />}
            <ul className="divide-y divide-border">
              {pending.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]">
                  <span className="min-w-[200px] flex-1"><strong>{name(e.patientId)}</strong> ({e.id})<span className="block text-muted-foreground">Requested {fmtDate(e.enrolledOn)}. {e.history.at(-1)?.action}{e.history.at(-1)?.note ? `. ${e.history.at(-1)?.note}` : ""}</span></span>
                  <EnrolmentBadge status={e.status} />
                  <GuardedButton size="sm" perm="mds.approve" what="complete suitability reviews" onClick={() => setReviewing(e)}>Review suitability</GuardedButton>
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>
        <TabsContent value="plan" className="space-y-3 pt-2">
          <Card className="flex flex-wrap items-end gap-3 p-4">
            <div className="w-[300px]"><Pick value={planFor} onChange={(v) => { setPlanFor(v); navigate(`/mds?patient=${v}`, { replace: true }); }} placeholder="Choose an MDS patient" options={active.map((e) => ({ value: e.patientId, label: `${name(e.patientId)} (${e.patientId})` }))} /></div>
            <p className="text-[13px] text-muted-foreground">Only patients with an active enrolment can be planned.</p>
          </Card>
          {planFor ? <CyclePlanner key={planFor} patientId={planFor} /> : <Card><EmptyState title="Choose an MDS patient to plan" /></Card>}
        </TabsContent>
      </Tabs>
      {reviewing && <EnrolmentReviewDialog enrolment={reviewing} onClose={() => setReviewing(null)} />}
      <PatientFinder open={finder} onOpenChange={setFinder} requireConfirm={false} confirmLabel="Open MDS enrolment" onConfirm={(id) => navigate(`/patients/${id}?tab=mds-enrolment`)} />
    </>
  );
}
