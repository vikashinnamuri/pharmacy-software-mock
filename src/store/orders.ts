import { today } from "@/lib/dates";
import { canMove, nextToken, ORDER_LABEL } from "@/lib/orders";
import { isTodayLocal } from "@/lib/selectors";
import { isExpired, reservedByBatch } from "@/lib/tray-engine";
import type { Counselling, Delivery, Invoice, Order, OrderEvent, OrderLine, OrderStatus, PaymentMethod, Prescription } from "@/types";
import { fail, pass, type Ctx, type Result } from "./context";

export interface OrderInput {
  patientId: string;
  prescriptionId?: string;
  source: Order["source"];
  lines: { medicineId: string; qty: number; rxLineId?: string; instructions?: string }[];
  fulfilment: Order["fulfilment"];
  deliveryAddress?: string;
  estimatedReady?: string;
  confirmMethod: string;
  submit: boolean;
  notes?: string;
  counselling?: CounsellingInput;
}

export type CounsellingInput = Omit<Counselling, "id" | "at" | "by">;

export interface OrderActions {
  createOrder(input: OrderInput): Result;
  submitOrder(id: string): Result;
  reviewOrder(id: string, outcome: "approved" | "rejected", note?: string): Result;
  recordOrderPayment(id: string, method: PaymentMethod): Result;
  startOrderPreparation(id: string): Result;
  completeOrderPreparation(id: string): Result;
  verifyOrder(id: string, outcome: "approved" | "rejected", note?: string): Result;
  recordCollection(id: string, collectedBy: string, idMethod: string): Result;
  holdOrder(id: string, note: string): Result;
  resumeOrder(id: string): Result;
  cancelOrder(id: string, note: string): Result;
  setOrderEstimate(id: string, iso: string): Result;
  saveCounselling(input: CounsellingInput): Result;
  /** Internal: stock leaves the shelf once, at hand-over or dispatch. */
  deductOrderStock(id: string, by: string): Result;
}

