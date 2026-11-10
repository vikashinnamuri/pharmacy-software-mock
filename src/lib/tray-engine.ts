import { addDays, DAY_NAMES, parseDate } from "@/lib/dates";
import type { Batch, Compartment, Medicine, Order, OrderStatus, Period, Prescription, PrescriptionLine, Tray, TrayFlag, TrayStatus } from "@/types";
import { ALL_PERIODS, BF_PERIODS, PERIODS } from "@/types";

export const REQUIRES_REVIEW = "Requires Pharmacist Review";

/** Trays in these states hold stock back from other trays and orders. */
const RESERVING: TrayStatus[] = ["awaiting-preparation", "in-preparation", "awaiting-verification", "correction-requested", "approved", "approval-invalidated", "ready", "on-hold"];
/** Orders hold their allocated batches in these states, until stock is deducted at hand-over. */
export const ORDER_RESERVING: OrderStatus[] = ["awaiting-payment", "payment-received", "in-preparation", "awaiting-verification", "ready-collection", "on-hold"];

export const isReserving = (t: Tray) => RESERVING.includes(t.status) && !(t.status === "on-hold" && !t.heldFrom?.match(/preparation|verification|approved|ready/));

export const reservedByBatch = (trays: Tray[], orders: Order[] = []) => {
  const map: Record<string, number> = {};
  for (const t of trays) {
    if (!isReserving(t) || t.inventoryDeducted) continue;
    for (const c of t.compartments) for (const i of c.items) if (i.batchId) map[i.batchId] = (map[i.batchId] ?? 0) + i.qty;
  }
  for (const o of orders) {
    if (!ORDER_RESERVING.includes(o.status) || o.inventoryDeducted) continue;
    for (const l of o.lines) for (const a of l.allocations) map[a.batchId] = (map[a.batchId] ?? 0) + a.qty;
  }
  return map;
};

export const isExpired = (b: Batch, on: string) => parseDate(b.expiryDate) < parseDate(on);

/** The rows of a patient's tray: the four standard periods plus any approved extras, in display order. */
export const trayPeriods = (approved: Period[] = []) => ALL_PERIODS.filter((p) => PERIODS.includes(p) || approved.includes(p));

/**
 * Why a line cannot go in a tray, or null when it can. The generator never
 * guesses: anything not explicitly structured and pharmacist-approved stays out.
 */
export function lineBlockReason(line: PrescriptionLine, med: Medicine | undefined, approvedPeriods?: Period[]): string | null {
  if (!med) return `${REQUIRES_REVIEW}: medicine not found in catalogue.`;
  if (line.trayDecision === "keep-out") return `Kept out by pharmacist${line.decisionNote ? `: ${line.decisionNote}` : "."}`;
  if (med.suitability === "unsuitable") return `${REQUIRES_REVIEW}: the catalogue marks this medicine unsuitable for trays.`;
  if (line.trayDecision === "undecided") return `${REQUIRES_REVIEW}: no tray decision recorded.`;
  if (line.frequency === "as-required") return `${REQUIRES_REVIEW}: taken as required, so it has no fixed compartment.`;
  if (line.frequency === "weekly" && line.days?.length !== 1) return `${REQUIRES_REVIEW}: the day of the week is not structured.`;
  if (line.frequency === "unclear") return `${REQUIRES_REVIEW}: the frequency is unclear.`;
  if (!line.unitsPerDose || line.unitsPerDose < 1) return `${REQUIRES_REVIEW}: the dose is not structured.`;
  if (!line.times.length) return `${REQUIRES_REVIEW}: no administration time recorded.`;
  if (approvedPeriods) {
    const missing = line.times.filter((t) => BF_PERIODS.includes(t) && !approvedPeriods.includes(t));
    if (missing.length) return `${REQUIRES_REVIEW}: ${missing.map(periodName).join(", ")} is not an approved period on this patient's MDS enrolment.`;
  }
  return null;
}

const PERIOD_NAME: Record<Period, string> = {
  "bf-breakfast": "Before Breakfast",
  morning: "Morning",
  "bf-lunch": "Before Lunch",
  lunchtime: "Lunchtime",
  "bf-evening": "Before Evening Meal",
  evening: "Evening",
  bedtime: "Bedtime",
};
export const periodName = (p: Period) => PERIOD_NAME[p];

