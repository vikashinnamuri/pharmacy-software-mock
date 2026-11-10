import { addDays, stamp, today } from "@/lib/dates";
import { isExpired } from "@/lib/tray-engine";
import type {
  Batch, Counselling, Delivery, Invoice, MdsEnrolment, Medicine, Order, OrderEvent, OrderLine, OrderStatus, Patient, Prescription, Purchase,
  StockMovement, Supplier,
} from "@/types";

const ARJUN = "Arjun R. (demo)";
const DIVYA = "Divya S. (demo)";
const KAVYA = "Kavya L. (demo)";
const RAVI = "Ravi T. (demo)";
const MEENA = "Meena K. (demo)";

/* ------------------------------------------------------------------ */

export const buildSuppliers = (): Supplier[] => [
  { id: "SUP-01", name: "Coromandel Distributors (demo)", contact: "Order desk", phone: "+91 90000 50001", email: "orders.demo@example.com", leadTimeDays: 2 },
  { id: "SUP-02", name: "Bay Medical Supplies (demo)", contact: "Account manager", phone: "+91 90000 50002", email: "bay.demo@example.com", leadTimeDays: 3 },
  { id: "SUP-03", name: "Adyar Pharma Wholesale (demo)", contact: "Sales", phone: "+91 90000 50003", email: "adyar.demo@example.com", leadTimeDays: 4 },
];

const SUPPLIER_FOR_MAKER: Record<string, string> = {
  "Coromandel Labs (demo)": "SUP-01",
  "Marina Therapeutics (demo)": "SUP-02",
  "Besant Health (demo)": "SUP-02",
  "Adyar Pharma (demo)": "SUP-03",
};
export const supplierFor = (manufacturer: string) => SUPPLIER_FOR_MAKER[manufacturer] ?? "SUP-01";

export const buildPurchases = (): Purchase[] => [
  {
    id: "PO-601", supplierId: "SUP-01", orderedOn: addDays(today(), -18), expectedOn: addDays(today(), -15), status: "received",
    receivedOn: addDays(today(), -15), receivedBy: MEENA, notes: "Routine top-up (demo).",
    lines: [
      { id: "PL-1", medicineId: "MED-015", qty: 900, unitCost: 0.4, batchNumber: "FVR-2505", expiryDate: addDays(today(), 600) },
      { id: "PL-2", medicineId: "MED-001", qty: 620, unitCost: 1.6, batchNumber: "GLC-2502", expiryDate: addDays(today(), 410) },
    ],
  },
  {
    id: "PO-602", supplierId: "SUP-02", orderedOn: addDays(today(), -2), expectedOn: addDays(today(), 1), status: "ordered",
    notes: "Lasinex is below reorder level after an expired batch (demo).",
    lines: [
      { id: "PL-3", medicineId: "MED-012", qty: 120, unitCost: 0.8 },
      { id: "PL-4", medicineId: "MED-007", qty: 200, unitCost: 1.1 },
    ],
  },
];

/* ------------------------------------------------------------------ */

