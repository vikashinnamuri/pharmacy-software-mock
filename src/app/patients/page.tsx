"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/common/data-table";
import { MdsBadge } from "@/components/common/status-badge";
import { Card, GuardedButton, PageHeader, Pick, SearchInput } from "@/components/common/ui";
import { PatientForm } from "@/components/forms/patient-form";
import { ageFrom, fmtDate } from "@/lib/dates";
import { activeMedicineCount, nextTrayDate } from "@/lib/selectors";
import { useAppStore } from "@/store/app-store";
import type { Patient } from "@/types";

function Inner() {
  const router = useRouter();
  const params = useSearchParams();
  const patients = useAppStore((s) => s.patients);
  const prescriptions = useAppStore((s) => s.prescriptions);
  const trays = useAppStore((s) => s.trays);
  const [q, setQ] = useState("");
  const [mds, setMds] = useState(params.get("mds") ?? "all");
  const [allergy, setAllergy] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | undefined>();

  const rows = useMemo(() => patients.filter((p) => {
    if (mds !== "all" && p.mdsStatus !== mds) return false;
    if (allergy === "yes" && !p.allergies.length) return false;
    if (allergy === "no" && p.allergies.length) return false;
    return `${p.id} ${p.name} ${p.phone} ${p.doctor.name}`.toLowerCase().includes(q.toLowerCase());
  }), [patients, q, mds, allergy]);

  const columns: ColumnDef<Patient>[] = [
    { accessorKey: "id", header: "Patient ID", cell: ({ row }) => <span className="font-semibold">{row.original.id}</span> },
    { accessorKey: "name", header: "Patient Name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { id: "age", accessorFn: (p) => ageFrom(p.dob), header: "Age" },
    { accessorKey: "phone", header: "Contact" },
    { id: "meds", accessorFn: (p) => activeMedicineCount({ prescriptions }, p.id), header: "Active Medications" },
    { accessorKey: "mdsStatus", header: "MDS Status", cell: ({ row }) => <MdsBadge status={row.original.mdsStatus} /> },
    { id: "next", accessorFn: (p) => nextTrayDate({ trays }, p.id) ?? "", header: "Next Tray Date", cell: ({ getValue }) => (getValue() ? fmtDate(getValue() as string) : <span className="text-muted-foreground">None scheduled</span>) },
    {
      id: "actions", header: "Actions", enableSorting: false, cell: ({ row }) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="icon-sm" variant="ghost" aria-label={`View ${row.original.name}`} onClick={() => router.push(`/patients/${row.original.id}`)}><Eye /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={`Edit ${row.original.name}`} onClick={() => { setEditing(row.original); setFormOpen(true); }}><Pencil /></Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Patients"
        description="Fictional patient medication records. Open one to see history, trays and documents."
        actions={<GuardedButton perm="patient.edit" what="add patients" onClick={() => { setEditing(undefined); setFormOpen(true); }}><UserPlus /> Add Patient</GuardedButton>}
      />
      <Card>
        <div className="flex flex-wrap gap-2 p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, ID, phone or doctor" />
          <Pick className="h-9 w-[180px]" value={mds} onChange={setMds} options={[{ value: "all", label: "All MDS statuses" }, { value: "active", label: "Active tray" }, { value: "assessment", label: "In assessment" }, { value: "paused", label: "Paused" }, { value: "none", label: "Not on trays" }]} />
          <Pick className="h-9 w-[170px]" value={allergy} onChange={setAllergy} options={[{ value: "all", label: "Any allergy status" }, { value: "yes", label: "Has allergies" }, { value: "no", label: "No allergies" }]} />
          <p className="ml-auto self-center text-[13px] text-muted-foreground">{rows.length} of {patients.length} patients</p>
        </div>
        <DataTable data={rows} columns={columns} pageSize={15} onRowClick={(p) => router.push(`/patients/${p.id}`)} getRowId={(p) => p.id} />
      </Card>
      <PatientForm open={formOpen} onOpenChange={setFormOpen} patient={editing} onSaved={(id) => { if (!editing) router.push(`/patients/${id}`); }} />
    </>
  );
}

export default function PatientsPage() {
  return <Suspense><Inner /></Suspense>;
}
