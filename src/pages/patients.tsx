import { useNavigate, useSearchParams } from "react-router";
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Pencil, QrCode, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/common/data-table";
import { PatientFinder } from "@/components/common/patient-finder";
import { MdsBadge } from "@/components/common/status-badge";
import { Card, GuardedButton, PageHeader, Pick, SearchInput } from "@/components/common/ui";
import { PatientCardDialog } from "@/components/forms/patient-card";
import { PatientForm } from "@/components/forms/patient-form";
import { ageFrom, fmtDate } from "@/lib/dates";
import { activeMedicineCount, nextTrayDate } from "@/lib/selectors";
import { useAppStore } from "@/store/app-store";
import type { Patient } from "@/types";

export default function PatientsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const patients = useAppStore((s) => s.patients);
  const prescriptions = useAppStore((s) => s.prescriptions);
  const trays = useAppStore((s) => s.trays);
  const [q, setQ] = useState("");
  const [mds, setMds] = useState(params.get("mds") ?? "all");
  const [allergy, setAllergy] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | undefined>();
  const [cardFor, setCardFor] = useState<string | null>(null);
  const [justRegistered, setJustRegistered] = useState(false);
  const [finder, setFinder] = useState(false);

  const pNew = params.get("new");
  const pSearch = params.get("search");
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { if (pNew) { setEditing(undefined); setFormOpen(true); } }, [pNew]);
  useEffect(() => { if (pSearch) setFinder(true); }, [pSearch]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const rows = useMemo(() => patients.filter((p) => {
    if (mds !== "all" && p.mdsStatus !== mds) return false;
    if (allergy === "yes" && !p.allergies.length) return false;
    if (allergy === "no" && p.allergies.length) return false;
    const needle = q.toLowerCase().trim();
    return `${p.id} ${p.name} ${p.phone} ${p.phone.replace(/\D/g, "")} ${p.doctor.name} ${p.qrToken} ${p.dob}`.toLowerCase().includes(needle);
  }), [patients, q, mds, allergy]);

  const columns: ColumnDef<Patient>[] = [
    { accessorKey: "id", header: "Patient ID", cell: ({ row }) => <span className="font-semibold">{row.original.id}</span> },
    { accessorKey: "name", header: "Patient Name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: "dob", header: "Date of birth", cell: ({ row }) => `${fmtDate(row.original.dob)} (${ageFrom(row.original.dob)})` },
    { accessorKey: "phone", header: "Mobile" },
    { id: "meds", accessorFn: (p) => activeMedicineCount({ prescriptions }, p.id), header: "Active Medications" },
    { accessorKey: "mdsStatus", header: "MDS", cell: ({ row }) => <MdsBadge status={row.original.mdsStatus} /> },
    { id: "next", accessorFn: (p) => nextTrayDate({ trays }, p.id) ?? "", header: "Next Tray", cell: ({ getValue }) => (getValue() ? fmtDate(getValue() as string) : <span className="text-muted-foreground">None</span>) },
    {
      id: "actions", header: "Actions", enableSorting: false, cell: ({ row }) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="icon-sm" variant="ghost" aria-label={`View ${row.original.name}`} onClick={() => navigate(`/patients/${row.original.id}`)}><Eye /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={`Patient card for ${row.original.name}`} onClick={() => { setJustRegistered(false); setCardFor(row.original.id); }}><QrCode /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={`Edit ${row.original.name}`} onClick={() => { setEditing(row.original); setFormOpen(true); }}><Pencil /></Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Patients"
        description="Fictional patient medication records. Every patient has a permanent ID and a QR card."
        actions={
          <>
            <Button variant="outline" onClick={() => setFinder(true)}><Search /> Find patient (ID, DOB, mobile, QR)</Button>
            <GuardedButton perm="patient.edit" what="register patients" onClick={() => { setEditing(undefined); setFormOpen(true); }}><UserPlus /> Register New Patient</GuardedButton>
          </>
        }
      />
      <Card>
        <div className="flex flex-wrap gap-2 p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, ID, mobile, card code or DOB" />
          <Pick className="h-9 w-[190px]" value={mds} onChange={setMds} options={[{ value: "all", label: "All MDS statuses" }, { value: "active", label: "MDS active" }, { value: "assessment", label: "MDS review pending" }, { value: "paused", label: "MDS suspended" }, { value: "none", label: "Not on MDS" }]} />
          <Pick className="h-9 w-[170px]" value={allergy} onChange={setAllergy} options={[{ value: "all", label: "Any allergy status" }, { value: "yes", label: "Has allergies" }, { value: "no", label: "No allergies" }]} />
          <p className="ml-auto self-center text-[13px] text-muted-foreground">{rows.length} of {patients.length} patients</p>
        </div>
        <DataTable data={rows} columns={columns} pageSize={15} onRowClick={(p) => navigate(`/patients/${p.id}`)} getRowId={(p) => p.id} />
      </Card>
      <PatientForm
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o && pNew) navigate("/patients", { replace: true }); }}
        patient={editing}
        onSaved={(id, isNew) => { if (isNew) { setJustRegistered(true); setCardFor(id); } }}
      />
      <PatientCardDialog patientId={cardFor} justRegistered={justRegistered} onClose={() => { const id = cardFor; setCardFor(null); if (justRegistered && id) navigate(`/patients/${id}`); }} />
      <PatientFinder open={finder} onOpenChange={(o) => { setFinder(o); if (!o && pSearch) navigate("/patients", { replace: true }); }} requireConfirm={false} confirmLabel="Open patient record" onConfirm={(id) => navigate(`/patients/${id}`)} />
    </>
  );
}
