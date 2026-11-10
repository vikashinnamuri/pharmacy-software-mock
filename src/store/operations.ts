import { addDays, today } from "@/lib/dates";
import { invoiceTotals } from "@/lib/selectors";
import { isExpired, reservedByBatch } from "@/lib/tray-engine";
import type { BackingTemplate, Batch, DocumentType, GeneratedDocument, PaymentMethod, Purchase, Supplier } from "@/types";
import { fail, pass, type Ctx, type Result } from "./context";

export interface OperationsActions {
  returnStock(batchId: string, qty: number, reason: string): Result;
  writeOffStock(batchId: string, qty: number, reason: string): Result;
  saveSupplier(s: Omit<Supplier, "id"> & { id?: string }): Result;
  createPurchase(p: Pick<Purchase, "supplierId" | "expectedOn" | "lines" | "notes">): Result;
  receivePurchase(id: string, received: { lineId: string; batchNumber: string; expiryDate: string; location: string }[]): Result;
  cancelPurchase(id: string, note: string): Result;

  recordInvoicePayment(id: string, amount: number, method: PaymentMethod, note?: string): Result;
  recordRefund(id: string, amount: number, note: string): Result;
  recordAdjustment(id: string, amount: number, note: string): Result;
  billSubscription(id: string): Result;

  logDocument(type: DocumentType, label: string, verb: GeneratedDocument["action"], patientId?: string, refId?: string, templateId?: string): number;
  saveTemplate(t: BackingTemplate): Result;
}

