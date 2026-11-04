import { addDays, mondayOf, stamp, today } from "@/lib/dates";
import { contentsFingerprint, generateSchedule, sourceFingerprint } from "@/lib/tray-engine";
import type { Activity, AppData, StockMovement, Tray, TrayStatus } from "@/types/state";
import { buildBatches, buildMovements } from "./batches";
import { buildInvoices, buildSubscriptions } from "./billing";
import { MEDICINES } from "./medicines";
import { buildPatients } from "./patients";
import { buildPrescriptions } from "./prescriptions";
import { STAFF } from "./staff";

const DIVYA = "Divya S. (demo)";
const ARJUN = "Arjun R. (demo)";

export function buildSeed(): AppData {
  const patients = buildPatients();
  const medicines = MEDICINES.map((m) => ({ ...m }));
  const prescriptions = buildPrescriptions();
  const batches = buildBatches();
  const movements = buildMovements();
  const invoices = buildInvoices();
  const subscriptions = buildSubscriptions();
  const week0 = mondayOf(today());
  const weekPrev = addDays(week0, -7);
  const weekNext = addDays(week0, 7);
  const trays: Tray[] = [];
  let ev = 0;
  let mv = 5000;

  const make = (n: number, patientId: string, weekStart: string, overrideRx?: typeof prescriptions): Tray => {
    const id = `TRY-${1000 + n}`;
    const rxList = overrideRx ?? prescriptions;
    const { compartments, flags, prescriptionIds } = generateSchedule({ patientId, weekStart, trayId: id, prescriptions: rxList, medicines, batches, otherTrays: trays, today: today() });
    const tray: Tray = {
      id, patientId, weekStart, type: "standard", status: "proposed", compartments, flags, prescriptionIds,
      sourceFingerprint: sourceFingerprint(prescriptionIds, patientId, rxList, medicines),
      events: [], inventoryDeducted: false,
    };
    trays.push(tray);
    return tray;
  };

  const evt = (t: Tray, type: Tray["events"][number]["type"], daysAgo: number, hour: number, note?: string) => {
    const pharmacistActs = ["schedule-approved", "approved", "rejected", "correction-requested", "invalidated"].includes(type);
    t.events.push({ id: `EV-${++ev}`, at: stamp(daysAgo, hour, 20), by: pharmacistActs ? ARJUN : DIVYA, role: pharmacistActs ? "pharmacist" : "dispenser", type, note });
  };

  const prepare = (t: Tray, count: number, daysAgo: number) => {
    t.compartments.filter((c) => c.items.length).slice(0, count).forEach((c, i) => {
      c.status = "prepared";
      c.preparedBy = DIVYA;
      c.preparedAt = stamp(daysAgo, 11, Math.min(59, 2 + i * 2));
    });
  };
  const prepareAll = (t: Tray, daysAgo: number) => prepare(t, 99, daysAgo);

  const toStatus = (t: Tray, status: TrayStatus) => { t.status = status; };

  const supply = (t: Tray, daysAgo: number) => {
    const units: Record<string, number> = {};
    t.compartments.forEach((c) => c.items.forEach((i) => { if (i.batchId) units[i.batchId] = (units[i.batchId] ?? 0) + i.qty; }));
    Object.entries(units).forEach(([batchId, qty]) => {
      const b = batches.find((x) => x.id === batchId)!;
      b.available -= qty;
      const m: StockMovement = { id: `MV-${++mv}`, at: stamp(daysAgo, 17, 5), batchId, medicineId: b.medicineId, type: "dispensed", qty: -qty, reference: t.id, by: DIVYA };
      movements.push(m);
    });
    t.inventoryDeducted = true;
    t.suppliedAt = stamp(daysAgo, 17, 5);
    t.status = "supplied";
  };

  const fullRun = (t: Tray, base: number) => {
    evt(t, "generated", base + 2, 9);
    evt(t, "schedule-approved", base + 2, 10);
    prepareAll(t, base + 1);
    evt(t, "submitted", base + 1, 12);
    evt(t, "approved", base + 1, 15, "All checks completed in the demo checklist.");
    t.approvedFingerprint = contentsFingerprint(t);
  };

  // Standard weekly trays, supplied last week.
  const t1 = make(1, "PT-1001", weekPrev); fullRun(t1, 7); supply(t1, 7); evt(t1, "supplied", 7, 17);
  const t2 = make(2, "PT-1002", weekPrev); fullRun(t2, 8); supply(t2, 8); evt(t2, "supplied", 8, 17);
  const t3 = make(3, "PT-1010", weekPrev); fullRun(t3, 8); supply(t3, 8); evt(t3, "supplied", 8, 17);

  // Approved and ready for supply.
  const t4 = make(4, "PT-1002", week0); fullRun(t4, 1); toStatus(t4, "approved");

  // Awaiting preparation.
  const t5 = make(5, "PT-1003", week0); evt(t5, "generated", 2, 9); evt(t5, "schedule-approved", 2, 11); toStatus(t5, "awaiting-preparation");

  // Part-way through preparation.
  const t6 = make(6, "PT-1004", week0); evt(t6, "generated", 2, 9); evt(t6, "schedule-approved", 2, 11); prepare(t6, 11, 0); toStatus(t6, "in-preparation");

  // Awaiting pharmacist verification.
  const t7 = make(7, "PT-1005", week0); evt(t7, "generated", 2, 9); evt(t7, "schedule-approved", 2, 10); prepareAll(t7, 0); evt(t7, "submitted", 0, 9); toStatus(t7, "awaiting-verification");

  // Rejected tray, then a replacement waiting for preparation.
  const t8 = make(8, "PT-1006", week0); evt(t8, "generated", 3, 9); evt(t8, "schedule-approved", 3, 10); prepareAll(t8, 2); evt(t8, "submitted", 2, 13);
  evt(t8, "rejected", 2, 16, "Wrong strength seen in Wednesday morning. Rebuild the tray."); toStatus(t8, "rejected");
  const t9 = make(9, "PT-1006", week0); t9.type = "replacement"; t9.replacementOf = t8.id;
  evt(t9, "replacement-created", 1, 10, `Replaces ${t8.id}`); evt(t9, "schedule-approved", 1, 11); toStatus(t9, "awaiting-preparation");

  // Prescription change invalidated an approval.
  const oldRx = prescriptions.map((p) =>
    p.id === "RX-2007" ? { ...p, status: "verified" as const } : p.id === "RX-2008" ? { ...p, status: "discontinued" as const } : p,
  );
  const t10 = make(10, "PT-1007", week0, oldRx); fullRun(t10, 2);
  t10.status = "approval-invalidated";
  t10.needsRegeneration = true;
  t10.invalidatedReason = "RX-2007 was replaced by RX-2008 after this tray was approved.";
  evt(t10, "invalidated", 1, 9, t10.invalidatedReason);

  // Proposed schedule with lines the generator refused to place.
  const t11 = make(11, "PT-1008", week0); evt(t11, "generated", 0, 8);

  // Correction requested on one compartment.
  const t12 = make(12, "PT-1009", week0); evt(t12, "generated", 3, 9); evt(t12, "schedule-approved", 3, 10); prepareAll(t12, 1); evt(t12, "submitted", 1, 12);
  const corr = t12.compartments.find((c) => c.day === 2 && c.period === "morning")!;
  corr.status = "pending"; corr.preparedAt = undefined; corr.preparedBy = undefined;
  corr.correctionNote = "Count looks short. Recheck Wednesday morning.";
  evt(t12, "correction-requested", 1, 15, corr.correctionNote); toStatus(t12, "correction-requested");

  // Next week, ready to start.
  const t13 = make(13, "PT-1003", weekNext); evt(t13, "generated", 0, 9); evt(t13, "schedule-approved", 0, 9); toStatus(t13, "awaiting-preparation");

  const name = (pid: string) => patients.find((p) => p.id === pid)!.name;
  const activity: Activity[] = [];
  let ac = 0;
  const push = (a: Omit<Activity, "id">) => activity.push({ ...a, id: `AC-${++ac}` });

  const EVENT_TEXT: Record<string, string> = {
    generated: "generated a proposed schedule",
    "schedule-approved": "approved the proposed schedule",
    submitted: "submitted the tray for verification",
    approved: "approved the tray",
    rejected: "rejected the tray",
    "correction-requested": "requested a correction",
    invalidated: "approval was invalidated",
    supplied: "marked the tray supplied",
    "replacement-created": "created a replacement tray",
  };
  trays.forEach((t) => {
    t.events.forEach((e) => {
      const kind = ["approved", "rejected", "correction-requested", "invalidated"].includes(e.type) ? "verification" : "tray";
      push({
        at: e.at, actor: e.by, role: e.role, kind, patientId: t.patientId, trayId: t.id,
        summary: `${t.id} for ${name(t.patientId)}: ${EVENT_TEXT[e.type]}${e.note ? `. ${e.note}` : ""}`,
      });
    });
    const preps = t.compartments.filter((c) => c.status === "prepared" && c.preparedAt);
    if (preps.length) {
      push({ at: preps[preps.length - 1].preparedAt!, actor: DIVYA, role: "dispenser", kind: "preparation", patientId: t.patientId, trayId: t.id, summary: `${t.id} for ${name(t.patientId)}: prepared ${preps.length} compartments` });
    }
  });
  prescriptions.forEach((p) => {
    p.history.forEach((h) => {
      push({ at: h.at, actor: h.by, role: h.role, kind: "prescription", patientId: p.patientId, prescriptionId: p.id, summary: `${p.id} for ${name(p.patientId)}: ${h.action.toLowerCase()}${h.note ? `. ${h.note}` : ""}` });
    });
  });
  patients.forEach((p) => {
    push({ at: stamp(Math.max(0, Math.round((Date.now() - new Date(p.registeredOn).getTime()) / 86400000)), 9, 40), actor: "Meena K. (demo)", role: "admin", kind: "patient", patientId: p.id, summary: `Registered ${p.name} (${p.id})` });
  });
  push({ at: stamp(16, 12, 0), actor: "Meena K. (demo)", role: "admin", kind: "inventory", summary: "Adjusted Lasinex batch LSX-2401 by -6 after a count" });
  invoices.filter((i) => i.status === "paid").slice(-3).forEach((i) => {
    push({ at: stamp(Math.max(0, Math.round((Date.now() - new Date(i.issuedOn).getTime()) / 86400000) - 1), 14, 30), actor: "Meena K. (demo)", role: "admin", kind: "billing", patientId: i.patientId, summary: `Recorded ${i.id} as paid (simulated)` });
  });
  activity.sort((a, b) => b.at.localeCompare(a.at));

  return {
    patients, medicines, prescriptions, batches, movements, trays, invoices, subscriptions, activity,
    staff: STAFF,
    settings: {
      pharmacyName: "Marina Care Pharmacy",
      addressLine: "Demo Street, Mylapore, Chennai 600004",
      phone: "+91 90000 00000",
      gstPlaceholder: "33AAAAA0000A1Z5 (sample)",
      defaultGstRate: 12,
      lowStockDays: 14,
      expiryWarningDays: 60,
      autoAdvance: true,
      tourEnabled: true,
    },
  };
}
