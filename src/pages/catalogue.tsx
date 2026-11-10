"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Pencil, PackageSearch, Plus } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PillArt } from "@/components/common/pill-art";
import { StockBadge, SuitabilityBadge } from "@/components/common/status-badge";
import { Card, ClinicalNotice, EmptyState, GuardedButton, PageHeader, Pick, SearchInput, TextLink } from "@/components/common/ui";
import { MedicineForm } from "@/components/forms/medicine-form";
import { fmtDate } from "@/lib/dates";
import { batchStatus, rupees, stockByMedicine } from "@/lib/selectors";
import { useAppStore } from "@/store/app-store";
import type { Medicine } from "@/types";

function Inner() {
  const params = useSearchParams();
  const medicines = useAppStore((s) => s.medicines);
  const batches = useAppStore((s) => s.batches);
  const trays = useAppStore((s) => s.trays);
  const settings = useAppStore((s) => s.settings);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [form, setForm] = useState("all");
  const [suit, setSuit] = useState("all");
  const [maker, setMaker] = useState("all");
  const [viewId, setViewId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Medicine | undefined>();

  const paramQ = params.get("q");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (paramQ !== null) setQ(paramQ); }, [paramQ]);

  const stock = useMemo(() => stockByMedicine({ batches, trays }), [batches, trays]);
  const rows = useMemo(() => medicines.filter((m) => {
    if (form !== "all" && m.form !== form) return false;
    if (suit !== "all" && m.suitability !== suit) return false;
    if (maker !== "all" && m.manufacturer !== maker) return false;
    return `${m.brand} ${m.generic} ${m.strength} ${m.manufacturer}`.toLowerCase().includes(q.toLowerCase());
  }), [medicines, form, suit, maker, q]);
  const view = medicines.find((m) => m.id === viewId);
  const viewBatches = batches.filter((b) => b.medicineId === viewId).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

  return (
    <>
      <PageHeader
        title="Medicine Catalogue"
        description="Synthetic entries with illustrated placeholders. Brand and manufacturer names are invented."
        actions={<GuardedButton perm="catalogue.edit" what="add medicines" onClick={() => { setEditing(undefined); setFormOpen(true); }}><Plus /> Add Medicine</GuardedButton>}
      />
      <ClinicalNotice>This catalogue is not clinically authoritative. Suitability labels only demonstrate how the workflow behaves.</ClinicalNotice>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search generic, brand or manufacturer" />
        <Pick className="h-9 w-[150px]" value={form} onChange={setForm} options={[{ value: "all", label: "All forms" }, ...[...new Set(medicines.map((m) => m.form))].map((f) => ({ value: f, label: f }))]} />
        <Pick className="h-9 w-[180px]" value={suit} onChange={setSuit} options={[{ value: "all", label: "Any suitability" }, { value: "suitable", label: "Suitable for tray" }, { value: "review-required", label: "Review required" }, { value: "unsuitable", label: "Not for trays" }]} />
        <Pick className="h-9 w-[230px]" value={maker} onChange={setMaker} options={[{ value: "all", label: "All manufacturers" }, ...[...new Set(medicines.map((m) => m.manufacturer))].map((f) => ({ value: f, label: f }))]} />
        <p className="ml-auto text-[13px] text-muted-foreground">{rows.length} of {medicines.length} medicines</p>
      </div>
      {rows.length === 0 && <Card><EmptyState icon={<PackageSearch className="size-5" />} title="No medicines match these filters" body="Clear the search or choose a different filter." action={<Button variant="outline" onClick={() => { setQ(""); setForm("all"); setSuit("all"); setMaker("all"); }}>Clear filters</Button>} /></Card>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {rows.map((m) => (
          <button key={m.id} type="button" onClick={() => setViewId(m.id)} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none">
            <span className="flex h-[108px] items-center justify-center bg-muted"><PillArt medicine={m} size={70} /></span>
            <span className="flex flex-1 flex-col p-3">
              <span className="font-bold">{m.brand} <span className="font-medium">{m.strength}</span></span>
              <span className="text-[13px] text-muted-foreground">{m.generic}, {m.form.toLowerCase()}</span>
              <span className="text-xs text-muted-foreground">Pack of {m.packSize}</span>
              <span className="mt-2"><SuitabilityBadge status={m.suitability} /></span>
            </span>
          </button>
        ))}
      </div>
      <Sheet open={!!view} onOpenChange={(o) => !o && setViewId(null)}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-[460px]">
          {view && (
            <>
              <SheetHeader className="border-b border-border pr-12">
                <SheetTitle className="text-lg">{view.brand} {view.strength}</SheetTitle>
                <SheetDescription>{view.generic}. Synthetic demo entry {view.id}.</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 p-4">
                <div className="flex h-[170px] items-center justify-center rounded-xl bg-muted"><PillArt medicine={view} size={120} /></div>
                <p className="text-xs text-muted-foreground">Illustration only, not a product photograph.</p>
                <div>
                  <SuitabilityBadge status={view.suitability} />
                  <p className="mt-1.5 text-[13px]">{view.suitabilityNote}</p>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Dosage form</dt><dd className="font-medium">{view.form}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Pack size</dt><dd className="font-medium">{view.packSize}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Manufacturer</dt><dd className="font-medium">{view.manufacturer}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Mock unit price</dt><dd className="font-medium">{rupees(view.unitPrice)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Free stock</dt><dd className="font-medium">{stock[view.id]?.free ?? 0} units</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Reorder level</dt><dd className="font-medium">{view.reorderLevel} units</dd></div>
                </dl>
                <div>
                  <p className="mb-1.5 text-[13px] font-semibold">Batches</p>
                  {viewBatches.length === 0 && <p className="text-[13px] text-muted-foreground">No stock recorded. <TextLink href="/inventory">Add stock in inventory</TextLink></p>}
                  <ul className="space-y-1.5">
                    {viewBatches.map((b) => (
                      <li key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-[13px]">
                        <span><strong>{b.batchNumber}</strong><span className="block text-muted-foreground">{b.available} units, expires {fmtDate(b.expiryDate)}</span></span>
                        <StockBadge status={batchStatus(b, view, stock[view.id]?.free ?? 0, settings.expiryWarningDays)} />
                      </li>
                    ))}
                  </ul>
                </div>
                <GuardedButton perm="catalogue.edit" what="edit medicines" variant="outline" onClick={() => { setEditing(view); setFormOpen(true); }}><Pencil /> Edit medicine</GuardedButton>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      <MedicineForm open={formOpen} onOpenChange={setFormOpen} medicine={editing} onSaved={(id) => setViewId(id)} />
    </>
  );
}

export default function CataloguePage() {
  return <Suspense><Inner /></Suspense>;
}
