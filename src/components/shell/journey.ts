import { JOURNEY_PATIENT_ID } from "@/data/patients";
import type { AppState } from "@/store/app-store";
import type { Role } from "@/types";

const journeyRx = (s: AppState) =>
  s.prescriptions.find((p) => p.patientId === JOURNEY_PATIENT_ID && Number(p.id.split("-")[1]) > 2021);
const journeyTray = (s: AppState) => s.trays.find((t) => t.patientId === JOURNEY_PATIENT_ID && t.createdInDemo);
const docDone = (s: AppState, types: string[], verb?: string) =>
  s.activity.some((a) => a.kind === "document" && a.documentType && types.includes(a.documentType) && a.patientId === JOURNEY_PATIENT_ID && (!verb || a.summary.includes(verb)));

export interface JourneyStep {
  title: string;
  hint: string;
  role?: Role;
  href: (s: AppState) => string;
  done: (s: AppState) => boolean;
}

const trayHref = (s: AppState) => {
  const t = journeyTray(s);
  return t ? `/trays?tray=${t.id}` : `/trays?patient=${JOURNEY_PATIENT_ID}`;
};

export const JOURNEY: JourneyStep[] = [
  { title: "Open Lakshmi Sundaram's record", hint: "A fictional patient on weekly trays. Search with Cmd K or open the patient list.", href: () => `/patients/${JOURNEY_PATIENT_ID}`, done: (s) => s.visits[`/patients/${JOURNEY_PATIENT_ID}`] !== undefined },
  { title: "Read the medical and medication history", hint: "Open the Medical History or Medication History tab.", href: () => `/patients/${JOURNEY_PATIENT_ID}`, done: (s) => s.visits["patient-history"] !== undefined },
  { title: "Add a prescription for Lakshmi", hint: "Enter a new medicine with structured times, then submit for review. Pantolin 40 mg in the morning works well.", role: "dispenser", href: () => `/prescriptions?new=${JOURNEY_PATIENT_ID}`, done: (s) => journeyRx(s)?.status === "pending" || journeyRx(s)?.status === "verified" },
  { title: "Switch to the pharmacist role", hint: "Buttons across the app change straight away.", role: "pharmacist", href: () => "/prescriptions", done: (s) => s.role === "pharmacist" },
  { title: "Verify the prescription and tray suitability", hint: "Review the line, decide whether it goes in the tray, then verify. Nothing is verified automatically.", role: "pharmacist", href: (s) => `/prescriptions?review=${journeyRx(s)?.id ?? ""}`, done: (s) => journeyRx(s)?.status === "verified" },
  { title: "Generate the proposed seven-day schedule", hint: "Only verified, structured lines are placed. Watch the wells fill.", role: "pharmacist", href: () => `/trays?patient=${JOURNEY_PATIENT_ID}`, done: (s) => !!journeyTray(s) },
  { title: "Approve the proposed schedule", hint: "This reserves stock and opens the tray for preparation.", role: "pharmacist", href: trayHref, done: (s) => { const t = journeyTray(s); return !!t && t.status !== "proposed"; } },
  { title: "Switch to dispensing staff", hint: "Preparation staff fill the tray but cannot approve it.", role: "dispenser", href: (s) => `/preparation?tray=${journeyTray(s)?.id ?? ""}`, done: (s) => s.role === "dispenser" },
  { title: "Prepare the compartments", hint: "Press P to seal a compartment and move to the next one.", role: "dispenser", href: (s) => `/preparation?tray=${journeyTray(s)?.id ?? ""}`, done: (s) => !!journeyTray(s)?.compartments.some((c) => c.status === "prepared") },
  { title: "Submit the tray for verification", hint: "Available once every compartment is prepared.", role: "dispenser", href: (s) => `/preparation?tray=${journeyTray(s)?.id ?? ""}`, done: (s) => { const t = journeyTray(s); return !!t && ["awaiting-verification", "approved", "supplied"].includes(t.status); } },
  { title: "Switch back to the pharmacist", hint: "The tray now sits in the verification queue.", role: "pharmacist", href: (s) => `/verification?tray=${journeyTray(s)?.id ?? ""}`, done: (s) => s.role === "pharmacist" },
  { title: "Review and approve the tray", hint: "Tick all eight checks. Approve stays locked until they are done.", role: "pharmacist", href: (s) => `/verification?tray=${journeyTray(s)?.id ?? ""}`, done: (s) => { const t = journeyTray(s); return !!t && ["approved", "supplied"].includes(t.status); } },
  { title: "View the backing sheet", hint: "Generated in your browser, marked as a demo on every page.", href: (s) => `/documents?type=backing&tray=${journeyTray(s)?.id ?? ""}`, done: (s) => docDone(s, ["backing"]) },
  { title: "Download a sample MAR chart", hint: "The chart is blank. It never implies a dose was given.", href: (s) => `/documents?type=mar-weekly&tray=${journeyTray(s)?.id ?? ""}`, done: (s) => docDone(s, ["mar-weekly", "mar-monthly"], "downloaded") },
  { title: "Mark the tray supplied", hint: "Stock is deducted once. Trying again changes nothing.", role: "pharmacist", href: trayHref, done: (s) => journeyTray(s)?.status === "supplied" },
  { title: "Inspect inventory and activity", hint: "See the stock movements this tray created, then the activity feed on the patient's record.", href: () => "/inventory", done: (s) => s.visits["/inventory"] === 15 },
];
