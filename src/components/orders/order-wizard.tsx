import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, FilePlus2, Plus, Stethoscope, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MedicineCombobox } from "@/components/common/medicine-combobox";
import { PatientFinderPanel } from "@/components/common/patient-finder";
import { PillArt } from "@/components/common/pill-art";
import { Badge, RxBadge } from "@/components/common/status-badge";
import { Field, GuardedButton, notify, Pick } from "@/components/common/ui";
import { blankCounselling, CounsellingFields } from "@/components/forms/counselling-form";
import { PatientForm } from "@/components/forms/patient-form";
import { RxForm } from "@/components/forms/rx-form";
import { lineSummary } from "@/components/tray/rx-detail-dialog";
import { fmtDate } from "@/lib/dates";
import { orderCharges } from "@/lib/orders";
import { rupees, stockByMedicine } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { CounsellingInput } from "@/store/orders";
import type { Order } from "@/types";

type Source = "prescription" | "request";
interface Line { key: string; medicineId: string; qty: number; rxLineId?: string; instructions?: string; selected: boolean }

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function NewOrderDialog({ open, onOpenChange, presetPatientId, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; presetPatientId?: string; onCreated: (id: string) => void }) {
  const state = useAppStore();
  const { patients, prescriptions, medicines, settings, createOrder, batches, trays, orders } = state;
  const [step, setStep] = useState(1);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [confirmMethod, setConfirmMethod] = useState("");
  const [source, setSource] = useState<Source>("prescription");
  const [rxId, setRxId] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([]);
  const [fulfilment, setFulfilment] = useState<Order["fulfilment"]>("collection");
  const [address, setAddress] = useState("");
  const [ready, setReady] = useState("");
  const [notes, setNotes] = useState("");
  const [withCounselling, setWithCounselling] = useState(false);
  const [counselling, setCounselling] = useState<CounsellingInput>(blankCounselling());
  const [regOpen, setRegOpen] = useState(false);
  const [rxOpen, setRxOpen] = useState(false);

  const patient = patients.find((p) => p.id === patientId);
  const stock = useMemo(() => stockByMedicine({ batches, trays, orders }), [batches, trays, orders]);
  const patientRx = useMemo(() => prescriptions.filter((p) => p.patientId === patientId && (p.status === "verified" || p.status === "pending")).sort((a, b) => b.issuedOn.localeCompare(a.issuedOn)), [prescriptions, patientId]);
  const history = useMemo(() => prescriptions.filter((p) => p.patientId === patientId && (p.status === "discontinued" || p.status === "rejected")), [prescriptions, patientId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setStep(1); setPatientId(null); setConfirmMethod(""); setSource("prescription"); setRxId(""); setLines([]); setFulfilment("collection");
    setNotes(""); setWithCounselling(false); setReady(toLocalInput(new Date(Date.now() + settings.tokenPrepMinutes * 60_000).toISOString()));
    if (presetPatientId) setPatientId(presetPatientId);
  }, [open, presetPatientId, settings.tokenPrepMinutes]);
  useEffect(() => { if (patient) { setAddress(patient.address); setCounselling(blankCounselling(patient.id, patient.allergies.join(", ") || "None known")); } }, [patient]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const pickRx = (id: string) => {
    setRxId(id);
    const rx = prescriptions.find((p) => p.id === id);
    setLines((rx?.lines ?? []).map((l) => ({ key: l.id, medicineId: l.medicineId, qty: l.quantity ?? (l.unitsPerDose ?? 1) * Math.max(1, l.times.length) * 28, rxLineId: l.id, instructions: l.instructions, selected: true })));
  };
  const chosen = lines.filter((l) => l.selected && l.medicineId && l.qty > 0);
  const charges = orderCharges(chosen.map((l) => ({ qty: l.qty, unitPrice: medicines.find((m) => m.id === l.medicineId)?.unitPrice ?? 0, gstRate: settings.defaultGstRate })));
  const deliveryFee = fulfilment === "delivery" ? settings.deliveryFee * (1 + settings.serviceGstRate / 100) : 0;

  const create = (submit: boolean) => {
    if (!patient) return;
    const r = createOrder({
      patientId: patient.id, prescriptionId: source === "prescription" ? rxId : undefined, source,
      lines: chosen.map((l) => ({ medicineId: l.medicineId, qty: l.qty, rxLineId: l.rxLineId, instructions: l.instructions })),
      fulfilment, deliveryAddress: address, estimatedReady: ready ? new Date(ready).toISOString() : undefined, confirmMethod, submit, notes: notes || undefined,
      counselling: withCounselling ? counselling : undefined,
    });
    if (notify(r) && r.id) { onOpenChange(false); onCreated(r.id); }
  };

  const canNext = step === 1 ? !!patient && !!confirmMethod : step === 2 ? chosen.length > 0 && (source === "request" || !!rxId) && (!withCounselling || counselling.advice.trim().length > 0) : true;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>New dispensing order</DialogTitle>
            <DialogDescription>Step {step} of 3: {step === 1 ? "find and confirm the patient" : step === 2 ? "choose the medicines" : "fulfilment and review"}. A token is issued when the order is created.</DialogDescription>
          </DialogHeader>
          <ol className="flex gap-1" aria-label="Progress">
            {["Patient", "Medicines", "Fulfilment"].map((s, i) => (
              <li key={s} className={cn("h-1.5 flex-1 rounded-full", i < step ? "bg-primary" : "bg-muted")} aria-label={`${s}${i < step ? ", done or current" : ""}`} />
            ))}
          </ol>

          {step === 1 && (
            <div className="space-y-3">
              {patient && confirmMethod ? (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-accent/40 p-3 text-[13px]">
                  <Check className="size-4 text-primary" />
                  <span className="flex-1"><strong>{patient.name}</strong> ({patient.id}) confirmed: {confirmMethod}.</span>
                  <Button size="sm" variant="ghost" onClick={() => { setConfirmMethod(""); setPatientId(null); }}>Change</Button>
                </div>
              ) : (
                <>
                  {patient ? (
                    <PatientFinderPanelPreset key={patient.id} patientId={patient.id} onConfirm={(id, m) => { setPatientId(id); setConfirmMethod(m); }} />
                  ) : (
                    <PatientFinderPanel onConfirm={(id, m) => { setPatientId(id); setConfirmMethod(m); }} confirmLabel="Confirm and continue" />
                  )}
                  <div className="flex items-center gap-2 border-t border-border pt-3 text-[13px] text-muted-foreground">
                    Not registered yet?
                    <GuardedButton size="sm" variant="outline" perm="patient.edit" what="register patients" onClick={() => setRegOpen(true)}><UserPlus /> Register new patient</GuardedButton>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 2 && patient && (
            <div className="space-y-3">
              {patient.allergies.length > 0 && <p className="flex items-center gap-1.5 rounded-lg bg-danger-bg px-3 py-2 text-[13px] font-semibold text-danger"><AlertTriangle className="size-4" /> Allergy on record: {patient.allergies.join(", ")}</p>}
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Order source">
                {([["prescription", "From a prescription", "Verified or pending script"], ["request", "Medication request", "No prescription, pharmacist still reviews"]] as const).map(([v, t, d]) => (
                  <button key={v} type="button" role="radio" aria-checked={source === v} onClick={() => { setSource(v); setLines([]); setRxId(""); if (v === "request") setWithCounselling(true); }}
                    className={cn("rounded-lg border p-3 text-left", source === v ? "border-primary bg-accent" : "border-input hover:bg-muted")}>
                    <span className="block text-sm font-semibold">{t}</span><span className="block text-xs text-muted-foreground">{d}</span>
                  </button>
                ))}
              </div>

              {source === "prescription" && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-end gap-2">
                    <Field label="Prescription" className="min-w-[240px] flex-1">
                      <Pick value={rxId} onChange={pickRx} placeholder={patientRx.length ? "Choose a prescription" : "No verified or pending prescription"} options={patientRx.map((p) => ({ value: p.id, label: `${p.id} v${p.version}, ${fmtDate(p.issuedOn)}, ${p.status === "pending" ? "pending review" : "verified"}` }))} />
                    </Field>
                    <GuardedButton variant="outline" perm="rx.enter" what="enter prescriptions" onClick={() => setRxOpen(true)}><FilePlus2 /> Enter new prescription</GuardedButton>
                  </div>
                  {rxId && prescriptions.find((p) => p.id === rxId)?.status === "pending" && <p className="text-[13px] text-warn">This prescription is pending. The pharmacist verifies it during the order review.</p>}
                  {rxId && (
                    <div className="rounded-lg border border-border">
                      <p className="border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground">Authorised for this transaction <RxBadge status={prescriptions.find((p) => p.id === rxId)!.status} /></p>
                      <ul className="divide-y divide-border">
                        {lines.map((l, i) => {
                          const med = medicines.find((m) => m.id === l.medicineId);
                          const rxLine = prescriptions.find((p) => p.id === rxId)?.lines.find((x) => x.id === l.rxLineId);
                          const free = stock[l.medicineId]?.free ?? 0;
                          return (
                            <li key={l.key} className="flex flex-wrap items-center gap-3 px-3 py-2">
                              <Checkbox checked={l.selected} onCheckedChange={(v) => setLines((ls) => ls.map((x, n) => (n === i ? { ...x, selected: !!v } : x)))} aria-label={`Include ${med?.brand}`} />
                              {med && <PillArt medicine={med} size={26} />}
                              <span className="min-w-[180px] flex-1 text-[13px]"><strong>{med?.brand} {med?.strength}</strong><span className="block text-muted-foreground">{rxLine && lineSummary(rxLine)}</span></span>
                              <Input type="number" min={1} className="h-8 w-20" value={l.qty} aria-label={`Quantity of ${med?.brand}`} onChange={(e) => setLines((ls) => ls.map((x, n) => (n === i ? { ...x, qty: Number(e.target.value) } : x)))} />
                              <Badge tone={free >= l.qty ? "ok" : "danger"}>{free} free</Badge>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  {history.length > 0 && (
                    <details className="rounded-lg border border-border px-3 py-2 text-[13px]">
                      <summary className="cursor-pointer font-medium">Medication history (not authorised for this order)</summary>
                      <ul className="mt-2 space-y-1 text-muted-foreground">
                        {history.flatMap((p) => p.lines.map((l) => <li key={l.id}>{medicines.find((m) => m.id === l.medicineId)?.brand} {l.strength}, {p.id} ({p.status})</li>))}
                      </ul>
                    </details>
                  )}
                </div>
              )}

              {source === "request" && (
                <div className="space-y-2">
                  {lines.map((l, i) => {
                    const free = stock[l.medicineId]?.free ?? 0;
                    return (
                      <div key={l.key} className="grid items-end gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_90px_1fr_auto]">
                        <Field label="Medicine"><MedicineCombobox value={l.medicineId} onChange={(v) => setLines((ls) => ls.map((x, n) => (n === i ? { ...x, medicineId: v } : x)))} /></Field>
                        <Field label="Quantity"><Input type="number" min={1} value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, n) => (n === i ? { ...x, qty: Number(e.target.value) } : x)))} /></Field>
                        <Field label="Directions"><Input value={l.instructions ?? ""} onChange={(e) => setLines((ls) => ls.map((x, n) => (n === i ? { ...x, instructions: e.target.value } : x)))} placeholder="As directed on the pack" /></Field>
                        <div className="flex items-center gap-1 pb-1">{l.medicineId && <Badge tone={free >= l.qty ? "ok" : "danger"}>{free} free</Badge>}<Button size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}><Trash2 /></Button></div>
                      </div>
                    );
                  })}
                  <Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, { key: `L${Date.now()}`, medicineId: "", qty: 10, selected: true }])}><Plus /> Add medicine</Button>
                </div>
              )}

              <div className="rounded-lg border border-border p-3">
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 font-medium"><Stethoscope className="size-4 text-primary" /> Record a counselling interaction</span>
                  <Switch checked={withCounselling} onCheckedChange={setWithCounselling} />
                </label>
                <p className="mt-0.5 text-xs text-muted-foreground">Optional. Useful for symptom-based requests. Not required for every purchase.</p>
                {withCounselling && <div className="mt-3"><CounsellingFields value={counselling} onChange={setCounselling} /></div>}
              </div>
            </div>
          )}

          {step === 3 && patient && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Fulfilment">
                {(["collection", "delivery"] as const).map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={fulfilment === v} onClick={() => setFulfilment(v)} className={cn("rounded-lg border p-3 text-left", fulfilment === v ? "border-primary bg-accent" : "border-input hover:bg-muted")}>
                    <span className="block text-sm font-semibold">{v === "collection" ? "Collection at the counter" : "Home delivery"}</span>
                    <span className="block text-xs text-muted-foreground">{v === "collection" ? "Token shown on the collection screen" : `Delivery fee ${rupees(settings.deliveryFee)} plus GST`}</span>
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={fulfilment === "delivery" ? "Estimated dispatch" : "Estimated ready time"}><Input type="datetime-local" value={ready} onChange={(e) => setReady(e.target.value)} /></Field>
                {fulfilment === "delivery" && <Field label="Delivery address"><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>}
                <Field label="Order notes" className="sm:col-span-2"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
              </div>
              <div className="rounded-lg border border-border">
                <p className="border-b border-border px-3 py-2 text-[13px] font-semibold">Summary for {patient.name}</p>
                <ul className="divide-y divide-border text-[13px]">
                  {chosen.map((l) => { const m = medicines.find((x) => x.id === l.medicineId); return <li key={l.key} className="flex justify-between px-3 py-1.5"><span>{m?.brand} {m?.strength} × {l.qty}</span><span>{rupees(l.qty * (m?.unitPrice ?? 0))}</span></li>; })}
                </ul>
                <dl className="space-y-0.5 border-t border-border px-3 py-2 text-[13px]">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Medicines plus GST (estimate)</dt><dd>{rupees(charges.total)}</dd></div>
                  {fulfilment === "delivery" && <div className="flex justify-between"><dt className="text-muted-foreground">Delivery (estimate)</dt><dd>{rupees(deliveryFee)}</dd></div>}
                  <div className="flex justify-between font-bold"><dt>Estimated total</dt><dd>{rupees(charges.total + deliveryFee)}</dd></div>
                </dl>
                <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">Stock is checked and charges are confirmed at pharmacist review. Payment is taken after review and before preparation.</p>
              </div>
            </div>
          )}

          <DialogFooter className="sm:items-center">
            {step > 1 && <Button variant="ghost" className="mr-auto" onClick={() => setStep(step - 1)}><ArrowLeft /> Back</Button>}
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            {step < 3 ? (
              <Button disabled={!canNext} onClick={() => setStep(step + 1)}>Next <ArrowRight /></Button>
            ) : (
              <>
                <GuardedButton variant="secondary" perm="order.create" what="create orders" onClick={() => create(false)}>Save as new order</GuardedButton>
                <GuardedButton perm="order.create" what="create orders" onClick={() => create(true)}><Check /> Create order and submit for review</GuardedButton>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PatientForm open={regOpen} onOpenChange={setRegOpen} onSaved={(id) => { setPatientId(id); setConfirmMethod(""); }} />
      {patient && <RxForm open={rxOpen} onOpenChange={setRxOpen} patientId={patient.id} onSaved={(id) => { setSource("prescription"); pickRx(id); }} />}
    </>
  );
}

/** Confirmation step for a patient chosen before the wizard opened. */
function PatientFinderPanelPreset({ patientId, onConfirm }: { patientId: string; onConfirm: (id: string, method: string) => void }) {
  const patient = useAppStore((s) => s.patients.find((p) => p.id === patientId));
  const [method, setMethod] = useState("Name and date of birth confirmed verbally");
  const [ok, setOk] = useState(false);
  if (!patient) return null;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/40 bg-accent/40 p-3">
        <p className="font-bold">{patient.name}</p>
        <p className="text-[13px] text-muted-foreground">{patient.id}. Born {fmtDate(patient.dob)}. {patient.phone}</p>
        {patient.allergies.length > 0 && <p className="mt-1 text-[13px] font-semibold text-danger">Allergy: {patient.allergies.join(", ")}</p>}
      </div>
      <Field label="How was the patient's identity confirmed?">
        <Pick value={method} onChange={setMethod} options={["Name and date of birth confirmed verbally", "Patient QR card scanned", "Photo ID checked", "Authorised representative confirmed"].map((m) => ({ value: m, label: m }))} />
      </Field>
      <Label className="flex items-start gap-2 rounded-lg border border-border p-3 text-[13px] font-normal"><Checkbox checked={ok} onCheckedChange={(v) => setOk(!!v)} className="mt-0.5" /> I have confirmed this is the right patient before dispensing.</Label>
      <Button disabled={!ok} onClick={() => onConfirm(patient.id, method)}><Check /> Confirm and continue</Button>
    </div>
  );
}
