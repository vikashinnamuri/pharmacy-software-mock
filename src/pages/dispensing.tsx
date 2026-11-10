import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { MonitorPlay, Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/common/data-table";
import { PillArt } from "@/components/common/pill-art";
import { OrderBadge } from "@/components/common/status-badge";
import { Card, ClinicalNotice, GuardedButton, PageHeader, SearchInput, Stat } from "@/components/common/ui";
import { OrderSheet, TokenDialog } from "@/components/orders/order-sheet";
import { NewOrderDialog } from "@/components/orders/order-wizard";
import { fmtDateTime } from "@/lib/dates";
import { ACTIVE_ORDER, DONE_ORDER, orderCharges, orderLabel } from "@/lib/orders";
import { isTodayLocal, rupees } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { Order } from "@/types";

const FILTERS: { value: string; label: string; match: (o: Order) => boolean }[] = [
  { value: "active", label: "Active queue", match: (o) => ACTIVE_ORDER.includes(o.status) },
  { value: "awaiting-review", label: "Awaiting review", match: (o) => o.status === "awaiting-review" || o.status === "new" },
  { value: "awaiting-payment", label: "Awaiting payment", match: (o) => o.status === "awaiting-payment" },
  { value: "in-preparation", label: "In preparation", match: (o) => o.status === "payment-received" || o.status === "in-preparation" },
  { value: "awaiting-verification", label: "Final check", match: (o) => o.status === "awaiting-verification" },
  { value: "ready", label: "Ready", match: (o) => o.status === "ready-collection" || o.status === "out-for-delivery" },
  { value: "on-hold", label: "On hold", match: (o) => o.status === "on-hold" },
  { value: "completed", label: "Completed", match: (o) => DONE_ORDER.includes(o.status) },
  { value: "cancelled", label: "Cancelled", match: (o) => o.status === "cancelled" },
  { value: "today", label: "Today", match: (o) => isTodayLocal(o.createdAt) },
  { value: "waiting", label: "Patients waiting", match: (o) => o.fulfilment === "collection" && ACTIVE_ORDER.includes(o.status) && o.status !== "on-hold" && o.status !== "new" },
  { value: "all", label: "All", match: () => true },
];
const VISIBLE = ["active", "awaiting-review", "awaiting-payment", "in-preparation", "awaiting-verification", "ready", "on-hold", "completed", "cancelled", "all"];

export default function DispensingPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const orders = useAppStore((s) => s.orders);
  const patients = useAppStore((s) => s.patients);
  const medicines = useAppStore((s) => s.medicines);
  const [filter, setFilter] = useState(params.get("status") ?? params.get("view") ?? "active");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(params.get("order"));
  const [wizard, setWizard] = useState(false);
  const [preset, setPreset] = useState<string | undefined>();
  const [tokenFor, setTokenFor] = useState<string | null>(null);
  /** A just-created order opens after its token slip is dismissed, so two dialogs never stack. */
  const [openAfterToken, setOpenAfterToken] = useState<string | null>(null);

  const pStatus = params.get("status") ?? params.get("view");
  const pOrder = params.get("order");
  const pNew = params.get("new");
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { if (pStatus) setFilter(pStatus); }, [pStatus]);
  useEffect(() => { if (pOrder) setOpenId(pOrder); }, [pOrder]);
  useEffect(() => { if (pNew !== null) { setPreset(pNew || undefined); setWizard(true); } }, [pNew]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const name = (id: string) => patients.find((p) => p.id === id)?.name ?? id;
  const f = FILTERS.find((x) => x.value === filter) ?? FILTERS[0];
  const rows = useMemo(() => orders.filter((o) => f.match(o) && `${o.id} ${o.token} ${name(o.patientId)} ${o.prescriptionId ?? ""}`.toLowerCase().includes(q.toLowerCase())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, f, q, patients]);
  const count = (v: string) => orders.filter(FILTERS.find((x) => x.value === v)!.match).length;
  const todays = orders.filter((o) => isTodayLocal(o.createdAt));
  const queue = orders.filter((o) => ACTIVE_ORDER.includes(o.status) && o.status !== "new").sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const columns: ColumnDef<Order>[] = [
    { accessorKey: "token", header: "Token", cell: ({ row }) => <span className="rounded-md bg-sidebar px-2 py-0.5 font-bold text-white">{row.original.token}</span> },
    { accessorKey: "id", header: "Order", cell: ({ row }) => <span className="font-semibold">{row.original.id}</span> },
    { id: "patient", accessorFn: (o) => name(o.patientId), header: "Patient" },
    { id: "rx", accessorFn: (o) => o.prescriptionId ?? "Request", header: "Prescription" },
    {
      id: "meds", header: "Medicines", enableSorting: false, cell: ({ row }) => (
        <span className="flex items-center gap-1.5"><span className="flex -space-x-1.5">{row.original.lines.slice(0, 4).map((l) => { const m = medicines.find((x) => x.id === l.medicineId); return m ? <PillArt key={l.id} medicine={m} size={22} /> : null; })}</span><span className="text-xs text-muted-foreground">{row.original.lines.reduce((n, l) => n + l.qty, 0)} units</span></span>
      ),
    },
    { id: "amount", accessorFn: (o) => orderCharges(o.lines).total, header: "Amount", cell: ({ getValue }) => rupees(getValue() as number) },
    { id: "fulfil", accessorFn: (o) => o.fulfilment, header: "Fulfilment", cell: ({ getValue }) => <span className="capitalize">{getValue() as string}</span> },
    { accessorKey: "createdAt", header: "Created", cell: ({ row }) => fmtDateTime(row.original.createdAt) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <OrderBadge order={row.original} /> },
  ];

  return (
    <>
      <PageHeader
        title="Dispensing Queue"
        description="Standard pharmacy dispensing, from prescription to collection or delivery. Every order carries a queue token."
        actions={
          <>
            <Button variant="outline" render={<Link to="/display" target="_blank" />}><MonitorPlay /> Public collection display</Button>
            <GuardedButton perm="order.create" what="create orders" onClick={() => { setPreset(undefined); setWizard(true); }}><Plus /> New dispensing order</GuardedButton>
          </>
        }
      />
      <ClinicalNotice>Pharmacist review, payment and final verification are simulated. Stock is held at review and deducted once at hand-over.</ClinicalNotice>
      <Card className="mb-3 grid grid-cols-2 gap-4 p-4 md:grid-cols-5">
        <Stat label="Today's orders" value={todays.length} />
        <Stat label="Awaiting review" value={count("awaiting-review")} tone={count("awaiting-review") ? "text-warn" : undefined} />
        <Stat label="Awaiting payment" value={count("awaiting-payment")} />
        <Stat label="Final check" value={count("awaiting-verification")} />
        <Stat label="Completed today" value={orders.filter((o) => DONE_ORDER.includes(o.status) && isTodayLocal(o.completedAt)).length} tone="text-ok" />
      </Card>
      <Tabs defaultValue="orders">
        <TabsList><TabsTrigger value="orders">Orders</TabsTrigger><TabsTrigger value="queue">Token queue ({queue.length})</TabsTrigger></TabsList>
        <TabsContent value="orders" className="pt-2">
          <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Filter by status">
            {FILTERS.filter((x) => VISIBLE.includes(x.value) || x.value === filter).map((t) => (
              <button key={t.value} type="button" role="tab" aria-selected={filter === t.value} onClick={() => { setFilter(t.value); if (pStatus) navigate("/dispensing", { replace: true }); }}
                className={cn("rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", filter === t.value ? "bg-sidebar text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                {t.label} <span className="opacity-70">{count(t.value)}</span>
              </button>
            ))}
          </div>
          <Card>
            <div className="flex flex-wrap gap-2 p-3"><SearchInput value={q} onChange={setQ} placeholder="Search token, order, patient or prescription" /></div>
            <DataTable data={rows} columns={columns} onRowClick={(o) => setOpenId(o.id)} initialSort={[{ id: "createdAt", desc: true }]} getRowId={(o) => o.id} />
          </Card>
        </TabsContent>
        <TabsContent value="queue" className="pt-2">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {queue.map((o) => (
              <button key={o.id} type="button" onClick={() => setOpenId(o.id)} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left hover:border-primary">
                <span className="rounded-lg bg-sidebar px-2.5 py-1.5 text-xl font-bold text-white">{o.token}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{name(o.patientId)}</span>
                  <span className="block text-xs text-muted-foreground">{orderLabel(o)}</span>
                  <span className="block text-xs text-muted-foreground">Est. {fmtDateTime(o.estimatedReady)}</span>
                </span>
                <span role="button" tabIndex={0} aria-label={`Print token ${o.token}`} onClick={(e) => { e.stopPropagation(); setTokenFor(o.id); }} className="rounded p-1.5 text-muted-foreground hover:bg-muted"><Printer className="size-4" /></span>
              </button>
            ))}
            {queue.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground sm:col-span-2">No tokens in the queue.</Card>}
          </div>
        </TabsContent>
      </Tabs>
      <NewOrderDialog open={wizard} onOpenChange={(o) => { setWizard(o); if (!o && pNew !== null) navigate("/dispensing", { replace: true }); }} presetPatientId={preset} onCreated={(id) => { setOpenAfterToken(id); setTokenFor(id); }} />
      <OrderSheet orderId={openId} onClose={() => { setOpenId(null); if (pOrder) navigate("/dispensing", { replace: true }); }} />
      <TokenDialog orderId={tokenFor} onClose={() => { setTokenFor(null); if (openAfterToken) { setOpenId(openAfterToken); setOpenAfterToken(null); } }} />
    </>
  );
}

