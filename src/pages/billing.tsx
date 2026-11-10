import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Ban, CalendarSync, CheckCircle2, Download, FilePlus2, Pause, Play, Plus, Receipt, Scale, Trash2, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/common/data-table";
import { InvoiceBadge, SubBadge } from "@/components/common/status-badge";
import { Card, ClinicalNotice, ConfirmDialog, Field, GuardedButton, notify, PageHeader, Pick, SearchInput, Stat, TextLink } from "@/components/common/ui";
import { addDays, fmtDate, fmtDateTime, today } from "@/lib/dates";
import { invoicePdf } from "@/lib/pdf/documents";
import { invoiceTotals, rupees } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { Invoice, InvoiceStatus, PaymentMethod, Subscription } from "@/types";

const lineSchema = z.object({
  kind: z.enum(["product", "service"]),
  source: z.string(),
  description: z.string().trim().min(2, "Describe the item"),
  qty: z.number({ error: "Enter a number" }).min(1, "At least 1"),
  unitPrice: z.number({ error: "Enter a number" }).min(0, "Cannot be negative"),
  discount: z.number({ error: "Enter a number" }).min(0, "Cannot be negative"),
  gstRate: z.number({ error: "Enter a number" }).min(0, "Cannot be negative").max(100, "Check this rate"),
}).refine((l) => l.discount <= l.qty * l.unitPrice, { path: ["discount"], message: "Discount is more than the line" });
const schema = z.object({
  patientId: z.string().min(1, "Choose a patient"),
  status: z.enum(["draft", "issued"]),
  ownMedicines: z.boolean(),
  lines: z.array(lineSchema).min(1, "Add at least one item"),
}).refine((v) => !(v.ownMedicines && v.lines.some((l) => l.kind === "product")), { path: ["ownMedicines"], message: "Remove medicine charges, or untick the declaration" });
type Values = z.infer<typeof schema>;
const METHODS: PaymentMethod[] = ["UPI", "Cash", "Card", "Bank transfer"];

