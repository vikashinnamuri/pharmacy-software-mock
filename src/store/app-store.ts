"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { buildSeed } from "@/data/seed";
import { staffFor } from "@/data/staff";
import { mondayOf, today } from "@/lib/dates";
import { can, ROLE_LABEL, type Permission } from "@/lib/permissions";
import { contentsFingerprint, generateSchedule, isExpired, lineBlockReason, reservedByBatch, sourceFingerprint, trayProgress, unitsByBatch } from "@/lib/tray-engine";
import type { AppData } from "@/types/state";
import type {
  Activity, ActivityKind, Batch, Compartment, DocumentType, Invoice, Medicine, Patient, PharmacySettings, Prescription,
  PrescriptionLine, Role, Subscription, Tray, TrayDecision, TrayEvent,
} from "@/types";

export interface Result { ok: boolean; message: string; id?: string }
const fail = (message: string): Result => ({ ok: false, message });
const pass = (message: string, id?: string): Result => ({ ok: true, message, id });

export interface AppState extends AppData {
  role: Role;
  readNotifications: string[];
  journeyStep: number;
  journeyOpen: boolean;
  /** key -> journey step index at which the screen or tab was last visited */
  visits: Record<string, number>;

  setRole(role: Role): void;
  resetDemo(): void;
  setJourneyStep(step: number): void;
  setJourneyOpen(open: boolean): void;
  markVisit(key: string): void;
  markNotificationsRead(ids: string[]): void;

  savePatient(p: Omit<Patient, "id" | "registeredOn" | "documents"> & { id?: string }): Result;

  saveRx(input: RxInput, submit: boolean): Result;
  submitRx(id: string): Result;
  reviewRx(id: string, outcome: "verified" | "rejected", decisions: Record<string, { decision: TrayDecision; note?: string }>, note?: string): Result;
  discontinueRx(id: string, note: string): Result;

  generateTray(patientId: string, weekStart: string): Result;
  approveSchedule(trayId: string): Result;
  markPrepared(trayId: string, compartmentId: string): Result;
  undoPrepared(trayId: string, compartmentId: string): Result;
  reportDiscrepancy(trayId: string, compartmentId: string, note: string): Result;
  resolveDiscrepancy(trayId: string, compartmentId: string): Result;
  changeBatch(trayId: string, compartmentId: string, itemId: string, batchId: string): Result;
  submitTray(trayId: string): Result;
  approveTray(trayId: string, note?: string): Result;
  rejectTray(trayId: string, note: string): Result;
  requestCorrection(trayId: string, compartmentIds: string[], note: string): Result;
  resendForVerification(trayId: string): Result;
  supplyTray(trayId: string): Result;
  createReplacement(trayId: string): Result;

  saveMedicine(m: Omit<Medicine, "id"> & { id?: string }): Result;
  addStock(b: Omit<Batch, "id" | "receivedOn" | "manufacturer">): Result;
  editBatch(id: string, patch: { available: number; expiryDate: string; location: string; reason: string }): Result;

  saveInvoice(i: Omit<Invoice, "id"> & { id?: string }): Result;
  setInvoiceStatus(id: string, status: Invoice["status"]): Result;
  saveSubscription(s: Omit<Subscription, "id"> & { id?: string }): Result;

  updateSettings(patch: Partial<PharmacySettings>): void;
  logDocument(type: DocumentType, label: string, verb: "previewed" | "downloaded" | "printed", patientId?: string, trayId?: string): void;
}

export interface RxInput {
  id?: string;
  patientId: string;
  prescriber: string;
  clinic: string;
  issuedOn: string;
  supersedes?: string;
  lines: Omit<PrescriptionLine, "id" | "trayDecision">[];
}

