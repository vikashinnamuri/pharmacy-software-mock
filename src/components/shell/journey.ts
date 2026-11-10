import { JOURNEY_PATIENT_ID } from "@/data/patients";
import type { AppState } from "@/store/app-store";
import type { OrderStatus, Role, TrayStatus } from "@/types";
import { isBf } from "@/types";

export interface JourneyStep {
  title: string;
  hint: string;
  role?: Role;
  href: (s: AppState) => string;
  done: (s: AppState) => boolean;
}

export interface Scenario {
  id: string;
  short: string;
  title: string;
  steps: JourneyStep[];
}

/* ------------------------------------------------------------------ */
/* Scenario A: standard dispensing                                     */
/* ------------------------------------------------------------------ */

const ORDER_SEQ: OrderStatus[] = ["new", "awaiting-review", "awaiting-payment", "payment-received", "in-preparation", "awaiting-verification", "ready-collection", "out-for-delivery", "collected", "delivered"];
const newPatient = (s: AppState) => s.patients.find((p) => p.createdInDemo);
const aRx = (s: AppState) => { const p = newPatient(s); return p ? s.prescriptions.find((r) => r.patientId === p.id) : undefined; };
const aOrder = (s: AppState) => { const p = newPatient(s); return p ? s.orders.find((o) => o.patientId === p.id) : undefined; };
const reached = (s: AppState, st: OrderStatus) => { const o = aOrder(s); return !!o && ORDER_SEQ.indexOf(o.status) >= ORDER_SEQ.indexOf(st); };
const aPid = (s: AppState) => newPatient(s)?.id ?? "";

const SCENARIO_A: Scenario = {
  id: "A",
  short: "A. Dispensing",
  title: "Standard dispensing",
  steps: [
    { title: "Register a new patient", hint: "Use fictional details. A permanent patient ID and QR code are issued on saving.", role: "reception", href: () => "/patients?new=1", done: (s) => !!newPatient(s) },
    { title: "Print the patient QR card", hint: "Print or download the card. The QR holds only a demo card code.", role: "reception", href: (s) => `/patients/${aPid(s)}`, done: (s) => s.documents.some((d) => d.type === "patient-card" && d.patientId === aPid(s) && d.action !== "previewed") },
    { title: "Enter a prescription", hint: "Search the catalogue as you type, for example Feverol or Telmicard. Submit it for review.", role: "dispenser", href: (s) => `/prescriptions?new=${aPid(s)}`, done: (s) => ["pending", "verified"].includes(aRx(s)?.status ?? "") },
    { title: "Pharmacist reviews the prescription", hint: "Not an MDS patient, so choose Keep out for each line, then verify.", role: "pharmacist", href: (s) => `/prescriptions?review=${aRx(s)?.id ?? ""}`, done: (s) => aRx(s)?.status === "verified" },
    { title: "Create the order and token", hint: "Confirm the patient's identity, pick the prescription lines and choose collection. A token like P-007 is issued.", role: "reception", href: (s) => `/dispensing?new=${aPid(s)}`, done: (s) => !!aOrder(s) && aOrder(s)!.status !== "new" },
    { title: "Pharmacist approves: stock and charges", hint: "Approving checks free stock, holds batches and raises the invoice.", role: "pharmacist", href: (s) => `/dispensing?order=${aOrder(s)?.id ?? ""}`, done: (s) => reached(s, "awaiting-payment") },
    { title: "Record the simulated payment", hint: "No real payment is taken.", role: "reception", href: (s) => `/dispensing?order=${aOrder(s)?.id ?? ""}`, done: (s) => reached(s, "payment-received") },
    { title: "Prepare and label the order", hint: "Start preparation, then send it for the final check.", role: "dispenser", href: (s) => `/dispensing?order=${aOrder(s)?.id ?? ""}`, done: (s) => reached(s, "awaiting-verification") },
    { title: "Final pharmacist verification", hint: "Tick the checklist and approve. The token turns ready on the public display.", role: "pharmacist", href: (s) => `/dispensing?order=${aOrder(s)?.id ?? ""}`, done: (s) => reached(s, "ready-collection") },
    { title: "Record collection", hint: "Confirm the collector's identity. Stock is deducted once, here.", role: "reception", href: () => "/collection", done: (s) => aOrder(s)?.status === "collected" || aOrder(s)?.status === "delivered" },
    { title: "See it in the patient's PMR", hint: "Open the Dispensing History tab on the patient record.", href: (s) => `/patients/${aPid(s)}?tab=dispensing`, done: (s) => s.visits["patient-dispensing"] === 10 },
  ],
};

