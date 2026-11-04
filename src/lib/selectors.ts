import { addDays, daysBetween, today } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { fillable, isExpired, reservedByBatch, trayProgress } from "@/lib/tray-engine";
import type { AppData } from "@/types/state";
import type { Batch, Invoice, Medicine, Role, Tray } from "@/types";

export type StockStatus = "expired" | "expiring" | "out" | "low" | "ok";

export function stockByMedicine(d: Pick<AppData, "batches" | "trays">) {
  const reserved = reservedByBatch(d.trays);
  const out: Record<string, { usable: number; reserved: number; free: number }> = {};
  const now = today();
  for (const b of d.batches) {
    const row = (out[b.medicineId] ??= { usable: 0, reserved: 0, free: 0 });
    if (!isExpired(b, now)) {
      row.usable += b.available;
      row.reserved += reserved[b.id] ?? 0;
      row.free += Math.max(0, b.available - (reserved[b.id] ?? 0));
    }
  }
  return out;
}

export function batchStatus(b: Batch, med: Medicine | undefined, freeForMedicine: number, warnDays: number): StockStatus {
  const now = today();
  if (isExpired(b, now)) return "expired";
  if (b.available <= 0) return "out";
  if (daysBetween(now, b.expiryDate) <= warnDays) return "expiring";
  if (med && freeForMedicine < med.reorderLevel) return "low";
  return "ok";
}

export function inventoryAlerts(d: Pick<AppData, "batches" | "medicines" | "trays" | "settings">) {
  const stock = stockByMedicine(d);
  const now = today();
  const expired = d.batches.filter((b) => isExpired(b, now) && b.available > 0);
  const expiring = d.batches
    .filter((b) => !isExpired(b, now) && b.available > 0 && daysBetween(now, b.expiryDate) <= d.settings.expiryWarningDays)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  const low = d.medicines
    .filter((m) => d.batches.some((b) => b.medicineId === m.id) && (stock[m.id]?.free ?? 0) < m.reorderLevel)
    .map((m) => ({ medicine: m, free: stock[m.id]?.free ?? 0 }))
    .sort((a, b) => a.free / a.medicine.reorderLevel - b.free / b.medicine.reorderLevel);
  return { expired, expiring, low };
}

export function kpis(d: AppData) {
  const alerts = inventoryAlerts(d);
  return {
    totalPatients: d.patients.length,
    activeRx: d.prescriptions.filter((p) => p.status === "verified").length,
    mdsPatients: d.patients.filter((p) => p.mdsStatus === "active").length,
    pendingPreparation: d.trays.filter((t) => ["awaiting-preparation", "in-preparation", "correction-requested"].includes(t.status)).length,
    awaitingVerification: d.trays.filter((t) => t.status === "awaiting-verification").length,
    readyForSupply: d.trays.filter((t) => t.status === "approved").length,
    lowStock: alerts.low.length,
    expiring: alerts.expiring.length + alerts.expired.length,
    pendingRx: d.prescriptions.filter((p) => p.status === "pending").length,
    alerts,
  };
}

export const activeMedicineCount = (d: Pick<AppData, "prescriptions">, patientId: string) =>
  new Set(d.prescriptions.filter((p) => p.patientId === patientId && p.status === "verified").flatMap((p) => p.lines.map((l) => l.medicineId))).size;

export function nextTrayDate(d: Pick<AppData, "trays">, patientId: string): string | null {
  const open = d.trays
    .filter((t) => t.patientId === patientId && t.status !== "supplied" && t.status !== "rejected")
    .map((t) => t.weekStart)
    .sort();
  return open[0] ?? null;
}

export interface Notification {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: "info" | "warn" | "danger";
}

