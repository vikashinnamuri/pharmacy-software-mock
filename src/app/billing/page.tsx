"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarSync, CheckCircle2, Download, FilePlus2, Pause, Play, Plus, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/common/data-table";
import { InvoiceBadge, SubBadge } from "@/components/common/status-badge";
import { Card, ConfirmDialog, Field, GuardedButton, notify, PageHeader, Pick, SearchInput, Stat } from "@/components/common/ui";
import { addDays, fmtDate, today } from "@/lib/dates";
import { invoicePdf } from "@/lib/pdf/documents";
import { invoiceTotals, rupees } from "@/lib/selectors";
import { useAppStore } from "@/store/app-store";
import type { Invoice, InvoiceStatus, Subscription } from "@/types";

const lineSchema = z.object({
  source: z.string(),
  description: z.string().trim().min(2, "Describe the item"),
  qty: z.number({ error: "Enter a number" }).min(1, "At least 1"),
  unitPrice: z.number({ error: "Enter a number" }).min(0, "Cannot be negative"),
  gstRate: z.number({ error: "Enter a number" }).min(0, "Cannot be negative").max(100, "Check this rate"),
});
const schema = z.object({
  patientId: z.string().min(1, "Choose a patient"),
  status: z.enum(["draft", "issued"]),
  lines: z.array(lineSchema).min(1, "Add at least one item"),
});
type Values = z.infer<typeof schema>;

const SERVICES = [
  { id: "svc-week", label: "Weekly tray service", price: 350 },
  { id: "svc-month", label: "Monthly tray service", price: 1200 },
  { id: "svc-delivery", label: "Delivery to home", price: 80 },
  { id: "svc-replace", label: "Replacement tray", price: 150 },
];