function InvoiceForm({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const patients = useAppStore((s) => s.patients);
  const medicines = useAppStore((s) => s.medicines);
  const settings = useAppStore((s) => s.settings);
  const saveInvoice = useAppStore((s) => s.saveInvoice);
  const SERVICES = useMemo(() => [
    { id: "svc-week", label: "MDS weekly service", price: settings.mdsWeeklyFee },
    { id: "svc-month", label: "MDS monthly service", price: Math.round(settings.mdsWeeklyFee * 3.4) },
    { id: "svc-delivery", label: "Home delivery", price: settings.deliveryFee },
    { id: "svc-replace", label: "Replacement tray", price: 150 },
    { id: "svc-review", label: "Medication review (service)", price: 250 },
  ], [settings.mdsWeeklyFee, settings.deliveryFee]);
  const blank = (kind: "product" | "service") => ({ kind, source: "", description: "", qty: 1, unitPrice: 0, discount: 0, gstRate: kind === "service" ? settings.serviceGstRate : settings.defaultGstRate });
  const defaults = useMemo<Values>(() => ({ patientId: "", status: "issued", ownMedicines: false, lines: [blank("service")] }), [settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const { register, control, handleSubmit, reset, setValue, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const lines = useWatch({ control, name: "lines" });
  const own = useWatch({ control, name: "ownMedicines" });
  useEffect(() => { if (open) reset(defaults); }, [open, reset, defaults]);

  const totals = invoiceTotals({ lines: (lines ?? []).map((l, i) => ({ id: String(i), description: l.description, kind: l.kind, qty: Number(l.qty) || 0, unitPrice: Number(l.unitPrice) || 0, discount: Number(l.discount) || 0, gstRate: Number(l.gstRate) || 0 })) });

  const pickSource = (i: number, id: string) => {
    setValue(`lines.${i}.source`, id);
    const s = SERVICES.find((x) => x.id === id);
    if (s) { setValue(`lines.${i}.description`, s.label, { shouldValidate: true }); setValue(`lines.${i}.unitPrice`, s.price); return; }
    const m = medicines.find((x) => x.id === id);
    if (m) { setValue(`lines.${i}.description`, `${m.brand} ${m.strength}`, { shouldValidate: true }); setValue(`lines.${i}.unitPrice`, m.unitPrice); }
  };

  const submit = (v: Values) => {
    const r = saveInvoice({
      patientId: v.patientId, issuedOn: today(), dueOn: addDays(today(), 14), status: v.status, ownMedicinesDeclared: v.ownMedicines || undefined,
      notes: v.ownMedicines ? "Patient declared medicines already lawfully obtained. Service charge only. Pharmacist checks still apply." : undefined,
      lines: v.lines.map((l, i) => ({ id: `IL-new-${Date.now()}-${i}`, description: l.description, kind: l.kind, medicineId: l.kind === "product" ? l.source || undefined : undefined, qty: l.qty, unitPrice: l.unitPrice, discount: l.discount || undefined, gstRate: l.gstRate })),
    });
    if (notify(r)) onOpenChange(false);
  };

  const section = (kind: "product" | "service", title: string) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between"><p className="text-[13px] font-semibold text-primary">{title}</p><Button type="button" variant="outline" size="xs" disabled={kind === "product" && own} onClick={() => append(blank(kind))}><Plus /> Add</Button></div>
      {fields.map((f, i) => (lines?.[i]?.kind !== kind ? null : (
        <div key={f.id} className="grid items-start gap-2 rounded-lg border border-border p-3 sm:grid-cols-12">
          <Field label={kind === "product" ? "Medicine" : "Service"} className="sm:col-span-4"><Pick value={lines?.[i]?.source} placeholder="Choose, or type below" onChange={(v) => pickSource(i, v)} options={kind === "product" ? medicines.map((m) => ({ value: m.id, label: `${m.brand} ${m.strength}` })) : SERVICES.map((s) => ({ value: s.id, label: s.label }))} /></Field>
          <Field label="Description" error={errors.lines?.[i]?.description?.message} className="sm:col-span-8"><Input {...register(`lines.${i}.description`)} /></Field>
          <Field label="Qty" error={errors.lines?.[i]?.qty?.message} className="sm:col-span-2"><Input type="number" {...register(`lines.${i}.qty`, { valueAsNumber: true })} /></Field>
          <Field label="Unit price (₹)" error={errors.lines?.[i]?.unitPrice?.message} className="sm:col-span-3"><Input type="number" step="0.1" {...register(`lines.${i}.unitPrice`, { valueAsNumber: true })} /></Field>
          <Field label="Discount (₹)" error={errors.lines?.[i]?.discount?.message} className="sm:col-span-2"><Input type="number" step="0.1" {...register(`lines.${i}.discount`, { valueAsNumber: true })} /></Field>
          <Field label="GST %" error={errors.lines?.[i]?.gstRate?.message} className="sm:col-span-2"><Input type="number" {...register(`lines.${i}.gstRate`, { valueAsNumber: true })} /></Field>
          <div className="flex items-end justify-between gap-2 self-end sm:col-span-3">
            <p className="pb-1.5 text-[13px] font-semibold">{rupees(((Number(lines?.[i]?.qty) || 0) * (Number(lines?.[i]?.unitPrice) || 0) - (Number(lines?.[i]?.discount) || 0)) * (1 + (Number(lines?.[i]?.gstRate) || 0) / 100))}</p>
            {fields.length > 1 && <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove item ${i + 1}`} onClick={() => remove(i)}><Trash2 /></Button>}
          </div>
        </div>
      )))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create sample invoice</DialogTitle>
          <DialogDescription>Medicine and service charges are kept apart. GST rates are configurable samples. No tax document is created and no payment is taken.</DialogDescription>
        </DialogHeader>
        <form id="invoice-form" className="space-y-4" onSubmit={handleSubmit(submit)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Patient" error={errors.patientId?.message}>
              <Controller control={control} name="patientId" render={({ field }) => <Pick value={field.value} onChange={field.onChange} placeholder="Select patient" options={patients.map((p) => ({ value: p.id, label: `${p.name} (${p.id})` }))} />} />
            </Field>
            <Field label="Save as">
              <Controller control={control} name="status" render={({ field }) => <Pick value={field.value} onChange={field.onChange} options={[{ value: "issued", label: "Issued" }, { value: "draft", label: "Draft" }]} />} />
            </Field>
          </div>
          <Controller control={control} name="ownMedicines" render={({ field }) => (
            <div className="rounded-lg border border-border p-3">
              <Label className="flex items-start gap-2 text-[13px] font-normal"><Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} className="mt-0.5" /> The patient has already lawfully purchased or obtained their medicines and is requesting the medication-management service only.</Label>
              {field.value && <p className="mt-2 text-xs text-warn">Accounting distinction only. It does not bypass pharmacist checks or imply regulatory authorisation for repackaging.</p>}
              {errors.ownMedicines && <p className="mt-1 text-xs text-danger">{errors.ownMedicines.message}</p>}
            </div>
          )} />
          {section("product", "A. Medicine charges")}
          {section("service", "B. MDS and service charges")}
          <dl className="ml-auto w-[280px] space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Medicine charges</dt><dd>{rupees(totals.medicine)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Service charges</dt><dd>{rupees(totals.service)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Discounts</dt><dd>- {rupees(totals.discount)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">CGST + SGST (sample)</dt><dd>{rupees(totals.gst)}</dd></div>
            <div className="flex justify-between border-t border-border pt-1 font-bold"><dt>Total</dt><dd>{rupees(totals.total)}</dd></div>
          </dl>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="invoice-form">Create invoice</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceView({ id, onClose }: { id: string | null; onClose: () => void }) {
  const state = useAppStore();
  const inv = state.invoices.find((i) => i.id === id);
  const patient = state.patients.find((p) => p.id === inv?.patientId);
  const [mode, setMode] = useState<null | "pay" | "refund" | "adjust">(null);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("UPI");
  const [note, setNote] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  if (!inv) return <Dialog open={false} />;
  const t = invoiceTotals(inv);
  const download = () => {
    invoicePdf(useAppStore.getState(), inv).save(`Sample-Invoice-${inv.id}-DEMO.pdf`);
    state.logDocument("invoice", `Sample invoice ${inv.id}`, "downloaded", inv.patientId, inv.id);
  };
  const open = (m: "pay" | "refund" | "adjust") => { setMode(m); setNote(""); setAmount(m === "pay" ? t.balance : m === "refund" ? t.paid - t.refunded : 0); };
  const confirm = () => {
    const r = mode === "pay" ? state.recordInvoicePayment(inv.id, amount, method, note) : mode === "refund" ? state.recordRefund(inv.id, amount, note) : state.recordAdjustment(inv.id, amount, note);
    if (notify(r)) setMode(null);
  };
  const rows = (kind: "product" | "service") => inv.lines.filter((l) => l.kind === kind);
  return (
    <Dialog open={!!id} onOpenChange={(o) => { if (!o) { setMode(null); onClose(); } }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{inv.id} <InvoiceBadge status={inv.status} /></DialogTitle>
          <DialogDescription>
            {patient?.name}. Issued {fmtDate(inv.issuedOn)}, due {fmtDate(inv.dueOn)}. A sample only, not a tax invoice.
            {inv.orderId && <> Order <TextLink href={`/dispensing?order=${inv.orderId}`}>{inv.orderId}</TextLink>.</>}
            {inv.trayId && <> Tray <TextLink href={`/trays?tray=${inv.trayId}`}>{inv.trayId}</TextLink>{inv.cycleId ? ` (${inv.cycleId})` : ""}.</>}
          </DialogDescription>
        </DialogHeader>
        {inv.ownMedicinesDeclared && <p className="rounded-lg bg-warn-bg p-2.5 text-[13px] text-warn">Own medicines declared: service charge only. An accounting distinction. Pharmacist checks still apply.</p>}
        {(["product", "service"] as const).map((kind) => rows(kind).length > 0 && (
          <div key={kind}>
            <p className="mb-1 text-[13px] font-semibold text-primary">{kind === "product" ? "A. Medicine charges" : "B. MDS and service charges"}</p>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-[13px] text-muted-foreground"><th className="py-1.5 font-semibold">Item</th><th className="font-semibold">Qty</th><th className="font-semibold">Price</th><th className="font-semibold">Disc.</th><th className="font-semibold">GST</th><th className="text-right font-semibold">Total</th></tr></thead>
              <tbody>
                {rows(kind).map((l) => {
                  const net = l.qty * l.unitPrice - (l.discount ?? 0);
                  return <tr key={l.id} className="border-b border-border/60"><td className="py-1.5">{l.description}</td><td>{l.qty}</td><td>{rupees(l.unitPrice)}</td><td>{l.discount ? rupees(l.discount) : ""}</td><td>{l.gstRate}%</td><td className="text-right">{rupees(net * (1 + l.gstRate / 100))}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        ))}
        <dl className="ml-auto w-[260px] space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Medicine charges</dt><dd>{rupees(t.medicine)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Service charges</dt><dd>{rupees(t.service)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">of which GST</dt><dd>{rupees(t.gst)}</dd></div>
          <div className="flex justify-between border-t border-border pt-1 font-bold"><dt>Total</dt><dd>{rupees(t.total)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Paid</dt><dd>{rupees(t.paid)}</dd></div>
          {t.refunded > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Refunded</dt><dd>{rupees(t.refunded)}</dd></div>}
          {t.adjusted !== 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Adjustments</dt><dd>{rupees(t.adjusted)}</dd></div>}
          <div className="flex justify-between font-semibold"><dt>Balance</dt><dd className={t.balance > 0 ? "text-warn" : "text-ok"}>{rupees(t.balance)}</dd></div>
        </dl>
        {(inv.payments?.length ?? 0) > 0 && (
          <div>
            <p className="mb-1 text-[13px] font-semibold">Payment history</p>
            <ul className="space-y-1 text-[13px]">
              {inv.payments!.map((p) => <li key={p.id} className="flex justify-between gap-2 rounded-md bg-muted px-2.5 py-1.5"><span className="capitalize">{p.kind}{p.method ? `, ${p.method}` : ""}{p.note ? `. ${p.note}` : ""}</span><span className={cn("font-medium", p.amount < 0 && "text-danger")}>{rupees(p.amount)} <span className="font-normal text-muted-foreground">{fmtDateTime(p.at)}</span></span></li>)}
            </ul>
          </div>
        )}
        {mode && (
          <div className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-3">
            <Field label={mode === "adjust" ? "Amount (₹, negative for a credit)" : "Amount (₹)"}><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
            {mode === "pay" && <Field label="Method"><Pick value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m, label: m }))} /></Field>}
            <Field label={mode === "pay" ? "Note (optional)" : "Reason"} className={mode === "pay" ? "" : "sm:col-span-2"}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <div className="flex gap-2 sm:col-span-3">
              <Button size="sm" onClick={confirm}>{mode === "pay" ? "Record simulated payment" : mode === "refund" ? "Record simulated refund" : "Record adjustment"}</Button>
              <Button size="sm" variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
            </div>
          </div>
        )}
        <DialogFooter className="flex-wrap">
          {inv.status === "draft" && <GuardedButton perm="billing.edit" what="change invoices" variant="outline" onClick={() => notify(state.setInvoiceStatus(inv.id, "issued"))}>Issue invoice</GuardedButton>}
          {t.balance > 0 && !["draft", "cancelled", "refunded"].includes(inv.status) && <GuardedButton perm="order.payment" what="record payments" variant="outline" onClick={() => open("pay")}><CheckCircle2 /> Record payment</GuardedButton>}
          {t.paid - t.refunded > 0 && <GuardedButton perm="billing.edit" what="record refunds" variant="outline" onClick={() => open("refund")}><Undo2 /> Refund</GuardedButton>}
          {!["cancelled", "refunded"].includes(inv.status) && <GuardedButton perm="billing.edit" what="adjust invoices" variant="outline" onClick={() => open("adjust")}><Scale /> Adjustment</GuardedButton>}
          {t.paid === 0 && !["cancelled", "paid", "refunded"].includes(inv.status) && !inv.orderId && <GuardedButton perm="billing.edit" what="cancel invoices" variant="ghost" onClick={() => setCancelOpen(true)}><Ban /> Cancel</GuardedButton>}
          <Button onClick={download}><Download /> Invoice preview (PDF)</Button>
        </DialogFooter>
        <ConfirmDialog open={cancelOpen} onOpenChange={setCancelOpen} title={`Cancel ${inv.id}?`} description="Nothing has been paid on this invoice." confirmLabel="Cancel invoice" destructive onConfirm={() => notify(state.setInvoiceStatus(inv.id, "cancelled"))} />
      </DialogContent>
    </Dialog>
  );
}

function NewSubscription({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const patients = useAppStore((s) => s.patients);
  const subs = useAppStore((s) => s.subscriptions);
  const enrolments = useAppStore((s) => s.enrolments);
  const save = useAppStore((s) => s.saveSubscription);
  const fee = useAppStore((s) => s.settings.mdsWeeklyFee);
  const [patientId, setPatientId] = useState("");
  const [plan, setPlan] = useState<Subscription["plan"]>("weekly");
  const eligible = patients.filter((p) => enrolments.some((e) => e.patientId === p.id && e.status === "active") && !subs.some((s) => s.patientId === p.id && s.status !== "cancelled"));
  const monthly = Math.round(fee * 3.4);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Start recurring MDS service plan</DialogTitle><DialogDescription>Simulated recurring billing concept. Nothing is charged automatically.</DialogDescription></DialogHeader>
        <Field label="Patient (active MDS only)" hint={eligible.length ? undefined : "Every active MDS patient already has a plan."}><Pick value={patientId} onChange={setPatientId} placeholder="Select patient" options={eligible.map((p) => ({ value: p.id, label: p.name }))} /></Field>
        <Field label="Plan"><Pick value={plan} onChange={setPlan} options={[{ value: "weekly", label: `Weekly MDS, ${rupees(fee)}` }, { value: "monthly", label: `Monthly MDS, ${rupees(monthly)}` }]} /></Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!patientId} onClick={() => {
            const ok = notify(save({ patientId, plan, price: plan === "weekly" ? fee : monthly, status: "active", startedOn: today(), renewalDate: addDays(today(), plan === "weekly" ? 7 : 30) }));
            if (ok) { onOpenChange(false); setPatientId(""); }
          }}>Start plan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BillingPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const invoices = useAppStore((s) => s.invoices);
  const subscriptions = useAppStore((s) => s.subscriptions);
  const patients = useAppStore((s) => s.patients);
  const saveSubscription = useAppStore((s) => s.saveSubscription);
  const billSubscription = useAppStore((s) => s.billSubscription);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | InvoiceStatus>("all");
  const [kind, setKind] = useState("all");
  const [newOpen, setNewOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(params.get("invoice"));
  const [cancelSub, setCancelSub] = useState<Subscription | null>(null);
  const pInvoice = params.get("invoice");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (pInvoice) setViewId(pInvoice); }, [pInvoice]);
  const name = (id: string) => patients.find((p) => p.id === id)?.name ?? id;

  const rows = useMemo(
    () => invoices.filter((i) => {
      if (status !== "all" && i.status !== status) return false;
      if (kind === "medicine" && !i.lines.some((l) => l.kind === "product")) return false;
      if (kind === "service" && !i.lines.some((l) => l.kind === "service")) return false;
      if (kind === "own" && !i.ownMedicinesDeclared) return false;
      return `${i.id} ${name(i.patientId)} ${i.orderId ?? ""} ${i.trayId ?? ""}`.toLowerCase().includes(q.toLowerCase());
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, status, kind, q, patients],
  );
  const totals = invoices.filter((i) => !["cancelled"].includes(i.status)).map(invoiceTotals);
  const paid = totals.reduce((n, t) => n + t.paid - t.refunded, 0);
  const outstanding = totals.reduce((n, t) => n + Math.max(0, t.balance), 0);
  const medicineCharges = totals.reduce((n, t) => n + t.medicine, 0);
  const serviceCharges = totals.reduce((n, t) => n + t.service, 0);
  const activeSubs = subscriptions.filter((s) => s.status === "active");

  const columns: ColumnDef<Invoice>[] = [
    { accessorKey: "id", header: "Invoice", cell: ({ row }) => <span className="font-semibold">{row.original.id}</span> },
    { id: "patient", accessorFn: (i) => name(i.patientId), header: "Patient" },
    { id: "ref", accessorFn: (i) => i.orderId ?? i.trayId ?? "", header: "Reference" },
    { accessorKey: "issuedOn", header: "Issued", cell: ({ row }) => fmtDate(row.original.issuedOn) },
    { id: "medicine", accessorFn: (i) => invoiceTotals(i).medicine, header: "Medicines", cell: ({ getValue }) => rupees(getValue() as number) },
    { id: "service", accessorFn: (i) => invoiceTotals(i).service, header: "Services", cell: ({ getValue }) => rupees(getValue() as number) },
    { id: "total", accessorFn: (i) => invoiceTotals(i).total, header: "Total", cell: ({ getValue }) => <span className="font-semibold">{rupees(getValue() as number)}</span> },
    { id: "balance", accessorFn: (i) => invoiceTotals(i).balance, header: "Balance", cell: ({ getValue }) => { const b = getValue() as number; return <span className={b > 0 ? "text-warn" : "text-muted-foreground"}>{rupees(b)}</span>; } },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <InvoiceBadge status={row.original.status} /> },
  ];
  const subColumns: ColumnDef<Subscription>[] = [
    { id: "patient", accessorFn: (s) => name(s.patientId), header: "Patient", cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
    { accessorKey: "plan", header: "Plan", cell: ({ row }) => (row.original.plan === "weekly" ? "Weekly MDS" : "Monthly MDS") },
    { accessorKey: "price", header: "Price", cell: ({ row }) => `${rupees(row.original.price)} / ${row.original.plan === "weekly" ? "week" : "month"}` },
    { accessorKey: "renewalDate", header: "Next billing", cell: ({ row }) => (row.original.status === "cancelled" ? "Not renewing" : fmtDate(row.original.renewalDate)) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <SubBadge status={row.original.status} /> },
    {
      id: "actions", header: "", enableSorting: false, cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex justify-end gap-1">
            {s.status === "active" && <GuardedButton size="sm" variant="ghost" perm="billing.edit" what="bill plans" onClick={() => notify(billSubscription(s.id))}><Receipt /> Bill period</GuardedButton>}
            {s.status === "active" && <GuardedButton size="sm" variant="ghost" perm="billing.edit" what="renew subscriptions" onClick={() => notify(saveSubscription({ ...s, renewalDate: addDays(s.renewalDate, s.plan === "weekly" ? 7 : 30) }))}><CalendarSync /> Skip period</GuardedButton>}
            {s.status === "active" && <GuardedButton size="sm" variant="ghost" perm="billing.edit" what="pause subscriptions" onClick={() => notify(saveSubscription({ ...s, status: "paused" }))}><Pause /> Pause</GuardedButton>}
            {s.status === "paused" && <GuardedButton size="sm" variant="ghost" perm="billing.edit" what="resume subscriptions" onClick={() => notify(saveSubscription({ ...s, status: "active" }))}><Play /> Resume</GuardedButton>}
            {s.status !== "cancelled" && <GuardedButton size="sm" variant="ghost" perm="billing.edit" what="cancel subscriptions" onClick={() => setCancelSub(s)}><XCircle /> Cancel</GuardedButton>}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Billing & Subscriptions"
        description="Medicine charges and MDS service charges, kept apart. Simulated payments only, and no claim of GST compliance."
        actions={<GuardedButton perm="billing.edit" what="create invoices" onClick={() => setNewOpen(true)}><FilePlus2 /> Create sample invoice</GuardedButton>}
      />
      <ClinicalNotice>No real payment is processed. Recording a payment, refund or adjustment only updates the mock ledger.</ClinicalNotice>
      <Card className="mb-3 grid grid-cols-2 gap-4 p-4 md:grid-cols-5">
        <Stat label="A. Medicine charges" value={rupees(medicineCharges)} />
        <Stat label="B. Service charges" value={rupees(serviceCharges)} />
        <Stat label="Received, net of refunds" value={rupees(paid)} />
        <Stat label="Outstanding" value={rupees(outstanding)} tone={outstanding ? "text-warn" : undefined} />
        <Stat label="Active MDS plans" value={activeSubs.length} />
      </Card>
      <Tabs defaultValue="invoices">
        <TabsList><TabsTrigger value="invoices">Invoices</TabsTrigger><TabsTrigger value="subs">Recurring MDS plans</TabsTrigger></TabsList>
        <TabsContent value="invoices" className="pt-2">
          <Card>
            <div className="flex flex-wrap gap-2 p-3">
              <SearchInput value={q} onChange={setQ} placeholder="Search invoice, patient, order or tray" />
              <Pick className="h-9 w-[170px]" value={status} onChange={setStatus} options={[{ value: "all", label: "All statuses" }, { value: "draft", label: "Draft" }, { value: "issued", label: "Issued" }, { value: "paid", label: "Paid" }, { value: "overdue", label: "Overdue" }, { value: "refunded", label: "Refunded" }, { value: "cancelled", label: "Cancelled" }]} />
              <Pick className="h-9 w-[220px]" value={kind} onChange={setKind} options={[{ value: "all", label: "All charge types" }, { value: "medicine", label: "Has medicine charges" }, { value: "service", label: "Has service charges" }, { value: "own", label: "Own medicines declared" }]} />
            </div>
            <DataTable data={rows} columns={columns} onRowClick={(i) => setViewId(i.id)} initialSort={[{ id: "issuedOn", desc: true }]} getRowId={(r) => r.id} />
          </Card>
        </TabsContent>
        <TabsContent value="subs" className="pt-2">
          <Card>
            <div className="flex items-center justify-between gap-2 p-3">
              <p className="text-[13px] text-muted-foreground">Recurring service billing concept. Use Bill period to raise this period's service invoice.</p>
              <GuardedButton size="sm" variant="outline" perm="billing.edit" what="start plans" onClick={() => setSubOpen(true)}><Plus /> Start plan</GuardedButton>
            </div>
            <DataTable data={subscriptions} columns={subColumns} initialSort={[{ id: "renewalDate", desc: false }]} getRowId={(r) => r.id} />
          </Card>
        </TabsContent>
      </Tabs>
      <InvoiceForm open={newOpen} onOpenChange={setNewOpen} />
      <InvoiceView id={viewId} onClose={() => { setViewId(null); if (pInvoice) navigate("/billing", { replace: true }); }} />
      <NewSubscription open={subOpen} onOpenChange={setSubOpen} />
      <ConfirmDialog
        open={!!cancelSub}
        onOpenChange={(o) => !o && setCancelSub(null)}
        title="Cancel this plan?"
        description={cancelSub ? `Stops the simulated plan for ${name(cancelSub.patientId)}.` : ""}
        confirmLabel="Cancel plan"
        destructive
        onConfirm={() => { if (cancelSub) notify(saveSubscription({ ...cancelSub, status: "cancelled" })); setCancelSub(null); }}
      />
    </>
  );
}