export function orderActions(ctx: Ctx): OrderActions {
  const { set, get, actor, allowed, denied, log, patientName, uid, nextNumber, now } = ctx;
  const getOrder = (id: string) => get().orders.find((o) => o.id === id);
  const event = (action: string, status?: OrderStatus, note?: string): OrderEvent => {
    const a = actor();
    return { at: now(), by: a.name, role: a.role, action, status, note };
  };
  const patch = (id: string, fn: (o: Order) => Order) => set((s) => ({ orders: s.orders.map((o) => (o.id === id ? fn(o) : o)) }));
  const label = (o: Order) => `${o.id} (${o.token}) for ${patientName(o.patientId)}`;
  const blocked = (o: Order, to: OrderStatus) =>
    canMove(o.status, to) ? null : fail(`${o.id} is ${ORDER_LABEL[o.status]}. It cannot move to ${ORDER_LABEL[to]} from there.`);

  /** First-expiry-first-out across batches, skipping stock held by trays and other orders. */
  const allocate = (medicineId: string, qty: number, excludeOrderId: string) => {
    const s = get();
    const reserved = reservedByBatch(s.trays, s.orders.filter((o) => o.id !== excludeOrderId));
    const options = s.batches.filter((b) => b.medicineId === medicineId && !isExpired(b, today())).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    const out: OrderLine["allocations"] = [];
    let need = qty;
    let freeTotal = 0;
    for (const b of options) {
      const free = Math.max(0, b.available - (reserved[b.id] ?? 0));
      freeTotal += free;
      if (need <= 0 || free <= 0) continue;
      const take = Math.min(free, need);
      out.push({ batchId: b.id, qty: take });
      need -= take;
    }
    return need > 0 ? { ok: false as const, free: freeTotal } : { ok: true as const, allocations: out };
  };

  const actions: OrderActions = {
    createOrder(input) {
      if (!allowed("order.create")) return denied("create dispensing orders");
      const s = get();
      const patient = s.patients.find((p) => p.id === input.patientId);
      if (!patient) return fail("Choose and confirm a patient first.");
      if (!input.confirmMethod.trim()) return fail("Confirm the patient's identity before creating an order.");
      const lines = input.lines.filter((l) => l.qty > 0);
      if (!lines.length) return fail("Add at least one medicine with a quantity above zero.");
      let rx: Prescription | undefined;
      if (input.source === "prescription") {
        rx = s.prescriptions.find((p) => p.id === input.prescriptionId);
        if (!rx || rx.patientId !== input.patientId) return fail("Choose a prescription that belongs to this patient.");
        if (!["pending", "verified"].includes(rx.status)) return fail(`${rx.id} is ${rx.status}. Only a pending or verified prescription can be dispensed.`);
        const bad = lines.find((l) => !rx!.lines.some((x) => x.id === l.rxLineId));
        if (bad) return fail("Every medicine must come from the selected prescription.");
      }
      const id = nextNumber(s.orders.map((o) => o.id), "ORD", 5000);
      const token = nextToken(s.orders.filter((o) => isTodayLocal(o.createdAt)).map((o) => o.token), "P");
      const a = actor();
      const at = now();
      const ready = input.estimatedReady ?? new Date(Date.now() + s.settings.tokenPrepMinutes * 60_000).toISOString();
      let counsellingId: string | undefined;
      const extra: Partial<typeof s> = {};
      if (input.counselling) {
        if (!allowed("counselling.record")) return denied("record counselling");
        counsellingId = nextNumber(s.counselling.map((c) => c.id), "CNS", 900);
        extra.counselling = [{ ...input.counselling, id: counsellingId, orderId: id, patientId: input.patientId, at, by: a.name }, ...s.counselling];
      }
      const order: Order = {
        id, token, patientId: input.patientId, prescriptionId: rx?.id, source: input.source,
        lines: lines.map((l) => {
          const med = s.medicines.find((m) => m.id === l.medicineId)!;
          const rxLine = rx?.lines.find((x) => x.id === l.rxLineId);
          return { id: uid("OL"), medicineId: l.medicineId, strength: rxLine?.strength ?? med.strength, qty: l.qty, unitPrice: med.unitPrice, gstRate: s.settings.defaultGstRate, rxLineId: l.rxLineId, instructions: l.instructions ?? rxLine?.instructions ?? "", allocations: [] };
        }),
        fulfilment: input.fulfilment,
        status: input.submit ? "awaiting-review" : "new",
        patientConfirmed: { by: a.name, at, method: input.confirmMethod },
        preparation: { status: "not-started" },
        verification: { status: "pending" },
        estimatedReady: ready,
        deliveryAddress: input.fulfilment === "delivery" ? input.deliveryAddress || patient.address : undefined,
        inventoryDeducted: false,
        counsellingId,
        createdAt: at,
        createdBy: a.name,
        notes: input.notes,
        events: [
          event(`Patient identity confirmed (${input.confirmMethod}). Order created with token ${token}`, "new"),
          ...(input.submit ? [event("Submitted for pharmacist review", "awaiting-review")] : []),
        ],
      };
      set({ orders: [order, ...s.orders], ...extra });
      log("order", `${id} (${token}) for ${patient.name}: created${input.submit ? " and submitted for pharmacist review" : ""}`, { patientId: patient.id, orderId: id, prescriptionId: rx?.id });
      if (counsellingId) log("counselling", `${counsellingId} recorded for ${patient.name} with ${id}`, { patientId: patient.id, orderId: id });
      return pass(`Created ${id}. Token ${token}.`, id);
    },

    submitOrder(id) {
      if (!allowed("order.create")) return denied("submit orders");
      const o = getOrder(id);
      if (!o) return fail("Order not found.");
      const b = blocked(o, "awaiting-review"); if (b) return b;
      patch(id, (x) => ({ ...x, status: "awaiting-review", events: [...x.events, event("Submitted for pharmacist review", "awaiting-review")] }));
      log("order", `${label(o)}: submitted for pharmacist review`, { patientId: o.patientId, orderId: id });
      return pass(`Submitted ${id} for pharmacist review`);
    },

    reviewOrder(id, outcome, note) {
      if (!allowed("order.review")) return denied("review dispensing orders");
      const s = get();
      const o = getOrder(id);
      if (!o) return fail("Order not found.");
      if (outcome === "rejected") {
        if (!note?.trim()) return fail("Add a reason before rejecting this order.");
        const b = blocked(o, "cancelled"); if (b) return b;
        patch(id, (x) => ({ ...x, status: "cancelled", review: { by: actor().name, at: now(), outcome, note }, events: [...x.events, event("Pharmacist review rejected. Order cancelled", "cancelled", note)] }));
        log("order", `${label(o)}: pharmacist rejected the order. ${note}`, { patientId: o.patientId, orderId: id });
        return pass(`Rejected ${id}`);
      }
      const b = blocked(o, "awaiting-payment"); if (b) return b;
      if (o.prescriptionId) {
        const rx = s.prescriptions.find((p) => p.id === o.prescriptionId);
        if (rx?.status === "pending") return fail(`${rx.id} is still pending. Review and verify the prescription first.`);
        if (rx?.status !== "verified") return fail(`${o.prescriptionId} is not verified, so it cannot be dispensed.`);
      }
      const lines: OrderLine[] = [];
      for (const l of o.lines) {
        const r = allocate(l.medicineId, l.qty, o.id);
        const med = s.medicines.find((m) => m.id === l.medicineId);
        if (!r.ok) return fail(`Not enough free stock of ${med?.brand}: needs ${l.qty}, ${r.free} free. Add stock or put the order on hold.`);
        lines.push({ ...l, allocations: r.allocations });
      }
      const invoiceId = nextNumber(s.invoices.map((i) => i.id), "INV", 3000);
      const invoice: Invoice = {
        id: invoiceId, patientId: o.patientId, issuedOn: today(), dueOn: today(), status: "issued", orderId: id, payments: [],
        lines: lines.map((l) => ({ id: uid("IL"), description: `${s.medicines.find((m) => m.id === l.medicineId)?.brand} ${l.strength}`, kind: "product", medicineId: l.medicineId, qty: l.qty, unitPrice: l.unitPrice, gstRate: l.gstRate })),
      };
      if (o.fulfilment === "delivery" && s.settings.deliveryFee > 0) {
        invoice.lines.push({ id: uid("IL"), description: "Home delivery (service)", kind: "service", qty: 1, unitPrice: s.settings.deliveryFee, gstRate: s.settings.serviceGstRate });
      }
      set((st) => ({
        invoices: [invoice, ...st.invoices],
        orders: st.orders.map((x) => (x.id === id ? {
          ...x, lines, status: "awaiting-payment", invoiceId,
          review: { by: actor().name, at: now(), outcome, note },
          events: [...x.events, event("Pharmacist review approved. Stock checked, batches held and charges calculated", "awaiting-payment", note)],
        } : x)),
      }));
      log("order", `${label(o)}: pharmacist review approved. Stock reserved and ${invoiceId} issued`, { patientId: o.patientId, orderId: id });
      return pass(`Approved ${id}. Stock reserved. ${invoiceId} is waiting for payment.`);
    },

    recordOrderPayment(id, method) {
      if (!allowed("order.payment")) return denied("record payments");
      const s = get();
      const o = getOrder(id);
      if (!o) return fail("Order not found.");
      const b = blocked(o, "payment-received"); if (b) return b;
      const inv = s.invoices.find((i) => i.id === o.invoiceId);
      if (!inv) return fail("This order has no invoice yet.");
      const total = inv.lines.reduce((n, l) => n + (l.qty * l.unitPrice - (l.discount ?? 0)) * (1 + l.gstRate / 100), 0);
      const paid = (inv.payments ?? []).reduce((n, p) => n + p.amount, 0);
      const amount = Math.round((total - paid) * 100) / 100;
      set((st) => ({
        invoices: st.invoices.map((i) => (i.id === inv.id ? { ...i, status: "paid", payments: [...(i.payments ?? []), { id: uid("PAY"), at: now(), amount, kind: "payment", method, by: actor().name, note: `Simulated payment for ${id}` }] } : i)),
        orders: st.orders.map((x) => (x.id === id ? { ...x, status: "payment-received", events: [...x.events, event(`Payment recorded (simulated, ${method})`, "payment-received")] } : x)),
      }));
      log("billing", `${label(o)}: payment of ₹${amount.toFixed(2)} recorded (simulated, ${method})`, { patientId: o.patientId, orderId: id });
      return pass(`Recorded ₹${amount.toFixed(2)} by ${method}. No real payment was processed.`);
    },

    startOrderPreparation(id) {
      if (!allowed("order.prepare")) return denied("prepare orders");
      const o = getOrder(id);
      if (!o) return fail("Order not found.");
      const b = blocked(o, "in-preparation"); if (b) return b;
      patch(id, (x) => ({ ...x, status: "in-preparation", preparation: { status: "in-progress", by: actor().name, startedAt: now() }, events: [...x.events, event("Preparation started", "in-preparation")] }));
      log("order", `${label(o)}: preparation started`, { patientId: o.patientId, orderId: id });
      return pass(`${o.token} is in preparation`);
    },

    completeOrderPreparation(id) {
      if (!allowed("order.prepare")) return denied("prepare orders");
      const o = getOrder(id);
      if (!o) return fail("Order not found.");
      const b = blocked(o, "awaiting-verification"); if (b) return b;
      patch(id, (x) => ({ ...x, status: "awaiting-verification", preparation: { ...x.preparation, status: "done", doneAt: now() }, verification: { status: "pending" }, events: [...x.events, event("Prepared and labelled. Sent for final pharmacist check", "awaiting-verification")] }));
      log("order", `${label(o)}: prepared and sent for final check`, { patientId: o.patientId, orderId: id });
      return pass("Sent for final pharmacist verification");
    },

    verifyOrder(id, outcome, note) {
      if (!allowed("order.verify")) return denied("verify orders");
      const s = get();
      const o = getOrder(id);
      if (!o) return fail("Order not found.");
      if (outcome === "rejected") {
        if (!note?.trim()) return fail("Say what needs to be corrected.");
        const b = blocked(o, "in-preparation"); if (b) return b;
        patch(id, (x) => ({ ...x, status: "in-preparation", preparation: { status: "in-progress", by: x.preparation.by, startedAt: now() }, verification: { status: "rejected", by: actor().name, at: now(), note }, events: [...x.events, event("Final check failed. Returned to preparation", "in-preparation", note)] }));
        log("order", `${label(o)}: final check failed. ${note}`, { patientId: o.patientId, orderId: id });
        return pass("Returned to preparation");
      }
      const b = blocked(o, "ready-collection"); if (b) return b;
      const patient = s.patients.find((p) => p.id === o.patientId)!;
      let deliveries = s.deliveries;
      let deliveryId: string | undefined;
      if (o.fulfilment === "delivery") {
        deliveryId = nextNumber(s.deliveries.map((d) => d.id), "DLV", 800);
        const d: Delivery = { id: deliveryId, kind: "order", refId: o.id, patientId: o.patientId, address: o.deliveryAddress ?? patient.address, estimatedDate: today(), status: "scheduled", authorisedRecipient: patient.representative?.name ?? patient.name };
        deliveries = [d, ...deliveries];
      }
      set((st) => ({
        deliveries,
        orders: st.orders.map((x) => (x.id === id ? { ...x, status: "ready-collection", deliveryId, verification: { status: "approved", by: actor().name, at: now(), note }, events: [...x.events, event(`Final pharmacist verification approved. ${o.fulfilment === "delivery" ? `Ready for dispatch (${deliveryId})` : "Ready for collection"}`, "ready-collection", note)] } : x)),
      }));
      log("verification", `${label(o)}: final verification approved. ${o.fulfilment === "delivery" ? "Ready for dispatch" : "Ready for collection"}`, { patientId: o.patientId, orderId: id });
      return pass(o.fulfilment === "delivery" ? `Approved. ${deliveryId} is ready for dispatch.` : `Approved. Token ${o.token} is ready for collection.`);
    },

    deductOrderStock(id, by) {
      const s = get();
      const o = getOrder(id);
      if (!o) return fail("Order not found.");
      if (o.inventoryDeducted) return pass("Stock was already deducted for this order. Nothing changed.");
      const units: Record<string, number> = {};
      o.lines.forEach((l) => l.allocations.forEach((a) => { units[a.batchId] = (units[a.batchId] ?? 0) + a.qty; }));
      for (const [batchId, qty] of Object.entries(units)) {
        const batch = s.batches.find((x) => x.id === batchId);
        if (!batch || batch.available < qty) return fail(`Batch ${batch?.batchNumber ?? batchId} has ${batch?.available ?? 0} units but the order needs ${qty}.`);
      }
      const at = now();
      set((st) => ({
        batches: st.batches.map((x) => (units[x.id] ? { ...x, available: x.available - units[x.id] } : x)),
        movements: [...Object.entries(units).map(([batchId, qty]) => ({ id: uid("MV"), at, batchId, medicineId: st.batches.find((x) => x.id === batchId)!.medicineId, type: "dispensed" as const, qty: -qty, reference: id, by })), ...st.movements],
        orders: st.orders.map((x) => (x.id === id ? { ...x, inventoryDeducted: true } : x)),
      }));
      return pass("Stock deducted");
    },

    recordCollection(id, collectedBy, idMethod) {
      if (!allowed("order.fulfil")) return denied("hand over orders");
      const o = getOrder(id);
      if (!o) return fail("Order not found.");
      if (o.fulfilment !== "collection") return fail("This is a delivery order. Dispatch it from Collection and Delivery.");
      const b = blocked(o, "collected"); if (b) return b;
      if (!collectedBy.trim()) return fail("Record who collected the order.");
      if (!idMethod) return fail("Confirm the collector's identity first.");
      const r = actions.deductOrderStock(id, actor().name);
      if (!r.ok) return r;
      patch(id, (x) => ({ ...x, status: "collected", collectedBy, completedAt: now(), events: [...x.events, event(`Collected by ${collectedBy}. Identity confirmed (${idMethod}). Stock deducted`, "collected")] }));
      log("order", `${label(o)}: collected by ${collectedBy}. Added to the patient's dispensing history`, { patientId: o.patientId, orderId: id });
      return pass(`Token ${o.token} collected. Stock deducted once.`);
    },

    holdOrder(id, note) {
      if (!allowed("order.create") && !allowed("order.review")) return denied("hold orders");
      const o = getOrder(id);
      if (!o) return fail("Order not found.");
      const b = blocked(o, "on-hold"); if (b) return b;
      if (!note.trim()) return fail("Say why the order is on hold.");
      patch(id, (x) => ({ ...x, status: "on-hold", heldFrom: x.status, events: [...x.events, event("Put on hold", "on-hold", note)] }));
      log("order", `${label(o)}: put on hold. ${note}`, { patientId: o.patientId, orderId: id });
      return pass(`${o.token} is on hold`);
    },

    resumeOrder(id) {
      if (!allowed("order.create") && !allowed("order.review")) return denied("resume orders");
      const o = getOrder(id);
      if (!o || o.status !== "on-hold" || !o.heldFrom) return fail("Only an order on hold can be resumed.");
      patch(id, (x) => ({ ...x, status: x.heldFrom!, heldFrom: undefined, events: [...x.events, event(`Resumed at ${ORDER_LABEL[x.heldFrom!]}`, x.heldFrom)] }));
      log("order", `${label(o)}: resumed`, { patientId: o.patientId, orderId: id });
      return pass(`Resumed at ${ORDER_LABEL[o.heldFrom]}`);
    },

    cancelOrder(id, note) {
      if (!allowed("order.create") && !allowed("order.review")) return denied("cancel orders");
      const s = get();
      const o = getOrder(id);
      if (!o) return fail("Order not found.");
      if (o.status !== "on-hold") { const b = blocked(o, "cancelled"); if (b) return b; }
      if (o.status === "on-hold" && o.heldFrom && !canMove(o.heldFrom, "cancelled")) return fail("This order has passed the point where it can be cancelled.");
      if (!note.trim()) return fail("Add a reason for cancelling.");
      const inv = s.invoices.find((i) => i.id === o.invoiceId);
      const paid = (inv?.payments ?? []).filter((p) => p.kind !== "adjustment").reduce((n, p) => n + p.amount, 0);
      set((st) => ({
        invoices: st.invoices.map((i) => {
          if (i.id !== inv?.id) return i;
          if (paid > 0) return { ...i, status: "refunded", payments: [...(i.payments ?? []), { id: uid("PAY"), at: now(), amount: -paid, kind: "refund", by: actor().name, note: `Refund on cancellation of ${id} (simulated)` }] };
          return { ...i, status: "cancelled" };
        }),
        orders: st.orders.map((x) => (x.id === id ? { ...x, status: "cancelled", heldFrom: undefined, events: [...x.events, event(`Cancelled. Reserved stock released${paid > 0 ? `. Refund of ₹${paid.toFixed(2)} recorded` : ""}`, "cancelled", note)] } : x)),
      }));
      log("order", `${label(o)}: cancelled. ${note}`, { patientId: o.patientId, orderId: id });
      return pass(`Cancelled ${id}.${paid > 0 ? ` Simulated refund of ₹${paid.toFixed(2)} recorded.` : ""}`);
    },

    setOrderEstimate(id, iso) {
      if (!allowed("order.create") && !allowed("order.fulfil")) return denied("change estimates");
      const o = getOrder(id);
      if (!o) return fail("Order not found.");
      patch(id, (x) => ({ ...x, estimatedReady: iso, events: [...x.events, event(`Estimated ready time set to ${new Date(iso).toLocaleString("en-IN")}`)] }));
      return pass("Estimate saved");
    },

    saveCounselling(input) {
      if (!allowed("counselling.record")) return denied("record counselling");
      if (!input.advice.trim()) return fail("Record the advice given.");
      const s = get();
      const id = nextNumber(s.counselling.map((c) => c.id), "CNS", 900);
      const a = actor();
      set({ counselling: [{ ...input, id, at: now(), by: a.name }, ...s.counselling] });
      if (input.orderId) patch(input.orderId, (o) => ({ ...o, counsellingId: id, events: [...o.events, event(`Counselling record ${id} added`)] }));
      log("counselling", `${id} recorded${input.patientId ? ` for ${patientName(input.patientId)}` : ""}`, { patientId: input.patientId, orderId: input.orderId });
      return pass(`Saved counselling record ${id}`, id);
    },
  };
  return actions;
}