let counter = Date.now() % 100000;
const uid = (prefix: string) => `${prefix}-${++counter}`;
const nextNumber = (ids: string[], prefix: string, floor: number) =>
  `${prefix}-${Math.max(floor, ...ids.map((x) => Number(x.split("-")[1]) || 0)) + 1}`;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const actor = () => staffFor(get().role);
      const allowed = (perm: Permission) => can(get().role, perm);
      const denied = (what: string) => fail(`${ROLE_LABEL[get().role]} cannot ${what} in this demo.`);

      const log = (kind: ActivityKind, summary: string, refs: Partial<Activity> = {}) => {
        const a = actor();
        const entry: Activity = { id: uid("AC"), at: new Date().toISOString(), actor: a.name, role: a.role, kind, summary, ...refs };
        set((s) => ({ activity: [entry, ...s.activity].slice(0, 800) }));
      };

      const patientName = (id: string) => get().patients.find((p) => p.id === id)?.name ?? id;
      const getTray = (id: string) => get().trays.find((t) => t.id === id);
      const patchTray = (id: string, fn: (t: Tray) => Tray) => set((s) => ({ trays: s.trays.map((t) => (t.id === id ? fn(t) : t)) }));
      const patchCompartment = (t: Tray, cid: string, fn: (c: Compartment) => Compartment): Tray => ({
        ...t,
        compartments: t.compartments.map((c) => (c.id === cid ? fn(c) : c)),
      });
      const trayEvent = (type: TrayEvent["type"], note?: string): TrayEvent => {
        const a = actor();
        return { id: uid("EV"), at: new Date().toISOString(), by: a.name, role: a.role, type, note };
      };
      const label = (t: Tray) => `${t.id} for ${patientName(t.patientId)}`;

      /**
       * Runs after any prescription, medicine or tray-content change. An approval
       * only stands while the tray and its sources match what was approved.
       */
      const revalidate = () => {
        const { trays, prescriptions, medicines } = get();
        const notes: { tray: Tray; reason: string }[] = [];
        const next = trays.map((t) => {
          if (t.status === "supplied" || t.status === "rejected") return t;
          const source = sourceFingerprint(t.prescriptionIds, t.patientId, prescriptions, medicines);
          const sourceChanged = source !== t.sourceFingerprint;
          const contentChanged = t.status === "approved" && t.approvedFingerprint !== contentsFingerprint(t);
          if (t.status === "approved" && (sourceChanged || contentChanged)) {
            const reason = sourceChanged
              ? "A source prescription or medicine changed after this tray was approved."
              : "Tray contents changed after approval.";
            const updated: Tray = {
              ...t, status: "approval-invalidated", invalidatedReason: reason, needsRegeneration: sourceChanged,
              approvedFingerprint: undefined, events: [...t.events, trayEvent("invalidated", reason)],
            };
            notes.push({ tray: updated, reason });
            return updated;
          }
          if (sourceChanged && !t.needsRegeneration) return { ...t, needsRegeneration: true };
          return t;
        });
        set({ trays: next });
        notes.forEach((n) => log("verification", `${label(n.tray)}: approval invalidated. ${n.reason}`, { trayId: n.tray.id, patientId: n.tray.patientId }));
        return notes.length;
      };

      return {
        ...buildSeed(),
        role: "dispenser",
        readNotifications: [],
        journeyStep: 0,
        journeyOpen: true,
        visits: {},

        setRole(role) {
          set({ role });
        },
        resetDemo() {
          set({ ...buildSeed(), role: "dispenser", readNotifications: [], journeyStep: 0, journeyOpen: true, visits: {} });
        },
        setJourneyStep: (journeyStep) => set({ journeyStep }),
        setJourneyOpen: (journeyOpen) => set({ journeyOpen }),
        markVisit: (key) => set((s) => (s.visits[key] === s.journeyStep ? s : { visits: { ...s.visits, [key]: s.journeyStep } })),
        markNotificationsRead: (ids) => set((s) => ({ readNotifications: [...new Set([...s.readNotifications, ...ids])] })),

        savePatient(input) {
          if (!allowed("patient.edit")) return denied("edit patients");
          if (input.id) {
            set((s) => ({ patients: s.patients.map((p) => (p.id === input.id ? { ...p, ...input, id: p.id } : p)) }));
            log("patient", `Updated details for ${input.name}`, { patientId: input.id });
            return pass(`Saved ${input.name}`, input.id);
          }
          const id = nextNumber(get().patients.map((p) => p.id), "PT", 1000);
          const patient: Patient = { ...input, id, registeredOn: today(), documents: [] };
          set((s) => ({ patients: [patient, ...s.patients] }));
          log("patient", `Registered ${input.name} (${id})`, { patientId: id });
          return pass(`Added ${input.name}`, id);
        },

        saveRx(input, submit) {
          if (!allowed("rx.enter")) return denied("enter prescriptions");
          const a = actor();
          const now = new Date().toISOString();
          const lines: PrescriptionLine[] = input.lines.map((l) => ({ ...l, id: uid("LN"), trayDecision: "undecided" }));
          const status = submit ? "pending" : "draft";
          const action = submit ? "Submitted for review" : "Saved draft";
          if (input.id) {
            const existing = get().prescriptions.find((p) => p.id === input.id);
            if (!existing) return fail("Prescription not found.");
            if (existing.status !== "draft" && existing.status !== "rejected") return fail("Only drafts and rejected prescriptions can be edited. Amend a verified prescription instead.");
            set((s) => ({
              prescriptions: s.prescriptions.map((p) =>
                p.id === input.id
                  ? { ...p, ...input, id: p.id, lines, status, review: undefined, history: [...p.history, { at: now, by: a.name, role: a.role, action }] }
                  : p,
              ),
            }));
            log("prescription", `${input.id} for ${patientName(input.patientId)}: ${action.toLowerCase()}`, { patientId: input.patientId, prescriptionId: input.id });
            return pass(submit ? `Submitted ${input.id} for review` : `Saved ${input.id} as a draft`, input.id);
          }
          const id = nextNumber(get().prescriptions.map((p) => p.id), "RX", 2000);
          const previous = input.supersedes ? get().prescriptions.find((p) => p.id === input.supersedes) : undefined;
          const rx: Prescription = {
            id, patientId: input.patientId, prescriber: input.prescriber, clinic: input.clinic, issuedOn: input.issuedOn,
            status, lines, version: (previous?.version ?? 0) + 1, supersedes: input.supersedes, createdBy: a.name,
            history: [{ at: now, by: a.name, role: a.role, action: previous ? `${action} (amends ${previous.id})` : action }],
          };
          set((s) => ({ prescriptions: [rx, ...s.prescriptions] }));
          log("prescription", `${id} for ${patientName(input.patientId)}: ${action.toLowerCase()}`, { patientId: input.patientId, prescriptionId: id });
          return pass(submit ? `Submitted ${id} for review` : `Saved ${id} as a draft`, id);
        },

        submitRx(id) {
          if (!allowed("rx.enter")) return denied("submit prescriptions");
          const a = actor();
          const rx = get().prescriptions.find((p) => p.id === id);
          if (!rx || rx.status !== "draft") return fail("Only a draft can be submitted.");
          set((s) => ({
            prescriptions: s.prescriptions.map((p) =>
              p.id === id ? { ...p, status: "pending", history: [...p.history, { at: new Date().toISOString(), by: a.name, role: a.role, action: "Submitted for review" }] } : p,
            ),
          }));
          log("prescription", `${id} for ${patientName(rx.patientId)}: submitted for review`, { patientId: rx.patientId, prescriptionId: id });
          return pass(`Submitted ${id} for review`);
        },

        reviewRx(id, outcome, decisions, note) {
          if (!allowed("rx.review")) return denied("review prescriptions");
          const a = actor();
          const rx = get().prescriptions.find((p) => p.id === id);
          if (!rx || rx.status !== "pending") return fail("Only a prescription pending review can be reviewed.");
          const lines = rx.lines.map((l) => {
            const d = decisions[l.id];
            return d ? { ...l, trayDecision: d.decision, decisionNote: d.note } : l;
          });
          if (outcome === "rejected" && !note?.trim()) return fail("Add a reason before rejecting this prescription.");
          if (outcome === "verified") {
            const meds = get().medicines;
            for (const l of lines) {
              const med = meds.find((m) => m.id === l.medicineId);
              if (l.trayDecision === "undecided") return fail(`Choose a tray decision for ${med?.brand ?? "every line"} first.`);
              if (l.trayDecision === "include") {
                const reason = lineBlockReason(l, med);
                if (reason) return fail(`${med?.brand}: ${reason} Keep this line out of the tray or reject the prescription.`);
              }
            }
          }
          const at = new Date().toISOString();
          set((s) => ({
            prescriptions: s.prescriptions.map((p) => {
              if (p.id === id) {
                return {
                  ...p, lines, status: outcome,
                  review: { by: a.name, at, note, outcome },
                  history: [...p.history, { at, by: a.name, role: a.role, action: outcome === "verified" ? "Verified prescription" : "Rejected prescription", note }],
                };
              }
              if (outcome === "verified" && p.id === rx.supersedes && p.status === "verified") {
                return {
                  ...p, status: "discontinued" as const, supersededBy: id,
                  history: [...p.history, { at, by: a.name, role: a.role, action: `Discontinued. Replaced by ${id}` }],
                };
              }
              return p;
            }),
          }));
          log("prescription", `${id} for ${patientName(rx.patientId)}: ${outcome === "verified" ? "verified" : "rejected"}${note ? `. ${note}` : ""}`, { patientId: rx.patientId, prescriptionId: id });
          const invalidated = revalidate();
          const suffix = invalidated ? ` ${invalidated} approved tray${invalidated > 1 ? "s" : ""} lost approval.` : "";
          return pass(`${outcome === "verified" ? "Verified" : "Rejected"} ${id}.${suffix}`);
        },

        discontinueRx(id, note) {
          if (!allowed("rx.review")) return denied("discontinue prescriptions");
          const a = actor();
          const rx = get().prescriptions.find((p) => p.id === id);
          if (!rx) return fail("Prescription not found.");
          const at = new Date().toISOString();
          set((s) => ({
            prescriptions: s.prescriptions.map((p) =>
              p.id === id ? { ...p, status: "discontinued", history: [...p.history, { at, by: a.name, role: a.role, action: "Discontinued prescription", note }] } : p,
            ),
          }));
          log("prescription", `${id} for ${patientName(rx.patientId)}: discontinued${note ? `. ${note}` : ""}`, { patientId: rx.patientId, prescriptionId: id });
          const invalidated = revalidate();
          return pass(`Discontinued ${id}.${invalidated ? ` ${invalidated} approved tray${invalidated > 1 ? "s" : ""} lost approval.` : ""}`);
        },

        generateTray(patientId, weekStart) {
          if (!allowed("tray.generate")) return denied("generate schedules");
          const state = get();
          const existing = state.trays.find(
            (t) => t.patientId === patientId && t.weekStart === weekStart && t.status !== "rejected" && t.status !== "supplied",
          );
          if (existing && !["proposed", "awaiting-preparation", "in-preparation", "correction-requested", "approval-invalidated", "awaiting-verification"].includes(existing.status)) {
            return fail(`${existing.id} is already approved for this week. Supply it or wait for its approval to be invalidated.`);
          }
          const supplied = state.trays.find((t) => t.patientId === patientId && t.weekStart === weekStart && t.status === "supplied");
          if (supplied) return fail(`${supplied.id} has already been supplied for this week. Create a replacement tray instead.`);

          const trayId = existing?.id ?? `TRY-${1000 + state.trays.reduce((m, t) => Math.max(m, Number(t.id.split("-")[1]) - 1000), 0) + 1}`;
          const sched = generateSchedule({
            patientId, weekStart, trayId,
            prescriptions: state.prescriptions, medicines: state.medicines, batches: state.batches,
            otherTrays: state.trays.filter((t) => t.id !== trayId), today: today(),
          });
          const anyVerified = state.prescriptions.some((p) => p.patientId === patientId && p.status === "verified");
          if (!anyVerified) return fail("This patient has no verified prescription. Verify one before generating a schedule.");
          if (!sched.compartments.some((c) => c.items.length)) {
            return fail("No line on the verified prescriptions can go in a tray for this week. Review the kept-out lines first.");
          }
          const fingerprint = sourceFingerprint(sched.prescriptionIds, patientId, state.prescriptions, state.medicines);
          const event = trayEvent("generated", existing ? "Regenerated from the current verified prescriptions." : undefined);
          if (existing) {
            patchTray(existing.id, (t) => ({
              ...t, ...sched, status: "proposed", sourceFingerprint: fingerprint, needsRegeneration: false,
              invalidatedReason: undefined, approvedFingerprint: undefined, events: [...t.events, event], createdInDemo: true,
            }));
          } else {
            const tray: Tray = {
              id: trayId, patientId, weekStart, type: "standard", status: "proposed", ...sched,
              sourceFingerprint: fingerprint, events: [event], inventoryDeducted: false, createdInDemo: true,
            };
            set((s) => ({ trays: [tray, ...s.trays] }));
          }
          log("tray", `${trayId} for ${patientName(patientId)}: generated a proposed schedule`, { trayId, patientId });
          const placed = sched.compartments.filter((c) => c.items.length).length;
          return pass(`Proposed ${placed} compartments${sched.flags.length ? `. ${sched.flags.length} line${sched.flags.length > 1 ? "s" : ""} left out for review` : ""}`, trayId);
        },

        approveSchedule(trayId) {
          if (!allowed("tray.approveSchedule")) return denied("approve schedules");
          const t = getTray(trayId);
          if (!t || t.status !== "proposed") return fail("Only a proposed schedule can be approved.");
          if (t.needsRegeneration) return fail("A prescription changed. Regenerate the schedule first.");
          patchTray(trayId, (x) => ({ ...x, status: "awaiting-preparation", events: [...x.events, trayEvent("schedule-approved")] }));
          log("tray", `${label(t)}: approved the proposed schedule`, { trayId, patientId: t.patientId });
          return pass("Approved the schedule. Stock is reserved and the tray is ready to prepare.");
        },

        markPrepared(trayId, cid) {
          if (!allowed("tray.prepare")) return denied("prepare compartments");
          const t = getTray(trayId);
          if (!t) return fail("Tray not found.");
          if (!["awaiting-preparation", "in-preparation", "correction-requested"].includes(t.status)) return fail("This tray is not open for preparation.");
          if (t.needsRegeneration) return fail("A prescription changed. Regenerate this tray before preparing it.");
          const c = t.compartments.find((x) => x.id === cid);
          if (!c || !c.items.length) return fail("This compartment is empty.");
          const noBatch = c.items.find((i) => !i.batchId);
          if (noBatch) return fail("No stock is allocated to this compartment. Add stock, then assign a batch.");
          const expired = c.items.find((i) => {
            const b = get().batches.find((x) => x.id === i.batchId);
            return b && isExpired(b, today());
          });
          if (expired) return fail("A batch in this compartment has expired. Choose another batch.");
          if (c.status === "discrepancy") return fail("Resolve the discrepancy on this compartment first.");
          const a = actor();
          patchTray(trayId, (x) => ({
            ...patchCompartment(x, cid, (y) => ({ ...y, status: "prepared", preparedBy: a.name, preparedAt: new Date().toISOString(), correctionNote: undefined })),
            status: x.status === "correction-requested" ? x.status : "in-preparation",
          }));
          return pass("Marked prepared");
        },

        undoPrepared(trayId, cid) {
          if (!allowed("tray.prepare")) return denied("prepare compartments");
          const t = getTray(trayId);
          if (!t || !["in-preparation", "correction-requested"].includes(t.status)) return fail("This tray is not open for preparation.");
          patchTray(trayId, (x) => patchCompartment(x, cid, (y) => ({ ...y, status: "pending", preparedBy: undefined, preparedAt: undefined })));
          return pass("Marked not prepared");
        },

        reportDiscrepancy(trayId, cid, note) {
          if (!allowed("tray.prepare")) return denied("report discrepancies");
          const t = getTray(trayId);
          if (!t) return fail("Tray not found.");
          const a = actor();
          patchTray(trayId, (x) => ({
            ...patchCompartment(x, cid, (y) => ({ ...y, status: "discrepancy", discrepancy: { note, by: a.name, at: new Date().toISOString() } })),
            status: x.status === "awaiting-preparation" ? "in-preparation" : x.status,
          }));
          const c = t.compartments.find((x) => x.id === cid)!;
          log("preparation", `${label(t)}: discrepancy on ${c.period} day ${c.day + 1}. ${note}`, { trayId, patientId: t.patientId });
          return pass("Reported the discrepancy");
        },

        resolveDiscrepancy(trayId, cid) {
          if (!allowed("tray.prepare") && !allowed("tray.verify")) return denied("resolve discrepancies");
          const t = getTray(trayId);
          if (!t) return fail("Tray not found.");
          patchTray(trayId, (x) => patchCompartment(x, cid, (y) => ({ ...y, status: "pending", discrepancy: undefined })));
          log("preparation", `${label(t)}: discrepancy resolved`, { trayId, patientId: t.patientId });
          return pass("Resolved. Prepare the compartment again.");
        },

        changeBatch(trayId, cid, itemId, batchId) {
          if (!allowed("tray.prepare") && !allowed("tray.verify")) return denied("change batches");
          const t = getTray(trayId);
          if (!t || t.status === "supplied" || t.status === "rejected") return fail("This tray can no longer be changed.");
          const batch = get().batches.find((b) => b.id === batchId);
          if (!batch) return fail("Batch not found.");
          if (isExpired(batch, today())) return fail(`Batch ${batch.batchNumber} has expired.`);
          patchTray(trayId, (x) => patchCompartment(x, cid, (y) => ({ ...y, items: y.items.map((i) => (i.id === itemId ? { ...i, batchId } : i)) })));
          log("preparation", `${label(t)}: changed a compartment to batch ${batch.batchNumber}`, { trayId, patientId: t.patientId });
          const invalidated = revalidate();
          return pass(`Changed to batch ${batch.batchNumber}.${invalidated ? " Tray approval was invalidated." : ""}`);
        },

        submitTray(trayId) {
          if (!allowed("tray.prepare")) return denied("submit trays");
          const t = getTray(trayId);
          if (!t) return fail("Tray not found.");
          if (!["awaiting-preparation", "in-preparation", "correction-requested"].includes(t.status)) return fail("This tray is not open for preparation.");
          if (t.needsRegeneration) return fail("A prescription changed. Regenerate this tray first.");
          const p = trayProgress(t);
          if (p.issues) return fail(`Resolve ${p.issues} discrepanc${p.issues > 1 ? "ies" : "y"} first.`);
          if (p.remaining) return fail(`${p.remaining} compartment${p.remaining > 1 ? "s are" : " is"} still not prepared.`);
          patchTray(trayId, (x) => ({ ...x, status: "awaiting-verification", events: [...x.events, trayEvent("submitted")] }));
          log("preparation", `${label(t)}: submitted the tray for verification`, { trayId, patientId: t.patientId });
          return pass("Submitted for pharmacist verification");
        },

        approveTray(trayId, note) {
          if (!allowed("tray.verify")) return denied("approve trays");
          const t = getTray(trayId);
          if (!t || t.status !== "awaiting-verification") return fail("Only a tray awaiting verification can be approved.");
          if (t.needsRegeneration) return fail("A prescription changed. This tray must be regenerated.");
          if (trayProgress(t).issues) return fail("Open discrepancies must be resolved before approval.");
          patchTray(trayId, (x) => ({ ...x, status: "approved", approvedFingerprint: contentsFingerprint(x), events: [...x.events, trayEvent("approved", note)] }));
          log("verification", `${label(t)}: approved the tray${note ? `. ${note}` : ""}`, { trayId, patientId: t.patientId });
          return pass("Approved the tray");
        },

        rejectTray(trayId, note) {
          if (!allowed("tray.verify")) return denied("reject trays");
          const t = getTray(trayId);
          if (!t || t.status !== "awaiting-verification") return fail("Only a tray awaiting verification can be rejected.");
          if (!note.trim()) return fail("Add a reason before rejecting this tray.");
          patchTray(trayId, (x) => ({ ...x, status: "rejected", events: [...x.events, trayEvent("rejected", note)] }));
          log("verification", `${label(t)}: rejected the tray. ${note}`, { trayId, patientId: t.patientId });
          return pass("Rejected the tray");
        },

        requestCorrection(trayId, compartmentIds, note) {
          if (!allowed("tray.verify")) return denied("request corrections");
          const t = getTray(trayId);
          if (!t || t.status !== "awaiting-verification") return fail("Only a tray awaiting verification can be sent back.");
          if (!note.trim()) return fail("Describe what needs correcting.");
          if (!compartmentIds.length) return fail("Select at least one compartment to send back.");
          patchTray(trayId, (x) => ({
            ...x,
            status: "correction-requested",
            compartments: x.compartments.map((c) =>
              compartmentIds.includes(c.id) ? { ...c, status: "pending", preparedAt: undefined, preparedBy: undefined, correctionNote: note } : c,
            ),
            events: [...x.events, trayEvent("correction-requested", note)],
          }));
          log("verification", `${label(t)}: requested a correction. ${note}`, { trayId, patientId: t.patientId });
          return pass("Sent back to preparation");
        },

        resendForVerification(trayId) {
          if (!allowed("tray.verify") && !allowed("tray.prepare")) return denied("resend trays");
          const t = getTray(trayId);
          if (!t || t.status !== "approval-invalidated") return fail("Only an invalidated tray can be sent back.");
          if (t.needsRegeneration) return fail("A prescription changed. This tray must be regenerated.");
          patchTray(trayId, (x) => ({ ...x, status: "awaiting-verification", invalidatedReason: undefined, events: [...x.events, trayEvent("submitted", "Resubmitted after approval was invalidated.")] }));
          log("verification", `${label(t)}: resubmitted for verification`, { trayId, patientId: t.patientId });
          return pass("Sent back for verification");
        },

        supplyTray(trayId) {
          if (!allowed("tray.supply")) return denied("supply trays");
          const t = getTray(trayId);
          if (!t) return fail("Tray not found.");
          if (t.inventoryDeducted || t.status === "supplied") return fail("This tray has already been supplied. Stock was not deducted again.");
          if (t.status !== "approved") return fail("Only an approved tray can be supplied.");
          if (t.approvedFingerprint !== contentsFingerprint(t)) return fail("Tray contents differ from what was approved.");
          const units = unitsByBatch(t);
          const { batches } = get();
          for (const [batchId, qty] of Object.entries(units)) {
            const b = batches.find((x) => x.id === batchId);
            if (!b || b.available < qty) return fail(`Batch ${b?.batchNumber ?? batchId} has ${b?.available ?? 0} units but the tray needs ${qty}. Add stock first.`);
          }
          const a = actor();
          const at = new Date().toISOString();
          set((s) => ({
            batches: s.batches.map((b) => (units[b.id] ? { ...b, available: b.available - units[b.id] } : b)),
            movements: [
              ...Object.entries(units).map(([batchId, qty]) => ({
                id: uid("MV"), at, batchId, medicineId: s.batches.find((b) => b.id === batchId)!.medicineId,
                type: "dispensed" as const, qty: -qty, reference: trayId, by: a.name,
              })),
              ...s.movements,
            ],
            trays: s.trays.map((x) =>
              x.id === trayId ? { ...x, status: "supplied", inventoryDeducted: true, suppliedAt: at, events: [...x.events, trayEvent("supplied")] } : x,
            ),
          }));
          const total = Object.values(units).reduce((n, v) => n + v, 0);
          log("tray", `${label(t)}: marked the tray supplied. Deducted ${total} units from stock`, { trayId, patientId: t.patientId });
          return pass(`Marked supplied. Deducted ${total} units from stock.`);
        },

        createReplacement(trayId) {
          if (!allowed("tray.generate")) return denied("create replacement trays");
          const state = get();
          const t = state.trays.find((x) => x.id === trayId);
          if (!t) return fail("Tray not found.");
          const open = state.trays.find((x) => x.replacementOf === trayId && x.status !== "rejected" && x.status !== "supplied");
          if (open) return fail(`${open.id} is already the open replacement for this tray.`);
          const id = `TRY-${1000 + state.trays.reduce((m, x) => Math.max(m, Number(x.id.split("-")[1]) - 1000), 0) + 1}`;
          const sched = generateSchedule({
            patientId: t.patientId, weekStart: t.weekStart, trayId: id,
            prescriptions: state.prescriptions, medicines: state.medicines, batches: state.batches,
            otherTrays: state.trays, today: today(),
          });
          if (!sched.compartments.some((c) => c.items.length)) return fail("No verified lines can go in a replacement tray.");
          const tray: Tray = {
            id, patientId: t.patientId, weekStart: t.weekStart, type: "replacement", replacementOf: trayId, status: "proposed", ...sched,
            sourceFingerprint: sourceFingerprint(sched.prescriptionIds, t.patientId, state.prescriptions, state.medicines),
            events: [trayEvent("replacement-created", `Replaces ${trayId}`)], inventoryDeducted: false, createdInDemo: true,
          };
          set((s) => ({ trays: [tray, ...s.trays] }));
          log("tray", `${id} for ${patientName(t.patientId)}: created a replacement for ${trayId}`, { trayId: id, patientId: t.patientId });
          return pass(`Created replacement ${id}. The pharmacist approves its schedule next.`, id);
        },

        saveMedicine(input) {
          if (!allowed("catalogue.edit")) return denied("edit the catalogue");
          if (input.id) {
            set((s) => ({ medicines: s.medicines.map((m) => (m.id === input.id ? { ...m, ...input, id: m.id } : m)) }));
            log("system", `Updated catalogue entry ${input.brand}`);
            const invalidated = revalidate();
            return pass(`Saved ${input.brand}.${invalidated ? ` ${invalidated} approved tray${invalidated > 1 ? "s" : ""} lost approval.` : ""}`, input.id);
          }
          const id = nextNumber(get().medicines.map((m) => m.id), "MED", 0).replace(/-(\d+)$/, (_, n) => `-${String(n).padStart(3, "0")}`);
          set((s) => ({ medicines: [{ ...input, id, isUserAdded: true }, ...s.medicines] }));
          log("system", `Added catalogue entry ${input.brand}`);
          return pass(`Added ${input.brand}`, id);
        },

        addStock(b) {
          if (!allowed("inventory.edit")) return denied("add stock");
          if (b.available <= 0) return fail("Enter a quantity above zero.");
          const med = get().medicines.find((m) => m.id === b.medicineId);
          if (!med) return fail("Choose a medicine.");
          if (get().batches.some((x) => x.batchNumber === b.batchNumber && x.medicineId === b.medicineId)) return fail(`Batch ${b.batchNumber} already exists. Edit it instead.`);
          const id = `BT-${b.batchNumber}-${uid("X")}`;
          const a = actor();
          const batch: Batch = { ...b, id, manufacturer: med.manufacturer, receivedOn: today() };
          set((s) => ({
            batches: [batch, ...s.batches],
            movements: [{ id: uid("MV"), at: new Date().toISOString(), batchId: id, medicineId: b.medicineId, type: "received", qty: b.available, reference: "Add stock", by: a.name }, ...s.movements],
          }));
          log("inventory", `Received ${b.available} units of ${med.brand}, batch ${b.batchNumber}`);
          return pass(`Added batch ${b.batchNumber}`, id);
        },

        editBatch(id, patch) {
          if (!allowed("inventory.edit")) return denied("edit stock");
          const b = get().batches.find((x) => x.id === id);
          if (!b) return fail("Batch not found.");
          if (patch.available < 0) return fail("Quantity cannot be negative.");
          const reserved = reservedByBatch(get().trays)[id] ?? 0;
          if (patch.available < reserved) return fail(`${reserved} units are reserved for trays. Quantity cannot go below that.`);
          const delta = patch.available - b.available;
          const a = actor();
          set((s) => ({
            batches: s.batches.map((x) => (x.id === id ? { ...x, available: patch.available, expiryDate: patch.expiryDate, location: patch.location } : x)),
            movements: delta
              ? [{ id: uid("MV"), at: new Date().toISOString(), batchId: id, medicineId: b.medicineId, type: "adjusted", qty: delta, reference: patch.reason || "Manual edit", by: a.name }, ...s.movements]
              : s.movements,
          }));
          log("inventory", `Edited batch ${b.batchNumber}${delta ? `, quantity ${delta > 0 ? "+" : ""}${delta}` : ""}`);
          return pass(`Saved batch ${b.batchNumber}`);
        },

        saveInvoice(input) {
          if (!allowed("billing.edit")) return denied("create invoices");
          if (input.id) {
            set((s) => ({ invoices: s.invoices.map((i) => (i.id === input.id ? { ...i, ...input, id: i.id } : i)) }));
            log("billing", `Updated sample invoice ${input.id}`, { patientId: input.patientId });
            return pass(`Saved ${input.id}`, input.id);
          }
          const id = nextNumber(get().invoices.map((i) => i.id), "INV", 3000);
          set((s) => ({ invoices: [{ ...input, id }, ...s.invoices] }));
          log("billing", `Created sample invoice ${id} for ${patientName(input.patientId)}`, { patientId: input.patientId });
          return pass(`Created ${id}`, id);
        },

        setInvoiceStatus(id, status) {
          if (!allowed("billing.edit")) return denied("change invoices");
          const inv = get().invoices.find((i) => i.id === id);
          if (!inv) return fail("Invoice not found.");
          set((s) => ({ invoices: s.invoices.map((i) => (i.id === id ? { ...i, status } : i)) }));
          log("billing", `Recorded ${id} as ${status} (simulated)`, { patientId: inv.patientId });
          return pass(`Recorded ${id} as ${status}. No payment was processed.`);
        },

        saveSubscription(input) {
          if (!allowed("billing.edit")) return denied("change subscriptions");
          if (input.id) {
            set((s) => ({ subscriptions: s.subscriptions.map((x) => (x.id === input.id ? { ...x, ...input, id: x.id } : x)) }));
            log("billing", `Updated subscription ${input.id}`, { patientId: input.patientId });
            return pass(`Saved ${input.id}`, input.id);
          }
          const id = nextNumber(get().subscriptions.map((x) => x.id), "SUB", 400);
          set((s) => ({ subscriptions: [{ ...input, id }, ...s.subscriptions] }));
          log("billing", `Started a ${input.plan} subscription for ${patientName(input.patientId)}`, { patientId: input.patientId });
          return pass(`Started ${id}`, id);
        },

        updateSettings(patch) {
          set((s) => ({ settings: { ...s.settings, ...patch } }));
        },

        logDocument(type, docLabel, verb, patientId, trayId) {
          log("document", `${docLabel} ${verb}${patientId ? ` for ${patientName(patientId)}` : ""}`, { documentType: type, patientId, trayId });
        },
      };
    },
    {
      name: "marina-care-demo-v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export const currentMonday = () => mondayOf(today());
