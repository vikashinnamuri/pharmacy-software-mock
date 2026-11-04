import { addDays, today } from "@/lib/dates";
import type { Invoice, InvoiceLine, InvoiceStatus, Subscription } from "@/types";

let seq = 0;
const svc = (description: string, qty: number, unitPrice: number, gstRate = 18): InvoiceLine => ({ id: `IL-${++seq}`, description, kind: "service", qty, unitPrice, gstRate });
const med = (description: string, medicineId: string, qty: number, unitPrice: number, gstRate = 12): InvoiceLine => ({ id: `IL-${++seq}`, description, kind: "product", medicineId, qty, unitPrice, gstRate });

const inv = (n: number, patientId: string, daysAgo: number, status: InvoiceStatus, lines: InvoiceLine[]): Invoice => ({
  id: `INV-${3000 + n}`,
  patientId,
  issuedOn: addDays(today(), -daysAgo),
  dueOn: addDays(today(), -daysAgo + 14),
  status,
  lines,
});

export const buildInvoices = (): Invoice[] => {
  seq = 0;
  return [
    inv(1, "PT-1001", 150, "paid", [svc("Monthly tray service", 1, 1200), med("Glucora 500 mg", "MED-001", 60, 2.4)]),
    inv(2, "PT-1002", 128, "paid", [svc("Monthly tray service", 1, 1200), med("Cardivan 50 mg", "MED-004", 30, 4.6), med("Plavira 75 mg", "MED-011", 30, 6.4)]),
    inv(3, "PT-1003", 110, "paid", [svc("Weekly tray service", 4, 350), med("Glucora 500 mg", "MED-001", 84, 2.4)]),
    inv(4, "PT-1004", 92, "paid", [svc("Weekly tray service", 4, 350), med("Ramicor 5 mg", "MED-008", 56, 3.9)]),
    inv(5, "PT-1005", 70, "paid", [svc("Monthly tray service", 1, 1200), med("Memorin 5 mg", "MED-017", 30, 7.2)]),
    inv(6, "PT-1006", 58, "paid", [svc("Weekly tray service", 4, 350), med("Lipistar 20 mg", "MED-003", 28, 5.8)]),
    inv(7, "PT-1007", 40, "paid", [svc("Monthly tray service", 1, 1200), med("Telmicard 40 mg", "MED-027", 30, 4.1)]),
    inv(8, "PT-1009", 26, "overdue", [svc("Weekly tray service", 4, 350), med("Serenta 50 mg", "MED-016", 28, 5.5)]),
    inv(9, "PT-1010", 12, "issued", [svc("Monthly tray service", 1, 1200), med("Urotam 0.4 mg", "MED-021", 30, 6.1)]),
    inv(10, "PT-1012", 6, "paid", [med("Moxilin 500 mg", "MED-025", 15, 4.8), med("Feverol 500 mg", "MED-015", 20, 0.6)]),
    inv(11, "PT-1014", 4, "issued", [med("Airolin 100 mcg", "MED-023", 1, 165)]),
    inv(12, "PT-1001", 2, "draft", [svc("Delivery to home", 1, 80), svc("Monthly tray service", 1, 1200)]),
  ];
};

const sub = (n: number, patientId: string, plan: Subscription["plan"], status: Subscription["status"], renewIn: number, startedAgo: number): Subscription => ({
  id: `SUB-${400 + n}`, patientId, plan, status,
  price: plan === "weekly" ? 350 : 1200,
  renewalDate: addDays(today(), renewIn),
  startedOn: addDays(today(), -startedAgo),
});

export const buildSubscriptions = (): Subscription[] => [
  sub(1, "PT-1001", "monthly", "active", 11, 210),
  sub(2, "PT-1002", "monthly", "active", 4, 240),
  sub(3, "PT-1003", "weekly", "active", 3, 195),
  sub(4, "PT-1004", "weekly", "active", 2, 168),
  sub(5, "PT-1005", "monthly", "active", 19, 150),
  sub(6, "PT-1006", "weekly", "active", 5, 140),
  sub(7, "PT-1007", "monthly", "active", 24, 125),
  sub(8, "PT-1008", "weekly", "active", 6, 106),
  sub(9, "PT-1009", "weekly", "active", 1, 92),
  sub(10, "PT-1010", "monthly", "active", 8, 80),
  sub(11, "PT-1016", "monthly", "paused", 30, 4),
];