export function buildEnrolments(patients: Patient[]): MdsEnrolment[] {
  const out: MdsEnrolment[] = [];
  let n = 0;
  const FULFIL: Record<string, MdsEnrolment["fulfilment"]> = { "PT-1004": "delivery", "PT-1005": "delivery", "PT-1009": "delivery" };
  patients.forEach((p) => {
    if (p.mdsStatus === "none") return;
    const id = `ENR-${800 + ++n}`;
    const enrolledOn = addDays(p.registeredOn, 3);
    const history: MdsEnrolment["history"] = [{ at: stamp(Math.max(0, daysAgo(enrolledOn)), 10, 0), by: DIVYA, role: "dispenser", action: "Requested MDS enrolment" }];
    const reviewed = p.mdsStatus !== "assessment";
    if (reviewed) history.push({ at: stamp(Math.max(0, daysAgo(enrolledOn) - 1), 12, 0), by: ARJUN, role: "pharmacist", action: "Suitability review: suitable for MDS" });
    if (p.mdsStatus === "paused") history.push({ at: stamp(4, 9, 0), by: ARJUN, role: "pharmacist", action: "Suspended", note: "Hospital admission. Resume on discharge." });
    const bf = p.id === "PT-1003";
    out.push({
      id, patientId: p.id,
      status: p.mdsStatus === "active" ? "active" : p.mdsStatus === "paused" ? "suspended" : "pending-review",
      enrolledOn,
      responsiblePharmacist: ARJUN,
      prescriber: p.doctor.name,
      caregiver: p.caregiver?.name,
      consent: p.mdsStatus !== "assessment",
      consentBy: p.caregiver ? "caregiver" : "patient",
      prepDay: [3, 4, 2, 3, 4, 1, 2, 3, 4, 2, 1, 3, 2, 4, 3, 1][Number(p.id.slice(3)) - 1001] ?? 3,
      fulfilment: FULFIL[p.id] ?? "collection",
      suitability: reviewed ? "suitable" : "pending",
      suitabilityNote: reviewed ? (bf ? "Suitable. Diaclide approved as a separate Before Breakfast compartment." : "Suitable for a weekly 7-day tray.") : undefined,
      reviewedBy: reviewed ? ARJUN : undefined,
      reviewedAt: reviewed ? stamp(Math.max(0, daysAgo(enrolledOn) - 1), 12, 0) : undefined,
      approvedPeriods: bf ? ["bf-breakfast"] : [],
      periodTimes: bf ? { "bf-breakfast": "07:30" } : {},
      history,
    });
  });
  return out;
}

const daysAgo = (date: string) => Math.round((Date.now() - new Date(date).getTime()) / 86_400_000);

/* ------------------------------------------------------------------ */

interface OrderSpec {
  n: number;
  patientId: string;
  rxId?: string;
  items: [string, number][];
  status: OrderStatus;
  fulfilment: Order["fulfilment"];
  daysAgo: number;
  hour: number;
  token: string;
  counselling?: boolean;
}