export function notificationsFor(d: AppData, role: Role): Notification[] {
  const out: Notification[] = [];
  const name = (id: string) => d.patients.find((p) => p.id === id)?.name ?? id;
  if (can(role, "tray.verify")) {
    d.trays.filter((t) => t.status === "awaiting-verification").forEach((t) =>
      out.push({ id: `verify-${t.id}-${t.events.length}`, title: "Tray waiting for your check", detail: `${t.id} for ${name(t.patientId)}`, href: `/verification?tray=${t.id}`, tone: "info" }),
    );
    d.prescriptions.filter((p) => p.status === "pending").forEach((p) =>
      out.push({ id: `rx-${p.id}-${p.history.length}`, title: "Prescription waiting for review", detail: `${p.id} for ${name(p.patientId)}`, href: `/prescriptions?review=${p.id}`, tone: "info" }),
    );
    d.trays.filter((t) => t.status === "proposed").forEach((t) =>
      out.push({ id: `sched-${t.id}-${t.events.length}`, title: "Proposed schedule to approve", detail: `${t.id} for ${name(t.patientId)}`, href: `/trays?tray=${t.id}`, tone: "info" }),
    );
  }
  if (can(role, "tray.prepare")) {
    d.trays.filter((t) => t.status === "correction-requested").forEach((t) =>
      out.push({ id: `corr-${t.id}-${t.events.length}`, title: "Correction requested", detail: `${t.id} for ${name(t.patientId)}`, href: `/preparation?tray=${t.id}`, tone: "warn" }),
    );
    d.trays.filter((t) => t.status === "awaiting-preparation").forEach((t) =>
      out.push({ id: `prep-${t.id}-${t.events.length}`, title: "Tray ready to prepare", detail: `${t.id} for ${name(t.patientId)}`, href: `/preparation?tray=${t.id}`, tone: "info" }),
    );
  }
  d.trays.filter((t) => t.status === "approval-invalidated").forEach((t) =>
    out.push({ id: `inv-${t.id}-${t.events.length}`, title: "Tray approval invalidated", detail: `${t.id} for ${name(t.patientId)}`, href: `/trays?tray=${t.id}`, tone: "danger" }),
  );
  d.trays.filter((t) => t.status === "rejected" && !d.trays.some((x) => x.replacementOf === t.id)).forEach((t) =>
    out.push({ id: `rej-${t.id}`, title: "Rejected tray needs a replacement", detail: `${t.id} for ${name(t.patientId)}`, href: `/trays?tray=${t.id}`, tone: "danger" }),
  );
  if (can(role, "inventory.edit")) {
    const a = inventoryAlerts(d);
    a.expired.forEach((b) => out.push({ id: `exp-${b.id}`, title: "Expired stock on the shelf", detail: `Batch ${b.batchNumber}`, href: `/inventory?q=${b.batchNumber}`, tone: "danger" }));
    a.low.slice(0, 4).forEach((l) => out.push({ id: `low-${l.medicine.id}-${l.free}`, title: "Low stock", detail: `${l.medicine.brand}: ${l.free} free`, href: `/inventory?q=${encodeURIComponent(l.medicine.brand)}`, tone: "warn" }));
  }
  return out;
}

export const invoiceTotals = (inv: Pick<Invoice, "lines">) => {
  const subtotal = inv.lines.reduce((n, l) => n + l.qty * l.unitPrice, 0);
  const gst = inv.lines.reduce((n, l) => n + (l.qty * l.unitPrice * l.gstRate) / 100, 0);
  return { subtotal, gst, total: subtotal + gst };
};

export const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const upcomingPreparations = (d: Pick<AppData, "trays" | "patients">) =>
  d.trays
    .filter((t) => ["proposed", "awaiting-preparation", "in-preparation", "correction-requested"].includes(t.status))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((t) => ({ tray: t, patient: d.patients.find((p) => p.id === t.patientId), progress: trayProgress(t) }));

export const trayUnits = (t: Tray) => fillable(t).length;
export const isWithinDays = (date: string, days: number) => daysBetween(today(), date) <= days;
export { addDays };
