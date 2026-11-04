import { addDays, stamp, today } from "@/lib/dates";
import type { Frequency, Period, Prescription, PrescriptionLine, RxStatus, TrayDecision } from "@/types";
import { MEDICINES } from "./medicines";

const FREQ: Record<number, Frequency> = { 1: "once-daily", 2: "twice-daily", 3: "three-times-daily", 4: "four-times-daily" };
let lineSeq = 0;

function L(
  medicineId: string,
  units: number | null,
  times: Period[],
  opts: Partial<PrescriptionLine> & { decision?: TrayDecision } = {},
): PrescriptionLine {
  const med = MEDICINES.find((m) => m.id === medicineId)!;
  const { decision, ...rest } = opts;
  return {
    id: `LN-${++lineSeq}`,
    medicineId,
    strength: med.strength,
    dosage: units ? `${units} ${med.form.toLowerCase()}${units > 1 ? "s" : ""}` : "See prescriber note",
    unitsPerDose: units,
    frequency: times.length === 1 && times[0] === "bedtime" ? "at-bedtime" : FREQ[times.length] ?? "unclear",
    times,
    instructions: "",
    startDate: addDays(today(), -60),
    endDate: addDays(today(), 120),
    trayDecision: decision ?? "include",
    ...rest,
  };
}

function R(
  n: number,
  patientId: string,
  status: RxStatus,
  prescriber: [string, string],
  issuedDaysAgo: number,
  lines: PrescriptionLine[],
  extra: Partial<Prescription> = {},
): Prescription {
  const id = `RX-${2000 + n}`;
  const history: Prescription["history"] = [
    { at: stamp(issuedDaysAgo, 10, 5), by: "Divya S. (demo)", role: "dispenser", action: status === "draft" ? "Saved draft" : "Submitted for review" },
  ];
  let review: Prescription["review"];
  if (status === "verified" || status === "discontinued") {
    review = { by: "Arjun R. (demo)", at: stamp(issuedDaysAgo, 11, 40), outcome: "verified" };
    history.push({ at: review.at, by: review.by, role: "pharmacist", action: "Verified prescription" });
  }
  if (status === "rejected") {
    review = { by: "Arjun R. (demo)", at: stamp(issuedDaysAgo, 12, 10), outcome: "rejected", note: extra.review?.note };
    history.push({ at: review.at, by: review.by, role: "pharmacist", action: "Rejected prescription", note: review.note });
  }
  if (status === "discontinued") {
    history.push({ at: stamp(Math.max(issuedDaysAgo - 20, 1), 16, 0), by: "Arjun R. (demo)", role: "pharmacist", action: "Discontinued prescription" });
  }
  return {
    id, patientId, status, lines, version: 1,
    prescriber: prescriber[0], clinic: prescriber[1],
    issuedOn: addDays(today(), -issuedDaysAgo),
    createdBy: "Divya S. (demo)",
    history,
    ...extra,
    review,
  };
}

const PN: [string, string] = ["Dr. Priya Natarajan", "Kapaleeshwar Clinic"];
const SB: [string, string] = ["Dr. S. Bhaskar", "Panagal Park Medical"];
const AR: [string, string] = ["Dr. Anitha Rao", "Velachery Family Practice"];
const RM: [string, string] = ["Dr. Rekha Menon", "Anna Nagar Heart Centre"];
const VC: [string, string] = ["Dr. Vijay Chandran", "Tambaram Health Point"];