export interface GeneratedSchedule {
  compartments: Compartment[];
  flags: TrayFlag[];
  prescriptionIds: string[];
}

export function generateSchedule(args: {
  patientId: string;
  weekStart: string;
  trayId: string;
  prescriptions: Prescription[];
  medicines: Medicine[];
  batches: Batch[];
  otherTrays: Tray[];
  orders?: Order[];
  today: string;
  /** Extra periods approved on the patient's enrolment. */
  approvedPeriods?: Period[];
  /** Line ids a pharmacist left out of this week only. */
  exclusions?: string[];
}): GeneratedSchedule {
  const { patientId, weekStart, trayId, prescriptions, medicines, batches, otherTrays, today, approvedPeriods = [], exclusions = [] } = args;
  const verified = prescriptions.filter((p) => p.patientId === patientId && p.status === "verified");
  const reserved = reservedByBatch(otherTrays, args.orders ?? []);
  const allocated: Record<string, number> = {};
  const flags: TrayFlag[] = [];
  const usedRx = new Set<string>();
  let itemSeq = 0;

  const rows = trayPeriods(approvedPeriods);
  const compartments: Compartment[] = [];
  for (let day = 0; day < 7; day++) {
    for (const period of rows) {
      compartments.push({ id: `${trayId}-${day}-${period}`, day, period, items: [], status: "empty" });
    }
  }

  const pickBatch = (medicineId: string, qty: number) => {
    const options = batches
      .filter((b) => b.medicineId === medicineId && !isExpired(b, today))
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    for (const b of options) {
      const free = b.available - (reserved[b.id] ?? 0) - (allocated[b.id] ?? 0);
      if (free >= qty) {
        allocated[b.id] = (allocated[b.id] ?? 0) + qty;
        return b.id;
      }
    }
    return null;
  };

  const place = (rx: Prescription, line: PrescriptionLine, day: number, period: Period) => {
    const c = compartments.find((x) => x.day === day && x.period === period)!;
    c.items.push({
      id: `${c.id}-${++itemSeq}`,
      lineId: line.id,
      prescriptionId: rx.id,
      medicineId: line.medicineId,
      strength: line.strength,
      qty: line.unitsPerDose!,
      batchId: pickBatch(line.medicineId, line.unitsPerDose!),
    });
    c.status = "pending";
  };

  for (const rx of verified) {
    for (const line of rx.lines) {
      const med = medicines.find((m) => m.id === line.medicineId);
      const excluded = exclusions.includes(line.id);
      const reason = excluded ? "Left out of this week by the pharmacist." : lineBlockReason(line, med, approvedPeriods);
      if (reason) {
        flags.push({ lineId: line.id, prescriptionId: rx.id, medicineId: line.medicineId, reason });
        continue;
      }
      let placed = false;
      for (let day = 0; day < 7; day++) {
        const date = addDays(weekStart, day);
        if (date < line.startDate || date > line.endDate) continue;
        if (line.days?.length && !line.days.includes(day)) continue;
        for (const period of line.times) {
          place(rx, line, day, period);
          placed = true;
        }
      }
      if (placed) usedRx.add(rx.id);
    }
  }

  return { compartments, flags, prescriptionIds: [...usedRx] };
}

/** Fingerprint of what the tray was built from. Changes when a source prescription or medicine changes. */
export function sourceFingerprint(prescriptionIds: string[], patientId: string, prescriptions: Prescription[], medicines: Medicine[], approvedPeriods: Period[] = []) {
  const relevant = prescriptions
    .filter((p) => p.patientId === patientId && (prescriptionIds.includes(p.id) || p.status === "verified"))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({
    periods: [...approvedPeriods].sort(),
    rx: relevant.map((p) => ({
      id: p.id,
      status: p.status,
      lines: p.lines.map((l) => {
        const med = medicines.find((m) => m.id === l.medicineId);
        return [l.medicineId, l.strength, l.unitsPerDose, l.frequency, l.times, l.days ?? [], l.startDate, l.endDate, l.trayDecision, med?.suitability, med?.strength];
      }),
    })),
  });
}

