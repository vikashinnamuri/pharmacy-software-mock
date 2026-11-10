import { addDays, daysBetween, today } from "@/lib/dates";
import { ACTIVE_ORDER, DONE_ORDER } from "@/lib/orders";
import { can } from "@/lib/permissions";
import { fillable, isExpired, reservedByBatch, trayProgress } from "@/lib/tray-engine";
import type { AppData } from "@/types/state";
import type { Batch, Invoice, Medicine, Role, Tray, TrayStatus } from "@/types";

export type StockStatus = "expired" | "expiring" | "out" | "low" | "ok";

type StockInput = Pick<AppData, "batches" | "trays"> & Partial<Pick<AppData, "orders">>;

export function stockByMedicine(d: StockInput) {
  const reserved = reservedByBatch(d.trays, d.orders ?? []);
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

export function inventoryAlerts(d: StockInput & Pick<AppData, "medicines" | "settings">) {
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

export const MDS_PENDING: TrayStatus[] = ["scheduled", "awaiting-rx-validation", "proposed", "awaiting-preparation", "in-preparation", "correction-requested"];
export const isToday = (iso?: string) => !!iso && iso.slice(0, 10) === today();
/** Local-date check for ISO timestamps stored in UTC. */
export const isTodayLocal = (iso?: string) => {
  if (!iso) return false;
  const d = new Date(iso);
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
};

export function kpis(d: AppData) {
  const alerts = inventoryAlerts(d);
  const orders = d.orders;
  const ordersAwaitingReview = orders.filter((o) => o.status === "awaiting-review").length;
  const pendingRx = d.prescriptions.filter((p) => p.status === "pending").length;
  return {
    totalPatients: d.patients.length,
    activeRx: d.prescriptions.filter((p) => p.status === "verified").length,
    mdsPatients: d.enrolments.filter((e) => e.status === "active").length,
    pendingPreparation: d.trays.filter((t) => ["awaiting-preparation", "in-preparation", "correction-requested"].includes(t.status)).length,
    awaitingVerification: d.trays.filter((t) => t.status === "awaiting-verification").length,
    readyForSupply: d.trays.filter((t) => t.status === "approved" || t.status === "ready").length,
    lowStock: alerts.low.length,
    expiring: alerts.expiring.length + alerts.expired.length,
    pendingRx,
    alerts,
    // Operational counters for the dashboard.
    todaysOrders: orders.filter((o) => isTodayLocal(o.createdAt)).length,
    pendingReviews: pendingRx + ordersAwaitingReview,
    ordersAwaitingReview,
    patientsWaiting: new Set(orders.filter((o) => o.fulfilment === "collection" && ACTIVE_ORDER.includes(o.status) && o.status !== "on-hold" && o.status !== "new").map((o) => o.patientId)).size,
    awaitingPayment: orders.filter((o) => o.status === "awaiting-payment").length,
    ordersInPreparation: orders.filter((o) => o.status === "payment-received" || o.status === "in-preparation").length,
    ordersAwaitingVerification: orders.filter((o) => o.status === "awaiting-verification").length,
    allAwaitingVerification: orders.filter((o) => o.status === "awaiting-verification").length + d.trays.filter((t) => t.status === "awaiting-verification").length,
    readyForCollection: orders.filter((o) => o.status === "ready-collection" && o.fulfilment === "collection").length + d.trays.filter((t) => t.status === "ready" && t.fulfilment?.method !== "delivery").length,
    outForDelivery: d.deliveries.filter((x) => x.status === "out").length,
    mdsTraysPending: d.trays.filter((t) => MDS_PENDING.includes(t.status)).length,
    completedOrders: orders.filter((o) => DONE_ORDER.includes(o.status) && isTodayLocal(o.completedAt)).length,
    enrolmentsPending: d.enrolments.filter((e) => e.status === "pending-review").length,
  };
}

export const activeMedicineCount = (d: Pick<AppData, "prescriptions">, patientId: string) =>
  new Set(d.prescriptions.filter((p) => p.patientId === patientId && p.status === "verified").flatMap((p) => p.lines.map((l) => l.medicineId))).size;

export function nextTrayDate(d: Pick<AppData, "trays">, patientId: string): string | null {
  const open = d.trays
    .filter((t) => t.patientId === patientId && !["supplied", "rejected", "cancelled"].includes(t.status))
    .map((t) => t.weekStart)
    .sort();
  return open[0] ?? null;
}

export const enrolmentFor = (d: Pick<AppData, "enrolments">, patientId: string) =>
  d.enrolments.filter((e) => e.patientId === patientId).sort((a, b) => b.id.localeCompare(a.id))[0];

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
  if (can(role, "order.review")) {
    d.orders.filter((o) => o.status === "awaiting-review").forEach((o) =>
      out.push({ id: `ord-rev-${o.id}-${o.events.length}`, title: "Dispensing order to review", detail: `${o.id}, token ${o.token}, ${name(o.patientId)}`, href: `/dispensing?order=${o.id}`, tone: "info" }),
    );
    d.orders.filter((o) => o.status === "awaiting-verification").forEach((o) =>
      out.push({ id: `ord-ver-${o.id}-${o.events.length}`, title: "Order waiting for final check", detail: `${o.id}, token ${o.token}`, href: `/dispensing?order=${o.id}`, tone: "info" }),
    );
  }
  if (can(role, "mds.approve")) {
    d.enrolments.filter((e) => e.status === "pending-review").forEach((e) =>
      out.push({ id: `enr-${e.id}-${e.history.length}`, title: "MDS suitability review needed", detail: name(e.patientId), href: `/patients/${e.patientId}?tab=mds-enrolment`, tone: "info" }),
    );
  }
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
    d.trays.filter((t) => t.status === "awaiting-rx-validation").forEach((t) =>
      out.push({ id: `rxval-${t.id}-${t.events.length}`, title: "Planned week flagged by a prescription change", detail: `${t.id} for ${name(t.patientId)}`, href: `/mds?patient=${t.patientId}`, tone: "warn" }),
    );
  }
  if (can(role, "order.payment")) {
    d.orders.filter((o) => o.status === "awaiting-payment").forEach((o) =>
      out.push({ id: `ord-pay-${o.id}`, title: "Payment to record", detail: `${o.id}, token ${o.token}, ${name(o.patientId)}`, href: `/dispensing?order=${o.id}`, tone: "info" }),
    );
  }
  if (can(role, "order.prepare")) {
    d.orders.filter((o) => o.status === "payment-received").forEach((o) =>
      out.push({ id: `ord-prep-${o.id}`, title: "Order paid, ready to prepare", detail: `${o.id}, token ${o.token}`, href: `/dispensing?order=${o.id}`, tone: "info" }),
    );
  }
  if (can(role, "order.fulfil")) {
    d.orders.filter((o) => o.status === "ready-collection" && o.fulfilment === "collection").forEach((o) =>
      out.push({ id: `ord-ready-${o.id}`, title: "Ready for collection", detail: `Token ${o.token}, ${name(o.patientId)}`, href: `/collection`, tone: "info" }),
    );
  }
  if (can(role, "delivery.manage")) {
    d.deliveries.filter((x) => x.status === "scheduled").forEach((x) =>
      out.push({ id: `dlv-${x.id}`, title: "Delivery waiting for dispatch", detail: `${x.id} for ${name(x.patientId)}`, href: `/collection?tab=delivery`, tone: "info" }),
    );
    d.deliveries.filter((x) => x.status === "out").forEach((x) =>
      out.push({ id: `dlv-out-${x.id}`, title: "Out for delivery", detail: `${x.id} to ${name(x.patientId)}`, href: `/collection?tab=delivery`, tone: "info" }),
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

/** Invoice arithmetic. Discounts come off before GST. Medicine and service charges are kept apart. */
export const invoiceTotals = (inv: Pick<Invoice, "lines"> & Partial<Pick<Invoice, "payments">>) => {
  let gross = 0, discount = 0, gst = 0, medicine = 0, service = 0;
  for (const l of inv.lines) {
    const lineGross = l.qty * l.unitPrice;
    const lineDisc = Math.min(lineGross, Math.max(0, l.discount ?? 0));
    const net = lineGross - lineDisc;
    const tax = (net * l.gstRate) / 100;
    gross += lineGross; discount += lineDisc; gst += tax;
    if (l.kind === "product") medicine += net + tax; else service += net + tax;
  }
  const subtotal = gross - discount;
  const total = subtotal + gst;
  const payments = inv.payments ?? [];
  const paid = payments.filter((p) => p.kind === "payment").reduce((n, p) => n + p.amount, 0);
  const refunded = -payments.filter((p) => p.kind === "refund").reduce((n, p) => n + p.amount, 0);
  const adjusted = payments.filter((p) => p.kind === "adjustment").reduce((n, p) => n + p.amount, 0);
  const balance = Math.round((total + adjusted - paid + refunded) * 100) / 100;
  return { gross, discount, subtotal, gst, total, medicine, service, paid, refunded, adjusted, balance };
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
