import { useSearchParams } from "react-router";
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ClipboardList, Download, PackageCheck, PackagePlus, Pencil, Plus, Trash2, Truck, Undo2, XCircle, Timer } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/common/data-table";
import { PillArt } from "@/components/common/pill-art";
import { Badge, StockBadge } from "@/components/common/status-badge";
import { Card, ClinicalNotice, ConfirmDialog, Field, GuardedButton, notify, PageHeader, Pick, SearchInput } from "@/components/common/ui";
import { addDays, fmtDate, fmtDateTime, today } from "@/lib/dates";
import { batchStatus, inventoryAlerts, rupees, stockByMedicine, type StockStatus } from "@/lib/selectors";
import { isExpired, reservedByBatch } from "@/lib/tray-engine";
import { useAppStore } from "@/store/app-store";
import type { Batch, MovementType, Purchase, StockMovement } from "@/types";

const addSchema = z.object({
  medicineId: z.string().min(1, "Choose a medicine"),
  supplierId: z.string(),
  batchNumber: z.string().trim().min(3, "Enter a batch number"),
  expiryDate: z.string().min(1, "Set an expiry date").refine((d) => d > today(), "Stock must not already be expired"),
  available: z.number({ error: "Enter a number" }).int().min(1, "Enter a quantity above zero"),
  location: z.string().trim().min(1, "Enter a shelf"),
});
type AddValues = z.infer<typeof addSchema>;