/* ------------------------------------------------------------------ */
/* Scenario B: four-week MDS management                                */
/* ------------------------------------------------------------------ */

const B_PID = "PT-1015";
const bEnrol = (s: AppState) => s.enrolments.find((e) => e.patientId === B_PID);
const bBfRx = (s: AppState, statuses: string[]) => s.prescriptions.find((p) => p.patientId === B_PID && statuses.includes(p.status) && p.lines.some((l) => l.times.some(isBf)));
const bCycle = (s: AppState) => s.cycles.find((c) => c.patientId === B_PID);
const bWeek1 = (s: AppState) => s.trays.find((t) => t.id === bCycle(s)?.trayIds[0]);
const w1In = (s: AppState, list: TrayStatus[]) => list.includes(bWeek1(s)?.status ?? "cancelled");
const W1 = (s: AppState) => bWeek1(s)?.id ?? "";

const SCENARIO_B: Scenario = {
  id: "B",
  short: "B. Four-week MDS",
  title: "Four-week MDS management",
  steps: [
    { title: "Open Revathi Balaji's record", hint: "A fictional patient whose family asked about weekly trays.", href: () => `/patients/${B_PID}`, done: (s) => s.visits[`/patients/${B_PID}`] !== undefined },
    { title: "Register her for MDS", hint: "Answer Yes on the MDS Enrolment tab. Record consent and request the Before Breakfast period.", role: "dispenser", href: () => `/patients/${B_PID}?tab=mds-enrolment`, done: (s) => !!bEnrol(s) },
    { title: "Pharmacist suitability review", hint: "Approve the Before Breakfast (BF) period with a time, for example 07:30. Nothing is approved automatically.", role: "pharmacist", href: () => `/patients/${B_PID}?tab=mds-enrolment`, done: (s) => bEnrol(s)?.status === "active" && !!bEnrol(s)?.approvedPeriods.includes("bf-breakfast") },
    { title: "Send back the unclear prescription", hint: "RX-2018 says Diaclide \"as before\". Reject it with a reason.", role: "pharmacist", href: () => "/prescriptions?review=RX-2018", done: (s) => s.prescriptions.find((p) => p.id === "RX-2018")?.status !== "pending" || !!bBfRx(s, ["pending", "verified"]) },
    { title: "Correct it with a Before Breakfast dose", hint: "Edit and resubmit RX-2018: Diaclide 80 mg, 1 tablet, once a day, Before Breakfast (BF).", role: "dispenser", href: () => "/prescriptions?view=RX-2018", done: (s) => !!bBfRx(s, ["pending", "verified"]) },
    { title: "Verify with tray decisions", hint: "Put both lines In tray, then verify.", role: "pharmacist", href: (s) => `/prescriptions?review=${bBfRx(s, ["pending"])?.id ?? "RX-2018"}`, done: (s) => !!bBfRx(s, ["verified"]) },
    { title: "Generate the four-week plan", hint: "Four weekly proposals are built. None is approved.", role: "dispenser", href: () => `/mds?patient=${B_PID}`, done: (s) => !!bCycle(s) },
    { title: "Release and approve week 1 only", hint: "Release week 1, then approve its schedule. Weeks 2 to 4 keep their own approvals.", role: "pharmacist", href: () => `/mds?patient=${B_PID}`, done: (s) => w1In(s, ["awaiting-preparation", "in-preparation", "awaiting-verification", "correction-requested", "approved", "ready", "supplied"]) },
    { title: "Prepare week 1", hint: "MDS Preparation Staff seal each compartment, including the Before Breakfast row, then submit.", role: "mds", href: (s) => `/preparation?tray=${W1(s)}`, done: (s) => w1In(s, ["awaiting-verification", "approved", "ready", "supplied"]) },
    { title: "Pharmacist checks week 1", hint: "Inspect compartments, batches and expiry. Tick the checks and approve.", role: "pharmacist", href: (s) => `/verification?tray=${W1(s)}`, done: (s) => w1In(s, ["approved", "ready", "supplied"]) },
    { title: "Print the Dossett backing sheet", hint: "Pick a template, then print or download. It matches the tray grid, including the BF row.", href: (s) => `/documents?type=backing&tray=${W1(s)}`, done: (s) => s.documents.some((d) => d.type === "backing" && d.refId === W1(s) && d.action !== "previewed") },
    { title: "Bill the MDS service", hint: "Use Bill service on week 1. Try the own-medicines declaration to see the service-only invoice.", role: "reception", href: () => `/mds?patient=${B_PID}`, done: (s) => s.invoices.some((i) => i.trayId === W1(s)) },
    { title: "Mark ready and hand over", hint: "Mark week 1 ready, then record collection or complete the delivery.", role: "reception", href: () => `/mds?patient=${B_PID}`, done: (s) => w1In(s, ["supplied"]) },
  ],
};

