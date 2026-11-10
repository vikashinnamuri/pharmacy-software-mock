"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, PackagePlus, Pencil, Timer, XCircle } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/common/data-table";
import { PillArt } from "@/components/common/pill-art";
import { StockBadge } from "@/components/common/status-badge";
import { Card, Field, GuardedButton, notify, PageHeader, Pick, SearchInput } from "@/components/common/ui";
import { addDays, fmtDate, fmtDateTime, today } from "@/lib/dates";
import { batchStatus, inventoryAlerts, stockByMedicine, type StockStatus } from "@/lib/selectors";
import { reservedByBatch } from "@/lib/tray-engine";
import { useAppStore } from "@/store/app-store";
import type { Batch, StockMovement } from "@/types";

const addSchema = z.object({
  medicineId: z.string().min(1, "Choose a medicine"),
  batchNumber: z.string().trim().min(3, "Enter a batch number"),
  expiryDate: z.string().min(1, "Set an expiry date").refine((d) => d > today(), "Stock must not already be expired"),
  available: z.number({ error: "Enter a number" }).int().min(1, "Enter a quantity above zero"),
  location: z.string().trim().min(1, "Enter a shelf"),
});
type AddValues = z.infer<typeof addSchema>;

function AddStock({ open, onOpenChange, preset }: { open: boolean; onOpenChange: (o: boolean) => void; preset?: string }) {
  const medicines = useAppStore((s) => s.medicines);
  const addStock = useAppStore((s) => s.addStock);
  const defaults = useMemo(() => ({ medicineId: preset ?? "", batchNumber: "", expiryDate: addDays(today(), 365), available: 100, location: "A1" }), [preset]);
  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<AddValues>({ resolver: zodResolver(addSchema), defaultValues: defaults });
  useEffect(() => { if (open) reset(defaults); }, [open, reset, defaults]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add stock</DialogTitle><DialogDescription>Adds a mock batch and records a stock movement.</DialogDescription></DialogHeader>
        <form id="add-stock" className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit((v) => { if (notify(addStock(v))) onOpenChange(false); })}>
          <Field label="Medicine" error={errors.medicineId?.message} className="sm:col-span-2">
            <Controller control={control} name="medicineId" render={({ field }) => <Pick value={field.value} onChange={field.onChange} placeholder="Select medicine" options={medicines.map((m) => ({ value: m.id, label: `${m.brand} ${m.strength}` }))} />} />
          </Field>
          <Field label="Batch number" error={errors.batchNumber?.message}><Input {...register("batchNumber")} /></Field>
          <Field label="Quantity" error={errors.available?.message}><Input type="number" {...register("available", { valueAsNumber: true })} /></Field>
          <Field label="Expiry date" error={errors.expiryDate?.message}><Input type="date" {...register("expiryDate")} /></Field>
          <Field label="Shelf" error={errors.location?.message}><Input {...register("location")} /></Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="add-stock">Add stock</Button>
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
  const { register, handleSubmit, reset, formState: { errors } } = useForm<EditValues>({ resolver: zodResolver(editSchema) });
  useEffect(() => { if (batch) reset({ available: batch.available, expiryDate: batch.expiryDate, location: batch.location, reason: "" }); }, [batch, reset]);
  const reserved = batch ? reservedByBatch(trays)[batch.id] ?? 0 : 0;
  return (
    <Dialog open={!!batch} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit batch {batch?.batchNumber}</DialogTitle>
          <DialogDescription>{reserved} units are reserved for trays, so the quantity cannot go below that.</DialogDescription>
        </DialogHeader>
        <form id="edit-stock" className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit((v) => { if (batch && notify(editBatch(batch.id, v))) onClose(); })}>
          <Field label="Available quantity" error={errors.available?.message}><Input type="number" {...register("available", { valueAsNumber: true })} /></Field>
          <Field label="Expiry date" error={errors.expiryDate?.message}><Input type="date" {...register("expiryDate")} /></Field>
          <Field label="Shelf" error={errors.location?.message}><Input {...register("location")} /></Field>
          <Field label="Reason" error={errors.reason?.message}><Input placeholder="Count correction" {...register("reason")} /></Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="edit-stock">Save batch</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface Row extends Batch { reserved: number; status: StockStatus; medName: string }

function Inner() {
  const params = useSearchParams();
  const state = useAppStore();
  const { batches, medicines, trays, movements, settings } = state;
  const [q, setQ] = useState(params.get("q") ?? "");
  const [filter, setFilter] = useState(params.get("filter") ?? "all");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);
  const [tab, setTab] = useState("stock");

  const paramQ = params.get("q");
  const paramF = params.get("filter");
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { if (paramQ !== null) setQ(paramQ); }, [paramQ]);
  useEffect(() => { if (paramF !== null) setFilter(paramF); }, [paramF]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const stock = useMemo(() => stockByMedicine({ batches, trays }), [batches, trays]);
  const reserved = useMemo(() => reservedByBatch(trays), [trays]);
  const alerts = useMemo(() => inventoryAlerts({ batches, medicines, trays, settings }), [batches, medicines, trays, settings]);

  const all: Row[] = useMemo(() => batches.map((b) => {
    const med = medicines.find((m) => m.id === b.medicineId);
    return { ...b, reserved: reserved[b.id] ?? 0, status: batchStatus(b, med, stock[b.medicineId]?.free ?? 0, settings.expiryWarningDays), medName: `${med?.brand} ${med?.strength}` };
  }), [batches, medicines, reserved, stock, settings.expiryWarningDays]);

  const rows = useMemo(() => all.filter((r) => {
    if (filter === "low" && r.status !== "low" && r.status !== "out") return false;
    if (filter === "expiry" && r.status !== "expired" && r.status !== "expiring") return false;
    const med = medicines.find((m) => m.id === r.medicineId);
    return `${r.medName} ${med?.generic} ${r.batchNumber} ${r.manufacturer}`.toLowerCase().includes(q.toLowerCase());
  }), [all, filter, q, medicines]);

  const columns: ColumnDef<Row>[] = [
    {
      accessorKey: "medName", header: "Medicine", cell: ({ row }) => {
        const m = medicines.find((x) => x.id === row.original.medicineId);
        return <span className="flex items-center gap-2">{m && <PillArt medicine={m} size={26} />}<span className="font-medium">{row.original.medName}</span></span>;
      },
    },
    { accessorKey: "batchNumber", header: "Batch number", cell: ({ row }) => <span className="font-semibold">{row.original.batchNumber}</span> },
    { accessorKey: "manufacturer", header: "Manufacturer" },
    { accessorKey: "expiryDate", header: "Expiry date", cell: ({ row }) => fmtDate(row.original.expiryDate) },
    { accessorKey: "available", header: "Available" },
    { accessorKey: "reserved", header: "Reserved" },
    { accessorKey: "status", header: "Stock status", cell: ({ row }) => <StockBadge status={row.original.status} /> },
    { id: "edit", header: "", enableSorting: false, cell: ({ row }) => <GuardedButton size="sm" variant="ghost" perm="inventory.edit" what="edit stock" onClick={() => setEditing(row.original)}><Pencil /> Edit</GuardedButton> },
  ];
  const moveColumns: ColumnDef<StockMovement>[] = [
    { accessorKey: "at", header: "When", cell: ({ row }) => fmtDateTime(row.original.at) },
    { id: "medicine", accessorFn: (m) => medicines.find((x) => x.id === m.medicineId)?.brand ?? "", header: "Medicine" },
    { id: "batch", accessorFn: (m) => batches.find((b) => b.id === m.batchId)?.batchNumber ?? "", header: "Batch" },
    { accessorKey: "type", header: "Type", cell: ({ row }) => <span className="capitalize">{row.original.type.replace("-", " ")}</span> },
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
        description="Mock stock by batch. Reserved units are held by trays in progress and leave stock only when a tray is supplied."
        actions={<GuardedButton perm="inventory.edit" what="add stock" onClick={() => setAddOpen(true)}><PackagePlus /> Add Stock</GuardedButton>}
      />
      <div className="mb-3 grid gap-3 md:grid-cols-3">
        <AlertCard icon={AlertTriangle} tone="text-warn" label="Low stock" count={alerts.low.length} active={filter === "low"} onClick={() => { setFilter(filter === "low" ? "all" : "low"); setTab("stock"); }} list={alerts.low.slice(0, 3).map((l) => l.medicine.brand).join(", ")} />
        <AlertCard icon={Timer} tone="text-warn" label={`Expiring within ${settings.expiryWarningDays} days`} count={alerts.expiring.length} active={filter === "expiry"} onClick={() => { setFilter(filter === "expiry" ? "all" : "expiry"); setTab("stock"); }} list={alerts.expiring.slice(0, 3).map((b) => b.batchNumber).join(", ")} />
        <AlertCard icon={XCircle} tone="text-danger" label="Expired, still on the shelf" count={alerts.expired.length} active={filter === "expiry"} onClick={() => { setFilter(filter === "expiry" ? "all" : "expiry"); setTab("stock"); }} list={alerts.expired.map((b) => b.batchNumber).join(", ")} />
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
        <TabsList><TabsTrigger value="stock">Stock by batch</TabsTrigger><TabsTrigger value="moves">Stock movement history</TabsTrigger></TabsList>
        <TabsContent value="stock" className="pt-2">
          <Card>
            <div className="flex flex-wrap gap-2 p-3">
              <SearchInput value={q} onChange={setQ} placeholder="Search medicine, batch or manufacturer" />
              <Pick className="h-9 w-[180px]" value={filter} onChange={setFilter} options={[{ value: "all", label: "All batches" }, { value: "low", label: "Low stock" }, { value: "expiry", label: "Expired or expiring" }]} />
              <p className="ml-auto self-center text-[13px] text-muted-foreground">{rows.length} of {all.length} batches</p>
            </div>
            <DataTable data={rows} columns={columns} pageSize={12} initialSort={[{ id: "expiryDate", desc: false }]} getRowId={(r) => r.id} />
          </Card>
        </TabsContent>
        <TabsContent value="moves" className="pt-2">
          <Card><DataTable data={movements} columns={moveColumns} pageSize={15} initialSort={[{ id: "at", desc: true }]} getRowId={(r) => r.id} /></Card>
        </TabsContent>
      </Tabs>
      <AddStock open={addOpen} onOpenChange={setAddOpen} />
      <EditStock batch={editing} onClose={() => setEditing(null)} />
    </>
  );
}

export default function InventoryPage() {
  return <Suspense><Inner /></Suspense>;
}
