"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { addDays, DAY_NAMES, fmtDate, fmtDateTime, fmtShort, parseDate, today, weekLabel, ageFrom } from "@/lib/dates";
import { invoiceTotals } from "@/lib/selectors";
import type { AppData } from "@/types/state";
import type { DocumentType, Invoice, Medicine, Patient, Tray } from "@/types";
import { PERIODS } from "@/types";

export const DEMO_TEXT = "DEMO — NOT FOR CLINICAL USE";
const NAVY: [number, number, number] = [18, 38, 74];
const TEAL: [number, number, number] = [11, 124, 122];
const GREY: [number, number, number] = [86, 101, 121];
const AMBER: [number, number, number] = [122, 75, 5];
const PERIOD_LABEL = { morning: "Morning", lunchtime: "Lunchtime", evening: "Evening", bedtime: "Bedtime" } as const;
const money = (n: number) => `Rs ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Doc = jsPDF & { lastAutoTable?: { finalY: number } };

/** Stamps the demo notice on every page, top and across the sheet. */
function stampAll(doc: Doc, pharmacy: string) {
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFillColor(...AMBER);
    doc.rect(0, 0, w, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(DEMO_TEXT, w / 2, 4.9, { align: "center" });

    doc.saveGraphicsState();
    doc.setGState(doc.GState({ opacity: 0.07 }));
    doc.setFontSize(Math.min(w, h) > 150 ? 34 : 15);
    doc.setTextColor(...AMBER);
    doc.text(DEMO_TEXT, w / 2, h / 2, { align: "center", angle: 28 });
    doc.restoreGraphicsState();

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY);
    if (w < 150) {
      doc.setFontSize(6);
      doc.text("Sample label with fictional data.", 5, h - 2.5);
      doc.text(`${p} of ${pages}`, w - 5, h - 2.5, { align: "right" });
    } else {
      doc.text(`${pharmacy}. Sample document with fictional data. ${DEMO_TEXT}.`, 10, h - 4);
      doc.text(`Page ${p} of ${pages}`, w - 10, h - 4, { align: "right" });
    }
  }
}

function header(doc: Doc, data: AppData, title: string, subtitle?: string) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text(title, 10, 16);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...GREY);
    doc.text(subtitle, 10, 21.5);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...TEAL);
  doc.text(data.settings.pharmacyName, w - 10, 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text(data.settings.addressLine, w - 10, 18, { align: "right" });
  doc.text(data.settings.phone, w - 10, 22, { align: "right" });
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.5);
  doc.line(10, 25, w - 10, 25);
}

function patientBlock(doc: Doc, p: Patient, y: number) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(238, 241, 244);
  doc.roundedRect(10, y, w - 20, 15, 2, 2, "F");
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(p.name, 13, y + 5.8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GREY);
  doc.text(`${p.id}.  Born ${fmtDate(p.dob)} (${ageFrom(p.dob)} years).  ${p.doctor.name}, ${p.doctor.clinic}`, 13, y + 11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(166, 30, 23);
  doc.text(`Allergies: ${p.allergies.join(", ") || "None recorded"}`, w - 13, y + 5.8, { align: "right" });
  return y + 19;
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

interface Ctx { data: AppData; patient: Patient; tray?: Tray; invoice?: Invoice; monthAnchor?: string }

const medOf = (d: AppData, id: string) => d.medicines.find((m) => m.id === id);
const batchNo = (d: AppData, id: string | null) => d.batches.find((b) => b.id === id)?.batchNumber ?? "Not allocated";
const batchExp = (d: AppData, id: string | null) => { const b = d.batches.find((x) => x.id === id); return b ? fmtDate(b.expiryDate) : ""; };

const trayMedicines = (tray: Tray) => {
  const map = new Map<string, { medicineId: string; strength: string; prescriptionId: string; lineId: string; batches: Set<string | null>; qty: number; slots: Set<string> }>();
  tray.compartments.forEach((c) => c.items.forEach((i) => {
    const r = map.get(i.lineId) ?? { medicineId: i.medicineId, strength: i.strength, prescriptionId: i.prescriptionId, lineId: i.lineId, batches: new Set(), qty: 0, slots: new Set() };
    r.qty += i.qty; r.batches.add(i.batchId); r.slots.add(PERIOD_LABEL[c.period]);
    map.set(i.lineId, r);
  }));
  return [...map.values()];
};

function dispensingLabel({ data, patient, tray }: Ctx): Doc {
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
    const line = r ? data.prescriptions.find((p) => p.id === r.prescriptionId)?.lines.find((l) => l.id === r.lineId) : undefined;
    doc.setTextColor(...NAVY); doc.setFontSize(10);
    if (line) doc.text(doc.splitTextToSize(`Take ${line.dosage}: ${line.times.map((t) => PERIOD_LABEL[t].toLowerCase()).join(", ")}. ${line.instructions}`, 90), 5, 33.5);
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

function backingSheet({ data, patient, tray }: Ctx): Doc {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" }) as Doc;
  const title = "MDS Tray Backing Sheet";
  header(doc, data, title, tray ? `${tray.id}. Week ${weekLabel(tray.weekStart)}` : "No tray selected");
  let y = patientBlock(doc, patient, 28);
  if (!tray) return doc;
  const head = [["", ...DAY_NAMES.map((d, i) => `${d} ${fmtShort(addDays(tray.weekStart, i))}`)]];
  const body = PERIODS.map((p) => [
    PERIOD_LABEL[p],
    ...DAY_NAMES.map((_, day) => {
      const c = tray.compartments.find((x) => x.day === day && x.period === p);
      return c?.items.map((i) => `${medOf(data, i.medicineId)?.brand} ${i.strength} x${i.qty}`).join("\n") || "";
    }),
  ]);
  autoTable(doc, {
    startY: y, head, body, theme: "grid", margin: { left: 10, right: 10 },
    styles: { fontSize: 7.5, cellPadding: 1.5, minCellHeight: 17, lineColor: [198, 209, 217], textColor: NAVY },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", halign: "center", minCellHeight: 6 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 21, fillColor: [238, 241, 244] } },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 4;
  autoTable(doc, {
    startY: y, theme: "plain", margin: { left: 10, right: 10 },
    head: [["Medicine", "Generic", "Times", "Units", "Batch", "Expiry"]],
    body: trayMedicines(tray).map((r) => {
      const m = medOf(data, r.medicineId);
      return [`${m?.brand} ${r.strength}`, m?.generic ?? "", [...r.slots].join(", "), String(r.qty), [...r.batches].map((b) => batchNo(data, b)).join(", "), [...r.batches].map((b) => batchExp(data, b)).join(", ")];
    }),
    styles: { fontSize: 7.5, cellPadding: 1, textColor: NAVY },
    headStyles: { textColor: TEAL, fontStyle: "bold" },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 4;
  const approved = [...tray.events].reverse().find((e) => e.type === "approved");
  const valid = tray.status === "approved" || tray.status === "supplied";
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...(valid ? TEAL : AMBER));
  doc.text(valid && approved ? `Simulated verification: ${approved.by}, ${fmtDateTime(approved.at)}` : `Not verified. Tray status: ${tray.status.replace(/-/g, " ")}`, 10, Math.min(y, 198));
  if (tray.flags.length) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GREY);
    doc.text(`Kept outside this tray: ${tray.flags.map((f) => medOf(data, f.medicineId)?.brand).join(", ")}`, 10, Math.min(y + 4, 202));
  }
  return doc;
}

function identificationSheet({ data, patient, tray }: Ctx): Doc {
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as Doc;
  header(doc, data, "Medication Identification Sheet", tray ? `${tray.id}. Week ${weekLabel(tray.weekStart)}` : "Active medicines");
  let y = patientBlock(doc, patient, 28);
  const rows = tray
    ? trayMedicines(tray).map((r) => ({ medicineId: r.medicineId, strength: r.strength, times: [...r.slots].join(", "), note: data.prescriptions.find((p) => p.id === r.prescriptionId)?.lines.find((l) => l.id === r.lineId)?.instructions ?? "" }))
    : data.prescriptions.filter((p) => p.patientId === patient.id && p.status === "verified").flatMap((p) => p.lines.map((l) => ({ medicineId: l.medicineId, strength: l.strength, times: l.times.map((t) => PERIOD_LABEL[t]).join(", ") || "Not in tray", note: l.instructions })));
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
    doc.text(`${m.generic}, ${m.form.toLowerCase()}. ${m.manufacturer}. Pack of ${m.packSize}.`, 35, y + 12);
    doc.text(`Appearance (illustrative): ${m.pill.shape}. Taken: ${r.times}.${r.note ? ` ${r.note}.` : ""}`, 35, y + 17);
    y += 25;
  });
  doc.setFontSize(8); doc.setTextColor(...GREY);
  doc.text("Illustrations are synthetic placeholders and do not show real products.", 10, Math.min(y + 4, 284));
  return doc;
}

function marChart(ctx: Ctx, days: string[], title: string, subtitle: string): Doc {
  const { data, patient, tray } = ctx;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" }) as Doc;
  header(doc, data, title, subtitle);
  const y = patientBlock(doc, patient, 28);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...AMBER);
  doc.text("Blank sample chart. No dose on this chart has been administered or recorded.", 10, y);

  const rows = (tray ? trayMedicines(tray).map((r) => ({ medicineId: r.medicineId, strength: r.strength, lineId: r.lineId, times: [...new Set(tray.compartments.filter((c) => c.items.some((i) => i.lineId === r.lineId)).map((c) => c.period))] }))
    : data.prescriptions.filter((p) => p.patientId === patient.id && p.status === "verified").flatMap((p) => p.lines.filter((l) => l.times.length).map((l) => ({ medicineId: l.medicineId, strength: l.strength, lineId: l.id, times: l.times }))));
  const body = rows.flatMap((r) => {
    const m = medOf(data, r.medicineId);
    return r.times.map((t, i) => [i === 0 ? `${m?.brand} ${r.strength}\n${m?.generic}` : "", PERIOD_LABEL[t], ...days.map(() => "")]);
  });
  const dense = days.length > 10;
  autoTable(doc, {
    startY: y + 3, theme: "grid", margin: { left: 10, right: 10 },
    head: [["Medicine", "Time", ...days]],
    body: body.length ? body : [["No scheduled medicines", "", ...days.map(() => "")]],
    styles: { fontSize: dense ? 6.5 : 8, cellPadding: dense ? 1 : 1.6, minCellHeight: dense ? 7 : 9, lineColor: [198, 209, 217], textColor: NAVY },
    headStyles: { fillColor: NAVY, textColor: 255, halign: "center", minCellHeight: 6 },
    columnStyles: { 0: { cellWidth: dense ? 34 : 50, fontStyle: "bold" }, 1: { cellWidth: dense ? 16 : 22 } },
  });
  const fy = doc.lastAutoTable?.finalY ?? y + 20;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GREY);
  doc.text("Key for carers to complete by hand if this were a live chart:  I = initials   R = refused   H = held   O = other, see notes", 10, Math.min(fy + 5, 200));
  return doc;
}

function weeklyMar(ctx: Ctx) {
  const start = ctx.tray?.weekStart ?? today();
  return marChart(ctx, DAY_NAMES.map((d, i) => `${d} ${fmtShort(addDays(start, i))}`), "Weekly MAR Chart", `Week ${weekLabel(start)}${ctx.tray ? `. ${ctx.tray.id}` : ""}`);
}

function monthlyMar(ctx: Ctx) {
  const anchor = parseDate(ctx.tray?.weekStart ?? today());
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const label = anchor.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  return marChart(ctx, Array.from({ length: last }, (_, i) => String(i + 1)), "Monthly MAR Chart", label);
}

function patientSummary({ data, patient }: Ctx): Doc {
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as Doc;
  header(doc, data, "Patient Medication Summary", `Printed ${fmtDate(today())}`);
  let y = patientBlock(doc, patient, 28);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...NAVY);
  doc.text(`Conditions: ${patient.conditions.join(", ") || "None recorded"}`, 10, y); y += 4.5;
  doc.text(`Phone: ${patient.phone}.  Emergency contact: ${patient.emergencyContact.name} (${patient.emergencyContact.relation ?? "contact"}), ${patient.emergencyContact.phone}`, 10, y); y += 4;
  const rx = data.prescriptions.filter((p) => p.patientId === patient.id);
  const section = (title: string, rows: string[][], columns: string[]) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...TEAL);
    doc.text(title, 10, y + 5);
    autoTable(doc, {
      startY: y + 7, theme: "striped", margin: { left: 10, right: 10 }, head: [columns],
      body: rows.length ? rows : [columns.map((_, i) => (i === 0 ? "None recorded" : ""))],
      styles: { fontSize: 8, cellPadding: 1.6, textColor: NAVY }, headStyles: { fillColor: NAVY, textColor: 255 },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 3;
  };
  const lines = (status: string) => rx.filter((p) => p.status === status).flatMap((p) => p.lines.map((l) => {
    const m = medOf(data, l.medicineId);
    return [`${m?.brand} ${l.strength}`, m?.generic ?? "", `${l.dosage}${l.times.length ? `, ${l.times.map((t) => PERIOD_LABEL[t].toLowerCase()).join(", ")}` : ""}`, l.trayDecision === "include" ? "In tray" : "Not in tray", p.id];
  }));
  const cols = ["Medicine", "Generic", "Dose and times", "Tray", "Prescription"];
  section("Active medicines (verified)", lines("verified"), cols);
  section("Waiting for review (not active)", lines("pending"), cols);
  section("Discontinued", lines("discontinued"), cols);
  const trays = data.trays.filter((t) => t.patientId === patient.id).sort((a, b) => b.weekStart.localeCompare(a.weekStart)).slice(0, 8);
  section("Recent weekly trays", trays.map((t) => [t.id, weekLabel(t.weekStart), t.status.replace(/-/g, " "), t.suppliedAt ? fmtDateTime(t.suppliedAt) : ""]), ["Tray", "Week", "Status", "Supplied"]);
  return doc;
}

export function invoicePdf(data: AppData, invoice: Invoice): jsPDF {
  const patient = data.patients.find((p) => p.id === invoice.patientId)!;
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as Doc;
  header(doc, data, "Sample Invoice", `${invoice.id}. Not a tax invoice. Simulated only.`);
  let y = patientBlock(doc, patient, 28);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...NAVY);
  doc.text(`Issued ${fmtDate(invoice.issuedOn)}.  Due ${fmtDate(invoice.dueOn)}.  Status: ${invoice.status}.  GST field (placeholder): ${data.settings.gstPlaceholder}`, 10, y);
  y += 3;
  autoTable(doc, {
    startY: y, theme: "striped", margin: { left: 10, right: 10 },
    head: [["Description", "Qty", "Unit price", "GST %", "CGST", "SGST", "Line total"]],
    body: invoice.lines.map((l) => {
      const net = l.qty * l.unitPrice; const gst = (net * l.gstRate) / 100;
      return [l.description, String(l.qty), money(l.unitPrice), `${l.gstRate}%`, money(gst / 2), money(gst / 2), money(net + gst)];
    }),
    styles: { fontSize: 8.5, cellPadding: 2, textColor: NAVY }, headStyles: { fillColor: NAVY, textColor: 255 },
  });
  const t = invoiceTotals(invoice);
  y = (doc.lastAutoTable?.finalY ?? y) + 7;
  doc.setFontSize(9.5);
  [["Subtotal", money(t.subtotal)], ["GST (sample rates)", money(t.gst)], ["Total", money(t.total)]].forEach(([k, v], i) => {
    doc.setFont("helvetica", i === 2 ? "bold" : "normal");
    doc.text(k, 150, y, { align: "right" });
    doc.text(v, 200, y, { align: "right" });
    y += 5.5;
  });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GREY);
  doc.text("No payment has been processed. GST values are configurable samples and do not claim compliance.", 10, y + 5);
  stampAll(doc, data.settings.pharmacyName);
  return doc;
}

export const DOCUMENTS: { type: DocumentType; title: string; description: string; needsTray: boolean }[] = [
  { type: "label", title: "Dispensing Label", description: "One label per tray medicine, sized for a 100 by 70 mm sheet.", needsTray: true },
  { type: "backing", title: "MDS Tray Backing Sheet", description: "The week's grid, medicine key, batches and verification line.", needsTray: true },
  { type: "identification", title: "Medication Identification Sheet", description: "What each medicine looks like and when it is taken.", needsTray: false },
  { type: "mar-weekly", title: "Weekly MAR Chart", description: "Blank seven-day administration chart.", needsTray: false },
  { type: "mar-monthly", title: "Monthly MAR Chart", description: "Blank full-month administration chart.", needsTray: false },
  { type: "summary", title: "Patient Medication Summary", description: "Active, pending and past medicines plus recent trays.", needsTray: false },
];

export function buildDocument(type: DocumentType, ctx: Ctx): jsPDF {
  const doc: Doc =
    type === "label" ? dispensingLabel(ctx)
    : type === "backing" ? backingSheet(ctx)
    : type === "identification" ? identificationSheet(ctx)
    : type === "mar-weekly" ? weeklyMar(ctx)
    : type === "mar-monthly" ? monthlyMar(ctx)
    : patientSummary(ctx);
  stampAll(doc, ctx.data.settings.pharmacyName);
  return doc;
}