/* ------------------------------------------------------------------ */
/* Scenario C: medication change on an MDS patient                     */
/* ------------------------------------------------------------------ */

const C_PID = "PT-1003";
const cAmend = (s: AppState) => s.prescriptions.find((p) => p.patientId === C_PID && p.supersedes === "RX-2003");
const cRebuilt = (s: AppState) => s.trays.some((t) => t.cycleId === "CYC-701" && t.revisions.length > 0 && ["awaiting-preparation", "in-preparation", "awaiting-verification", "approved", "ready", "supplied"].includes(t.status) && !t.needsRegeneration);

const SCENARIO_C: Scenario = {
  id: "C",
  short: "C. Medication change",
  title: "Medication change",
  steps: [
    { title: "Open Kamala Devi's four-week plan", hint: "Weeks 1 and 2 are approved for preparation. Weeks 3 and 4 are planned only. Note the Before Breakfast row.", href: () => `/mds?patient=${C_PID}`, done: (s) => s.visits[`mds-plan-${C_PID}`] !== undefined },
    { title: "Amend her prescription", hint: "On RX-2003 choose Amend. For example change Glucora to twice a day. Submit for review.", role: "dispenser", href: () => "/prescriptions?view=RX-2003", done: (s) => !!cAmend(s) },
    { title: "Pharmacist verifies the amendment", hint: "The change list shows what is different. Make tray decisions and verify. RX-2003 is kept as the earlier version.", role: "pharmacist", href: (s) => `/prescriptions?review=${cAmend(s)?.id ?? ""}`, done: (s) => cAmend(s)?.status === "verified" },
    { title: "Review the flagged weeks", hint: "Every affected future week is flagged with what changes. Mark the changes as reviewed.", href: () => `/mds?patient=${C_PID}`, done: (s) => s.visits["cycle-changes"] === 3 },
    { title: "Rebuild and re-approve a week", hint: "Rebuild an affected week, then approve its schedule again as the pharmacist.", role: "pharmacist", href: () => `/mds?patient=${C_PID}`, done: cRebuilt },
    { title: "See the preserved earlier schedule", hint: "Open Versions on the rebuilt week. The previous schedule is kept, not overwritten.", href: () => `/mds?patient=${C_PID}`, done: (s) => s.visits["tray-versions"] === 5 },
  ],
};

/* ------------------------------------------------------------------ */
/* The original weekly tray tour                                       */
/* ------------------------------------------------------------------ */

const journeyRx = (s: AppState) =>
  s.prescriptions.find((p) => p.patientId === JOURNEY_PATIENT_ID && Number(p.id.split("-")[1]) > 2023);
const journeyTray = (s: AppState) => s.trays.find((t) => t.patientId === JOURNEY_PATIENT_ID && t.createdInDemo);
const docDone = (s: AppState, types: string[], verb?: string) =>
  s.activity.some((a) => a.kind === "document" && a.documentType && types.includes(a.documentType) && a.patientId === JOURNEY_PATIENT_ID && (!verb || a.summary.includes(verb)));
const trayHref = (s: AppState) => {
  const t = journeyTray(s);
  return t ? `/trays?tray=${t.id}` : `/trays?patient=${JOURNEY_PATIENT_ID}`;
};

