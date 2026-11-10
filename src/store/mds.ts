import { addDays, fmtDate, mondayOf, today, weekLabel } from "@/lib/dates";
import { nextToken } from "@/lib/orders";
import { enrolmentFor, isTodayLocal } from "@/lib/selectors";
import { generateSchedule, periodName, scheduleLines, sourceFingerprint, unitsByMedicine } from "@/lib/tray-engine";
import type { Delivery, EnrolmentEvent, EnrolmentStatus, Invoice, MdsCycle, MdsEnrolment, MdsStatus, Period, Tray, TrayEvent, TrayStatus } from "@/types";
import { fail, pass, type Ctx, type Result } from "./context";

export type EnrolmentInput = Pick<MdsEnrolment, "patientId" | "responsiblePharmacist" | "prescriber" | "caregiver" | "consent" | "consentBy" | "prepDay" | "fulfilment"> & { requestedPeriods: Period[]; note?: string };

export interface MdsActions {
  requestEnrolment(input: EnrolmentInput): Result;
  updateEnrolment(id: string, patch: Partial<Pick<MdsEnrolment, "responsiblePharmacist" | "prescriber" | "caregiver" | "consent" | "consentBy" | "prepDay" | "fulfilment">>): Result;
  reviewEnrolment(id: string, outcome: "suitable" | "not-suitable", periods: Period[], times: Partial<Record<Period, string>>, note: string): Result;
  setEnrolmentStatus(id: string, status: Extract<EnrolmentStatus, "active" | "suspended" | "discontinued">, note: string): Result;
  setApprovedPeriods(id: string, periods: Period[], times: Partial<Record<Period, string>>, note: string): Result;

  generateCycle(patientId: string, startWeek: string): Result;
  releaseWeek(trayId: string): Result;
  setWeekExclusion(trayId: string, lineId: string, exclude: boolean, note: string): Result;
  assignTray(trayId: string, staff: string): Result;
  markTrayReady(trayId: string, estimatedReady: string): Result;
  holdTray(trayId: string, note: string): Result;
  resumeTray(trayId: string): Result;
  cancelTray(trayId: string, note: string): Result;
  billMdsWeek(trayId: string, opts: { includeMedicines: boolean; ownMedicinesDeclared: boolean }): Result;

  dispatchDelivery(id: string, assignedTo: string): Result;
  completeDelivery(id: string, receivedBy: string): Result;
  failDelivery(id: string, note: string): Result;
  updateDelivery(id: string, patch: Partial<Pick<Delivery, "assignedTo" | "estimatedDate" | "authorisedRecipient" | "address" | "notes">>): Result;
}

const MDS_FOR: Record<EnrolmentStatus, MdsStatus> = { "pending-review": "assessment", active: "active", suspended: "paused", discontinued: "none", declined: "none" };