/** Seeded dispensing orders. Stock for completed orders is deducted once, with matching movements. */
export function buildOrders(args: {
  patients: Patient[]; prescriptions: Prescription[]; medicines: Medicine[]; batches: Batch[]; movements: StockMovement[];
  invoiceStart: number; gstRate: number;
}) {
  const { patients, prescriptions, medicines, batches, movements, gstRate } = args;
  const orders: Order[] = [];
  const invoices: Invoice[] = [];
  const deliveries: Delivery[] = [];
  const counselling: Counselling[] = [];
  let inv = args.invoiceStart;
  let mv = 7000;
  let dl = 800;
  let cn = 900;
  let ln = 0;
  const held: Record<string, number> = {};

  const SPECS: OrderSpec[] = [
    { n: 1, patientId: "PT-1012", rxId: "RX-2013", items: [["MED-025", 15], ["MED-015", 10]], status: "collected", fulfilment: "collection", daysAgo: 3, hour: 11, token: "P-004" },
    { n: 2, patientId: "PT-1014", rxId: "RX-2017", items: [["MED-023", 1]], status: "delivered", fulfilment: "delivery", daysAgo: 1, hour: 10, token: "P-002" },
    { n: 3, patientId: "PT-1016", rxId: "RX-2019", items: [["MED-003", 28], ["MED-004", 28]], status: "ready-collection", fulfilment: "collection", daysAgo: 0, hour: 9, token: "P-001" },
    { n: 4, patientId: "PT-1013", items: [["MED-015", 10]], status: "awaiting-payment", fulfilment: "collection", daysAgo: 0, hour: 9, token: "P-002", counselling: true },
    { n: 5, patientId: "PT-1017", rxId: "RX-2022", items: [["MED-027", 28], ["MED-003", 28]], status: "in-preparation", fulfilment: "collection", daysAgo: 0, hour: 10, token: "P-003" },
    { n: 6, patientId: "PT-1018", rxId: "RX-2023", items: [["MED-007", 28]], status: "awaiting-review", fulfilment: "collection", daysAgo: 0, hour: 10, token: "P-004" },
    { n: 7, patientId: "PT-1014", rxId: "RX-2017", items: [["MED-023", 1]], status: "out-for-delivery", fulfilment: "delivery", daysAgo: 0, hour: 8, token: "P-005" },
    { n: 8, patientId: "PT-1012", items: [["MED-015", 20]], status: "awaiting-verification", fulfilment: "collection", daysAgo: 0, hour: 11, token: "P-006" },
  ];

  const order = (s: OrderStatus) => ["awaiting-review", "awaiting-payment", "payment-received", "in-preparation", "awaiting-verification", "ready-collection", "out-for-delivery", "collected", "delivered"].indexOf(s);

  SPECS.forEach((sp) => {
    const patient = patients.find((p) => p.id === sp.patientId)!;
    const rx = sp.rxId ? prescriptions.find((p) => p.id === sp.rxId) : undefined;
    const reached = (s: OrderStatus) => order(sp.status) >= order(s);
    const id = `ORD-${5000 + sp.n}`;
    const t = (offsetMin: number) => {
      const d = new Date(stamp(sp.daysAgo, sp.hour, 0));
      d.setMinutes(d.getMinutes() + offsetMin);
      return d.toISOString();
    };
    const deducted = ["collected", "delivered", "out-for-delivery"].includes(sp.status);
    const allocate = reached("awaiting-payment");

    const lines: OrderLine[] = sp.items.map(([medicineId, qty]) => {
      const med = medicines.find((m) => m.id === medicineId)!;
      const rxLine = rx?.lines.find((l) => l.medicineId === medicineId);
      const allocations: OrderLine["allocations"] = [];
      if (allocate) {
        const batch = batches
          .filter((b) => b.medicineId === medicineId && !isExpired(b, today()) && b.available - (held[b.id] ?? 0) >= qty)
          .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))[0];
        if (batch) {
          allocations.push({ batchId: batch.id, qty });
          if (deducted) {
            batch.available -= qty;
            movements.push({ id: `MV-${++mv}`, at: t(90), batchId: batch.id, medicineId, type: "dispensed", qty: -qty, reference: id, by: sp.status === "out-for-delivery" || sp.status === "delivered" ? RAVI : DIVYA });
          } else held[batch.id] = (held[batch.id] ?? 0) + qty;
        }
      }
      return { id: `OL-${++ln}`, medicineId, strength: med.strength, qty, unitPrice: med.unitPrice, gstRate, rxLineId: rxLine?.id, instructions: rxLine?.instructions || (rx ? "" : "Take as directed on the pack."), allocations };
    });

    const events: OrderEvent[] = [
      { at: t(0), by: KAVYA, role: "reception", action: `Patient identity confirmed (QR card) and order created. Token ${sp.token}`, status: "new" },
      { at: t(1), by: KAVYA, role: "reception", action: "Submitted for pharmacist review", status: "awaiting-review" },
    ];
    let invoiceId: string | undefined;
    if (reached("awaiting-payment")) {
      events.push({ at: t(15), by: ARJUN, role: "pharmacist", action: "Pharmacist review approved. Stock checked and charges calculated", status: "awaiting-payment" });
      invoiceId = `INV-${++inv}`;
      const paid = reached("payment-received");
      const net = lines.reduce((n, l) => n + l.qty * l.unitPrice, 0);
      const total = Math.round(net * (1 + gstRate / 100) * 100) / 100;
      invoices.push({
        id: invoiceId, patientId: sp.patientId, issuedOn: addDays(today(), -sp.daysAgo), dueOn: addDays(today(), -sp.daysAgo), status: paid ? "paid" : "issued", orderId: id,
        lines: lines.map((l) => ({ id: `IL-${id}-${l.id}`, description: `${medicines.find((m) => m.id === l.medicineId)!.brand} ${l.strength}`, kind: "product", medicineId: l.medicineId, qty: l.qty, unitPrice: l.unitPrice, gstRate: l.gstRate })),
        payments: paid ? [{ id: `PAY-${id}`, at: t(25), amount: total, kind: "payment", method: sp.n % 2 ? "UPI" : "Cash", by: KAVYA, note: "Simulated payment" }] : [],
      });
      if (paid) events.push({ at: t(25), by: KAVYA, role: "reception", action: `Payment recorded (simulated, ${sp.n % 2 ? "UPI" : "Cash"})`, status: "payment-received" });
    }
    if (reached("in-preparation")) events.push({ at: t(35), by: DIVYA, role: "dispenser", action: "Preparation started", status: "in-preparation" });
    if (reached("awaiting-verification")) events.push({ at: t(50), by: DIVYA, role: "dispenser", action: "Prepared and labelled. Sent for final check", status: "awaiting-verification" });
    if (reached("ready-collection")) events.push({ at: t(60), by: ARJUN, role: "pharmacist", action: "Final pharmacist verification approved", status: "ready-collection" });

    let deliveryId: string | undefined;
    if (sp.fulfilment === "delivery" && reached("ready-collection")) {
      deliveryId = `DLV-${++dl}`;
      const out = reached("out-for-delivery");
      const done = sp.status === "delivered";
      deliveries.push({
        id: deliveryId, kind: "order", refId: id, patientId: sp.patientId, address: patient.address, assignedTo: RAVI,
        estimatedDate: addDays(today(), -sp.daysAgo), status: done ? "delivered" : out ? "out" : "scheduled",
        authorisedRecipient: patient.representative?.name ?? patient.name,
        dispatchedAt: out ? t(90) : undefined, deliveredAt: done ? t(150) : undefined, receivedBy: done ? patient.name : undefined,
      });
      if (out) events.push({ at: t(90), by: RAVI, role: "delivery", action: "Dispatched for delivery. Stock deducted", status: "out-for-delivery" });
      if (done) events.push({ at: t(150), by: RAVI, role: "delivery", action: `Delivered to ${patient.name}`, status: "delivered" });
    }
    if (sp.status === "collected") events.push({ at: t(120), by: DIVYA, role: "dispenser", action: `Collected by ${patient.name}. Identity confirmed. Stock deducted`, status: "collected" });

    let counsellingId: string | undefined;
    if (sp.counselling) {
      counsellingId = `CNS-${++cn}`;
      counselling.push({
        id: counsellingId, patientId: sp.patientId, orderId: id, forWhom: "patient", reasonType: "symptoms",
        symptoms: "Tension-type headache", duration: "2 days", otherMedicines: "Thyroid tablet", allergies: "Ibuprofen",
        history: "Hypothyroidism", advice: "Paracetamol only, no ibuprofen-containing products. Maximum dose explained. Fluids and rest.",
        referral: false, at: t(10), by: ARJUN,
      });
    }

    orders.push({
      id, token: sp.token, patientId: sp.patientId, prescriptionId: rx?.id, source: rx ? "prescription" : "request", lines,
      fulfilment: sp.fulfilment, status: sp.status,
      patientConfirmed: { by: KAVYA, at: t(0), method: "QR card scanned" },
      review: reached("awaiting-payment") ? { by: ARJUN, at: t(15), outcome: "approved" } : undefined,
      invoiceId,
      preparation: reached("awaiting-verification") ? { status: "done", by: DIVYA, startedAt: t(35), doneAt: t(50) } : reached("in-preparation") ? { status: "in-progress", by: DIVYA, startedAt: t(35) } : { status: "not-started" },
      verification: reached("ready-collection") ? { status: "approved", by: ARJUN, at: t(60) } : { status: "pending" },
      estimatedReady: t(75),
      deliveryAddress: sp.fulfilment === "delivery" ? patient.address : undefined,
      deliveryId,
      collectedBy: sp.status === "collected" ? patient.name : undefined,
      completedAt: sp.status === "collected" ? t(120) : sp.status === "delivered" ? t(150) : undefined,
      inventoryDeducted: deducted,
      counsellingId,
      createdAt: t(0), createdBy: KAVYA, events,
    });
  });

  counselling.push({
    id: `CNS-${++cn}`, patientId: "PT-1012", forWhom: "patient", reasonType: "symptoms", symptoms: "Productive cough", duration: "5 days",
    otherMedicines: "None", allergies: "None known", history: "Smoker", advice: "Prescription antibiotic course explained. Complete the course.",
    referral: true, referralNotes: "Return to GP if fever persists beyond 3 days.", at: stamp(3, 11, 20), by: ARJUN,
  });

  return { orders, invoices, deliveries, counselling };
}
