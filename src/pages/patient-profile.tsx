import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Ban, CalendarRange, Download, FilePen, FilePlus2, FileText, Grid3x3, Pencil, QrCode as QrIcon, ScrollText, ShieldCheck, ShoppingBag,
  Stethoscope, UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PillArt } from "@/components/common/pill-art";
import { QrCode } from "@/components/common/qr-code";
import { Badge, MdsBadge, OrderBadge, RxBadge, TrayBadge } from "@/components/common/status-badge";
import { Card, ClinicalNotice, ConfirmDialog, EmptyState, GuardedButton, notify } from "@/components/common/ui";
import { CounsellingDialog } from "@/components/forms/counselling-form";
import { PatientCardDialog } from "@/components/forms/patient-card";
import { PatientForm } from "@/components/forms/patient-form";
import { RxForm } from "@/components/forms/rx-form";
import { EnrolmentPanel } from "@/components/mds/enrolment";
import { OrderSheet } from "@/components/orders/order-sheet";
import { lineSummary, RxDetailDialog } from "@/components/tray/rx-detail-dialog";
import { ageFrom, fmtDate, fmtDateTime, weekLabel } from "@/lib/dates";
import { orderCharges } from "@/lib/orders";
import { enrolmentFor, nextTrayDate, rupees } from "@/lib/selectors";
import { trayProgress } from "@/lib/tray-engine";
import { useAppStore } from "@/store/app-store";
import type { Prescription } from "@/types";

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
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const state = useAppStore();
  const patient = state.patients.find((p) => p.id === id);
  const { prescriptions: allRx, trays: allTrays, activity, medicines, orders: allOrders, counselling: allCounselling, markVisit, discontinueLine } = state;
  const [editOpen, setEditOpen] = useState(false);
  const [rxId, setRxId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [amend, setAmend] = useState<Prescription | undefined>();
  const [discLine, setDiscLine] = useState<{ rxId: string; lineId: string; name: string } | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [counselOpen, setCounselOpen] = useState(false);
  const [tab, setTab] = useState(params.get("tab") ?? "overview");
  const pTab = params.get("tab");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (pTab) setTab(pTab); }, [pTab]);

  const rx = useMemo(() => allRx.filter((p) => p.patientId === id).sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.id.localeCompare(a.id)), [allRx, id]);
  const trays = useMemo(() => allTrays.filter((t) => t.patientId === id).sort((a, b) => b.weekStart.localeCompare(a.weekStart) || b.id.localeCompare(a.id)), [allTrays, id]);
  const orders = useMemo(() => allOrders.filter((o) => o.patientId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [allOrders, id]);
  const counselling = useMemo(() => allCounselling.filter((c) => c.patientId === id), [allCounselling, id]);
  const timeline = useMemo(() => activity.filter((a) => a.patientId === id), [activity, id]);
  const current = rx.filter((p) => p.status === "verified").flatMap((p) => p.lines.map((l) => ({ p, l })));
  const historical = rx.filter((p) => p.status === "discontinued" || p.status === "rejected").flatMap((p) => p.lines.map((l) => ({ p, l })));

  if (!patient) {
    return <Card><EmptyState icon={<UserRound className="size-5" />} title="Patient not found" body="This record does not exist in the demo data. It may have been cleared by a reset." action={<Button render={<Link to="/patients" />}>Back to patients</Button>} /></Card>;
  }
  const next = nextTrayDate({ trays: allTrays }, patient.id);
  const enrolment = enrolmentFor(state, patient.id);
  const onMds = enrolment?.status === "active";

  return (
    <>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" render={<Link to="/patients" />}><ArrowLeft /> Patients</Button>
      <Card className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent text-lg font-bold text-accent-foreground">{patient.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
        <div className="min-w-[200px] flex-1">
          <h1 className="text-[24px] leading-tight font-bold tracking-tight">{patient.name}</h1>
          <p className="text-sm text-muted-foreground">{patient.id}, {ageFrom(patient.dob)} years, {patient.gender.toLowerCase()}. {current.length} authorised medicine{current.length === 1 ? "" : "s"}.{onMds ? ` Next tray ${next ? fmtDate(next) : "not scheduled"}.` : ""}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {onMds ? <Badge tone="teal" icon={ShieldCheck} className="px-2.5 py-1 text-[13px]">MDS PATIENT, {enrolment.id}</Badge> : <MdsBadge status={patient.mdsStatus} />}
            {patient.allergies.length > 0 ? <Badge tone="danger" icon={AlertTriangle}>Allergy: {patient.allergies.join(", ")}</Badge> : <Badge tone="neutral">No known allergies</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setCardOpen(true)}><QrIcon /> Patient card</Button>
          <GuardedButton perm="patient.edit" what="edit patients" variant="outline" onClick={() => setEditOpen(true)}><Pencil /> Edit</GuardedButton>
          <GuardedButton perm="rx.enter" what="add prescriptions" variant="outline" onClick={() => navigate(`/prescriptions?new=${patient.id}`)}><FilePlus2 /> Add Prescription</GuardedButton>
          <GuardedButton perm="order.create" what="create orders" onClick={() => navigate(`/dispensing?new=${patient.id}`)}><ShoppingBag /> Dispense</GuardedButton>
          {onMds && <Button variant="outline" onClick={() => navigate(`/mds?patient=${patient.id}`)}><CalendarRange /> Four-week plan</Button>}
        </div>
      </Card>
      <ClinicalNotice>This record is fictional. Use it to validate the workflow only.</ClinicalNotice>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as string); if (v === "history" || v === "medications") markVisit("patient-history"); if (v === "dispensing") markVisit("patient-dispensing"); }}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="mds-enrolment">MDS Enrolment</TabsTrigger>
          <TabsTrigger value="history">Medical History</TabsTrigger>
          <TabsTrigger value="medications">Medications</TabsTrigger>
          <TabsTrigger value="prescriptions">Prescriptions ({rx.length})</TabsTrigger>
          <TabsTrigger value="dispensing">Dispensing History ({orders.length})</TabsTrigger>
          <TabsTrigger value="mds">MDS History ({trays.length})</TabsTrigger>
          <TabsTrigger value="counselling">Counselling ({counselling.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="timeline">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-2">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card className="p-4"><p className="mb-3 font-semibold">Demographics</p><dl className="space-y-2.5"><Fact label="Date of birth" value={fmtDate(patient.dob)} /><Fact label="Mobile" value={patient.phone} /><Fact label="Email" value={patient.email} /><Fact label="Address" value={patient.address} /><Fact label="Registered" value={fmtDate(patient.registeredOn)} /></dl></Card>
            <Card className="p-4"><p className="mb-3 font-semibold">Doctor and consent</p><dl className="space-y-2.5"><Fact label="Doctor" value={patient.doctor.name} /><Fact label="Clinic" value={patient.doctor.clinic} /><Fact label="Consent" value={patient.consent.given ? `Given by ${patient.consent.by}, ${fmtDate(patient.consent.recordedOn)}` : "Not recorded"} /></dl></Card>
            <Card className="p-4"><p className="mb-3 font-semibold">Caregiver and representative</p><dl className="space-y-2.5"><Fact label="Caregiver" value={patient.caregiver ? `${patient.caregiver.name} (${patient.caregiver.relation ?? "caregiver"}), ${patient.caregiver.phone}` : "None"} /><Fact label="Authorised representative" value={patient.representative ? `${patient.representative.name} (${patient.representative.relation ?? "representative"})` : "None"} /><Fact label="Emergency contact" value={`${patient.emergencyContact.name} (${patient.emergencyContact.relation ?? "contact"}), ${patient.emergencyContact.phone}`} /></dl></Card>
            <Card className="flex flex-col items-center gap-2 p-4 text-center">
              <p className="self-start font-semibold">Patient QR card</p>
              <QrCode value={patient.qrToken} size={112} />
              <p className="text-[13px] font-semibold">{patient.qrToken}</p>
              <p className="text-xs text-muted-foreground">Holds only this card code. No medical information.</p>
              <Button size="sm" variant="outline" onClick={() => setCardOpen(true)}>Print patient card</Button>
            </Card>
            {patient.notes && <Card className="p-4 md:col-span-2 xl:col-span-4"><p className="mb-1 font-semibold">Notes</p><p className="text-sm">{patient.notes}</p></Card>}
          </div>
        </TabsContent>

        <TabsContent value="mds-enrolment" className="pt-2">
          <EnrolmentPanel patientId={patient.id} onPlan={() => navigate(`/mds?patient=${patient.id}`)} />
        </TabsContent>

        <TabsContent value="history" className="pt-2">
          <div className="grid gap-3 md:grid-cols-3">
            <Card className="p-4">
              <p className="mb-2 font-semibold">Conditions</p>
              {patient.conditions.length ? <ul className="flex flex-wrap gap-1.5">{patient.conditions.map((c) => <li key={c}><Badge tone="info">{c}</Badge></li>)}</ul> : <p className="text-[13px] text-muted-foreground">None recorded.</p>}
            </Card>
            <Card className="p-4">
              <p className="mb-2 font-semibold">Allergies</p>
              {patient.allergies.length ? <ul className="flex flex-wrap gap-1.5">{patient.allergies.map((c) => <li key={c}><Badge tone="danger" icon={AlertTriangle}>{c}</Badge></li>)}</ul> : <p className="text-[13px] text-muted-foreground">No known allergies.</p>}
            </Card>
            <Card className="p-4">
              <p className="mb-2 font-semibold">Existing medication history (reported)</p>
              <p className="text-[13px]">{patient.reportedMedication}</p>
              <p className="mt-1 text-xs text-muted-foreground">As told at registration. Not an authorised medicine list.</p>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="medications" className="space-y-3 pt-2">
          <Card>
            <div className="px-5 pt-4 pb-2"><h2 className="font-semibold">Current authorised medicines</h2><p className="text-[13px] text-muted-foreground">From verified prescriptions. Only these can be dispensed or placed in a tray.</p></div>
            {current.length === 0 && <EmptyState title="No authorised medicines" body="Medicines appear here once a prescription is verified." />}
            <ul className="divide-y divide-border">
              {current.map(({ p, l }) => {
                const med = medicines.find((x) => x.id === l.medicineId);
                return (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                    {med && <PillArt medicine={med} size={32} />}
                    <span className="min-w-[220px] flex-1">
                      <span className="block font-semibold">{med?.brand} {l.strength} <span className="font-normal text-muted-foreground">{med?.generic}, {med?.formulation.toLowerCase()}</span></span>
                      <span className="block text-[13px] text-muted-foreground">{lineSummary(l)}{l.instructions ? `. ${l.instructions}` : ""}</span>
                    </span>
                    <button type="button" className="text-[13px] text-primary hover:underline" onClick={() => setRxId(p.id)}>{p.id} v{p.version}</button>
                    <Badge tone={l.trayDecision === "include" ? "teal" : "neutral"}>{l.trayDecision === "include" ? "In tray" : "Original pack"}</Badge>
                    <GuardedButton size="sm" variant="ghost" perm="rx.enter" what="amend medicines" onClick={() => setAmend(p)}><FilePen /> Amend</GuardedButton>
                    <GuardedButton size="sm" variant="ghost" perm="rx.review" what="discontinue medicines" onClick={() => setDiscLine({ rxId: p.id, lineId: l.id, name: `${med?.brand} ${l.strength}` })}><Ban /> Discontinue</GuardedButton>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card>
            <div className="px-5 pt-4 pb-2"><h2 className="font-semibold">Historical medicines</h2><p className="text-[13px] text-muted-foreground">Earlier versions and discontinued prescriptions. Kept, never overwritten.</p></div>
            <ul className="divide-y divide-border">
              {historical.map(({ p, l }) => {
                const med = medicines.find((x) => x.id === l.medicineId);
                return (
                  <li key={`${p.id}-${l.id}`} className="flex flex-wrap items-center gap-3 px-5 py-2.5 opacity-80">
                    {med && <PillArt medicine={med} size={28} />}
                    <span className="min-w-[220px] flex-1"><span className="block font-medium">{med?.brand} {l.strength}</span><span className="block text-[13px] text-muted-foreground">{lineSummary(l)}</span></span>
                    <button type="button" className="text-[13px] text-primary hover:underline" onClick={() => setRxId(p.id)}>{p.id} v{p.version}</button>
                    <RxBadge status={p.status} />
                  </li>
                );
              })}
              {!historical.length && <li className="px-5 py-4 text-[13px] text-muted-foreground">No historical medicines.</li>}
            </ul>
          </Card>
        </TabsContent>

        <TabsContent value="prescriptions" className="pt-2">
          <Card>
            {rx.length === 0 && <EmptyState icon={<ScrollText className="size-5" />} title="No prescriptions yet" action={<GuardedButton perm="rx.enter" what="add prescriptions" onClick={() => navigate(`/prescriptions?new=${patient.id}`)}>Add Prescription</GuardedButton>} />}
            <ul>
              {rx.map((p) => (
                <li key={p.id} className="border-b border-border last:border-0">
                  <button type="button" onClick={() => setRxId(p.id)} className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left hover:bg-accent/50">
                    <span className="min-w-[110px] font-semibold">{p.id} <span className="text-xs font-normal text-muted-foreground">v{p.version}</span></span>
                    <span className="flex -space-x-1">{p.lines.slice(0, 5).map((l) => { const m = medicines.find((x) => x.id === l.medicineId); return m ? <PillArt key={l.id} medicine={m} size={24} /> : null; })}</span>
                    <span className="flex-1 text-[13px] text-muted-foreground">{p.prescriber}, {fmtDate(p.issuedOn)}{p.supersedes ? `. Amends ${p.supersedes}` : ""}</span>
                    <RxBadge status={p.status} />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>

        <TabsContent value="dispensing" className="pt-2">
          <Card>
            {orders.length === 0 && <EmptyState icon={<ShoppingBag className="size-5" />} title="No dispensing orders yet" action={<GuardedButton perm="order.create" what="create orders" onClick={() => navigate(`/dispensing?new=${patient.id}`)}>New dispensing order</GuardedButton>} />}
            <ul className="divide-y divide-border">
              {orders.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => setOrderId(o.id)} className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left hover:bg-accent/50">
                    <span className="rounded-md bg-sidebar px-2 py-0.5 text-sm font-bold text-white">{o.token}</span>
                    <span className="min-w-[110px] font-semibold">{o.id}</span>
                    <span className="flex-1 text-[13px] text-muted-foreground">{o.lines.map((l) => `${medicines.find((m) => m.id === l.medicineId)?.brand} ×${l.qty}`).join(", ")}. {fmtDateTime(o.createdAt)}{o.completedAt ? `. Completed ${fmtDateTime(o.completedAt)}` : ""}</span>
                    <span className="text-[13px]">{rupees(orderCharges(o.lines).total)}</span>
                    <OrderBadge order={o} />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>

        <TabsContent value="mds" className="pt-2">
          <Card>
            {trays.length === 0 && <EmptyState icon={<Grid3x3 className="size-5" />} title="No weekly trays yet" body={onMds ? "Generate a four-week plan to create weekly trays." : "The patient is not on active MDS."} action={onMds ? <Button render={<Link to={`/mds?patient=${patient.id}`} />}>Open four-week planning</Button> : undefined} />}
            <ul>
              {trays.map((t) => {
                const pr = trayProgress(t);
                return (
                  <li key={t.id} className="border-b border-border last:border-0">
                    <Link to={`/trays?tray=${t.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-accent/50">
                      <span className="min-w-[110px] font-semibold">{t.id}</span>
                      <span className="flex-1 text-[13px]">{weekLabel(t.weekStart)}{t.cycleId ? `, ${t.cycleId} week ${t.cycleWeek}` : ""}{t.type === "replacement" ? `, replaces ${t.replacementOf}` : ""}</span>
                      <span className="text-[13px] text-muted-foreground">{pr.prepared} of {pr.total} prepared</span>
                      <TrayBadge status={t.status} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </TabsContent>

        <TabsContent value="counselling" className="pt-2">
          <Card>
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <p className="font-semibold">Pharmacy counselling records</p>
              <GuardedButton size="sm" perm="counselling.record" what="record counselling" onClick={() => setCounselOpen(true)}><Stethoscope /> Add record</GuardedButton>
            </div>
            {counselling.length === 0 && <EmptyState title="No counselling records" body="Records are optional and only kept when relevant." />}
            <ul className="divide-y divide-border">
              {counselling.map((c) => (
                <li key={c.id} className="px-5 py-3 text-[13px]">
                  <p className="font-semibold">{c.id}{c.orderId ? `, linked to ${c.orderId}` : ""} <span className="font-normal text-muted-foreground">{c.by}, {fmtDateTime(c.at)}</span></p>
                  <p>For {c.forWhom === "patient" ? "the patient" : c.forName ?? c.forWhom}. {c.reasonType === "symptoms" ? `Symptoms: ${c.symptoms}${c.duration ? ` for ${c.duration}` : ""}.` : c.reasonType === "repeat" ? "Repeat medicine." : "Advice only."}</p>
                  {c.otherMedicines && <p className="text-muted-foreground">Other medicines: {c.otherMedicines}. Allergies: {c.allergies || "none"}. History: {c.history || "none"}.</p>}
                  <p>Advice: {c.advice}</p>
                  {c.referral && <p className="text-warn">Referral: {c.referralNotes}</p>}
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="pt-2">
          <Card>
            <ul className="divide-y divide-border">
              {patient.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <FileText className="size-5 text-muted-foreground" />
                  <span className="min-w-[200px] flex-1"><span className="block font-medium">{d.title}</span><span className="block text-[13px] text-muted-foreground">{d.kind}, added {fmtDate(d.addedOn)}</span></span>
                  <Badge tone={d.status === "On file" ? "ok" : d.status === "Expired" ? "danger" : "warn"}>{d.status}</Badge>
                </li>
              ))}
              {state.documents.filter((d) => d.patientId === patient.id && d.action !== "previewed").slice(0, 10).map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-[13px]">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="flex-1">{d.type.replace(/-/g, " ")} {d.refId !== patient.id ? `for ${d.refId}` : ""}, version {d.version}</span>
                  <span className="text-muted-foreground">{d.action}, {d.by}, {fmtDateTime(d.at)}</span>
                </li>
              ))}
              {patient.documents.length === 0 && <li className="px-5 py-4 text-[13px] text-muted-foreground">No files on this record.</li>}
            </ul>
            <div className="border-t border-border p-3">
              <Button variant="outline" size="sm" render={<Link to={`/documents?type=current-meds&patient=${patient.id}`} />}><Download /> Generate patient documents</Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="pt-2">
          <Card className="p-5">
            {timeline.length === 0 && <p className="text-[13px] text-muted-foreground">No activity recorded for this patient yet.</p>}
            <ol className="space-y-3 border-l-2 border-border pl-4">
              {timeline.slice(0, 80).map((a) => (
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
      <OrderSheet orderId={orderId} onClose={() => setOrderId(null)} />
      <RxForm open={!!amend} onOpenChange={(o) => !o && setAmend(undefined)} amend={amend} />
      <PatientCardDialog patientId={cardOpen ? patient.id : null} onClose={() => setCardOpen(false)} />
      <CounsellingDialog open={counselOpen} onOpenChange={setCounselOpen} patientId={patient.id} />
      <ConfirmDialog
        open={!!discLine} onOpenChange={(o) => !o && setDiscLine(null)}
        title={`Discontinue ${discLine?.name}?`}
        description="A new verified version of the prescription is created without this medicine. The earlier version is kept, and affected trays are flagged for review."
        reasonLabel="Reason" reasonRequired destructive confirmLabel="Discontinue medicine"
        onConfirm={(note) => { if (discLine) notify(discontinueLine(discLine.rxId, discLine.lineId, note)); setDiscLine(null); }}
      />
    </>
  );
}