export function mdsActions(ctx: Ctx): MdsActions {
  const { set, get, actor, allowed, denied, log, patientName, nextNumber, revalidate, now } = ctx;
  const ev = (action: string, note?: string): EnrolmentEvent => { const a = actor(); return { at: now(), by: a.name, role: a.role, action, note }; };
  const trayEv = (type: TrayEvent["type"], note?: string): TrayEvent => { const a = actor(); return { id: ctx.uid("EV"), at: now(), by: a.name, role: a.role, type, note }; };
  const patchEnrol = (id: string, fn: (e: MdsEnrolment) => MdsEnrolment) => {
    set((s) => {
      const enrolments = s.enrolments.map((e) => (e.id === id ? fn(e) : e));
      const e = enrolments.find((x) => x.id === id)!;
      return { enrolments, patients: s.patients.map((p) => (p.id === e.patientId ? { ...p, mdsStatus: MDS_FOR[e.status] } : p)) };
    });
  };
  const getTray = (id: string) => get().trays.find((t) => t.id === id);
  const patchTray = (id: string, fn: (t: Tray) => Tray) => set((s) => ({ trays: s.trays.map((t) => (t.id === id ? fn(t) : t)) }));
  const trayLabel = (t: Tray) => `${t.id} for ${patientName(t.patientId)}`;

  /** Rebuilds a tray's contents from today's verified prescriptions, keeping the old version as a revision. */
  const rebuild = (t: Tray, reason: string, status: TrayStatus, exclusions = t.exclusions): Tray => {
    const s = get();
    const periods = enrolmentFor(s, t.patientId)?.approvedPeriods ?? [];
    const sched = generateSchedule({
      patientId: t.patientId, weekStart: t.weekStart, trayId: t.id, prescriptions: s.prescriptions, medicines: s.medicines, batches: s.batches,
      otherTrays: s.trays.filter((x) => x.id !== t.id), orders: s.orders, today: today(), approvedPeriods: periods, exclusions: exclusions.map((x) => x.lineId),
    });
    const before = scheduleLines(t.compartments, s.medicines);
    const revisions = before.length
      ? [...t.revisions, { id: ctx.uid("REV"), at: now(), by: actor().name, reason, lines: before, prescriptionIds: t.prescriptionIds, statusBefore: t.status }]
      : t.revisions;
    return {
      ...t, ...sched, status, exclusions, revisions, needsRegeneration: false, pendingChanges: undefined, invalidatedReason: undefined, approvedFingerprint: undefined,
      sourceFingerprint: sourceFingerprint(sched.prescriptionIds, t.patientId, s.prescriptions, s.medicines, periods),
    };
  };

  const deliveryFor = (t: Tray): Delivery => {
    const p = get().patients.find((x) => x.id === t.patientId)!;
    return {
      id: nextNumber(get().deliveries.map((d) => d.id), "DLV", 800), kind: "tray", refId: t.id, patientId: t.patientId, address: p.address,
      estimatedDate: addDays(t.weekStart, -1) < today() ? today() : addDays(t.weekStart, -1), status: "scheduled", authorisedRecipient: p.caregiver?.name ?? p.name,
    };
  };

  return {
    requestEnrolment(input) {
      if (!allowed("mds.enrol")) return denied("enrol patients for MDS");
      const s = get();
      const p = s.patients.find((x) => x.id === input.patientId);
      if (!p) return fail("Patient not found.");
      const current = enrolmentFor(s, p.id);
      if (current && ["pending-review", "active", "suspended"].includes(current.status)) return fail(`${p.name} already has an MDS enrolment (${current.id}).`);
      if (!input.consent) return fail("Record MDS consent from the patient or caregiver before requesting enrolment.");
      const id = nextNumber(s.enrolments.map((e) => e.id), "ENR", 800);
      const e: MdsEnrolment = {
        id, patientId: p.id, status: "pending-review", enrolledOn: today(), responsiblePharmacist: input.responsiblePharmacist, prescriber: input.prescriber,
        caregiver: input.caregiver || undefined, consent: input.consent, consentBy: input.consentBy, prepDay: input.prepDay, fulfilment: input.fulfilment,
        suitability: "pending", approvedPeriods: [], periodTimes: {},
        history: [ev(`Requested MDS enrolment${input.requestedPeriods.length ? `. Requested extra periods: ${input.requestedPeriods.map(periodName).join(", ")}` : ""}`, input.note)],
      };
      set({ enrolments: [e, ...s.enrolments], patients: s.patients.map((x) => (x.id === p.id ? { ...x, mdsStatus: "assessment" } : x)) });
      log("mds", `${id} for ${p.name}: MDS enrolment requested. Waiting for pharmacist suitability review`, { patientId: p.id });
      return pass(`Requested MDS enrolment for ${p.name}. A pharmacist must complete the suitability review.`, id);
    },

    updateEnrolment(id, patch) {
      if (!allowed("mds.enrol")) return denied("change MDS enrolments");
      const e = get().enrolments.find((x) => x.id === id);
      if (!e) return fail("Enrolment not found.");
      patchEnrol(id, (x) => ({ ...x, ...patch, history: [...x.history, ev("Updated enrolment details")] }));
      log("mds", `${id} for ${patientName(e.patientId)}: details updated`, { patientId: e.patientId });
      return pass("Saved enrolment");
    },

    reviewEnrolment(id, outcome, periods, times, note) {
      if (!allowed("mds.approve")) return denied("complete suitability reviews");
      const e = get().enrolments.find((x) => x.id === id);
      if (!e || e.status !== "pending-review") return fail("Only an enrolment waiting for review can be reviewed.");
      if (!note.trim()) return fail("Add a suitability note.");
      const a = actor();
      patchEnrol(id, (x) => ({
        ...x, status: outcome === "suitable" ? "active" : "declined", suitability: outcome, suitabilityNote: note, reviewedBy: a.name, reviewedAt: now(),
        approvedPeriods: outcome === "suitable" ? periods : [], periodTimes: outcome === "suitable" ? times : {},
        history: [...x.history, ev(outcome === "suitable" ? `Suitability review: suitable. Enrolment active${periods.length ? `. Approved periods: ${periods.map(periodName).join(", ")}` : ""}` : "Suitability review: not suitable. Enrolment declined", note)],
      }));
      log("mds", `${id} for ${patientName(e.patientId)}: ${outcome === "suitable" ? "suitable, MDS enrolment active" : "not suitable, enrolment declined"}. ${note}`, { patientId: e.patientId });
      return pass(outcome === "suitable" ? "Enrolment approved and active" : "Enrolment declined");
    },

    setEnrolmentStatus(id, status, note) {
      if (!allowed("mds.approve")) return denied("change MDS service status");
      const e = get().enrolments.find((x) => x.id === id);
      if (!e) return fail("Enrolment not found.");
      if (status === "active" && e.suitability !== "suitable") return fail("Complete the suitability review before activating.");
      if (e.status === "discontinued") return fail("A discontinued enrolment cannot be changed. Request a new enrolment.");
      if (!note.trim()) return fail("Add a reason.");
      patchEnrol(id, (x) => ({ ...x, status, history: [...x.history, ev(status === "active" ? "Resumed (active)" : status === "suspended" ? "Suspended" : "Discontinued", note)] }));
      log("mds", `${id} for ${patientName(e.patientId)}: service ${status}. ${note}`, { patientId: e.patientId });
      return pass(`MDS service ${status}`);
    },

    setApprovedPeriods(id, periods, times, note) {
      if (!allowed("mds.approve")) return denied("approve administration periods");
      const e = get().enrolments.find((x) => x.id === id);
      if (!e) return fail("Enrolment not found.");
      if (!note.trim()) return fail("Add a note for the change.");
      patchEnrol(id, (x) => ({ ...x, approvedPeriods: periods, periodTimes: times, history: [...x.history, ev(`Approved periods changed to: ${periods.length ? periods.map(periodName).join(", ") : "standard four only"}`, note)] }));
      log("mds", `${id} for ${patientName(e.patientId)}: approved administration periods changed. ${note}`, { patientId: e.patientId });
      const n = revalidate();
      return pass(`Saved periods.${n ? ` ${n} approved tray${n > 1 ? "s" : ""} lost approval.` : " Affected planned weeks are flagged for review."}`);
    },

    generateCycle(patientId, startWeek) {
      if (!allowed("tray.generate")) return denied("plan MDS cycles");
      const s = get();
      const e = enrolmentFor(s, patientId);
      if (!e || e.status !== "active") return fail("The patient needs an active MDS enrolment with a completed suitability review first.");
      if (!s.prescriptions.some((p) => p.patientId === patientId && p.status === "verified")) return fail("This patient has no verified prescription to plan from.");
      const start = mondayOf(startWeek);
      const clash = s.cycles.find((c) => c.patientId === patientId && c.status === "active" && c.trayIds.some((tid) => {
        const t = s.trays.find((x) => x.id === tid);
        return t && t.weekStart >= start && t.weekStart <= addDays(start, 21);
      }));
      if (clash) return fail(`${clash.id} already covers some of these weeks.`);
      const id = nextNumber(s.cycles.map((c) => c.id), "CYC", 700);
      const trayIds: string[] = [];
      const created: Tray[] = [];
      for (let w = 0; w < 4; w++) {
        const weekStart = addDays(start, w * 7);
        const existing = [...s.trays, ...created].find((t) => t.patientId === patientId && t.weekStart === weekStart && !["rejected", "supplied", "cancelled"].includes(t.status));
        if (existing) {
          trayIds.push(existing.id);
          continue;
        }
        const trayId = `TRY-${1000 + [...s.trays, ...created].reduce((m, t) => Math.max(m, Number(t.id.split("-")[1]) - 1000), 0) + 1}`;
        const sched = generateSchedule({ patientId, weekStart, trayId, prescriptions: s.prescriptions, medicines: s.medicines, batches: s.batches, otherTrays: [...s.trays, ...created], orders: s.orders, today: today(), approvedPeriods: e.approvedPeriods });
        created.push({
          id: trayId, patientId, weekStart, type: "standard", status: "scheduled", ...sched,
          sourceFingerprint: sourceFingerprint(sched.prescriptionIds, patientId, s.prescriptions, s.medicines, e.approvedPeriods),
          events: [trayEv("generated", `Week ${w + 1} of four-week cycle ${id}. Planned only, not approved.`)], inventoryDeducted: false, revisions: [], exclusions: [],
          cycleId: id, cycleWeek: w + 1, fulfilment: { method: e.fulfilment }, createdInDemo: true,
        });
        trayIds.push(trayId);
      }
      if (!created.some((t) => t.compartments.some((c) => c.items.length))) return fail("No verified line can go in a tray for these weeks. Review the kept-out lines first.");
      const cycle: MdsCycle = { id, patientId, startWeek: start, trayIds, status: "active", createdAt: now(), createdBy: actor().name };
      set((st) => ({
        cycles: [cycle, ...st.cycles],
        trays: [...created, ...st.trays.map((t) => {
          const w = trayIds.indexOf(t.id);
          return w >= 0 ? { ...t, cycleId: id, cycleWeek: w + 1 } : t;
        })],
      }));
      log("mds", `${id} for ${patientName(patientId)}: generated a four-week plan (${trayIds.join(", ")}). Each week needs its own approval`, { patientId });
      return pass(`Planned ${id}: four weeks from ${fmtDate(start)}. Nothing is approved yet. Release each week for pharmacist review.`, id);
    },

    releaseWeek(trayId) {
      if (!allowed("tray.generate")) return denied("release planned weeks");
      const t = getTray(trayId);
      if (!t || t.status !== "scheduled") return fail("Only a scheduled week can be released for review.");
      const s = get();
      const pendingRx = s.prescriptions.filter((p) => p.patientId === t.patientId && p.status === "pending");
      const flagged = t.needsRegeneration || pendingRx.length > 0;
      const next = flagged ? "awaiting-rx-validation" : "proposed";
      const updated = t.needsRegeneration ? t : rebuild(t, "Refreshed from current prescriptions on release.", next);
      patchTray(trayId, () => ({ ...updated, status: next, events: [...t.events, trayEv("released", flagged ? `Waiting for prescription validation${pendingRx.length ? `: ${pendingRx.map((p) => p.id).join(", ")} pending` : ""}.` : "Released for clinical suitability review.")] }));
      log("tray", `${trayLabel(t)}: week ${t.cycleWeek ?? ""} released ${flagged ? "and waiting for prescription validation" : "for pharmacist review"}`, { trayId, patientId: t.patientId });
      return pass(flagged ? "Released. A prescription needs validating before the schedule can be reviewed." : "Released for pharmacist review of the proposed schedule.");
    },

    setWeekExclusion(trayId, lineId, exclude, note) {
      if (!allowed("tray.approveSchedule")) return denied("edit proposed schedules");
      const t = getTray(trayId);
      if (!t || !["scheduled", "proposed", "awaiting-rx-validation"].includes(t.status)) return fail("Only a planned or proposed week can be edited. Approved weeks keep their record.");
      if (exclude && !note.trim()) return fail("Say why this medicine is left out of the week.");
      const exclusions = exclude ? [...t.exclusions.filter((x) => x.lineId !== lineId), { lineId, note, by: actor().name }] : t.exclusions.filter((x) => x.lineId !== lineId);
      const updated = rebuild(t, exclude ? `Left a medicine out of this week: ${note}` : "Returned a medicine to this week.", t.status, exclusions);
      patchTray(trayId, () => ({ ...updated, events: [...t.events, trayEv("schedule-edited", exclude ? `Left out for this week: ${note}` : "Medicine returned to this week")] }));
      log("tray", `${trayLabel(t)}: proposed schedule edited by pharmacist`, { trayId, patientId: t.patientId });
      return pass("Schedule updated. The previous version is kept in the version history.");
    },

    assignTray(trayId, staff) {
      if (!allowed("tray.prepare") && !allowed("tray.verify")) return denied("assign trays");
      const t = getTray(trayId);
      if (!t) return fail("Tray not found.");
      patchTray(trayId, (x) => ({ ...x, assignedTo: staff, events: [...x.events, trayEv("assigned", `Assigned to ${staff}`)] }));
      log("preparation", `${trayLabel(t)}: assigned to ${staff}`, { trayId, patientId: t.patientId });
      return pass(`Assigned to ${staff}`);
    },

    markTrayReady(trayId, estimatedReady) {
      if (!allowed("tray.supply")) return denied("mark trays ready");
      const s = get();
      const t = getTray(trayId);
      if (!t || t.status !== "approved") return fail("Only a pharmacist-approved tray can be made ready.");
      const method = t.fulfilment?.method ?? enrolmentFor(s, t.patientId)?.fulfilment ?? "collection";
      let deliveries = s.deliveries;
      let token: string | undefined;
      let deliveryId: string | undefined;
      if (method === "delivery") {
        const d = deliveryFor(t);
        deliveryId = d.id;
        deliveries = [d, ...deliveries];
      } else {
        token = nextToken(s.trays.filter((x) => x.fulfilment?.token && isTodayLocal(x.events.find((e) => e.type === "ready")?.at)).map((x) => x.fulfilment!.token!), "M");
      }
      set((st) => ({
        deliveries,
        trays: st.trays.map((x) => (x.id === trayId ? { ...x, status: "ready", fulfilment: { method, token, estimatedReady, deliveryId }, events: [...x.events, trayEv("ready", method === "delivery" ? `Ready for delivery (${deliveryId})` : `Ready for collection, token ${token}`)] } : x)),
      }));
      log("tray", `${trayLabel(t)}: ready for ${method}${token ? `, token ${token}` : ""}`, { trayId, patientId: t.patientId });
      return pass(method === "delivery" ? `Ready for delivery. ${deliveryId} created.` : `Ready for collection. Token ${token}.`);
    },

    holdTray(trayId, note) {
      if (!allowed("tray.verify") && !allowed("tray.generate")) return denied("hold trays");
      const t = getTray(trayId);
      if (!t || ["supplied", "rejected", "cancelled", "on-hold"].includes(t.status)) return fail("This tray cannot be put on hold.");
      if (!note.trim()) return fail("Say why the tray is on hold.");
      patchTray(trayId, (x) => ({ ...x, status: "on-hold", heldFrom: x.status, events: [...x.events, trayEv("held", note)] }));
      log("tray", `${trayLabel(t)}: on hold. ${note}`, { trayId, patientId: t.patientId });
      return pass("Tray on hold");
    },

    resumeTray(trayId) {
      if (!allowed("tray.verify") && !allowed("tray.generate")) return denied("resume trays");
      const t = getTray(trayId);
      if (!t || t.status !== "on-hold" || !t.heldFrom) return fail("Only a tray on hold can be resumed.");
      patchTray(trayId, (x) => ({ ...x, status: x.heldFrom!, heldFrom: undefined, events: [...x.events, trayEv("resumed")] }));
      log("tray", `${trayLabel(t)}: resumed`, { trayId, patientId: t.patientId });
      revalidate();
      return pass("Tray resumed");
    },

    cancelTray(trayId, note) {
      if (!allowed("tray.verify")) return denied("cancel trays");
      const t = getTray(trayId);
      if (!t || ["supplied", "cancelled"].includes(t.status) || t.inventoryDeducted) return fail("This tray can no longer be cancelled.");
      if (!note.trim()) return fail("Add a reason.");
      patchTray(trayId, (x) => ({ ...x, status: "cancelled", heldFrom: undefined, events: [...x.events, trayEv("cancelled", note)] }));
      log("tray", `${trayLabel(t)}: cancelled. Reserved stock released. ${note}`, { trayId, patientId: t.patientId });
      return pass("Tray cancelled. Reserved stock released.");
    },

    billMdsWeek(trayId, opts) {
      if (!allowed("billing.edit")) return denied("bill MDS services");
      const s = get();
      const t = getTray(trayId);
      if (!t) return fail("Tray not found.");
      if (s.invoices.some((i) => i.trayId === trayId && i.status !== "cancelled")) return fail(`${trayId} has already been billed.`);
      const id = nextNumber(s.invoices.map((i) => i.id), "INV", 3000);
      const lines: Invoice["lines"] = [
        { id: ctx.uid("IL"), description: `MDS weekly service, ${t.id}, week ${weekLabel(t.weekStart)}${t.cycleId ? ` (${t.cycleId} week ${t.cycleWeek})` : ""}`, kind: "service", qty: 1, unitPrice: s.settings.mdsWeeklyFee, gstRate: s.settings.serviceGstRate },
      ];
      if ((t.fulfilment?.method ?? enrolmentFor(s, t.patientId)?.fulfilment) === "delivery") lines.push({ id: ctx.uid("IL"), description: "Home delivery (service)", kind: "service", qty: 1, unitPrice: s.settings.deliveryFee, gstRate: s.settings.serviceGstRate });
      if (opts.includeMedicines && !opts.ownMedicinesDeclared) {
        Object.entries(unitsByMedicine(t)).forEach(([medicineId, qty]) => {
          const m = s.medicines.find((x) => x.id === medicineId)!;
          lines.push({ id: ctx.uid("IL"), description: `${m.brand} ${m.strength}`, kind: "product", medicineId, qty, unitPrice: m.unitPrice, gstRate: s.settings.defaultGstRate });
        });
      }
      const inv: Invoice = {
        id, patientId: t.patientId, issuedOn: today(), dueOn: addDays(today(), 7), status: "issued", lines, payments: [], trayId, cycleId: t.cycleId,
        ownMedicinesDeclared: opts.ownMedicinesDeclared,
        notes: opts.ownMedicinesDeclared ? "Patient declared medicines already lawfully obtained. Service charge only. Pharmacist checks still apply." : undefined,
      };
      set({ invoices: [inv, ...s.invoices] });
      log("billing", `${id} for ${patientName(t.patientId)}: MDS service invoice for ${t.id}${opts.ownMedicinesDeclared ? " (own medicines declared)" : ""}`, { patientId: t.patientId, trayId });
      return pass(`Created ${id} for the MDS service`, id);
    },

    dispatchDelivery(id, assignedTo) {
      if (!allowed("delivery.manage")) return denied("dispatch deliveries");
      const d = get().deliveries.find((x) => x.id === id);
      if (!d || !["scheduled", "failed"].includes(d.status)) return fail("Only a scheduled or returned delivery can be dispatched.");
      if (!assignedTo) return fail("Assign delivery staff first.");
      const by = actor().name;
      if (d.kind === "order") {
        const o = get().orders.find((x) => x.id === d.refId);
        if (!o || o.status !== "ready-collection") return fail("The order must pass its final pharmacist check before dispatch.");
        const r = get().deductOrderStock(o.id, by);
        if (!r.ok) return r;
        set((s) => ({ orders: s.orders.map((x) => (x.id === o.id ? { ...x, status: "out-for-delivery", events: [...x.events, { at: now(), by, role: actor().role, action: `Dispatched with ${assignedTo} (${id}). Stock deducted`, status: "out-for-delivery" as const }] } : x)) }));
      } else {
        const t = getTray(d.refId);
        if (!t || t.status !== "ready") return fail("The tray must be approved and ready before dispatch.");
        const r = get().deductTrayStock(t.id, by);
        if (!r.ok) return r;
      }
      set((s) => ({ deliveries: s.deliveries.map((x) => (x.id === id ? { ...x, status: "out", assignedTo, dispatchedAt: now() } : x)) }));
      log("delivery", `${id} for ${patientName(d.patientId)}: out for delivery with ${assignedTo}`, { patientId: d.patientId, orderId: d.kind === "order" ? d.refId : undefined, trayId: d.kind === "tray" ? d.refId : undefined });
      return pass(`${id} is out for delivery. Stock deducted once.`);
    },

    completeDelivery(id, receivedBy) {
      if (!allowed("delivery.manage")) return denied("confirm deliveries");
      const d = get().deliveries.find((x) => x.id === id);
      if (!d || d.status !== "out") return fail("Only a delivery that is out can be confirmed.");
      if (!receivedBy.trim()) return fail("Record who received the delivery.");
      const by = actor().name;
      const at = now();
      set((s) => ({
        deliveries: s.deliveries.map((x) => (x.id === id ? { ...x, status: "delivered", receivedBy, deliveredAt: at } : x)),
        orders: d.kind === "order" ? s.orders.map((o) => (o.id === d.refId ? { ...o, status: "delivered", completedAt: at, collectedBy: receivedBy, events: [...o.events, { at, by, role: actor().role, action: `Delivered to ${receivedBy}`, status: "delivered" as const }] } : o)) : s.orders,
        trays: d.kind === "tray" ? s.trays.map((t) => (t.id === d.refId ? { ...t, status: "supplied", suppliedAt: at, fulfilment: { ...t.fulfilment!, collectedBy: receivedBy }, events: [...t.events, trayEv("supplied", `Delivered to ${receivedBy}`)] } : t)) : s.trays,
      }));
      log("delivery", `${id} for ${patientName(d.patientId)}: delivered to ${receivedBy}. Recorded in the patient's history`, { patientId: d.patientId, orderId: d.kind === "order" ? d.refId : undefined, trayId: d.kind === "tray" ? d.refId : undefined });
      return pass(`Delivered to ${receivedBy}`);
    },

    failDelivery(id, note) {
      if (!allowed("delivery.manage")) return denied("update deliveries");
      const d = get().deliveries.find((x) => x.id === id);
      if (!d || d.status !== "out") return fail("Only a delivery that is out can be marked as failed.");
      if (!note.trim()) return fail("Say what happened.");
      set((s) => ({
        deliveries: s.deliveries.map((x) => (x.id === id ? { ...x, status: "failed", notes: note } : x)),
        orders: d.kind === "order" ? s.orders.map((o) => (o.id === d.refId ? { ...o, status: "ready-collection", events: [...o.events, { at: now(), by: actor().name, role: actor().role, action: "Delivery failed. Returned to the pharmacy for re-dispatch", status: "ready-collection" as const, note }] } : o)) : s.orders,
      }));
      log("delivery", `${id} for ${patientName(d.patientId)}: delivery failed. ${note}`, { patientId: d.patientId });
      return pass("Marked as failed. Stock stays deducted and is not deducted again on re-dispatch.");
    },

    updateDelivery(id, patch) {
      if (!allowed("delivery.manage")) return denied("update deliveries");
      const d = get().deliveries.find((x) => x.id === id);
      if (!d) return fail("Delivery not found.");
      set((s) => ({ deliveries: s.deliveries.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
      return pass("Delivery updated");
    },
  };
}