const CLASSIC: Scenario = {
  id: "T",
  short: "Tray tour",
  title: "Original weekly tray tour",
  steps: [
    { title: "Open Lakshmi Sundaram's record", hint: "A fictional patient on weekly trays. Search with Cmd K or open the patient list.", href: () => `/patients/${JOURNEY_PATIENT_ID}`, done: (s) => s.visits[`/patients/${JOURNEY_PATIENT_ID}`] !== undefined },
    { title: "Read the medical and medication history", hint: "Open the Medical History or Medications tab.", href: () => `/patients/${JOURNEY_PATIENT_ID}`, done: (s) => s.visits["patient-history"] !== undefined },
    { title: "Add a prescription for Lakshmi", hint: "Pantolin 40 mg in the morning works well. Submit for review.", role: "dispenser", href: () => `/prescriptions?new=${JOURNEY_PATIENT_ID}`, done: (s) => journeyRx(s)?.status === "pending" || journeyRx(s)?.status === "verified" },
    { title: "Switch to the pharmacist role", hint: "Buttons across the app change straight away.", role: "pharmacist", href: () => "/prescriptions", done: (s) => s.role === "pharmacist" },
    { title: "Verify the prescription and tray suitability", hint: "Decide whether each line goes in the tray, then verify.", role: "pharmacist", href: (s) => `/prescriptions?review=${journeyRx(s)?.id ?? ""}`, done: (s) => journeyRx(s)?.status === "verified" },
    { title: "Rebuild this week's schedule", hint: "Lakshmi has no open tray this week. Generate one. Only verified, structured lines are placed.", role: "pharmacist", href: () => `/trays?patient=${JOURNEY_PATIENT_ID}`, done: (s) => !!journeyTray(s) },
    { title: "Approve the proposed schedule", hint: "This reserves stock and opens the tray for preparation.", role: "pharmacist", href: trayHref, done: (s) => { const t = journeyTray(s); return !!t && !["proposed", "scheduled", "awaiting-rx-validation"].includes(t.status); } },
    { title: "Switch to MDS preparation staff", hint: "Preparation staff fill the tray but cannot approve it.", role: "mds", href: (s) => `/preparation?tray=${journeyTray(s)?.id ?? ""}`, done: (s) => s.role === "mds" || s.role === "dispenser" },
    { title: "Prepare the compartments", hint: "Press P to seal a compartment and move to the next one.", role: "mds", href: (s) => `/preparation?tray=${journeyTray(s)?.id ?? ""}`, done: (s) => !!journeyTray(s)?.compartments.some((c) => c.status === "prepared") },
    { title: "Submit the tray for verification", hint: "Available once every compartment is prepared.", role: "mds", href: (s) => `/preparation?tray=${journeyTray(s)?.id ?? ""}`, done: (s) => { const t = journeyTray(s); return !!t && ["awaiting-verification", "approved", "ready", "supplied"].includes(t.status); } },
    { title: "Switch back to the pharmacist", hint: "The tray now sits in the verification queue.", role: "pharmacist", href: (s) => `/verification?tray=${journeyTray(s)?.id ?? ""}`, done: (s) => s.role === "pharmacist" },
    { title: "Review and approve the tray", hint: "Tick all eight checks. Approve stays locked until they are done.", role: "pharmacist", href: (s) => `/verification?tray=${journeyTray(s)?.id ?? ""}`, done: (s) => { const t = journeyTray(s); return !!t && ["approved", "ready", "supplied"].includes(t.status); } },
    { title: "View the backing sheet", hint: "Generated in your browser, marked as a demo on every page.", href: (s) => `/documents?type=backing&tray=${journeyTray(s)?.id ?? ""}`, done: (s) => docDone(s, ["backing"]) },
    { title: "Download a sample MAR chart", hint: "The chart is blank. It never implies a dose was given.", href: (s) => `/documents?type=mar-weekly&tray=${journeyTray(s)?.id ?? ""}`, done: (s) => docDone(s, ["mar-weekly", "mar-monthly"], "downloaded") },
    { title: "Mark ready and hand over", hint: "Mark the tray ready, then record collection. Stock is deducted once.", role: "pharmacist", href: trayHref, done: (s) => journeyTray(s)?.status === "supplied" },
    { title: "Inspect inventory and activity", hint: "See the stock movements this tray created, then the activity feed on the patient's record.", href: () => "/inventory", done: (s) => s.visits["/inventory"] === 15 },
  ],
};

export const SCENARIOS: Scenario[] = [SCENARIO_A, SCENARIO_B, SCENARIO_C, CLASSIC];
export const scenarioById = (id: string) => SCENARIOS.find((x) => x.id === id) ?? SCENARIOS[0];
/** Kept for older imports. */
export const JOURNEY = CLASSIC.steps;