export function contentsFingerprint(tray: Pick<Tray, "compartments">) {
  return JSON.stringify(
    tray.compartments
      .filter((c) => c.items.length)
      .map((c) => [c.day, c.period, c.items.map((i) => [i.medicineId, i.strength, i.qty, i.batchId])]),
  );
}

export const fillable = (t: Pick<Tray, "compartments">) => t.compartments.filter((c) => c.items.length > 0);

export function trayProgress(t: Pick<Tray, "compartments">) {
  const all = fillable(t);
  const prepared = all.filter((c) => c.status === "prepared").length;
  const issues = all.filter((c) => c.status === "discrepancy").length;
  return { total: all.length, prepared, issues, remaining: all.length - prepared, pct: all.length ? Math.round((prepared / all.length) * 100) : 0 };
}

export const totalUnits = (t: Pick<Tray, "compartments">) =>
  t.compartments.reduce((sum, c) => sum + c.items.reduce((s, i) => s + i.qty, 0), 0);

/** Weekly quantity per batch, used to deduct stock at supply. */
export function unitsByBatch(t: Pick<Tray, "compartments">) {
  const map: Record<string, number> = {};
  for (const c of t.compartments) for (const i of c.items) if (i.batchId) map[i.batchId] = (map[i.batchId] ?? 0) + i.qty;
  return map;
}

/** Weekly quantity per medicine, for four-week requirement estimates. */
export function unitsByMedicine(t: Pick<Tray, "compartments">) {
  const map: Record<string, number> = {};
  for (const c of t.compartments) for (const i of c.items) map[i.medicineId] = (map[i.medicineId] ?? 0) + i.qty;
  return map;
}

const daysText = (days: number[]) => {
  const sorted = [...new Set(days)].sort();
  if (sorted.length === 7) return "every day";
  return sorted.map((d) => DAY_NAMES[d]).join(", ");
};

type Shape = Map<string, { label: string; qty: number; slots: Map<Period, number[]> }>;

function shapeOf(compartments: Compartment[], medicines: Medicine[]): Shape {
  const map: Shape = new Map();
  for (const c of compartments) {
    for (const i of c.items) {
      const key = `${i.medicineId}|${i.strength}`;
      const m = medicines.find((x) => x.id === i.medicineId);
      const row = map.get(key) ?? { label: `${m?.brand ?? i.medicineId} ${i.strength}`, qty: i.qty, slots: new Map() };
      row.qty = Math.max(row.qty, i.qty);
      row.slots.set(c.period, [...(row.slots.get(c.period) ?? []), c.day]);
      map.set(key, row);
    }
  }
  return map;
}

const slotsText = (slots: Map<Period, number[]>) =>
  ALL_PERIODS.filter((p) => slots.has(p)).map((p) => `${periodName(p)} (${daysText(slots.get(p)!)})`).join("; ");

/** One readable line per medicine, e.g. "Glucora 500 mg ×1: Morning (every day); Evening (every day)". */
export function scheduleLines(compartments: Compartment[], medicines: Medicine[]) {
  return [...shapeOf(compartments, medicines).values()].map((r) => `${r.label} ×${r.qty}: ${slotsText(r.slots)}`);
}

/** What changes between two versions of a weekly schedule, in plain words. */
export function scheduleDiff(before: Compartment[], after: Compartment[], medicines: Medicine[]): string[] {
  const a = shapeOf(before, medicines);
  const b = shapeOf(after, medicines);
  const out: string[] = [];
  for (const [key, row] of b) {
    const old = a.get(key);
    if (!old) { out.push(`Added ${row.label} ×${row.qty}: ${slotsText(row.slots)}`); continue; }
    if (old.qty !== row.qty) out.push(`${row.label}: dose changes from ×${old.qty} to ×${row.qty}`);
    if (slotsText(old.slots) !== slotsText(row.slots)) out.push(`${row.label}: timing changes from ${slotsText(old.slots)} to ${slotsText(row.slots)}`);
  }
  for (const [key, row] of a) if (!b.has(key)) out.push(`Removed ${row.label}`);
  return out;
}