function InvoiceForm({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const patients = useAppStore((s) => s.patients);
  const medicines = useAppStore((s) => s.medicines);
  const settings = useAppStore((s) => s.settings);
  const saveInvoice = useAppStore((s) => s.saveInvoice);
  const defaults = useMemo<Values>(() => ({ patientId: "", status: "issued", lines: [{ source: "", description: "", qty: 1, unitPrice: 0, gstRate: settings.defaultGstRate }] }), [settings.defaultGstRate]);
  const { register, control, handleSubmit, reset, setValue, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const lines = useWatch({ control, name: "lines" });
  useEffect(() => { if (open) reset(defaults); }, [open, reset, defaults]);

  const totals = invoiceTotals({ lines: (lines ?? []).map((l, i) => ({ id: String(i), description: l.description, kind: "service", qty: Number(l.qty) || 0, unitPrice: Number(l.unitPrice) || 0, gstRate: Number(l.gstRate) || 0 })) });
  const sourceOptions = [
    ...SERVICES.map((s) => ({ value: s.id, label: `Service: ${s.label}` })),
    ...medicines.map((m) => ({ value: m.id, label: `Product: ${m.brand} ${m.strength}` })),
  ];

  const pickSource = (i: number, id: string) => {
    setValue(`lines.${i}.source`, id);
    const s = SERVICES.find((x) => x.id === id);
    if (s) { setValue(`lines.${i}.description`, s.label, { shouldValidate: true }); setValue(`lines.${i}.unitPrice`, s.price); setValue(`lines.${i}.gstRate`, 18); return; }
    const m = medicines.find((x) => x.id === id);
    if (m) { setValue(`lines.${i}.description`, `${m.brand} ${m.strength}`, { shouldValidate: true }); setValue(`lines.${i}.unitPrice`, m.unitPrice); setValue(`lines.${i}.gstRate`, settings.defaultGstRate); }
  };

  const submit = (v: Values) => {
    const r = saveInvoice({
      patientId: v.patientId, issuedOn: today(), dueOn: addDays(today(), 14), status: v.status,
      lines: v.lines.map((l, i) => {
        const isService = SERVICES.some((s) => s.id === l.source);
        return { id: `IL-new-${Date.now()}-${i}`, description: l.description, kind: isService || !l.source ? "service" : "product", medicineId: isService ? undefined : l.source || undefined, qty: l.qty, unitPrice: l.unitPrice, gstRate: l.gstRate };
      }),
    });
    if (notify(r)) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create sample invoice</DialogTitle>
          <DialogDescription>GST rates are editable samples. This creates no tax document and takes no payment.</DialogDescription>
        </DialogHeader>
        <form id="invoice-form" className="space-y-3" onSubmit={handleSubmit(submit)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Patient" error={errors.patientId?.message}>
              <Controller control={control} name="patientId" render={({ field }) => <Pick value={field.value} onChange={field.onChange} placeholder="Select patient" options={patients.map((p) => ({ value: p.id, label: `${p.name} (${p.id})` }))} />} />
            </Field>
            <Field label="Save as">
              <Controller control={control} name="status" render={({ field }) => <Pick value={field.value} onChange={field.onChange} options={[{ value: "issued", label: "Issued" }, { value: "draft", label: "Draft" }]} />} />
            </Field>
          </div>
          {fields.map((f, i) => (
            <div key={f.id} className="grid items-start gap-2 rounded-lg border border-border p-3 sm:grid-cols-12">
              <Field label="Product or service" className="sm:col-span-5"><Pick value={lines?.[i]?.source} placeholder="Choose, or type below" onChange={(v) => pickSource(i, v)} options={sourceOptions} /></Field>
              <Field label="Description" error={errors.lines?.[i]?.description?.message} className="sm:col-span-7"><Input {...register(`lines.${i}.description`)} /></Field>
              <Field label="Quantity" error={errors.lines?.[i]?.qty?.message} className="sm:col-span-3"><Input type="number" {...register(`lines.${i}.qty`, { valueAsNumber: true })} /></Field>
              <Field label="Unit price (₹)" error={errors.lines?.[i]?.unitPrice?.message} className="sm:col-span-3"><Input type="number" step="0.1" {...register(`lines.${i}.unitPrice`, { valueAsNumber: true })} /></Field>
              <Field label="GST %" error={errors.lines?.[i]?.gstRate?.message} className="sm:col-span-2"><Input type="number" {...register(`lines.${i}.gstRate`, { valueAsNumber: true })} /></Field>
              <div className="flex items-end justify-between gap-2 self-end sm:col-span-4">
                <p className="pb-1.5 text-[13px] font-semibold">{rupees((Number(lines?.[i]?.qty) || 0) * (Number(lines?.[i]?.unitPrice) || 0) * (1 + (Number(lines?.[i]?.gstRate) || 0) / 100))}</p>
                {fields.length > 1 && <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove item ${i + 1}`} onClick={() => remove(i)}><Trash2 /></Button>}
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => append({ source: "", description: "", qty: 1, unitPrice: 0, gstRate: settings.defaultGstRate })}><Plus /> Add item</Button>
          <dl className="ml-auto w-[260px] space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{rupees(totals.subtotal)}</dd></div>
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
  if (!inv) return <Dialog open={false} />;
  const t = invoiceTotals(inv);
  const download = () => {
    invoicePdf(state, inv).save(`Sample-Invoice-${inv.id}-DEMO.pdf`);
    state.logDocument("summary", `Sample invoice ${inv.id}`, "downloaded", inv.patientId);
  };
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{inv.id} <InvoiceBadge status={inv.status} /></DialogTitle>
          <DialogDescription>{patient?.name}. Issued {fmtDate(inv.issuedOn)}, due {fmtDate(inv.dueOn)}. A sample only, not a tax invoice.</DialogDescription>
        </DialogHeader>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-[13px] text-muted-foreground"><th className="py-1.5 font-semibold">Item</th><th className="font-semibold">Qty</th><th className="font-semibold">Price</th><th className="font-semibold">GST</th><th className="text-right font-semibold">Total</th></tr></thead>
          <tbody>
            {inv.lines.map((l) => {
              const net = l.qty * l.unitPrice;
              return <tr key={l.id} className="border-b border-border/60"><td className="py-1.5">{l.description}</td><td>{l.qty}</td><td>{rupees(l.unitPrice)}</td><td>{l.gstRate}%</td><td className="text-right">{rupees(net * (1 + l.gstRate / 100))}</td></tr>;
            })}
          </tbody>
        </table>
        <dl className="ml-auto w-[240px] space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{rupees(t.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">CGST</dt><dd>{rupees(t.gst / 2)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">SGST</dt><dd>{rupees(t.gst / 2)}</dd></div>
          <div className="flex justify-between border-t border-border pt-1 font-bold"><dt>Total</dt><dd>{rupees(t.total)}</dd></div>
        </dl>
        <DialogFooter>
          {inv.status === "draft" && <GuardedButton perm="billing.edit" what="change invoices" variant="outline" onClick={() => notify(state.setInvoiceStatus(inv.id, "issued"))}>Issue invoice</GuardedButton>}
          {(inv.status === "issued" || inv.status === "overdue") && <GuardedButton perm="billing.edit" what="change invoices" variant="outline" onClick={() => notify(state.setInvoiceStatus(inv.id, "paid"))}><CheckCircle2 /> Record as paid (simulated)</GuardedButton>}
          <Button onClick={download}><Download /> Download sample invoice</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewSubscription({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const patients = useAppStore((s) => s.patients);
  const subs = useAppStore((s) => s.subscriptions);
  const save = useAppStore((s) => s.saveSubscription);
  const [patientId, setPatientId] = useState("");
  const [plan, setPlan] = useState<Subscription["plan"]>("weekly");
  const eligible = patients.filter((p) => !subs.some((s) => s.patientId === p.id && s.status !== "cancelled"));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Start MDS subscription</DialogTitle><DialogDescription>Simulated plan. Nothing is charged.</DialogDescription></DialogHeader>
        <Field label="Patient" hint={eligible.length ? undefined : "All patients already have a subscription."}><Pick value={patientId} onChange={setPatientId} placeholder="Select patient" options={eligible.map((p) => ({ value: p.id, label: p.name }))} /></Field>
        <Field label="Plan"><Pick value={plan} onChange={setPlan} options={[{ value: "weekly", label: "Weekly MDS, ₹350" }, { value: "monthly", label: "Monthly MDS, ₹1,200" }]} /></Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!patientId} onClick={() => {
            const ok = notify(save({ patientId, plan, price: plan === "weekly" ? 350 : 1200, status: "active", startedOn: today(), renewalDate: addDays(today(), plan === "weekly" ? 7 : 30) }));
            if (ok) { onOpenChange(false); setPatientId(""); }
          }}>Start subscription</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BillingPage() {
  const invoices = useAppStore((s) => s.invoices);
  const subscriptions = useAppStore((s) => s.subscriptions);
  const patients = useAppStore((s) => s.patients);
  const saveSubscription = useAppStore((s) => s.saveSubscription);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | InvoiceStatus>("all");
  const [newOpen, setNewOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [cancelSub, setCancelSub] = useState<Subscription | null>(null);
  const name = (id: string) => patients.find((p) => p.id === id)?.name ?? id;

  const rows = useMemo(
    () => invoices.filter((i) => (status === "all" || i.status === status) && `${i.id} ${name(i.patientId)}`.toLowerCase().includes(q.toLowerCase())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, status, q, patients],
  );
  const paid = invoices.filter((i) => i.status === "paid").reduce((n, i) => n + invoiceTotals(i).total, 0);
  const outstanding = invoices.filter((i) => i.status === "issued" || i.status === "overdue").reduce((n, i) => n + invoiceTotals(i).total, 0);
  const activeSubs = subscriptions.filter((s) => s.status === "active");
  const mrr = activeSubs.reduce((n, s) => n + (s.plan === "weekly" ? s.price * 4 : s.price), 0);

  const columns: ColumnDef<Invoice>[] = [
    { accessorKey: "id", header: "Invoice", cell: ({ row }) => <span className="font-semibold">{row.original.id}</span> },
    { id: "patient", accessorFn: (i) => name(i.patientId), header: "Patient" },
    { accessorKey: "issuedOn", header: "Issued", cell: ({ row }) => fmtDate(row.original.issuedOn) },
    { accessorKey: "dueOn", header: "Due", cell: ({ row }) => fmtDate(row.original.dueOn) },
    { id: "total", accessorFn: (i) => invoiceTotals(i).total, header: "Total", cell: ({ getValue }) => rupees(getValue() as number) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <InvoiceBadge status={row.original.status} /> },
  ];
  const subColumns: ColumnDef<Subscription>[] = [
    { id: "patient", accessorFn: (s) => name(s.patientId), header: "Patient", cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
    { accessorKey: "plan", header: "Plan", cell: ({ row }) => (row.original.plan === "weekly" ? "Weekly MDS" : "Monthly MDS") },
    { accessorKey: "price", header: "Price", cell: ({ row }) => `${rupees(row.original.price)} / ${row.original.plan === "weekly" ? "week" : "month"}` },
    { accessorKey: "renewalDate", header: "Renewal date", cell: ({ row }) => (row.original.status === "cancelled" ? "Not renewing" : fmtDate(row.original.renewalDate)) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <SubBadge status={row.original.status} /> },
    {
      id: "actions", header: "", enableSorting: false, cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex justify-end gap-1">
            {s.status === "active" && <GuardedButton size="sm" variant="ghost" perm="billing.edit" what="renew subscriptions" onClick={() => notify(saveSubscription({ ...s, renewalDate: addDays(s.renewalDate, s.plan === "weekly" ? 7 : 30) }))}><CalendarSync /> Renew</GuardedButton>}
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
        description="Simulated invoices and tray plans. No real payments, and no claim of GST compliance."
        actions={<GuardedButton perm="billing.edit" what="create invoices" onClick={() => setNewOpen(true)}><FilePlus2 /> Create sample invoice</GuardedButton>}
      />
      <Card className="mb-3 grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
        <Stat label="Paid (simulated)" value={rupees(paid)} />
        <Stat label="Outstanding" value={rupees(outstanding)} tone={outstanding ? "text-warn" : undefined} />
        <Stat label="Active subscriptions" value={activeSubs.length} />
        <Stat label="Monthly plan value (mock)" value={rupees(mrr)} />
      </Card>
      <Tabs defaultValue="invoices">
        <TabsList><TabsTrigger value="invoices">Invoices</TabsTrigger><TabsTrigger value="subs">MDS subscriptions</TabsTrigger></TabsList>
        <TabsContent value="invoices" className="pt-2">
          <Card>
            <div className="flex flex-wrap gap-2 p-3">
              <SearchInput value={q} onChange={setQ} placeholder="Search invoice or patient" />
              <Pick className="h-9 w-[170px]" value={status} onChange={setStatus} options={[{ value: "all", label: "All statuses" }, { value: "draft", label: "Draft" }, { value: "issued", label: "Issued" }, { value: "paid", label: "Paid" }, { value: "overdue", label: "Overdue" }]} />
            </div>
            <DataTable data={rows} columns={columns} onRowClick={(i) => setViewId(i.id)} initialSort={[{ id: "issuedOn", desc: true }]} getRowId={(r) => r.id} />
          </Card>
        </TabsContent>
        <TabsContent value="subs" className="pt-2">
          <Card>
            <div className="flex justify-end p-3"><GuardedButton size="sm" variant="outline" perm="billing.edit" what="start subscriptions" onClick={() => setSubOpen(true)}><Plus /> Start subscription</GuardedButton></div>
            <DataTable data={subscriptions} columns={subColumns} initialSort={[{ id: "renewalDate", desc: false }]} getRowId={(r) => r.id} />
          </Card>
        </TabsContent>
      </Tabs>
      <InvoiceForm open={newOpen} onOpenChange={setNewOpen} />
      <InvoiceView id={viewId} onClose={() => setViewId(null)} />
      <NewSubscription open={subOpen} onOpenChange={setSubOpen} />
      <ConfirmDialog
        open={!!cancelSub}
        onOpenChange={(o) => !o && setCancelSub(null)}
        title="Cancel this subscription?"
        description={cancelSub ? `Stops the simulated plan for ${name(cancelSub.patientId)}.` : ""}
        confirmLabel="Cancel subscription"
        destructive
        onConfirm={() => { if (cancelSub) notify(saveSubscription({ ...cancelSub, status: "cancelled" })); setCancelSub(null); }}
      />
    </>
  );
}