function AddStock({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const medicines = useAppStore((s) => s.medicines);
  const suppliers = useAppStore((s) => s.suppliers);
  const addStock = useAppStore((s) => s.addStock);
  const defaults = useMemo(() => ({ medicineId: "", supplierId: "", batchNumber: "", expiryDate: addDays(today(), 365), available: 100, location: "A1" }), []);
  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<AddValues>({ resolver: zodResolver(addSchema), defaultValues: defaults });
  useEffect(() => { if (open) reset(defaults); }, [open, reset, defaults]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Stock receipt</DialogTitle><DialogDescription>Adds a batch without a purchase order and records a stock movement.</DialogDescription></DialogHeader>
        <form id="add-stock" className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit((v) => { if (notify(addStock({ ...v, supplierId: v.supplierId || undefined }))) onOpenChange(false); })}>
          <Field label="Medicine" error={errors.medicineId?.message} className="sm:col-span-2">
            <Controller control={control} name="medicineId" render={({ field }) => <Pick value={field.value} onChange={field.onChange} placeholder="Select medicine" options={medicines.map((m) => ({ value: m.id, label: `${m.brand} ${m.strength}` }))} />} />
          </Field>
          <Field label="Supplier" className="sm:col-span-2">
            <Controller control={control} name="supplierId" render={({ field }) => <Pick value={field.value} onChange={field.onChange} placeholder="Optional" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />} />
          </Field>
          <Field label="Batch number" error={errors.batchNumber?.message}><Input {...register("batchNumber")} /></Field>
          <Field label="Quantity" error={errors.available?.message}><Input type="number" {...register("available", { valueAsNumber: true })} /></Field>
          <Field label="Expiry date" error={errors.expiryDate?.message}><Input type="date" {...register("expiryDate")} /></Field>
          <Field label="Shelf" error={errors.location?.message}><Input {...register("location")} /></Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="add-stock">Receive stock</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const editSchema = z.object({
  available: z.number({ error: "Enter a number" }).int().min(0, "Quantity cannot be negative"),
  expiryDate: z.string().min(1, "Set an expiry date"),
  location: z.string().trim().min(1, "Enter a shelf"),
  reason: z.string().trim().min(3, "Say why the stock changed"),
});
type EditValues = z.infer<typeof editSchema>;

function EditStock({ batch, onClose }: { batch: Batch | null; onClose: () => void }) {
  const editBatch = useAppStore((s) => s.editBatch);
  const trays = useAppStore((s) => s.trays);
  const orders = useAppStore((s) => s.orders);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<EditValues>({ resolver: zodResolver(editSchema) });
  useEffect(() => { if (batch) reset({ available: batch.available, expiryDate: batch.expiryDate, location: batch.location, reason: "" }); }, [batch, reset]);
  const reserved = batch ? reservedByBatch(trays, orders)[batch.id] ?? 0 : 0;
  return (
    <Dialog open={!!batch} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Stock adjustment: batch {batch?.batchNumber}</DialogTitle>
          <DialogDescription>{reserved} units are reserved for trays and orders, so the quantity cannot go below that.</DialogDescription>
        </DialogHeader>
        <form id="edit-stock" className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit((v) => { if (batch && notify(editBatch(batch.id, v))) onClose(); })}>
          <Field label="Counted quantity" error={errors.available?.message}><Input type="number" {...register("available", { valueAsNumber: true })} /></Field>
          <Field label="Expiry date" error={errors.expiryDate?.message}><Input type="date" {...register("expiryDate")} /></Field>
          <Field label="Shelf" error={errors.location?.message}><Input {...register("location")} /></Field>
          <Field label="Reason" error={errors.reason?.message}><Input placeholder="Count correction" {...register("reason")} /></Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="edit-stock">Save adjustment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoveOut({ batch, kind, onClose }: { batch: Batch | null; kind: "return" | "waste"; onClose: () => void }) {
  const state = useAppStore();
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const reserved = batch ? reservedByBatch(state.trays, state.orders)[batch.id] ?? 0 : 0;
  const expired = batch ? isExpired(batch, today()) : false;
  const max = batch ? (expired ? batch.available : Math.max(0, batch.available - reserved)) : 0;
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (batch) { setQty(max || 1); setReason(kind === "waste" && expired ? "Expired stock" : ""); } }, [batch, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!batch) return null;
  const supplier = state.suppliers.find((s) => s.id === batch.supplierId);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{kind === "return" ? "Return to supplier" : "Record wastage"}: batch {batch.batchNumber}</DialogTitle>
          <DialogDescription>{kind === "return" ? `Supplier: ${supplier?.name ?? "not recorded"}.` : "Writes stock off, for example expired or damaged packs."} Up to {max} unit{max === 1 ? "" : "s"} can leave the shelf. Reserved stock is protected.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Quantity"><Input type="number" min={1} max={max} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></Field>
          <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === "return" ? "Short-dated, damaged in transit" : "Expired, broken pack"} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <GuardedButton perm="inventory.edit" what="move stock out" variant={kind === "waste" ? "destructive" : "default"} onClick={() => { if (notify(kind === "return" ? state.returnStock(batch.id, qty, reason) : state.writeOffStock(batch.id, qty, reason))) onClose(); }}>{kind === "return" ? "Record return" : "Write off"}</GuardedButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PurchaseForm({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const state = useAppStore();
  const [supplierId, setSupplierId] = useState("");
  const [expected, setExpected] = useState(addDays(today(), 3));
  const [lines, setLines] = useState<{ medicineId: string; qty: number; unitCost: number }[]>([{ medicineId: "", qty: 100, unitCost: 1 }]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (open) { setSupplierId(""); setLines([{ medicineId: "", qty: 100, unitCost: 1 }]); setExpected(addDays(today(), 3)); } }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Raise purchase order</DialogTitle><DialogDescription>Simulated order to a fictional supplier. Nothing is sent.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Supplier"><Pick value={supplierId} onChange={setSupplierId} placeholder="Choose supplier" options={state.suppliers.map((s) => ({ value: s.id, label: s.name }))} /></Field>
          <Field label="Expected"><Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} /></Field>
        </div>
        {lines.map((l, i) => (
          <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_90px_110px_auto]">
            <Field label="Medicine"><Pick value={l.medicineId} onChange={(v) => setLines((ls) => ls.map((x, n) => (n === i ? { ...x, medicineId: v, unitCost: Math.round((state.medicines.find((m) => m.id === v)?.unitPrice ?? 1) * 0.65 * 100) / 100 } : x)))} placeholder="Select" options={state.medicines.map((m) => ({ value: m.id, label: `${m.brand} ${m.strength}` }))} /></Field>
            <Field label="Qty"><Input type="number" value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, n) => (n === i ? { ...x, qty: Number(e.target.value) } : x)))} /></Field>
            <Field label="Unit cost (₹)"><Input type="number" step="0.01" value={l.unitCost} onChange={(e) => setLines((ls) => ls.map((x, n) => (n === i ? { ...x, unitCost: Number(e.target.value) } : x)))} /></Field>
            <Button size="icon-sm" variant="ghost" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}><Trash2 /></Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, { medicineId: "", qty: 100, unitCost: 1 }])}><Plus /> Add line</Button>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <GuardedButton perm="inventory.edit" what="raise purchase orders" disabled={!supplierId} onClick={() => { if (notify(state.createPurchase({ supplierId, expectedOn: expected, lines: lines.map((l, i) => ({ ...l, id: `PL-${Date.now()}-${i}` })) }))) onOpenChange(false); }}>Raise order</GuardedButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveForm({ po, onClose }: { po: Purchase | null; onClose: () => void }) {
  const state = useAppStore();
  const [rows, setRows] = useState<Record<string, { batchNumber: string; expiryDate: string; location: string }>>({});
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (po) setRows(Object.fromEntries(po.lines.map((l) => [l.id, { batchNumber: "", expiryDate: addDays(today(), 365), location: "Receiving" }]))); }, [po]);
  if (!po) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Receive {po.id}</DialogTitle><DialogDescription>Record the batch number and expiry printed on each delivered pack.</DialogDescription></DialogHeader>
        {po.lines.map((l) => {
          const m = state.medicines.find((x) => x.id === l.medicineId);
          const r = rows[l.id] ?? { batchNumber: "", expiryDate: "", location: "" };
          return (
            <div key={l.id} className="grid items-end gap-2 rounded-lg border border-border p-2.5 sm:grid-cols-[1fr_140px_150px_100px]">
              <p className="text-[13px]"><strong>{m?.brand} {m?.strength}</strong><span className="block text-muted-foreground">{l.qty} units at {rupees(l.unitCost)}</span></p>
              <Field label="Batch number"><Input value={r.batchNumber} onChange={(e) => setRows((x) => ({ ...x, [l.id]: { ...r, batchNumber: e.target.value.toUpperCase() } }))} /></Field>
              <Field label="Expiry"><Input type="date" value={r.expiryDate} onChange={(e) => setRows((x) => ({ ...x, [l.id]: { ...r, expiryDate: e.target.value } }))} /></Field>
              <Field label="Shelf"><Input value={r.location} onChange={(e) => setRows((x) => ({ ...x, [l.id]: { ...r, location: e.target.value } }))} /></Field>
            </div>
          );
        })}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <GuardedButton perm="inventory.edit" what="receive stock" onClick={() => { if (notify(state.receivePurchase(po.id, Object.entries(rows).map(([lineId, r]) => ({ lineId, ...r }))))) onClose(); }}><PackageCheck /> Receive into stock</GuardedButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface Row extends Batch { reserved: number; status: StockStatus; medName: string; supplier: string }