export function operationsActions(ctx: Ctx): OperationsActions {
  const { set, get, actor, allowed, denied, log, patientName, uid, nextNumber, now } = ctx;
  const freeOf = (b: Batch) => b.available - (reservedByBatch(get().trays, get().orders)[b.id] ?? 0);

  const moveOut = (batchId: string, qty: number, type: "returned" | "written-off", reason: string, what: string): Result => {
    const b = get().batches.find((x) => x.id === batchId);
    if (!b) return fail("Batch not found.");
    if (!Number.isInteger(qty) || qty <= 0) return fail("Enter a whole quantity above zero.");
    if (!reason.trim()) return fail(`Say why the stock is being ${what}.`);
    const limit = isExpired(b, today()) ? b.available : freeOf(b);
    if (qty > limit) return fail(`Only ${limit} unit${limit === 1 ? "" : "s"} of batch ${b.batchNumber} can be ${what}. The rest is reserved or not on the shelf.`);
    set((s) => ({
      batches: s.batches.map((x) => (x.id === batchId ? { ...x, available: x.available - qty } : x)),
      movements: [{ id: uid("MV"), at: now(), batchId, medicineId: b.medicineId, type, qty: -qty, reference: reason, by: actor().name }, ...s.movements],
    }));
    const med = get().medicines.find((m) => m.id === b.medicineId);
    log("inventory", `${type === "returned" ? "Returned" : "Wrote off"} ${qty} units of ${med?.brand}, batch ${b.batchNumber}. ${reason}`);
    return pass(`${type === "returned" ? "Returned" : "Wrote off"} ${qty} units`);
  };

  const patchInvoicePayments = (id: string, entry: { amount: number; kind: "payment" | "refund" | "adjustment"; method?: PaymentMethod; note?: string }) => {
    set((s) => ({
      invoices: s.invoices.map((i) => {
        if (i.id !== id) return i;
        const payments = [...(i.payments ?? []), { id: uid("PAY"), at: now(), by: actor().name, ...entry }];
        const t = invoiceTotals({ ...i, payments });
        const status = entry.kind === "refund" && t.paid - t.refunded <= 0.005 ? "refunded" : t.balance <= 0.005 ? "paid" : i.status === "draft" ? "issued" : i.status === "paid" ? "issued" : i.status;
        return { ...i, payments, status };
      }),
    }));
  };

  return {
    returnStock: (batchId, qty, reason) => (allowed("inventory.edit") ? moveOut(batchId, qty, "returned", reason, "returned") : denied("return stock")),
    writeOffStock: (batchId, qty, reason) => (allowed("inventory.edit") ? moveOut(batchId, qty, "written-off", reason, "written off") : denied("write off stock")),

    saveSupplier(input) {
      if (!allowed("inventory.edit")) return denied("change suppliers");
      if (!input.name.trim()) return fail("Enter the supplier name.");
      if (input.id) {
        set((s) => ({ suppliers: s.suppliers.map((x) => (x.id === input.id ? { ...x, ...input, id: x.id } : x)) }));
        return pass(`Saved ${input.name}`, input.id);
      }
      const id = nextNumber(get().suppliers.map((x) => x.id), "SUP", 0).replace(/-(\d+)$/, (_, n) => `-${String(n).padStart(2, "0")}`);
      set((s) => ({ suppliers: [...s.suppliers, { ...input, id }] }));
      log("inventory", `Added supplier ${input.name}`);
      return pass(`Added ${input.name}`, id);
    },

    createPurchase(input) {
      if (!allowed("inventory.edit")) return denied("raise purchase orders");
      const lines = input.lines.filter((l) => l.medicineId && l.qty > 0);
      if (!lines.length) return fail("Add at least one medicine with a quantity.");
      const id = nextNumber(get().purchases.map((x) => x.id), "PO", 600);
      set((s) => ({ purchases: [{ ...input, lines, id, orderedOn: today(), status: "ordered" }, ...s.purchases] }));
      log("inventory", `Raised purchase order ${id} with ${get().suppliers.find((x) => x.id === input.supplierId)?.name}`);
      return pass(`Raised ${id}`, id);
    },

    receivePurchase(id, received) {
      if (!allowed("inventory.edit")) return denied("receive stock");
      const s = get();
      const po = s.purchases.find((x) => x.id === id);
      if (!po || po.status !== "ordered") return fail("Only an open purchase order can be received.");
      for (const l of po.lines) {
        const r = received.find((x) => x.lineId === l.id);
        if (!r?.batchNumber.trim()) return fail("Enter a batch number for every line.");
        if (!r.expiryDate || r.expiryDate <= today()) return fail("Every batch needs an expiry date in the future.");
        if (s.batches.some((b) => b.batchNumber === r.batchNumber && b.medicineId === l.medicineId)) return fail(`Batch ${r.batchNumber} already exists.`);
      }
      const at = now();
      const by = actor().name;
      const newBatches: Batch[] = po.lines.map((l) => {
        const r = received.find((x) => x.lineId === l.id)!;
        const med = s.medicines.find((m) => m.id === l.medicineId)!;
        return { id: `BT-${r.batchNumber}-${uid("X")}`, medicineId: l.medicineId, batchNumber: r.batchNumber, manufacturer: med.manufacturer, expiryDate: r.expiryDate, available: l.qty, location: r.location || "Receiving", receivedOn: today(), supplierId: po.supplierId };
      });
      set((st) => ({
        batches: [...newBatches, ...st.batches],
        movements: [...newBatches.map((b) => ({ id: uid("MV"), at, batchId: b.id, medicineId: b.medicineId, type: "received" as const, qty: b.available, reference: `Stock receipt ${id}`, by })), ...st.movements],
        purchases: st.purchases.map((x) => (x.id === id ? { ...x, status: "received", receivedOn: today(), receivedBy: by, lines: x.lines.map((l) => { const r = received.find((y) => y.lineId === l.id)!; return { ...l, batchNumber: r.batchNumber, expiryDate: r.expiryDate }; }) } : x)),
      }));
      log("inventory", `Received ${id}: ${newBatches.length} batch${newBatches.length > 1 ? "es" : ""} added to stock`);
      return pass(`Received ${id}. ${newBatches.length} batch${newBatches.length > 1 ? "es" : ""} added.`);
    },

    cancelPurchase(id, note) {
      if (!allowed("inventory.edit")) return denied("cancel purchase orders");
      const po = get().purchases.find((x) => x.id === id);
      if (!po || po.status !== "ordered") return fail("Only an open purchase order can be cancelled.");
      set((s) => ({ purchases: s.purchases.map((x) => (x.id === id ? { ...x, status: "cancelled", notes: note || x.notes } : x)) }));
      log("inventory", `Cancelled purchase order ${id}${note ? `. ${note}` : ""}`);
      return pass(`Cancelled ${id}`);
    },

    recordInvoicePayment(id, amount, method, note) {
      if (!allowed("billing.edit") && !allowed("order.payment")) return denied("record payments");
      const inv = get().invoices.find((i) => i.id === id);
      if (!inv) return fail("Invoice not found.");
      if (["refunded", "cancelled"].includes(inv.status)) return fail(`${id} is ${inv.status}.`);
      if (!(amount > 0)) return fail("Enter an amount above zero.");
      const t = invoiceTotals(inv);
      if (amount > t.balance + 0.005) return fail(`The balance is ₹${t.balance.toFixed(2)}. Use an adjustment for anything else.`);
      // An order waiting for payment moves on through the order workflow, so its status history stays complete.
      const order = inv.orderId ? get().orders.find((o) => o.id === inv.orderId) : undefined;
      if (order?.status === "awaiting-payment" && Math.abs(amount - t.balance) < 0.005) return get().recordOrderPayment(order.id, method);
      patchInvoicePayments(id, { amount, kind: "payment", method, note: note || "Simulated payment" });
      log("billing", `${id}: payment of ₹${amount.toFixed(2)} recorded (simulated, ${method})`, { patientId: inv.patientId });
      return pass(`Recorded ₹${amount.toFixed(2)}. No real payment was processed.`);
    },

    recordRefund(id, amount, note) {
      if (!allowed("billing.edit")) return denied("record refunds");
      const inv = get().invoices.find((i) => i.id === id);
      if (!inv) return fail("Invoice not found.");
      const t = invoiceTotals(inv);
      if (!(amount > 0)) return fail("Enter an amount above zero.");
      if (amount > t.paid - t.refunded + 0.005) return fail(`Only ₹${(t.paid - t.refunded).toFixed(2)} has been paid on ${id}.`);
      if (!note.trim()) return fail("Add a reason for the refund.");
      patchInvoicePayments(id, { amount: -amount, kind: "refund", note });
      log("billing", `${id}: refund of ₹${amount.toFixed(2)} recorded (simulated). ${note}`, { patientId: inv.patientId });
      return pass(`Recorded a simulated refund of ₹${amount.toFixed(2)}`);
    },

    recordAdjustment(id, amount, note) {
      if (!allowed("billing.edit")) return denied("adjust invoices");
      const inv = get().invoices.find((i) => i.id === id);
      if (!inv) return fail("Invoice not found.");
      if (!amount) return fail("Enter a non-zero amount. Use a negative number for a credit.");
      if (!note.trim()) return fail("Explain the adjustment.");
      patchInvoicePayments(id, { amount, kind: "adjustment", note });
      log("billing", `${id}: adjustment of ₹${amount.toFixed(2)}. ${note}`, { patientId: inv.patientId });
      return pass("Adjustment recorded");
    },

    billSubscription(id) {
      if (!allowed("billing.edit")) return denied("bill subscriptions");
      const s = get();
      const sub = s.subscriptions.find((x) => x.id === id);
      if (!sub || sub.status !== "active") return fail("Only an active plan can be billed.");
      const invId = nextNumber(s.invoices.map((i) => i.id), "INV", 3000);
      const period = sub.plan === "weekly" ? 7 : 30;
      set((st) => ({
        invoices: [{
          id: invId, patientId: sub.patientId, issuedOn: today(), dueOn: addDays(today(), 7), status: "issued", payments: [],
          lines: [{ id: uid("IL"), description: `${sub.plan === "weekly" ? "Weekly" : "Monthly"} MDS service plan, ${sub.id} (recurring)`, kind: "service", qty: 1, unitPrice: sub.price, gstRate: st.settings.serviceGstRate }],
          notes: "Recurring service billing concept. Generated manually in this demo.",
        }, ...st.invoices],
        subscriptions: st.subscriptions.map((x) => (x.id === id ? { ...x, renewalDate: addDays(x.renewalDate, period) } : x)),
      }));
      log("billing", `${invId} for ${patientName(sub.patientId)}: recurring MDS plan invoice from ${sub.id}`, { patientId: sub.patientId });
      return pass(`Created ${invId}. Next renewal moved on ${period} days.`, invId);
    },

    logDocument(type, docLabel, verb, patientId, refId, templateId) {
      const s = get();
      const ref = refId ?? patientId ?? "general";
      const prior = s.documents.filter((d) => d.type === type && d.refId === ref && d.action !== "previewed");
      const isOutput = verb !== "previewed";
      const action = isOutput && prior.length ? "reprinted" : verb;
      const version = isOutput ? prior.length + 1 : Math.max(1, prior.length);
      const doc: GeneratedDocument = { id: uid("GD"), type, refId: ref, patientId, version, action: verb === "downloaded" ? "downloaded" : action, templateId, at: now(), by: actor().name };
      set({ documents: [doc, ...s.documents].slice(0, 500) });
      log("document", `${docLabel} ${isOutput && prior.length ? `${verb} again (version ${version})` : verb}${patientId ? ` for ${patientName(patientId)}` : ""}`, { documentType: type, patientId, trayId: refId?.startsWith("TRY") ? refId : undefined, orderId: refId?.startsWith("ORD") ? refId : undefined });
      return version;
    },

    saveTemplate(t) {
      if (!allowed("settings.edit")) return denied("change templates");
      if (t.widthMm < 80 || t.heightMm < 60 || t.widthMm > 500 || t.heightMm > 500) return fail("Keep the sheet between 80 × 60 mm and 500 × 500 mm.");
      if ([t.marginTop, t.marginRight, t.marginBottom, t.marginLeft].some((m) => m < 0 || m > 40)) return fail("Margins must be between 0 and 40 mm.");
      set((s) => {
        const exists = s.settings.backingTemplates.some((x) => x.id === t.id);
        return { settings: { ...s.settings, backingTemplates: exists ? s.settings.backingTemplates.map((x) => (x.id === t.id ? t : x)) : [...s.settings.backingTemplates, t] } };
      });
      return pass(`Saved template ${t.name}`);
    },
  };
}
