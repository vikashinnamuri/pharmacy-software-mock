import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { addDays, DAY_NAMES, fmtDate, fmtDateTime, fmtShort, parseDate, today, weekLabel, ageFrom } from "@/lib/dates";
import { orderLabel } from "@/lib/orders";
import { qrMatrix } from "@/lib/qr";
import { enrolmentFor, invoiceTotals } from "@/lib/selectors";
import { periodName, trayPeriods, trayProgress } from "@/lib/tray-engine";
import type { AppData } from "@/types/state";
import type { BackingTemplate, DocumentType, Invoice, Medicine, Order, Patient, Period, Tray } from "@/types";
import { ALL_PERIODS } from "@/types";

export const DEMO_TEXT = "DEMO — NOT FOR CLINICAL USE";
const NAVY: [number, number, number] = [18, 38, 74];
const TEAL: [number, number, number] = [11, 124, 122];
const GREY: [number, number, number] = [86, 101, 121];
const AMBER: [number, number, number] = [122, 75, 5];
const money = (n: number) => `Rs ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const P = (p: Period) => periodName(p);

type Doc = jsPDF & { lastAutoTable?: { finalY: number } };

/** Stamps the demo notice on every page, top and across the sheet. */
function stampAll(doc: Doc, pharmacy: string, extra?: string) {
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFillColor(...AMBER);
    doc.rect(0, 0, w, w < 100 ? 5 : 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(w < 100 ? 6.5 : 9);
    doc.setTextColor(255, 255, 255);
    doc.text(DEMO_TEXT, w / 2, w < 100 ? 3.6 : 4.9, { align: "center" });

    doc.saveGraphicsState();
    doc.setGState(doc.GState({ opacity: 0.07 }));
    doc.setFontSize(Math.min(w, h) > 150 ? 34 : 13);
    doc.setTextColor(...AMBER);
    doc.text(DEMO_TEXT, w / 2, h / 2, { align: "center", angle: 28 });
    doc.restoreGraphicsState();

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY);
    if (w < 150) {
      doc.setFontSize(5.5);
      doc.text(`Fictional data. ${extra ?? ""}`, 3, h - 2);
      doc.text(`${p} of ${pages}`, w - 3, h - 2, { align: "right" });
    } else {
      doc.text(`${pharmacy}. Sample document with fictional data. ${DEMO_TEXT}.${extra ? ` ${extra}` : ""}`, 10, h - 4);
      doc.text(`Page ${p} of ${pages}`, w - 10, h - 4, { align: "right" });
    }
  }
}

function header(doc: Doc, data: AppData, title: string, subtitle?: string, left = 10, top = 16) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text(title, left, top);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...GREY);
    doc.text(subtitle, left, top + 5.5);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...TEAL);
  doc.text(data.settings.pharmacyName, w - left, top - 2, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text(data.settings.addressLine, w - left, top + 2, { align: "right" });
  doc.text(data.settings.phone, w - left, top + 6, { align: "right" });
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.5);
  doc.line(left, top + 9, w - left, top + 9);
  return top + 12;
}

function patientBlock(doc: Doc, p: Patient, y: number, left = 10) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(238, 241, 244);
  doc.roundedRect(left, y, w - left * 2, 15, 2, 2, "F");
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(p.name, left + 3, y + 5.8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GREY);
  doc.text(`${p.id}.  Born ${fmtDate(p.dob)} (${ageFrom(p.dob)} years).  ${p.doctor.name}, ${p.doctor.clinic}`, left + 3, y + 11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(166, 30, 23);
  doc.text(`Allergies: ${p.allergies.join(", ") || "None recorded"}`, w - left - 3, y + 5.8, { align: "right" });
  return y + 19;
}

/** Draws a QR code. The value must be a non-sensitive identifier. */
function drawQr(doc: Doc, value: string, x: number, y: number, size: number) {
  const m = qrMatrix(value);
  const cell = size / m.size;
  doc.setFillColor(255, 255, 255);
  doc.rect(x - 1, y - 1, size + 2, size + 2, "F");
  doc.setFillColor(...NAVY);
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.dark(r, c)) doc.rect(x + c * cell, y + r * cell, cell + 0.02, cell + 0.02, "F");
}

const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function drawPill(doc: Doc, m: Medicine, x: number, y: number, s: number) {
  const { shape, color, color2 } = m.pill;
  doc.setDrawColor(120, 130, 145);
  doc.setLineWidth(0.2);
  doc.setFillColor(...hexRgb(color));
  const cx = x + s / 2, cy = y + s / 2;
  if (shape === "round") doc.circle(cx, cy, s * 0.4, "FD");
  else if (shape === "oval" || shape === "softgel") doc.ellipse(cx, cy, s * 0.47, s * 0.28, "FD");
  else if (shape === "caplet") doc.roundedRect(x, cy - s * 0.24, s, s * 0.48, s * 0.24, s * 0.24, "FD");
  else if (shape === "capsule") {
    doc.roundedRect(x, cy - s * 0.24, s, s * 0.48, s * 0.24, s * 0.24, "FD");
    doc.setFillColor(...hexRgb(color2 ?? "#FFFFFF"));
    doc.rect(cx, cy - s * 0.24 + 0.1, s * 0.25, s * 0.48 - 0.2, "F");
    doc.roundedRect(cx, cy - s * 0.24, s * 0.5, s * 0.48, s * 0.24, s * 0.24, "F");
    doc.setDrawColor(120, 130, 145);
    doc.line(cx, cy - s * 0.24, cx, cy + s * 0.24);
    doc.roundedRect(x, cy - s * 0.24, s, s * 0.48, s * 0.24, s * 0.24, "S");
  } else doc.roundedRect(x + s * 0.2, y, s * 0.6, s, 0.8, 0.8, "FD");
}

export interface DocCtx { data: AppData; patient: Patient; tray?: Tray; invoice?: Invoice; template?: BackingTemplate; version?: number }

const medOf = (d: AppData, id: string) => d.medicines.find((m) => m.id === id);
const batchNo = (d: AppData, id: string | null) => d.batches.find((b) => b.id === id)?.batchNumber ?? "Not allocated";
const batchExp = (d: AppData, id: string | null) => { const b = d.batches.find((x) => x.id === id); return b ? fmtDate(b.expiryDate) : ""; };
const lineOf = (d: AppData, rxId: string, lineId: string) => d.prescriptions.find((p) => p.id === rxId)?.lines.find((l) => l.id === lineId);

const trayMedicines = (tray: Tray) => {
  const map = new Map<string, { medicineId: string; strength: string; prescriptionId: string; lineId: string; batches: Set<string | null>; qty: number; slots: Set<Period> }>();
  tray.compartments.forEach((c) => c.items.forEach((i) => {
    const r = map.get(i.lineId) ?? { medicineId: i.medicineId, strength: i.strength, prescriptionId: i.prescriptionId, lineId: i.lineId, batches: new Set(), qty: 0, slots: new Set() };
    r.qty += i.qty; r.batches.add(i.batchId); r.slots.add(c.period);
    map.set(i.lineId, r);
  }));
  return [...map.values()];
};
const slotText = (slots: Set<Period>) => ALL_PERIODS.filter((p) => slots.has(p)).map(P).join(", ");
const rowsOf = (tray: Tray) => ALL_PERIODS.filter((p) => tray.compartments.some((c) => c.period === p));

function dispensingLabel({ data, patient, tray }: DocCtx): Doc {
  const doc = new jsPDF({ unit: "mm", format: [100, 70], orientation: "landscape" }) as Doc;
  const rows = tray ? trayMedicines(tray) : [];
  const labels = rows.length ? rows : [null];
  labels.forEach((r, n) => {
    if (n) doc.addPage([100, 70], "landscape");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...TEAL);
    doc.text(data.settings.pharmacyName, 5, 12);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...GREY);
    doc.text(`${data.settings.addressLine}. ${data.settings.phone}`, 5, 15.5);
    doc.setDrawColor(...TEAL); doc.line(5, 17, 95, 17);
    const med = r ? medOf(data, r.medicineId) : undefined;
    doc.setTextColor(...NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text(med ? `${med.brand} ${r!.strength}` : "No tray medicine selected", 5, 23.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...GREY);
    if (med) doc.text(`${med.generic}, ${med.form.toLowerCase()}`, 5, 27.5);
    const line = r ? lineOf(data, r.prescriptionId, r.lineId) : undefined;
    doc.setTextColor(...NAVY); doc.setFontSize(10);
    if (line) doc.text(doc.splitTextToSize(`Take ${line.dosage}: ${line.times.map((t) => P(t).toLowerCase()).join(", ")}. ${line.instructions}`, 90), 5, 33.5);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(patient.name, 5, 47);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GREY);
    doc.text(`${patient.id}. Printed ${fmtDate(today())}.`, 5, 51);
    if (r) {
      doc.text(`Qty ${r.qty} in ${tray?.id}. Batch ${[...r.batches].map((b) => batchNo(data, b)).join(", ")}.`, 5, 55);
      doc.text(`Expiry ${[...r.batches].map((b) => batchExp(data, b)).join(", ")}. From ${r.prescriptionId}.`, 5, 59);
    }
  });
  return doc;
}

/**
 * Dossett backing sheet. Laid out to a configurable template so it can be
 * aligned to the physical tray later. Not a retail receipt.
 */
function backingSheet({ data, patient, tray, template, version }: DocCtx): Doc {
  const t = template ?? data.settings.backingTemplates.find((x) => x.id === data.settings.defaultTemplateId) ?? data.settings.backingTemplates[0];
  const landscape = t.widthMm >= t.heightMm;
  const doc = new jsPDF({ unit: "mm", format: [Math.min(t.widthMm, t.heightMm), Math.max(t.widthMm, t.heightMm)], orientation: landscape ? "landscape" : "portrait" }) as Doc;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const L = t.marginLeft, R = t.marginRight;
  const scale = Math.max(0.75, Math.min(1.5, W / 297));
  const ref = tray ? `${tray.cycleId ? `${tray.cycleId}-W${tray.cycleWeek}` : "SINGLE"}-${tray.id}` : "NO-TRAY";
  let y = header(doc, data, "MDS Dossett Backing Sheet", tray ? `Week commencing ${fmtDate(tray.weekStart)} (${weekLabel(tray.weekStart)}). Cycle reference ${ref}` : "No tray selected", L, t.marginTop + 8);
  y = patientBlock(doc, patient, y, L);
  if (!tray) return doc;

  if (t.showQr) {
    const qs = 18 * scale;
    drawQr(doc, ref, W - R - qs, t.marginTop + 1, qs * 0.85);
  }

  const rows = rowsOf(tray);
  const enrol = enrolmentFor(data, patient.id);
  const head = [["", ...DAY_NAMES.map((d, i) => `${d} ${fmtShort(addDays(tray.weekStart, i))}`)]];
  const body = rows.map((p) => [
    `${P(p)}${enrol?.periodTimes[p] ? `\n${enrol.periodTimes[p]}` : ""}`,
    ...DAY_NAMES.map((_, day) => {
      const c = tray.compartments.find((x) => x.day === day && x.period === p);
      return c?.items.map((i) => `${medOf(data, i.medicineId)?.brand} ${i.strength} x${i.qty}`).join("\n") || "";
    }),
  ]);
  const gridBottom = H - t.marginBottom - 52 * Math.min(1, scale);
  const cellH = Math.max(8, Math.min(22 * scale, (gridBottom - y - 8) / Math.max(1, rows.length)));
  autoTable(doc, {
    startY: y, head, body, theme: "grid", margin: { left: L, right: R },
    styles: { fontSize: 7.2 * scale, cellPadding: 1.3, minCellHeight: cellH, lineColor: [198, 209, 217], textColor: NAVY, valign: "top" },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", halign: "center", minCellHeight: 6 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 24 * scale, fillColor: [238, 241, 244] } },
    didParseCell: (h) => { if (h.section === "body" && h.column.index === 0 && String(h.cell.raw).startsWith("Before")) h.cell.styles.fillColor = [224, 242, 241]; },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 3;

  autoTable(doc, {
    startY: y, theme: "striped", margin: { left: L, right: R },
    head: [["Medicine and strength", "Identification", "Product code", "Times", "Units", "Batch", "Expiry", "Instructions"]],
    body: trayMedicines(tray).map((r) => {
      const m = medOf(data, r.medicineId);
      const line = lineOf(data, r.prescriptionId, r.lineId);
      return [
        `${m?.brand} ${r.strength}\n${m?.generic}`,
        t.showIdentification && m ? `${m.form}, ${m.formulation}. ${m.pill.shape}, colour ${m.pill.color}` : m?.form ?? "",
        m?.productCode ?? "", slotText(r.slots), String(r.qty),
        [...r.batches].map((b) => batchNo(data, b)).join(", "), [...r.batches].map((b) => batchExp(data, b)).join(", "),
        [line?.instructions, line?.mealRelation === "before-food" ? "Before food" : line?.mealRelation === "with-food" ? "With food" : line?.mealRelation === "after-food" ? "After food" : ""].filter(Boolean).join(". "),
      ];
    }),
    styles: { fontSize: 6.8 * scale, cellPadding: 1, textColor: NAVY },
    headStyles: { fillColor: TEAL, textColor: 255, fontStyle: "bold" },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 3;

  const prog = trayProgress(tray);
  const preparers = [...new Set(tray.compartments.filter((c) => c.preparedBy).map((c) => c.preparedBy))];
  const lastPrep = tray.compartments.filter((c) => c.preparedAt).map((c) => c.preparedAt!).sort().at(-1);
  const approved = [...tray.events].reverse().find((e) => e.type === "approved");
  const valid = ["approved", "ready", "supplied"].includes(tray.status);
  const boxW = (W - L - R - 4) / 2;
  const boxY = Math.min(y, H - t.marginBottom - 22);
  doc.setDrawColor(198, 209, 217);
  doc.roundedRect(L, boxY, boxW, 16, 1.5, 1.5, "S");
  doc.roundedRect(L + boxW + 4, boxY, boxW, 16, 1.5, 1.5, "S");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...TEAL);
  doc.text("Preparation record", L + 2, boxY + 4.5);
  doc.text("Pharmacist verification record (simulated)", L + boxW + 6, boxY + 4.5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...NAVY);
  doc.text(doc.splitTextToSize(`${prog.prepared} of ${prog.total} compartments prepared${preparers.length ? ` by ${preparers.join(", ")}` : ""}${lastPrep ? `, last ${fmtDateTime(lastPrep)}` : ""}.`, boxW - 4), L + 2, boxY + 9);
  doc.setTextColor(...(valid ? NAVY : AMBER));
  doc.text(doc.splitTextToSize(valid && approved ? `Approved by ${approved.by}, ${fmtDateTime(approved.at)}.${approved.note ? ` ${approved.note}` : ""}` : `Not verified. Status: ${tray.status.replace(/-/g, " ")}. Do not supply.`, boxW - 4), L + boxW + 6, boxY + 9);
  doc.setFontSize(6.8); doc.setTextColor(...GREY);
  const kept = tray.flags.length ? `Kept outside this tray: ${tray.flags.map((f) => medOf(data, f.medicineId)?.brand).join(", ")}. ` : "";
  doc.text(`${kept}Template: ${t.name}, ${t.widthMm} x ${t.heightMm} mm. Version ${version ?? 1}. Alignment to the physical tray and printer is not validated.`, L, Math.min(boxY + 20, H - t.marginBottom - 1));
  return doc;
}

function identificationSheet({ data, patient, tray }: DocCtx): Doc {
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as Doc;
  let y = header(doc, data, "Medication Identification Sheet", tray ? `${tray.id}. Week ${weekLabel(tray.weekStart)}` : "Active medicines");
  y = patientBlock(doc, patient, y);
  const rows = tray
    ? trayMedicines(tray).map((r) => ({ medicineId: r.medicineId, strength: r.strength, times: slotText(r.slots), note: lineOf(data, r.prescriptionId, r.lineId)?.instructions ?? "" }))
    : data.prescriptions.filter((p) => p.patientId === patient.id && p.status === "verified").flatMap((p) => p.lines.map((l) => ({ medicineId: l.medicineId, strength: l.strength, times: l.times.map(P).join(", ") || "Not in tray", note: l.instructions })));
  rows.forEach((r) => {
    const m = medOf(data, r.medicineId);
    if (!m) return;
    if (y > 265) { doc.addPage(); y = 14; }
    doc.setDrawColor(223, 229, 234);
    doc.setFillColor(248, 250, 251);
    doc.roundedRect(10, y, 190, 22, 2, 2, "FD");
    drawPill(doc, m, 15, y + 4, 14);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...NAVY);
    doc.text(`${m.brand} ${r.strength}`, 35, y + 7);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GREY);
    doc.text(`${m.generic}, ${m.form.toLowerCase()}, ${m.formulation.toLowerCase()}. ${m.manufacturer}. Code ${m.productCode}.`, 35, y + 12);
    doc.text(`Appearance (illustrative): ${m.pill.shape}. Taken: ${r.times}.${r.note ? ` ${r.note}.` : ""}`, 35, y + 17);
    y += 25;
  });
  doc.setFontSize(8); doc.setTextColor(...GREY);
  doc.text("Illustrations are synthetic placeholders and do not show real products.", 10, Math.min(y + 4, 284));
  return doc;
}

const verifiedLines = (data: AppData, patientId: string) =>
  data.prescriptions.filter((p) => p.patientId === patientId && p.status === "verified").flatMap((p) => p.lines.map((l) => ({ rx: p, l })));

function marChart(ctx: DocCtx, days: string[], title: string, subtitle: string, blankMeds = false): Doc {
  const { data, patient, tray } = ctx;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" }) as Doc;
  let y = header(doc, data, title, subtitle);
  y = patientBlock(doc, patient, y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...AMBER);
  doc.text("Blank sample chart. No dose on this chart has been administered or recorded.", 10, y);

  const rows = blankMeds ? [] : (tray ? trayMedicines(tray).map((r) => ({ medicineId: r.medicineId, strength: r.strength, times: ALL_PERIODS.filter((p) => r.slots.has(p)) }))
    : verifiedLines(data, patient.id).filter(({ l }) => l.times.length).map(({ l }) => ({ medicineId: l.medicineId, strength: l.strength, times: l.times })));
  const body = rows.flatMap((r) => {
    const m = medOf(data, r.medicineId);
    return r.times.map((t, i) => [i === 0 ? `${m?.brand} ${r.strength}\n${m?.generic}` : "", P(t), ...days.map(() => "")]);
  });
  const blankRows = Array.from({ length: blankMeds ? 10 : 0 }, () => ["", "", ...days.map(() => "")]);
  const dense = days.length > 10;
  autoTable(doc, {
    startY: y + 3, theme: "grid", margin: { left: 10, right: 10 },
    head: [["Medicine", "Time", ...days]],
    body: blankMeds ? blankRows : body.length ? body : [["No scheduled medicines", "", ...days.map(() => "")]],
    styles: { fontSize: dense ? 6.5 : 8, cellPadding: dense ? 1 : 1.6, minCellHeight: dense ? 7 : 9, lineColor: [198, 209, 217], textColor: NAVY },
    headStyles: { fillColor: NAVY, textColor: 255, halign: "center", minCellHeight: 6 },
    columnStyles: { 0: { cellWidth: dense ? 34 : 50, fontStyle: "bold" }, 1: { cellWidth: dense ? 18 : 26 } },
  });
  const fy = doc.lastAutoTable?.finalY ?? y + 20;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GREY);
  doc.text("Key for carers to complete by hand if this were a live chart:  I = initials   R = refused   H = held   O = other, see notes", 10, Math.min(fy + 5, 200));
  return doc;
}

const weekDays = (start: string) => DAY_NAMES.map((d, i) => `${d} ${fmtShort(addDays(start, i))}`);
function monthDays(anchorIso: string) {
  const anchor = parseDate(anchorIso);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  return { days: Array.from({ length: last }, (_, i) => String(i + 1)), label: anchor.toLocaleDateString("en-IN", { month: "long", year: "numeric" }), anchor };
}

/** A schedule chart: when each medicine is due. It is not an administration record. */
function medicationChart(ctx: DocCtx, monthly: boolean): Doc {
  const { data, patient, tray } = ctx;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" }) as Doc;
  const start = tray?.weekStart ?? today();
  const m = monthDays(start);
  let y = header(doc, data, monthly ? "Monthly Medication Chart" : "Weekly Medication Chart", monthly ? `${m.label}. When each medicine is due` : `Week ${weekLabel(start)}. When each medicine is due`);
  y = patientBlock(doc, patient, y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...AMBER);
  doc.text("A dot shows a scheduled dose from verified prescriptions. It does not mean a dose was given.", 10, y);
  const lines = verifiedLines(data, patient.id).filter(({ l }) => l.times.length && l.unitsPerDose);
  const dates = monthly ? m.days.map((d) => addDays(`${m.anchor.getFullYear()}-${String(m.anchor.getMonth() + 1).padStart(2, "0")}-01`, Number(d) - 1)) : DAY_NAMES.map((_, i) => addDays(start, i));
  const body = lines.flatMap(({ l }) => {
    const med = medOf(data, l.medicineId);
    return l.times.map((t, i) => [
      i === 0 ? `${med?.brand} ${l.strength} x${l.unitsPerDose}` : "", P(t),
      ...dates.map((d) => {
        const dow = (parseDate(d).getDay() + 6) % 7;
        const due = d >= l.startDate && d <= l.endDate && (!l.days?.length || l.days.includes(dow));
        return due ? "•" : "";
      }),
    ]);
  });
  autoTable(doc, {
    startY: y + 3, theme: "grid", margin: { left: 10, right: 10 },
    head: [["Medicine", "Time", ...(monthly ? m.days : weekDays(start))]],
    body: body.length ? body : [["No scheduled medicines", "", ...dates.map(() => "")]],
    styles: { fontSize: monthly ? 6.3 : 8, cellPadding: monthly ? 0.8 : 1.6, halign: "center", textColor: NAVY, lineColor: [198, 209, 217] },
    headStyles: { fillColor: TEAL, textColor: 255 },
    columnStyles: { 0: { halign: "left", cellWidth: monthly ? 36 : 54, fontStyle: "bold" }, 1: { halign: "left", cellWidth: monthly ? 20 : 30 } },
  });
  return doc;
}

function table(doc: Doc, y: number, title: string, head: string[], rows: string[][]) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...TEAL);
  doc.text(title, 10, y + 5);
  autoTable(doc, {
    startY: y + 7, theme: "striped", margin: { left: 10, right: 10 }, head: [head],
    body: rows.length ? rows : [head.map((_, i) => (i === 0 ? "None recorded" : ""))],
    styles: { fontSize: 8, cellPadding: 1.6, textColor: NAVY }, headStyles: { fillColor: NAVY, textColor: 255 },
  });
  return (doc.lastAutoTable?.finalY ?? y) + 3;
}

const lineText = (l: { dosage: string; times: Period[]; days?: number[]; instructions: string }) =>
  `${l.dosage}${l.times.length ? `, ${l.times.map((t) => P(t).toLowerCase()).join(", ")}` : ""}${l.days?.length && l.days.length < 7 ? ` on ${l.days.map((d) => DAY_NAMES[d]).join(", ")}` : ""}${l.instructions ? `. ${l.instructions}` : ""}`;

function currentMeds({ data, patient }: DocCtx): Doc {
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as Doc;
  let y = header(doc, data, "Current Medication List", `Authorised (verified) medicines on ${fmtDate(today())}`);
  y = patientBlock(doc, patient, y);
  y = table(doc, y, "Authorised medicines", ["Medicine", "Generic", "Dose and timing", "Tray", "Prescription"], verifiedLines(data, patient.id).map(({ rx, l }) => {
    const m = medOf(data, l.medicineId);
    return [`${m?.brand} ${l.strength}`, m?.generic ?? "", lineText(l), l.trayDecision === "include" ? "In tray" : "Original pack", `${rx.id} v${rx.version}`];
  }));
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...GREY);
  doc.text(doc.splitTextToSize(`Reported at registration (not authorised): ${patient.reportedMedication}`, 190), 10, y + 4);
  return doc;
}

function medHistory({ data, patient }: DocCtx): Doc {
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as Doc;
  let y = header(doc, data, "Historical Medication Record", `Every prescription version for this patient. Printed ${fmtDate(today())}`);
  y = patientBlock(doc, patient, y);
  const rx = data.prescriptions.filter((p) => p.patientId === patient.id).sort((a, b) => b.issuedOn.localeCompare(a.issuedOn));
  y = table(doc, y, "Prescription versions", ["Prescription", "Version", "Issued", "Status", "Medicines", "Links"], rx.map((p) => [
    p.id, String(p.version), fmtDate(p.issuedOn), p.status,
    p.lines.map((l) => `${medOf(data, l.medicineId)?.brand} ${l.strength}: ${lineText(l)}`).join("\n"),
    [p.supersedes && `Amends ${p.supersedes}`, p.supersededBy && `Replaced by ${p.supersededBy}`].filter(Boolean).join(". "),
  ]));
  table(doc, y, "Change history", ["When", "Prescription", "Action", "By"], rx.flatMap((p) => p.history.map((h) => [fmtDateTime(h.at), p.id, `${h.action}${h.note ? `. ${h.note}` : ""}`, h.by])).sort((a, b) => b[0].localeCompare(a[0])));
  return doc;
}

function cycleReport({ data, patient, tray }: DocCtx): Doc {
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as Doc;
  const cycle = data.cycles.find((c) => c.id === tray?.cycleId) ?? data.cycles.filter((c) => c.patientId === patient.id).sort((a, b) => b.startWeek.localeCompare(a.startWeek))[0];
  let y = header(doc, data, "MDS Cycle Report", cycle ? `${cycle.id}. Four weeks from ${fmtDate(cycle.startWeek)}` : "No four-week cycle for this patient");
  y = patientBlock(doc, patient, y);
  if (!cycle) return doc;
  const trays = cycle.trayIds.map((id) => data.trays.find((t) => t.id === id)).filter(Boolean) as Tray[];
  y = table(doc, y, "Weekly cycles", ["Week", "Tray", "Dates", "Status", "Prepared", "Verified by", "Revisions"], trays.map((t) => {
    const p = trayProgress(t);
    const ap = [...t.events].reverse().find((e) => e.type === "approved");
    return [String(t.cycleWeek), t.id, weekLabel(t.weekStart), t.status.replace(/-/g, " "), `${p.prepared} of ${p.total}`, ap ? `${ap.by}, ${fmtDateTime(ap.at)}` : "Not verified", String(t.revisions.length)];
  }));
  y = table(doc, y, "Estimated medication requirements", ["Medicine", ...trays.map((t) => `Week ${t.cycleWeek}`), "Total"], (() => {
    const meds = [...new Set(trays.flatMap((t) => t.compartments.flatMap((c) => c.items.map((i) => i.medicineId))))];
    return meds.map((id) => {
      const per = trays.map((t) => t.compartments.reduce((n, c) => n + c.items.filter((i) => i.medicineId === id).reduce((a, i) => a + i.qty, 0), 0));
      return [`${medOf(data, id)?.brand} ${medOf(data, id)?.strength}`, ...per.map(String), String(per.reduce((a, b) => a + b, 0))];
    });
  })());
  table(doc, y, "Activity", ["When", "Tray", "Event", "By"], trays.flatMap((t) => t.events.map((e) => [fmtDateTime(e.at), t.id, `${e.type.replace(/-/g, " ")}${e.note ? `. ${e.note}` : ""}`, e.by])).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 40));
  return doc;
}

const orderMeds = (data: AppData, o: Order) => o.lines.map((l) => `${medOf(data, l.medicineId)?.brand} ${l.strength} x${l.qty}`).join(", ");

function dispensingHistory({ data, patient }: DocCtx): Doc {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" }) as Doc;
  let y = header(doc, data, "Dispensing History", `Standard dispensing orders. Printed ${fmtDate(today())}`);
  y = patientBlock(doc, patient, y);
  const orders = data.orders.filter((o) => o.patientId === patient.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  table(doc, y, "Orders", ["Order", "Token", "Created", "Prescription", "Medicines", "Status", "Verified by", "Completed"], orders.map((o) => [
    o.id, o.token, fmtDateTime(o.createdAt), o.prescriptionId ?? "Medication request", orderMeds(data, o), orderLabel(o), o.verification.by ?? "", o.completedAt ? fmtDateTime(o.completedAt) : "",
  ]));
  return doc;
}

function fulfilmentHistory({ data, patient }: DocCtx): Doc {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" }) as Doc;
  let y = header(doc, data, "Collection and Delivery History", `Printed ${fmtDate(today())}`);
  y = patientBlock(doc, patient, y);
  const coll = [
    ...data.orders.filter((o) => o.patientId === patient.id && o.status === "collected").map((o) => [fmtDateTime(o.completedAt), o.id, `Token ${o.token}`, orderMeds(data, o), o.collectedBy ?? ""]),
    ...data.trays.filter((t) => t.patientId === patient.id && t.status === "supplied" && t.fulfilment?.method !== "delivery").map((t) => [fmtDateTime(t.suppliedAt), t.id, `Week ${weekLabel(t.weekStart)}`, "Weekly MDS tray", t.fulfilment?.collectedBy ?? ""]),
  ].sort((a, b) => b[0].localeCompare(a[0]));
  y = table(doc, y, "Collections", ["When", "Reference", "Detail", "Items", "Collected by"], coll);
  table(doc, y, "Deliveries", ["Delivery", "Reference", "Address", "Assigned", "Status", "Received by", "Delivered"], data.deliveries.filter((d) => d.patientId === patient.id).map((d) => [
    d.id, d.refId, d.address, d.assignedTo ?? "", d.status, d.receivedBy ?? "", d.deliveredAt ? fmtDateTime(d.deliveredAt) : "",
  ]));
  return doc;
}

function patientSummary({ data, patient }: DocCtx): Doc {
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as Doc;
  let y = header(doc, data, "Patient Medication Summary", `Printed ${fmtDate(today())}`);
  y = patientBlock(doc, patient, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...NAVY);
  doc.text(`Conditions: ${patient.conditions.join(", ") || "None recorded"}`, 10, y); y += 4.5;
  doc.text(`Phone: ${patient.phone}.  Emergency contact: ${patient.emergencyContact.name} (${patient.emergencyContact.relation ?? "contact"}), ${patient.emergencyContact.phone}`, 10, y); y += 4;
  const rx = data.prescriptions.filter((p) => p.patientId === patient.id);
  const lines = (status: string) => rx.filter((p) => p.status === status).flatMap((p) => p.lines.map((l) => {
    const m = medOf(data, l.medicineId);
    return [`${m?.brand} ${l.strength}`, m?.generic ?? "", lineText(l), l.trayDecision === "include" ? "In tray" : "Not in tray", p.id];
  }));
  const cols = ["Medicine", "Generic", "Dose and times", "Tray", "Prescription"];
  y = table(doc, y, "Active medicines (verified)", cols, lines("verified"));
  y = table(doc, y, "Waiting for review (not active)", cols, lines("pending"));
  y = table(doc, y, "Discontinued", cols, lines("discontinued"));
  const trays = data.trays.filter((t) => t.patientId === patient.id).sort((a, b) => b.weekStart.localeCompare(a.weekStart)).slice(0, 8);
  table(doc, y, "Recent weekly trays", ["Tray", "Week", "Status", "Completed"], trays.map((t) => [t.id, weekLabel(t.weekStart), t.status.replace(/-/g, " "), t.suppliedAt ? fmtDateTime(t.suppliedAt) : ""]));
  return doc;
}

/** Wallet-size card with the patient ID and a QR code holding only the demo identifier. */
export function patientCardPdf(data: AppData, patient: Patient): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: [54, 85.6], orientation: "landscape" }) as Doc;
  doc.setFillColor(...NAVY);
  doc.rect(0, 5, 85.6, 10, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
  doc.text(data.settings.pharmacyName, 4, 11.5);
  doc.setFontSize(5.5); doc.setFont("helvetica", "normal");
  doc.text("Patient card", 81.6, 11.5, { align: "right" });
  doc.setTextColor(...NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(doc.splitTextToSize(patient.name, 48), 4, 21);
  doc.setFontSize(8); doc.setTextColor(...TEAL);
  doc.text(`Patient ID  ${patient.id}`, 4, 30);
  doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(...GREY);
  doc.text(`Card code ${patient.qrToken}`, 4, 34.5);
  doc.text(`Registered ${fmtDate(patient.registeredOn)}`, 4, 38);
  doc.text(data.settings.phone, 4, 41.5);
  doc.text("The QR code holds only the card code.", 4, 46);
  drawQr(doc, patient.qrToken, 57, 19, 24);
  stampAll(doc, data.settings.pharmacyName);
  return doc;
}

/** Queue token slip. Shows the token and order number only, no medicine names. */
export function tokenPdf(data: AppData, token: string, ref: string, estimatedReady?: string, kind = "Dispensing order"): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: [80, 100] }) as Doc;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...TEAL);
  doc.text(data.settings.pharmacyName, 40, 14, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...GREY);
  doc.text(kind, 40, 19, { align: "center" });
  doc.setDrawColor(...TEAL); doc.line(8, 22, 72, 22);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...NAVY);
  doc.text("Your token", 40, 31, { align: "center" });
  doc.setFontSize(34);
  doc.text(token, 40, 47, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GREY);
  doc.text(`Reference ${ref}`, 40, 56, { align: "center" });
  doc.text(`Issued ${fmtDateTime(new Date().toISOString())}`, 40, 61, { align: "center" });
  if (estimatedReady) doc.text(`Estimated ready ${fmtDateTime(estimatedReady)}`, 40, 66, { align: "center" });
  doc.setFontSize(7);
  doc.text(doc.splitTextToSize("Watch the collection screen for your token. Staff will confirm your identity at collection.", 60), 40, 74, { align: "center" });
  drawQr(doc, ref, 32, 81, 14);
  stampAll(doc, data.settings.pharmacyName);
  return doc;
}

export function invoicePdf(data: AppData, invoice: Invoice): jsPDF {
  const patient = data.patients.find((p) => p.id === invoice.patientId)!;
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as Doc;
  let y = header(doc, data, "Sample Invoice", `${invoice.id}. Not a tax invoice. Simulated only.`);
  y = patientBlock(doc, patient, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...NAVY);
  doc.text(`Issued ${fmtDate(invoice.issuedOn)}.  Due ${fmtDate(invoice.dueOn)}.  Status: ${invoice.status}.  GST field (placeholder): ${data.settings.gstPlaceholder}`, 10, y);
  if (invoice.orderId || invoice.trayId) doc.text(`Reference: ${[invoice.orderId, invoice.trayId, invoice.cycleId].filter(Boolean).join(", ")}`, 10, y + 4.5);
  y += 6;
  if (invoice.ownMedicinesDeclared) {
    doc.setFontSize(8); doc.setTextColor(...AMBER);
    doc.text(doc.splitTextToSize("Patient declared their medicines were already lawfully obtained. This invoice covers the medication-management service only. This is an accounting record. It does not replace pharmacist checks or authorise repackaging.", 190), 10, y + 2);
    y += 9;
  }
  const section = (title: string, kind: "product" | "service") => {
    const lines = invoice.lines.filter((l) => l.kind === kind);
    if (!lines.length) return;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...TEAL);
    doc.text(title, 10, y + 5);
    autoTable(doc, {
      startY: y + 7, theme: "striped", margin: { left: 10, right: 10 },
      head: [["Description", "Qty", "Unit price", "Discount", "GST %", "CGST", "SGST", "Line total"]],
      body: lines.map((l) => {
        const net = l.qty * l.unitPrice - (l.discount ?? 0); const gst = (net * l.gstRate) / 100;
        return [l.description, String(l.qty), money(l.unitPrice), money(l.discount ?? 0), `${l.gstRate}%`, money(gst / 2), money(gst / 2), money(net + gst)];
      }),
      styles: { fontSize: 8.5, cellPadding: 2, textColor: NAVY }, headStyles: { fillColor: NAVY, textColor: 255 },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 2;
  };
  section("A. Medicine charges", "product");
  section("B. MDS and other service charges", "service");
  const t = invoiceTotals(invoice);
  y += 5;
  doc.setFontSize(9.5); doc.setTextColor(...NAVY);
  [["Medicine charges", money(t.medicine)], ["Service charges", money(t.service)], ["Discounts", `- ${money(t.discount)}`], ["GST (sample rates)", money(t.gst)], ["Total", money(t.total)], ["Paid", money(t.paid)], ["Refunded", money(t.refunded)], ["Adjustments", money(t.adjusted)], ["Balance", money(t.balance)]].forEach(([k, v], i) => {
    doc.setFont("helvetica", i === 4 || i === 8 ? "bold" : "normal");
    doc.text(k, 150, y, { align: "right" });
    doc.text(v, 200, y, { align: "right" });
    y += 5;
  });
  if (invoice.payments?.length) {
    autoTable(doc, {
      startY: y + 2, theme: "plain", margin: { left: 10, right: 10 }, head: [["Payment history", "Type", "Method", "Amount", "By"]],
      body: invoice.payments.map((p) => [fmtDateTime(p.at), p.kind, p.method ?? "", money(p.amount), p.by]),
      styles: { fontSize: 8, textColor: NAVY }, headStyles: { textColor: TEAL },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 3;
  }
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GREY);
  doc.text("No payment has been processed. GST values are configurable samples and do not claim compliance.", 10, Math.min(y + 5, 285));
  stampAll(doc, data.settings.pharmacyName);
  return doc;
}

export interface DocumentMeta { type: DocumentType; title: string; description: string; needsTray: boolean; group: "MDS tray" | "Charts" | "Records" }

export const DOCUMENTS: DocumentMeta[] = [
  { type: "backing", title: "MDS Dossett Backing Sheet", description: "Matches the tray grid, with identification, batches, records and QR. Uses a template.", needsTray: true, group: "MDS tray" },
  { type: "label", title: "Dispensing Label", description: "One label per tray medicine, sized for a 100 by 70 mm sheet.", needsTray: true, group: "MDS tray" },
  { type: "identification", title: "Medication Identification Sheet", description: "What each medicine looks like and when it is taken.", needsTray: false, group: "MDS tray" },
  { type: "cycle-report", title: "MDS Cycle Report", description: "Four-week cycle: weekly status, requirements and activity.", needsTray: false, group: "MDS tray" },
  { type: "med-chart-weekly", title: "Weekly Medication Chart", description: "When each medicine is due this week. Not an administration record.", needsTray: false, group: "Charts" },
  { type: "med-chart-monthly", title: "Monthly Medication Chart", description: "Scheduled doses across the month from verified prescriptions.", needsTray: false, group: "Charts" },
  { type: "mar-weekly", title: "Weekly MAR Chart", description: "Blank seven-day administration chart.", needsTray: false, group: "Charts" },
  { type: "mar-monthly", title: "Monthly MAR Chart", description: "Blank full-month administration chart.", needsTray: false, group: "Charts" },
  { type: "mar-template", title: "Blank MAR Template", description: "Empty MAR with no medicines filled in.", needsTray: false, group: "Charts" },
  { type: "current-meds", title: "Current Medication List", description: "Authorised medicines only, with the patient-reported list kept apart.", needsTray: false, group: "Records" },
  { type: "med-history", title: "Historical Medication Record", description: "Every prescription version and change.", needsTray: false, group: "Records" },
  { type: "dispensing-history", title: "Dispensing History", description: "Standard dispensing orders and their outcome.", needsTray: false, group: "Records" },
  { type: "fulfilment-history", title: "Collection and Delivery History", description: "Who collected or received each order and tray.", needsTray: false, group: "Records" },
  { type: "summary", title: "Patient Medication Summary", description: "Active, pending and past medicines plus recent trays.", needsTray: false, group: "Records" },
];

export function buildDocument(type: DocumentType, ctx: DocCtx): jsPDF {
  const start = ctx.tray?.weekStart ?? today();
  const m = monthDays(start);
  const doc: Doc =
    type === "label" ? dispensingLabel(ctx)
    : type === "backing" ? backingSheet(ctx)
    : type === "identification" ? identificationSheet(ctx)
    : type === "mar-weekly" ? marChart(ctx, weekDays(start), "Weekly MAR Chart", `Week ${weekLabel(start)}${ctx.tray ? `. ${ctx.tray.id}` : ""}`)
    : type === "mar-monthly" ? marChart(ctx, m.days, "Monthly MAR Chart", m.label)
    : type === "mar-template" ? marChart(ctx, weekDays(start), "Blank MAR Template", "Medicines to be written in by the pharmacy", true)
    : type === "med-chart-weekly" ? medicationChart(ctx, false)
    : type === "med-chart-monthly" ? medicationChart(ctx, true)
    : type === "current-meds" ? currentMeds(ctx)
    : type === "med-history" ? medHistory(ctx)
    : type === "cycle-report" ? cycleReport(ctx)
    : type === "dispensing-history" ? dispensingHistory(ctx)
    : type === "fulfilment-history" ? fulfilmentHistory(ctx)
    : patientSummary(ctx);
  stampAll(doc, ctx.data.settings.pharmacyName, ctx.version && ctx.version > 1 ? `Reprint, version ${ctx.version}.` : undefined);
  return doc;
}

export { trayPeriods };
