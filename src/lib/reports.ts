import { addDays, mondayOf, parseDate, today } from "@/lib/dates";
import { invoiceTotals } from "@/lib/selectors";
import type { AppData } from "@/types/state";

const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (key: string) => parseDate(`${key}-01`).toLocaleDateString("en-IN", { month: "short" });

function lastMonths(n: number) {
  const d = parseDate(today());
  d.setDate(1);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function monthlyDispensing(d: Pick<AppData, "movements">, n = 6) {
  return lastMonths(n).map((key) => ({
    month: monthLabel(key),
    units: d.movements.filter((m) => m.type === "dispensed" && monthKey(m.at) === key).reduce((s, m) => s - m.qty, 0),
  }));
}

export function patientRegistrations(d: Pick<AppData, "patients">, n = 8) {
  let running = d.patients.filter((p) => monthKey(p.registeredOn) < lastMonths(n)[0]).length;
  return lastMonths(n).map((key) => {
    const added = d.patients.filter((p) => monthKey(p.registeredOn) === key).length;
    running += added;
    return { month: monthLabel(key), added, total: running };
  });
}

export function prescriptionsByStatus(d: Pick<AppData, "prescriptions">) {
  const labels = [["draft", "Draft"], ["pending", "Pending Review"], ["verified", "Verified"], ["rejected", "Rejected"], ["discontinued", "Discontinued"]] as const;
  return labels.map(([k, label]) => ({ status: k, label, count: d.prescriptions.filter((p) => p.status === k).length }));
}

export function weeklyTraysPrepared(d: Pick<AppData, "trays">, n = 6) {
  const thisWeek = mondayOf(today());
  return Array.from({ length: n }, (_, i) => {
    const week = addDays(thisWeek, (i - (n - 2)) * 7);
    const inWeek = d.trays.filter((t) => t.weekStart === week);
    return {
      week: parseDate(week).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      prepared: inWeek.filter((t) => t.compartments.some((c) => c.items.length) && t.compartments.filter((c) => c.items.length).every((c) => c.status === "prepared")).length,
      total: inWeek.length,
    };
  });
}

export function verificationOutcomes(d: Pick<AppData, "trays">) {
  const count = (type: string) => d.trays.reduce((n, t) => n + t.events.filter((e) => e.type === type).length, 0);
  return [
    { outcome: "Approved", count: count("approved") },
    { outcome: "Correction requested", count: count("correction-requested") },
    { outcome: "Rejected", count: count("rejected") },
    { outcome: "Approval invalidated", count: count("invalidated") },
  ];
}

export function pendingTrays(d: Pick<AppData, "trays">) {
  const groups = [
    ["Proposed schedule", ["proposed"]],
    ["Awaiting preparation", ["awaiting-preparation"]],
    ["In preparation", ["in-preparation"]],
    ["Correction requested", ["correction-requested"]],
    ["Awaiting verification", ["awaiting-verification"]],
    ["Approval invalidated", ["approval-invalidated"]],
    ["Ready for supply", ["approved"]],
  ] as const;
  return groups.map(([label, statuses]) => ({ label, count: d.trays.filter((t) => (statuses as readonly string[]).includes(t.status)).length }));
}

export function revenueByMonth(d: Pick<AppData, "invoices">, n = 6) {
  return lastMonths(n).map((key) => {
    const rows = d.invoices.filter((i) => monthKey(i.issuedOn) === key);
    return {
      month: monthLabel(key),
      paid: Math.round(rows.filter((i) => i.status === "paid").reduce((s, i) => s + invoiceTotals(i).total, 0)),
      outstanding: Math.round(rows.filter((i) => i.status === "issued" || i.status === "overdue").reduce((s, i) => s + invoiceTotals(i).total, 0)),
    };
  });
}
