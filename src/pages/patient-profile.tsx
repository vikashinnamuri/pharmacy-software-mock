"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Download, FilePlus2, FileText, Grid3x3, Pencil, ScrollText, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PillArt } from "@/components/common/pill-art";
import { Badge, MdsBadge, RxBadge, TrayBadge } from "@/components/common/status-badge";
import { Card, ClinicalNotice, EmptyState, GuardedButton, PERIOD_META } from "@/components/common/ui";
import { PatientForm } from "@/components/forms/patient-form";
import { RxDetailDialog } from "@/components/tray/rx-detail-dialog";
import { ageFrom, fmtDate, fmtDateTime, weekLabel } from "@/lib/dates";
import { nextTrayDate } from "@/lib/selectors";
import { trayProgress } from "@/lib/tray-engine";
import { useAppStore } from "@/store/app-store";

function Fact({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value || "Not recorded"}</dd>
    </div>
  );
}

export default function PatientProfile() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const patient = useAppStore((s) => s.patients.find((p) => p.id === id));
  const allRx = useAppStore((s) => s.prescriptions);
  const allTrays = useAppStore((s) => s.trays);
  const activity = useAppStore((s) => s.activity);
  const medicines = useAppStore((s) => s.medicines);
  const markVisit = useAppStore((s) => s.markVisit);
  const [editOpen, setEditOpen] = useState(false);
  const [rxId, setRxId] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");

  const rx = useMemo(() => allRx.filter((p) => p.patientId === id).sort((a, b) => b.issuedOn.localeCompare(a.issuedOn)), [allRx, id]);
  const trays = useMemo(() => allTrays.filter((t) => t.patientId === id).sort((a, b) => b.weekStart.localeCompare(a.weekStart) || b.id.localeCompare(a.id)), [allTrays, id]);
  const timeline = useMemo(() => activity.filter((a) => a.patientId === id), [activity, id]);

  const medicationHistory = useMemo(() => {
    const rows: { key: string; medicineId: string; state: "Active" | "Changed" | "Discontinued"; rxId: string; detail: string; date: string }[] = [];
    rx.forEach((p) => p.lines.forEach((l) => {
      const state = p.status === "verified" ? (l.changeNote ? "Changed" : "Active") : p.status === "discontinued" ? "Discontinued" : null;
      if (!state) return;
      rows.push({
        key: `${p.id}-${l.id}`, medicineId: l.medicineId, state, rxId: p.id,
        detail: `${l.dosage}${l.times.length ? `, ${l.times.map((t) => PERIOD_META[t].label.toLowerCase()).join(", ")}` : ""}${l.changeNote ? `. ${l.changeNote}` : ""}`,
        date: p.issuedOn,
      });
    }));
    return rows;
  }, [rx]);

  if (!patient) {
    return <Card><EmptyState icon={<UserRound className="size-5" />} title="Patient not found" body="This record does not exist in the demo data. It may have been cleared by a reset." action={<Button render={<Link href="/patients" />}>Back to patients</Button>} /></Card>;
  }
  const next = nextTrayDate({ trays: allTrays }, patient.id);
  const activeCount = medicationHistory.filter((m) => m.state !== "Discontinued").length;

  return (
    <>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" render={<Link href="/patients" />}><ArrowLeft /> Patients</Button>
      <Card className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent text-lg font-bold text-accent-foreground">{patient.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
        <div className="min-w-[200px] flex-1">
          <h1 className="text-[24px] leading-tight font-bold tracking-tight">{patient.name}</h1>
          <p className="text-sm text-muted-foreground">{patient.id}, {ageFrom(patient.dob)} years, {patient.gender.toLowerCase()}. {activeCount} active medicine{activeCount === 1 ? "" : "s"}. Next tray {next ? fmtDate(next) : "not scheduled"}.</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <MdsBadge status={patient.mdsStatus} />
            {patient.allergies.length > 0 ? <Badge tone="danger" icon={AlertTriangle}>Allergy: {patient.allergies.join(", ")}</Badge> : <Badge tone="neutral">No allergies recorded</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <GuardedButton perm="patient.edit" what="edit patients" variant="outline" onClick={() => setEditOpen(true)}><Pencil /> Edit Patient</GuardedButton>
          <GuardedButton perm="rx.enter" what="add prescriptions" variant="outline" onClick={() => router.push(`/prescriptions?new=${patient.id}`)}><FilePlus2 /> Add Prescription</GuardedButton>
          <Button onClick={() => router.push(`/trays?patient=${patient.id}`)}><Grid3x3 /> Open trays</Button>
        </div>
      </Card>
      <ClinicalNotice>This record is fictional. Use it to validate the workflow only.</ClinicalNotice>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as string); if (v === "history" || v === "medications") markVisit("patient-history"); }}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">Medical History</TabsTrigger>
          <TabsTrigger value="prescriptions">Prescriptions ({rx.length})</TabsTrigger>
          <TabsTrigger value="medications">Medication History</TabsTrigger>
          <TabsTrigger value="mds">MDS History ({trays.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({patient.documents.length})</TabsTrigger>
          <TabsTrigger value="timeline">Activity Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-2">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card className="p-4"><p className="mb-3 font-semibold">Demographics</p><dl className="space-y-2.5"><Fact label="Date of birth" value={fmtDate(patient.dob)} /><Fact label="Phone" value={patient.phone} /><Fact label="Address" value={patient.address} /><Fact label="Registered" value={fmtDate(patient.registeredOn)} /></dl></Card>
            <Card className="p-4"><p className="mb-3 font-semibold">Doctor</p><dl className="space-y-2.5"><Fact label="Name" value={patient.doctor.name} /><Fact label="Clinic" value={patient.doctor.clinic} /><Fact label="Phone" value={patient.doctor.phone} /></dl></Card>
            <Card className="p-4"><p className="mb-3 font-semibold">Caregiver</p>{patient.caregiver ? <dl className="space-y-2.5"><Fact label="Name" value={patient.caregiver.name} /><Fact label="Relation" value={patient.caregiver.relation} /><Fact label="Phone" value={patient.caregiver.phone} /></dl> : <p className="text-[13px] text-muted-foreground">No caregiver recorded. Edit the patient to add one.</p>}</Card>
            <Card className="p-4"><p className="mb-3 font-semibold">Emergency contact</p><dl className="space-y-2.5"><Fact label="Name" value={patient.emergencyContact.name} /><Fact label="Relation" value={patient.emergencyContact.relation} /><Fact label="Phone" value={patient.emergencyContact.phone} /></dl></Card>
            {patient.notes && <Card className="p-4 md:col-span-2 xl:col-span-4"><p className="mb-1 font-semibold">Notes</p><p className="text-sm">{patient.notes}</p></Card>}
          </div>
        </TabsContent>

        <TabsContent value="history" className="pt-2">
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="p-4">
              <p className="mb-2 font-semibold">Conditions</p>
              {patient.conditions.length ? <ul className="flex flex-wrap gap-1.5">{patient.conditions.map((c) => <li key={c}><Badge tone="info">{c}</Badge></li>)}</ul> : <p className="text-[13px] text-muted-foreground">None recorded.</p>}
            </Card>
            <Card className="p-4">
              <p className="mb-2 font-semibold">Allergies</p>
              {patient.allergies.length ? <ul className="flex flex-wrap gap-1.5">{patient.allergies.map((c) => <li key={c}><Badge tone="danger" icon={AlertTriangle}>{c}</Badge></li>)}</ul> : <p className="text-[13px] text-muted-foreground">None recorded.</p>}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="prescriptions" className="pt-2">
          <Card>
            {rx.length === 0 && <EmptyState icon={<ScrollText className="size-5" />} title="No prescriptions yet" action={<GuardedButton perm="rx.enter" what="add prescriptions" onClick={() => router.push(`/prescriptions?new=${patient.id}`)}>Add Prescription</GuardedButton>} />}
            <ul>
              {rx.map((p) => (
                <li key={p.id} className="border-b border-border last:border-0">
                  <button type="button" onClick={() => setRxId(p.id)} className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left hover:bg-accent/50">
                    <span className="min-w-[110px] font-semibold">{p.id}</span>
                    <span className="flex -space-x-1">{p.lines.slice(0, 5).map((l) => { const m = medicines.find((x) => x.id === l.medicineId); return m ? <PillArt key={l.id} medicine={m} size={24} /> : null; })}</span>
                    <span className="flex-1 text-[13px] text-muted-foreground">{p.prescriber}, {fmtDate(p.issuedOn)}</span>
                    <RxBadge status={p.status} />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>

        <TabsContent value="medications" className="pt-2">
          <Card>
            {medicationHistory.length === 0 && <EmptyState title="No medication history yet" body="Medicines appear here once a prescription is verified." />}
            <ul className="divide-y divide-border">
              {medicationHistory.map((m) => {
                const med = medicines.find((x) => x.id === m.medicineId);
                return (
                  <li key={m.key} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                    {med && <PillArt medicine={med} size={32} />}
                    <span className="min-w-[200px] flex-1">
                      <span className="block font-semibold">{med?.brand} {med?.strength}</span>
                      <span className="block text-[13px] text-muted-foreground">{m.detail}</span>
                    </span>
                    <span className="text-[13px] text-muted-foreground">{m.rxId}, {fmtDate(m.date)}</span>
                    <Badge tone={m.state === "Active" ? "ok" : m.state === "Changed" ? "violet" : "neutral"}>{m.state}</Badge>
                  </li>
                );
              })}
            </ul>
          </Card>
        </TabsContent>

        <TabsContent value="mds" className="pt-2">
          <Card>
            {trays.length === 0 && <EmptyState icon={<Grid3x3 className="size-5" />} title="No weekly trays yet" action={<Button render={<Link href={`/trays?patient=${patient.id}`} />}>Go to weekly trays</Button>} />}
            <ul>
              {trays.map((t) => {
                const pr = trayProgress(t);
                return (
                  <li key={t.id} className="border-b border-border last:border-0">
                    <Link href={`/trays?tray=${t.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-accent/50">
                      <span className="min-w-[110px] font-semibold">{t.id}</span>
                      <span className="flex-1 text-[13px]">{weekLabel(t.weekStart)}{t.type === "replacement" ? `, replaces ${t.replacementOf}` : ""}</span>
                      <span className="text-[13px] text-muted-foreground">{pr.prepared} of {pr.total} prepared</span>
                      <TrayBadge status={t.status} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="pt-2">
          <Card>
            {patient.documents.length === 0 && <EmptyState icon={<FileText className="size-5" />} title="No files on this record" body="Generated documents are available any time from Documents and MAR Charts." />}
            <ul className="divide-y divide-border">
              {patient.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <FileText className="size-5 text-muted-foreground" />
                  <span className="min-w-[200px] flex-1"><span className="block font-medium">{d.title}</span><span className="block text-[13px] text-muted-foreground">{d.kind}, added {fmtDate(d.addedOn)}</span></span>
                  <Badge tone={d.status === "On file" ? "ok" : d.status === "Expired" ? "danger" : "warn"}>{d.status}</Badge>
                </li>
              ))}
            </ul>
            <div className="border-t border-border p-3">
              <Button variant="outline" size="sm" render={<Link href={`/documents?type=summary&patient=${patient.id}`} />}><Download /> Generate patient documents</Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="pt-2">
          <Card className="p-5">
            {timeline.length === 0 && <p className="text-[13px] text-muted-foreground">No activity recorded for this patient yet.</p>}
            <ol className="space-y-3 border-l-2 border-border pl-4">
              {timeline.slice(0, 60).map((a) => (
                <li key={a.id} className="relative text-sm">
                  <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary" />
                  {a.summary}
                  <span className="block text-xs text-muted-foreground">{a.actor}, {fmtDateTime(a.at)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </TabsContent>
      </Tabs>
      <PatientForm open={editOpen} onOpenChange={setEditOpen} patient={patient} />
      <RxDetailDialog id={rxId} onClose={() => setRxId(null)} />
    </>
  );
}