export const buildPrescriptions = (): Prescription[] => {
  lineSeq = 0;
  return [
    R(1, "PT-1001", "verified", PN, 30, [
      L("MED-001", 1, ["morning", "evening"], { instructions: "With food" }),
      L("MED-002", 1, ["morning"]),
      L("MED-003", 1, ["bedtime"]),
    ]),
    R(2, "PT-1002", "verified", SB, 25, [
      L("MED-004", 1, ["morning"]),
      L("MED-009", 1, ["morning"]),
      L("MED-011", 1, ["lunchtime"]),
      L("MED-026", 1, ["bedtime"]),
    ]),
    R(3, "PT-1003", "verified", PN, 22, [
      L("MED-001", 1, ["morning", "lunchtime", "evening"], { instructions: "With food" }),
      L("MED-010", 1, ["morning"], { instructions: "Before breakfast" }),
      L("MED-007", 1, ["morning"], { decision: "include", decisionNote: "Reviewed for this patient (demo)." }),
    ]),
    R(4, "PT-1004", "verified", AR, 20, [
      L("MED-012", 1, ["morning"]),
      L("MED-008", 1, ["morning", "evening"]),
      L("MED-009", 1, ["morning"]),
      L("MED-015", 2, ["bedtime"]),
    ]),
    R(5, "PT-1005", "verified", SB, 18, [
      L("MED-017", 1, ["bedtime"]),
      L("MED-027", 1, ["morning"]),
      L("MED-015", 1, ["morning", "lunchtime", "evening"]),
    ]),
    R(6, "PT-1006", "verified", RM, 28, [
      L("MED-011", 1, ["morning"]),
      L("MED-003", 1, ["bedtime"]),
      L("MED-006", 1, ["morning"], { instructions: "Before food" }),
    ]),
    // Prescription change: this version was discontinued and replaced by RX-2008.
    R(7, "PT-1007", "discontinued", RM, 40, [L("MED-004", 1, ["morning"]), L("MED-001", 1, ["morning", "evening"])], { supersededBy: "RX-2008" }),
    R(8, "PT-1007", "verified", RM, 1, [
      L("MED-027", 1, ["morning"], { changeNote: "Changed from Losartan by prescriber" }),
      L("MED-001", 1, ["morning", "evening"]),
    ], { supersedes: "RX-2007", version: 2 }),
    // Unsuitable medicine and unclear line.
    R(9, "PT-1008", "verified", AR, 4, [
      L("MED-002", 1, ["morning"]),
      L("MED-026", 1, ["bedtime"]),
      L("MED-022", 1, ["evening"], { decision: "keep-out", decisionNote: "Dose may change. Supplied separately." }),
      L("MED-013", 1, ["morning", "evening"], { decision: "keep-out", decisionNote: "Moisture sensitive. Supplied in original pack." }),
    ]),
    R(10, "PT-1009", "verified", SB, 15, [
      L("MED-016", 1, ["morning"]),
      L("MED-002", 1, ["morning"]),
      L("MED-019", 1, ["lunchtime", "evening"]),
    ]),
    R(11, "PT-1010", "verified", VC, 35, [
      L("MED-021", 1, ["bedtime"]),
      L("MED-001", 1, ["morning", "evening"]),
    ]),
    R(12, "PT-1011", "pending", VC, 1, [
      L("MED-027", 1, ["morning"], { decision: "undecided" }),
      L("MED-014", 1, [], { frequency: "weekly", decision: "undecided", instructions: "Once a week as directed" }),
      L("MED-018", 1, ["morning"], { decision: "undecided" }),
    ]),
    R(13, "PT-1012", "verified", PN, 3, [
      L("MED-025", 1, ["morning", "lunchtime", "evening"], { decision: "keep-out", decisionNote: "Short course. Not on a tray.", endDate: addDays(today(), 4) }),
      L("MED-015", 1, [], { frequency: "as-required", decision: "keep-out", decisionNote: "As needed. Not on a tray." }),
    ]),
    R(14, "PT-1013", "draft", AR, 0, [L("MED-007", 1, ["morning"], { decision: "undecided" })]),
    R(15, "PT-1013", "rejected", AR, 9, [
      L("MED-007", null, [], { frequency: "unclear", decision: "undecided", dosage: "Illegible on script" }),
    ], { review: { by: "", at: "", outcome: "rejected", note: "Dose is not readable. Confirm with the prescriber." } }),
    R(16, "PT-1014", "discontinued", RM, 70, [L("MED-023", 2, [], { frequency: "as-required", decision: "keep-out", decisionNote: "Inhaler. Not on a tray." })], { supersededBy: "RX-2017" }),
    R(17, "PT-1014", "verified", RM, 14, [
      L("MED-023", 2, [], { frequency: "as-required", decision: "keep-out", decisionNote: "Inhaler. Not on a tray.", instructions: "When needed" }),
    ], { supersedes: "RX-2016", version: 2 }),
    // Unclear prescription still in the queue.
    R(18, "PT-1015", "pending", VC, 0, [
      L("MED-001", 1, ["morning", "evening"], { decision: "undecided" }),
      L("MED-010", null, [], { frequency: "unclear", dosage: "\"As before\"", decision: "undecided", instructions: "Prescriber wrote: as before" }),
    ]),
    R(19, "PT-1016", "verified", SB, 45, [L("MED-003", 1, ["bedtime"]), L("MED-004", 1, ["morning"])]),
    R(20, "PT-1002", "discontinued", SB, 90, [L("MED-004", 1, ["evening"]), L("MED-009", 1, ["morning"])], { supersededBy: "RX-2002" }),
    R(21, "PT-1010", "pending", VC, 2, [
      L("MED-006", 1, ["morning"], { decision: "undecided", instructions: "Before breakfast" }),
    ]),
  ];
};