const MOVE_LABEL: Record<MovementType, string> = { received: "Received", adjusted: "Adjusted", dispensed: "Dispensed", "written-off": "Wastage", returned: "Returned to supplier" };

export default function InventoryPage() {
  const [params] = useSearchParams();
  const state = useAppStore();
  const { batches, medicines, trays, orders, movements, settings, suppliers, purchases } = state;
  const [q, setQ] = useState(params.get("q") ?? "");
  const [filter, setFilter] = useState(params.get("filter") ?? "all");
  const [moveType, setMoveType] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [poOpen, setPoOpen] = useState(false);
  const [receiving, setReceiving] = useState<Purchase | null>(null);
  const [cancelPo, setCancelPo] = useState<Purchase | null>(null);
  const [editing, setEditing] = useState<Batch | null>(null);
  const [moving, setMoving] = useState<{ batch: Batch; kind: "return" | "waste" } | null>(null);
  const [tab, setTab] = useState("stock");

  const paramQ = params.get("q");
  const paramF = params.get("filter");
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { if (paramQ !== null) setQ(paramQ); }, [paramQ]);
  useEffect(() => { if (paramF !== null) setFilter(paramF); }, [paramF]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const stock = useMemo(() => stockByMedicine({ batches, trays, orders }), [batches, trays, orders]);
  const reserved = useMemo(() => reservedByBatch(trays, orders), [trays, orders]);
  const alerts = useMemo(() => inventoryAlerts({ batches, medicines, trays, orders, settings }), [batches, medicines, trays, orders, settings]);

  const all: Row[] = useMemo(() => batches.map((b) => {
    const med = medicines.find((m) => m.id === b.medicineId);
    return { ...b, reserved: reserved[b.id] ?? 0, status: batchStatus(b, med, stock[b.medicineId]?.free ?? 0, settings.expiryWarningDays), medName: `${med?.brand} ${med?.strength}`, supplier: suppliers.find((s) => s.id === b.supplierId)?.name ?? "" };
  }), [batches, medicines, reserved, stock, settings.expiryWarningDays, suppliers]);

  const rows = useMemo(() => all.filter((r) => {
    if (filter === "low" && r.status !== "low" && r.status !== "out") return false;
    if (filter === "expiry" && r.status !== "expired" && r.status !== "expiring") return false;
    const med = medicines.find((m) => m.id === r.medicineId);
    return `${r.medName} ${med?.generic} ${r.batchNumber} ${r.manufacturer} ${r.supplier}`.toLowerCase().includes(q.toLowerCase());
  }), [all, filter, q, medicines]);

  const moves = useMemo(() => movements.filter((m) => moveType === "all" || m.type === moveType), [movements, moveType]);
  const summary = useMemo(() => {
    const map = new Map<string, Record<MovementType, number>>();
    movements.forEach((m) => {
      const r = map.get(m.medicineId) ?? { received: 0, adjusted: 0, dispensed: 0, "written-off": 0, returned: 0 };
      r[m.type] += m.qty;
      map.set(m.medicineId, r);
    });
    return [...map.entries()];
  }, [movements]);
  const exportCsv = () => {
    const head = "When,Medicine,Batch,Type,Quantity,Reference,By";
    const body = moves.map((m) => [m.at, medicines.find((x) => x.id === m.medicineId)?.brand, batches.find((b) => b.id === m.batchId)?.batchNumber, m.type, m.qty, m.reference, m.by].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([`DEMO - NOT FOR CLINICAL USE\n${head}\n${body.join("\n")}`], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `stock-movements-DEMO-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const columns: ColumnDef<Row>[] = [
    {
      accessorKey: "medName", header: "Medicine", cell: ({ row }) => {
        const m = medicines.find((x) => x.id === row.original.medicineId);
        return <span className="flex items-center gap-2">{m && <PillArt medicine={m} size={26} />}<span className="font-medium">{row.original.medName}</span></span>;
      },
    },
    { accessorKey: "batchNumber", header: "Batch", cell: ({ row }) => <span className="font-semibold">{row.original.batchNumber}</span> },
    { accessorKey: "supplier", header: "Supplier" },
    { accessorKey: "expiryDate", header: "Expiry", cell: ({ row }) => fmtDate(row.original.expiryDate) },
    { accessorKey: "available", header: "On shelf" },
    { accessorKey: "reserved", header: "Reserved" },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StockBadge status={row.original.status} /> },
    {
      id: "edit", header: "", enableSorting: false, cell: ({ row }) => (
        <div className="flex justify-end gap-0.5">
          <GuardedButton size="sm" variant="ghost" perm="inventory.edit" what="adjust stock" onClick={() => setEditing(row.original)}><Pencil /> Adjust</GuardedButton>
          <GuardedButton size="sm" variant="ghost" perm="inventory.edit" what="return stock" onClick={() => setMoving({ batch: row.original, kind: "return" })}><Undo2 /> Return</GuardedButton>
          <GuardedButton size="sm" variant="ghost" perm="inventory.edit" what="write off stock" onClick={() => setMoving({ batch: row.original, kind: "waste" })}><Trash2 /> Wastage</GuardedButton>
        </div>
      ),
    },
  ];
  const moveColumns: ColumnDef<StockMovement>[] = [
    { accessorKey: "at", header: "When", cell: ({ row }) => fmtDateTime(row.original.at) },
    { id: "medicine", accessorFn: (m) => medicines.find((x) => x.id === m.medicineId)?.brand ?? "", header: "Medicine" },
    { id: "batch", accessorFn: (m) => batches.find((b) => b.id === m.batchId)?.batchNumber ?? "", header: "Batch" },
    { accessorKey: "type", header: "Type", cell: ({ row }) => MOVE_LABEL[row.original.type] },
    {
      accessorKey: "qty", header: "Quantity", cell: ({ row }) => (
        <span className={`inline-flex items-center gap-1 font-semibold ${row.original.qty < 0 ? "text-danger" : "text-ok"}`}>
          {row.original.qty < 0 ? <ArrowDownRight className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}{row.original.qty > 0 ? "+" : ""}{row.original.qty}
        </span>
      ),
    },
    { accessorKey: "reference", header: "Reference" },
    { accessorKey: "by", header: "By" },
  ];

  const AlertCard = ({ icon: Icon, label, count, tone, active, onClick, list }: { icon: typeof Timer; label: string; count: number; tone: string; active: boolean; onClick: () => void; list: string }) => (
    <button type="button" aria-pressed={active} onClick={onClick} className={`rounded-xl border bg-card p-3.5 text-left transition-colors hover:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none ${active ? "border-primary ring-1 ring-primary" : "border-border"}`}>
      <p className="flex items-center gap-2 text-[13px] font-semibold"><Icon className={`size-4 ${tone}`} /> {label}</p>
      <p className="mt-1 text-2xl font-bold">{count}</p>
      <p className="truncate text-xs text-muted-foreground">{list || "Nothing to act on"}</p>
    </button>
  );

  return (
    <>
      <PageHeader
        title="Inventory Management"
        description="One stock ledger for standard dispensing and MDS. Reserved units are held by approved trays and reviewed orders, and leave stock once at hand-over."
        actions={
          <>
            <GuardedButton variant="outline" perm="inventory.edit" what="raise purchase orders" onClick={() => setPoOpen(true)}><ClipboardList /> Purchase order</GuardedButton>
            <GuardedButton perm="inventory.edit" what="receive stock" onClick={() => setAddOpen(true)}><PackagePlus /> Stock receipt</GuardedButton>
          </>
        }
      />
      <ClinicalNotice>Stock never goes below zero, and a transaction is never deducted twice. All suppliers and batches are fictional.</ClinicalNotice>
      <div className="mb-3 grid gap-3 md:grid-cols-3">
        <AlertCard icon={AlertTriangle} tone="text-warn" label="Low stock" count={alerts.low.length} active={filter === "low"} onClick={() => { setFilter(filter === "low" ? "all" : "low"); setTab("stock"); }} list={alerts.low.slice(0, 3).map((l) => l.medicine.brand).join(", ")} />
        <AlertCard icon={Timer} tone="text-warn" label={`Near expiry (within ${settings.expiryWarningDays} days)`} count={alerts.expiring.length} active={filter === "expiry"} onClick={() => { setFilter(filter === "expiry" ? "all" : "expiry"); setTab("stock"); }} list={alerts.expiring.slice(0, 3).map((b) => b.batchNumber).join(", ")} />
        <AlertCard icon={XCircle} tone="text-danger" label="Expired, still on the shelf" count={alerts.expired.length} active={filter === "expiry"} onClick={() => { setFilter(filter === "expiry" ? "all" : "expiry"); setTab("stock"); }} list={alerts.expired.map((b) => b.batchNumber).join(", ")} />
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="stock">Stock by batch</TabsTrigger>
          <TabsTrigger value="moves">Stock movements</TabsTrigger>
          <TabsTrigger value="purchases">Purchases and receipts ({purchases.filter((p) => p.status === "ordered").length} open)</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
        </TabsList>
        <TabsContent value="stock" className="pt-2">
          <Card>
            <div className="flex flex-wrap gap-2 p-3">
              <SearchInput value={q} onChange={setQ} placeholder="Search medicine, batch, supplier" />
              <Pick className="h-9 w-[180px]" value={filter} onChange={setFilter} options={[{ value: "all", label: "All batches" }, { value: "low", label: "Low stock" }, { value: "expiry", label: "Expired or expiring" }]} />
              <p className="ml-auto self-center text-[13px] text-muted-foreground">{rows.length} of {all.length} batches</p>
            </div>
            <DataTable data={rows} columns={columns} pageSize={12} initialSort={[{ id: "expiryDate", desc: false }]} getRowId={(r) => r.id} />
          </Card>
        </TabsContent>
        <TabsContent value="moves" className="space-y-3 pt-2">
          <Card>
            <div className="flex flex-wrap items-center gap-2 p-3">
              <Pick className="h-9 w-[210px]" value={moveType} onChange={setMoveType} options={[{ value: "all", label: "All movement types" }, ...(Object.keys(MOVE_LABEL) as MovementType[]).map((t) => ({ value: t, label: MOVE_LABEL[t] }))]} />
              <Button size="sm" variant="outline" className="ml-auto" onClick={exportCsv}><Download /> Export CSV</Button>
            </div>
            <DataTable data={moves} columns={moveColumns} pageSize={15} initialSort={[{ id: "at", desc: true }]} getRowId={(r) => r.id} />
          </Card>
          <Card className="overflow-x-auto">
            <p className="px-5 pt-4 pb-2 font-semibold">Stock movement report by medicine</p>
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-border text-left text-[13px] text-muted-foreground"><th className="px-5 py-1.5 font-semibold">Medicine</th>{(Object.keys(MOVE_LABEL) as MovementType[]).map((t) => <th key={t} className="px-3 text-right font-semibold">{MOVE_LABEL[t]}</th>)}<th className="px-5 text-right font-semibold">On shelf now</th></tr></thead>
              <tbody>
                {summary.map(([id, r]) => {
                  const m = medicines.find((x) => x.id === id);
                  return <tr key={id} className="border-b border-border/60"><td className="px-5 py-1.5">{m?.brand} {m?.strength}</td>{(Object.keys(MOVE_LABEL) as MovementType[]).map((t) => <td key={t} className="px-3 text-right">{r[t] || ""}</td>)}<td className="px-5 text-right font-semibold">{batches.filter((b) => b.medicineId === id).reduce((n, b) => n + b.available, 0)}</td></tr>;
                })}
              </tbody>
            </table>
          </Card>
        </TabsContent>
        <TabsContent value="purchases" className="pt-2">
          <Card>
            <ul className="divide-y divide-border">
              {purchases.map((po) => (
                <li key={po.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]">
                  <span className="min-w-[220px] flex-1">
                    <span className="font-semibold">{po.id}</span> to {suppliers.find((s) => s.id === po.supplierId)?.name}
                    <span className="block text-muted-foreground">{po.lines.map((l) => `${medicines.find((m) => m.id === l.medicineId)?.brand} × ${l.qty}${l.batchNumber ? ` (${l.batchNumber})` : ""}`).join(", ")}</span>
                    <span className="block text-xs text-muted-foreground">Ordered {fmtDate(po.orderedOn)}, expected {fmtDate(po.expectedOn)}{po.receivedOn ? `. Received ${fmtDate(po.receivedOn)} by ${po.receivedBy}` : ""}. Value {rupees(po.lines.reduce((n, l) => n + l.qty * l.unitCost, 0))}</span>
                  </span>
                  <Badge tone={po.status === "received" ? "ok" : po.status === "ordered" ? "info" : "neutral"}>{po.status === "ordered" ? "Awaiting delivery" : po.status === "received" ? "Received" : "Cancelled"}</Badge>
                  {po.status === "ordered" && <GuardedButton size="sm" perm="inventory.edit" what="receive stock" onClick={() => setReceiving(po)}><Truck /> Receive</GuardedButton>}
                  {po.status === "ordered" && <GuardedButton size="sm" variant="ghost" perm="inventory.edit" what="cancel orders" onClick={() => setCancelPo(po)}>Cancel</GuardedButton>}
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>
        <TabsContent value="suppliers" className="pt-2">
          <Card>
            <ul className="divide-y divide-border">
              {suppliers.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]">
                  <span className="min-w-[220px] flex-1"><span className="font-semibold">{s.name}</span><span className="block text-muted-foreground">{s.contact}, {s.phone}, {s.email}</span></span>
                  <span className="text-muted-foreground">Lead time {s.leadTimeDays} days</span>
                  <span className="text-muted-foreground">{batches.filter((b) => b.supplierId === s.id).length} batches</span>
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>
      </Tabs>
      <AddStock open={addOpen} onOpenChange={setAddOpen} />
      <EditStock batch={editing} onClose={() => setEditing(null)} />
      {moving && <MoveOut batch={moving.batch} kind={moving.kind} onClose={() => setMoving(null)} />}
      <PurchaseForm open={poOpen} onOpenChange={setPoOpen} />
      <ReceiveForm po={receiving} onClose={() => setReceiving(null)} />
      <ConfirmDialog open={!!cancelPo} onOpenChange={(o) => !o && setCancelPo(null)} title={`Cancel ${cancelPo?.id}?`} description="The order is marked cancelled. Nothing is received." reasonLabel="Reason (optional)" confirmLabel="Cancel order" destructive onConfirm={(note) => { if (cancelPo) notify(state.cancelPurchase(cancelPo.id, note)); setCancelPo(null); }} />
    </>
  );
}
