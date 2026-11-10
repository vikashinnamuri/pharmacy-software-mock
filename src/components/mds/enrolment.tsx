import { useEffect, useState } from "react";
import { Ban, CalendarRange, Pause, Pencil, Play, ShieldCheck, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EnrolmentBadge, SuitabilityReviewBadge } from "@/components/common/status-badge";
import { Card, ConfirmDialog, Field, GuardedButton, notify, PERIOD_META, Pick } from "@/components/common/ui";
import { DAY_FULL, fmtDate, fmtDateTime } from "@/lib/dates";
import { periodName } from "@/lib/tray-engine";
import { useAppStore } from "@/store/app-store";
import type { MdsEnrolment, Period } from "@/types";
import { BF_PERIODS } from "@/types";
import { STAFF } from "@/data/staff";

const PHARMACISTS = STAFF.filter((s) => s.role === "pharmacist").map((s) => s.name);

function PeriodPicker({ value, onChange, times, onTimes }: { value: Period[]; onChange: (p: Period[]) => void; times?: Partial<Record<Period, string>>; onTimes?: (t: Partial<Record<Period, string>>) => void }) {
  return (
    <div className="space-y-1.5">
      {BF_PERIODS.map((p) => {
        const on = value.includes(p);
        return (
          <div key={p} className="flex flex-wrap items-center gap-2">
            <Label className="flex min-w-[220px] cursor-pointer items-center gap-2 rounded-md border border-input px-2.5 py-1.5 text-[13px] font-normal">
              <Checkbox checked={on} onCheckedChange={(v) => onChange(v ? [...value, p] : value.filter((x) => x !== p))} />
              <Utensils className="size-3.5 text-primary" /> {PERIOD_META[p].label} (BF)
            </Label>
            {on && onTimes && <Input type="time" className="h-8 w-[120px]" aria-label={`Time for ${PERIOD_META[p].label}`} value={times?.[p] ?? ""} onChange={(e) => onTimes({ ...times, [p]: e.target.value })} />}
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">Before Food is tied to this patient's meal. The standard four periods are always available.</p>
    </div>
  );
}

export function EnrolmentRequestDialog({ open, onOpenChange, patientId }: { open: boolean; onOpenChange: (o: boolean) => void; patientId: string }) {
  const patient = useAppStore((s) => s.patients.find((p) => p.id === patientId));
  const request = useAppStore((s) => s.requestEnrolment);
  const [v, setV] = useState({ responsiblePharmacist: PHARMACISTS[0], prescriber: "", caregiver: "", consent: false, consentBy: "patient" as MdsEnrolment["consentBy"], prepDay: 3, fulfilment: "collection" as MdsEnrolment["fulfilment"], requestedPeriods: [] as Period[], note: "" });
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (open && patient) setV((x) => ({ ...x, prescriber: patient.doctor.name, caregiver: patient.caregiver?.name ?? "", consentBy: patient.caregiver ? "caregiver" : "patient", consent: false, requestedPeriods: [], note: "" })); }, [open, patient]);
  if (!patient) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Register {patient.name} for MDS</DialogTitle>
          <DialogDescription>This requests enrolment. It stays inactive until a pharmacist completes the simulated suitability review.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Responsible pharmacist"><Pick value={v.responsiblePharmacist} onChange={(x) => setV({ ...v, responsiblePharmacist: x })} options={PHARMACISTS.map((p) => ({ value: p, label: p }))} /></Field>
          <Field label="Prescriber"><Input value={v.prescriber} onChange={(e) => setV({ ...v, prescriber: e.target.value })} /></Field>
          <Field label="Caregiver"><Input value={v.caregiver} onChange={(e) => setV({ ...v, caregiver: e.target.value })} placeholder="Optional" /></Field>
          <Field label="Weekly preparation day"><Pick value={String(v.prepDay)} onChange={(x) => setV({ ...v, prepDay: Number(x) })} options={DAY_FULL.map((d, i) => ({ value: String(i), label: d }))} /></Field>
          <Field label="Collection or delivery"><Pick value={v.fulfilment} onChange={(x) => setV({ ...v, fulfilment: x })} options={[{ value: "collection", label: "Collection" }, { value: "delivery", label: "Home delivery" }]} /></Field>
          <Field label="MDS consent given by"><Pick value={v.consentBy} onChange={(x) => setV({ ...v, consentBy: x })} options={[{ value: "patient", label: "Patient" }, { value: "caregiver", label: "Caregiver" }, { value: "representative", label: "Representative" }]} /></Field>
          <Label className="flex items-start gap-2 text-[13px] font-normal sm:col-span-2"><Checkbox checked={v.consent} onCheckedChange={(x) => setV({ ...v, consent: !!x })} className="mt-0.5" /> MDS consent recorded (simulated)</Label>
          <Field label="Extra administration periods requested" className="sm:col-span-2"><PeriodPicker value={v.requestedPeriods} onChange={(p) => setV({ ...v, requestedPeriods: p })} /></Field>
          <Field label="Note for the pharmacist" className="sm:col-span-2"><Textarea rows={2} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <GuardedButton perm="mds.enrol" what="enrol patients" disabled={!v.consent} onClick={() => { if (notify(request({ ...v, patientId }))) onOpenChange(false); }}>Request enrolment</GuardedButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EnrolmentReviewDialog({ enrolment, onClose, mode = "review" }: { enrolment: MdsEnrolment | null; onClose: () => void; mode?: "review" | "periods" }) {
  const patient = useAppStore((s) => s.patients.find((p) => p.id === enrolment?.patientId));
  const prescriptions = useAppStore((s) => s.prescriptions);
  const medicines = useAppStore((s) => s.medicines);
  const review = useAppStore((s) => s.reviewEnrolment);
  const setPeriods = useAppStore((s) => s.setApprovedPeriods);
  const [periods, setP] = useState<Period[]>([]);
  const [times, setT] = useState<Partial<Record<Period, string>>>({});
  const [note, setNote] = useState("");
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!enrolment) return;
    const requested = enrolment.history.map((h) => h.action).join(" ");
    setP(mode === "periods" ? enrolment.approvedPeriods : BF_PERIODS.filter((p) => requested.includes(periodName(p))));
    setT(enrolment.periodTimes);
    setNote("");
  }, [enrolment, mode]);
  /* eslint-enable react-hooks/set-state-in-effect */
  if (!enrolment || !patient) return null;
  const rx = prescriptions.filter((p) => p.patientId === patient.id && (p.status === "verified" || p.status === "pending"));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === "review" ? `Suitability review: ${patient.name}` : `Approved periods: ${patient.name}`}</DialogTitle>
          <DialogDescription>{mode === "review" ? "Simulated pharmacist review. Enrolment is never approved automatically." : "Changing periods flags affected planned weeks and lifts any approval built on them."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-[13px]">
          <div className="rounded-lg bg-muted p-3">
            <p><strong>Conditions:</strong> {patient.conditions.join(", ") || "None recorded"}</p>
            <p><strong>Allergies:</strong> {patient.allergies.join(", ") || "None recorded"}</p>
            <p><strong>Current medicines:</strong> {rx.flatMap((p) => p.lines.map((l) => `${medicines.find((m) => m.id === l.medicineId)?.brand} (${p.status})`)).join(", ") || "None"}</p>
            <p><strong>Consent:</strong> {enrolment.consent ? `Recorded, given by ${enrolment.consentBy}` : "Not recorded"}</p>
          </div>
          <Field label="Approve extra administration periods for this patient"><PeriodPicker value={periods} onChange={setP} times={times} onTimes={setT} /></Field>
          <Field label={mode === "review" ? "Suitability note" : "Reason for the change"}><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "review" ? "Suitable for a weekly tray. Manual dexterity and understanding checked (demo)." : ""} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {mode === "review" ? (
            <>
              <GuardedButton perm="mds.approve" what="complete suitability reviews" variant="destructive" disabled={!note.trim()} onClick={() => { if (notify(review(enrolment.id, "not-suitable", [], {}, note))) onClose(); }}>Not suitable</GuardedButton>
              <GuardedButton perm="mds.approve" what="complete suitability reviews" disabled={!note.trim()} onClick={() => { if (notify(review(enrolment.id, "suitable", periods, times, note))) onClose(); }}><ShieldCheck /> Suitable: activate MDS</GuardedButton>
            </>
          ) : (
            <GuardedButton perm="mds.approve" what="approve periods" disabled={!note.trim()} onClick={() => { if (notify(setPeriods(enrolment.id, periods, times, note))) onClose(); }}>Save periods</GuardedButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDetailsDialog({ enrolment, onClose }: { enrolment: MdsEnrolment | null; onClose: () => void }) {
  const update = useAppStore((s) => s.updateEnrolment);
  const [v, setV] = useState<Partial<MdsEnrolment>>({});
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (enrolment) setV({ responsiblePharmacist: enrolment.responsiblePharmacist, prescriber: enrolment.prescriber, caregiver: enrolment.caregiver ?? "", prepDay: enrolment.prepDay, fulfilment: enrolment.fulfilment }); }, [enrolment]);
  if (!enrolment) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Edit MDS enrolment {enrolment.id}</DialogTitle><DialogDescription>Service details only. Suitability and periods are pharmacist decisions.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <Field label="Responsible pharmacist"><Pick value={v.responsiblePharmacist ?? ""} onChange={(x) => setV({ ...v, responsiblePharmacist: x })} options={PHARMACISTS.map((p) => ({ value: p, label: p }))} /></Field>
          <Field label="Prescriber"><Input value={v.prescriber ?? ""} onChange={(e) => setV({ ...v, prescriber: e.target.value })} /></Field>
          <Field label="Caregiver"><Input value={v.caregiver ?? ""} onChange={(e) => setV({ ...v, caregiver: e.target.value })} /></Field>
          <Field label="Weekly preparation day"><Pick value={String(v.prepDay ?? 3)} onChange={(x) => setV({ ...v, prepDay: Number(x) })} options={DAY_FULL.map((d, i) => ({ value: String(i), label: d }))} /></Field>
          <Field label="Collection or delivery"><Pick value={v.fulfilment ?? "collection"} onChange={(x) => setV({ ...v, fulfilment: x as MdsEnrolment["fulfilment"] })} options={[{ value: "collection", label: "Collection" }, { value: "delivery", label: "Home delivery" }]} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <GuardedButton perm="mds.enrol" what="change enrolments" onClick={() => { if (notify(update(enrolment.id, { ...v, caregiver: v.caregiver || undefined }))) onClose(); }}>Save</GuardedButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The patient's MDS enrolment panel, kept separate from ordinary registration. */
export function EnrolmentPanel({ patientId, onPlan }: { patientId: string; onPlan?: () => void }) {
  const enrolments = useAppStore((s) => s.enrolments);
  const setStatus = useAppStore((s) => s.setEnrolmentStatus);
  const enrolment = enrolments.filter((e) => e.patientId === patientId).sort((a, b) => b.id.localeCompare(a.id))[0];
  const [requestOpen, setRequestOpen] = useState(false);
  const [reviewing, setReviewing] = useState<null | "review" | "periods">(null);
  const [editing, setEditing] = useState(false);
  const [statusTo, setStatusTo] = useState<null | "active" | "suspended" | "discontinued">(null);

  if (!enrolment || enrolment.status === "discontinued" || enrolment.status === "declined") {
    return (
      <Card className="p-5">
        <p className="text-lg font-semibold">Register patient for MDS?</p>
        <p className="mt-1 text-[13px] text-muted-foreground">MDS (Dossett) enrolment is separate from ordinary registration and needs a pharmacist suitability review before it becomes active.</p>
        {enrolment && <p className="mt-2 text-[13px]">Previous enrolment {enrolment.id}: <EnrolmentBadge status={enrolment.status} /> {enrolment.suitabilityNote}</p>}
        <div className="mt-3 flex gap-2">
          <GuardedButton perm="mds.enrol" what="enrol patients" onClick={() => setRequestOpen(true)}>Yes, register for MDS</GuardedButton>
          <Button variant="outline" disabled>No, standard dispensing only</Button>
        </div>
        <EnrolmentRequestDialog open={requestOpen} onOpenChange={setRequestOpen} patientId={patientId} />
      </Card>
    );
  }

  const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm font-medium">{children}</dd></div>;
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">MDS enrolment {enrolment.id} <EnrolmentBadge status={enrolment.status} /></p>
          <p className="text-[13px] text-muted-foreground">Enrolled {fmtDate(enrolment.enrolledOn)}. Responsible pharmacist {enrolment.responsiblePharmacist}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {enrolment.status === "pending-review" && <GuardedButton perm="mds.approve" what="complete suitability reviews" onClick={() => setReviewing("review")}><ShieldCheck /> Suitability review</GuardedButton>}
          {enrolment.status === "active" && onPlan && <Button onClick={onPlan}><CalendarRange /> Four-week planning</Button>}
          <GuardedButton size="sm" variant="outline" perm="mds.enrol" what="change enrolments" onClick={() => setEditing(true)}><Pencil /> Edit details</GuardedButton>
          {enrolment.status === "active" && <GuardedButton size="sm" variant="outline" perm="mds.approve" what="approve periods" onClick={() => setReviewing("periods")}><Utensils /> Periods</GuardedButton>}
          {enrolment.status === "active" && <GuardedButton size="sm" variant="outline" perm="mds.approve" what="suspend MDS" onClick={() => setStatusTo("suspended")}><Pause /> Suspend</GuardedButton>}
          {enrolment.status === "suspended" && <GuardedButton size="sm" variant="outline" perm="mds.approve" what="resume MDS" onClick={() => setStatusTo("active")}><Play /> Resume</GuardedButton>}
          {(enrolment.status === "active" || enrolment.status === "suspended") && <GuardedButton size="sm" variant="outline" perm="mds.approve" what="discontinue MDS" onClick={() => setStatusTo("discontinued")}><Ban /> Discontinue</GuardedButton>}
        </div>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Fact label="Prescriber">{enrolment.prescriber}</Fact>
        <Fact label="Caregiver">{enrolment.caregiver ?? "None"}</Fact>
        <Fact label="MDS consent">{enrolment.consent ? `Yes, by ${enrolment.consentBy}` : "Not recorded"}</Fact>
        <Fact label="Weekly preparation day">{DAY_FULL[enrolment.prepDay]}</Fact>
        <Fact label="Collection or delivery">{enrolment.fulfilment === "delivery" ? "Home delivery" : "Collection"}</Fact>
        <Fact label="Suitability assessment"><SuitabilityReviewBadge status={enrolment.suitability} /></Fact>
        <Fact label="Reviewed">{enrolment.reviewedBy ? `${enrolment.reviewedBy}, ${fmtDateTime(enrolment.reviewedAt)}` : "Waiting for pharmacist"}</Fact>
        <Fact label="Administration periods">{["Morning, Lunchtime, Evening, Bedtime", ...enrolment.approvedPeriods.map((p) => `${periodName(p)}${enrolment.periodTimes[p] ? ` (${enrolment.periodTimes[p]})` : ""}`)].join(", ")}</Fact>
      </dl>
      {enrolment.suitabilityNote && <p className="mt-3 rounded-lg bg-muted p-3 text-[13px]"><strong>Suitability note:</strong> {enrolment.suitabilityNote}</p>}
      <details className="mt-3 text-[13px]">
        <summary className="cursor-pointer font-medium">Enrolment history ({enrolment.history.length})</summary>
        <ol className="mt-2 space-y-1.5 border-l-2 border-border pl-3">
          {[...enrolment.history].reverse().map((h, i) => <li key={i}>{h.action}{h.note ? `. ${h.note}` : ""} <span className="text-xs text-muted-foreground">{h.by}, {fmtDateTime(h.at)}</span></li>)}
        </ol>
      </details>
      {reviewing && <EnrolmentReviewDialog enrolment={enrolment} mode={reviewing} onClose={() => setReviewing(null)} />}
      {editing && <EditDetailsDialog enrolment={enrolment} onClose={() => setEditing(false)} />}
      <ConfirmDialog open={!!statusTo} onOpenChange={(o) => !o && setStatusTo(null)} title={statusTo === "active" ? "Resume MDS service?" : statusTo === "suspended" ? "Suspend MDS service?" : "Discontinue MDS service?"} description="The change is recorded in the enrolment history." reasonLabel="Reason" reasonRequired destructive={statusTo === "discontinued"} confirmLabel="Confirm" onConfirm={(note) => { if (statusTo) notify(setStatus(enrolment.id, statusTo, note)); setStatusTo(null); }} />
    </Card>
  );
}
