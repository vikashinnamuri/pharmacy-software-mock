import { addDays, stamp, today } from "@/lib/dates";
import type { Batch, StockMovement } from "@/types";
import { MEDICINES } from "./medicines";

// [medicine, batch number, expiry in days from today, quantity, location, received days ago]
const ROWS: [string, string, number, number, string, number][] = [
  ["MED-001", "GLC-2411", 42, 96, "A1", 150],
  ["MED-001", "GLC-2502", 410, 620, "A1", 40],
  ["MED-002", "VSC-2503", 380, 410, "A2", 55],
  ["MED-003", "LPS-2412", 210, 260, "A3", 120],
  ["MED-003", "LPS-2506", 520, 240, "A3", 22],
  ["MED-004", "CDV-2501", 300, 330, "A4", 70],
  ["MED-005", "ECS-2406", 26, 48, "A5", 210],
  ["MED-005", "ECS-2505", 440, 120, "A5", 30],
  ["MED-006", "PNT-2502", 340, 280, "B1", 60],
  ["MED-007", "THY-2410", 58, 88, "B2", 180],
  ["MED-007", "THY-2504", 470, 240, "B2", 35],
  ["MED-008", "RMC-2503", 390, 300, "B3", 50],
  ["MED-009", "BSC-2501", 320, 260, "B4", 75],
  ["MED-010", "DCL-2412", 230, 240, "B5", 110],
  ["MED-011", "PLV-2502", 350, 210, "C1", 65],
  ["MED-012", "LSX-2401", -18, 60, "C2", 300],
  ["MED-012", "LSX-2504", 430, 180, "C2", 28],
  ["MED-013", "VLP-2502", 330, 90, "C3", 80],
  ["MED-014", "OST-2503", 400, 24, "C4", 45],
  ["MED-015", "FVR-2505", 600, 900, "C5", 15],
  ["MED-016", "SRN-2502", 345, 150, "D1", 68],
  ["MED-017", "MMR-2412", 190, 22, "D2", 130],
  ["MED-018", "SNV-2503", 370, 140, "D3", 52],
  ["MED-019", "CLW-2504", 460, 360, "D4", 33],
  ["MED-020", "OMZ-2502", 310, 130, "D5", 72],
  ["MED-021", "URT-2501", 290, 75, "E1", 90],
  ["MED-022", "CGL-2409", 45, 14, "E2", 200],
  ["MED-023", "ARL-2503", 365, 4, "E3", 48],
  ["MED-024", "LCT-2412", 150, 16, "E4", 125],
  ["MED-025", "MXL-2503", 280, 60, "E5", 58],
  ["MED-026", "RSL-2504", 450, 240, "F1", 36],
  ["MED-027", "TLM-2502", 335, 120, "F2", 66],
  ["MED-027", "TLM-2410", -4, 12, "F2", 280],
];

export const buildBatches = (): Batch[] =>
  ROWS.map(([medicineId, batchNumber, exp, available, location, rec]) => ({
    id: `BT-${batchNumber}`,
    medicineId,
    batchNumber,
    manufacturer: MEDICINES.find((m) => m.id === medicineId)!.manufacturer,
    expiryDate: addDays(today(), exp),
    available,
    location,
    receivedOn: addDays(today(), -rec),
  }));

/** Stock history. Received rows for each batch plus six months of dispensing. */
export const buildMovements = (): StockMovement[] => {
  const out: StockMovement[] = [];
  let n = 0;
  ROWS.forEach(([medicineId, batchNumber, , available, , rec]) => {
    out.push({
      id: `MV-${++n}`, at: stamp(rec, 9, 30), batchId: `BT-${batchNumber}`, medicineId,
      type: "received", qty: available + Math.max(0, Math.round(available * 0.4)),
      reference: "Opening stock (demo)", by: "Meena K. (demo)",
    });
  });
  const monthly = [418, 472, 505, 548, 590, 612];
  monthly.forEach((total, i) => {
    const daysAgo = (5 - i) * 30 + 8;
    const shares = [0.34, 0.26, 0.22, 0.18];
    const meds = ["BT-GLC-2502", "BT-VSC-2503", "BT-LPS-2412", "BT-CDV-2501"];
    meds.forEach((batchId, j) => {
      out.push({
        id: `MV-${++n}`, at: stamp(daysAgo, 15, 10 + j), batchId,
        medicineId: ROWS.find((r) => `BT-${r[1]}` === batchId)![0],
        type: "dispensed", qty: -Math.round(total * shares[j]),
        reference: "Monthly tray supply (demo)", by: "Divya S. (demo)",
      });
    });
  });
  out.push({ id: `MV-${++n}`, at: stamp(16, 12, 0), batchId: "BT-LSX-2401", medicineId: "MED-012", type: "adjusted", qty: -6, reference: "Count correction (demo)", by: "Meena K. (demo)" });
  return out;
};
