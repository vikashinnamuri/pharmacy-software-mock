import { addDays, parseDate } from "@/lib/dates";
import type { Batch, Compartment, Medicine, Period, Prescription, PrescriptionLine, Tray, TrayFlag, TrayStatus } from "@/types";
import { PERIODS } from "@/types";

export const REQUIRES_REVIEW = "Requires Pharmacist Review";

/** Trays in these states hold stock back from other trays. */
const RESERVING: TrayStatus[] = ["awaiting-preparation", "in-preparation", "awaiting-verification", "correction-requested", "approved", "approval-invalidated"];

export const isReserving = (t: Tray) => RESERVING.includes(t.status);

export const reservedByBatch = (trays: Tray[]) => {
  const map: Record<string, number> = {};
  for (const t of trays) {
    if (!isReserving(t)) continue;
    for (const c of t.compartments) for (const i of c.items) if (i.batchId) map[i.batchId] = (map[i.batchId] ?? 0) + i.qty;
  }
  return map;
};

export const isExpired = (b: Batch, on: string) => parseDate(b.expiryDate) < parseDate(on);

/**
 * Why a line cannot go in a tray, or null when it can. The generator never
 * guesses: anything not explicitly structured and pharmacist-approved stays out.
 */
export function lineBlockReason(line: PrescriptionLine, med: Medicine | undefined): string | null {
  if (!med) return `${REQUIRES_REVIEW}: medicine not found in catalogue.`;
  if (line.trayDecision === "keep-out") return `Kept out by pharmacist${line.decisionNote ? `: ${line.decisionNote}` : "."}`;
  if (med.suitability === "unsuitable") return `${REQUIRES_REVIEW}: the catalogue marks this medicine unsuitable for trays.`;
  if (line.trayDecision === "undecided") return `${REQUIRES_REVIEW}: no tray decision recorded.`;
  if (line.frequency === "as-required") return `${REQUIRES_REVIEW}: taken as required, so it has no fixed compartment.`;
  if (line.frequency === "weekly") return `${REQUIRES_REVIEW}: the day of the week is not structured.`;
  if (line.frequency === "unclear") return `${REQUIRES_REVIEW}: the frequency is unclear.`;
  if (!line.unitsPerDose || line.unitsPerDose < 1) return `${REQUIRES_REVIEW}: the dose is not structured.`;
  if (!line.times.length) return `${REQUIRES_REVIEW}: no administration time recorded.`;
  return null;
}

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
  today: string;
}): GeneratedSchedule {
  const { patientId, weekStart, trayId, prescriptions, medicines, batches, otherTrays, today } = args;
  const verified = prescriptions.filter((p) => p.patientId === patientId && p.status === "verified");
  const reserved = reservedByBatch(otherTrays);
  const allocated: Record<string, number> = {};
  const flags: TrayFlag[] = [];
  const usedRx = new Set<string>();
  let itemSeq = 0;

  const compartments: Compartment[] = [];
  for (let day = 0; day < 7; day++) {
    for (const period of PERIODS) {
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
      const reason = lineBlockReason(line, med);
      if (reason) {
        flags.push({ lineId: line.id, prescriptionId: rx.id, medicineId: line.medicineId, reason });
        continue;
      }
      let placed = false;
      for (let day = 0; day < 7; day++) {
        const date = addDays(weekStart, day);
        if (date < line.startDate || date > line.endDate) continue;
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
export function sourceFingerprint(prescriptionIds: string[], patientId: string, prescriptions: Prescription[], medicines: Medicine[]) {
  const relevant = prescriptions
    .filter((p) => p.patientId === patientId && (prescriptionIds.includes(p.id) || p.status === "verified"))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(
    relevant.map((p) => ({
      id: p.id,
      status: p.status,
      lines: p.lines.map((l) => {
        const med = medicines.find((m) => m.id === l.medicineId);
        return [l.medicineId, l.strength, l.unitsPerDose, l.frequency, l.times, l.startDate, l.endDate, l.trayDecision, med?.suitability, med?.strength];
      }),
    })),
  );
}

export function contentsFingerprint(tray: Pick<Tray, "compartments">) {
  return JSON.stringify(
    tray.compartments
      .filter((c) => c.items.length)
      .map((c) => [c.day, c.period, c.items.map((i) => [i.medicineId, i.strength, i.qty, i.batchId])]),
  );
}

export const fillable = (t: Tray) => t.compartments.filter((c) => c.items.length > 0);

export function trayProgress(t: Tray) {
  const all = fillable(t);
  const prepared = all.filter((c) => c.status === "prepared").length;
  const issues = all.filter((c) => c.status === "discrepancy").length;
  return { total: all.length, prepared, issues, remaining: all.length - prepared, pct: all.length ? Math.round((prepared / all.length) * 100) : 0 };
}

export const totalUnits = (t: Tray) =>
  t.compartments.reduce((sum, c) => sum + c.items.reduce((s, i) => s + i.qty, 0), 0);

/** Weekly quantity per batch, used to deduct stock at supply. */
export function unitsByBatch(t: Tray) {
  const map: Record<string, number> = {};
  for (const c of t.compartments) for (const i of c.items) if (i.batchId) map[i.batchId] = (map[i.batchId] ?? 0) + i.qty;
  return map;
}
