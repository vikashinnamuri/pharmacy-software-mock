import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  AlertTriangle, Ban, Check, ClipboardCheck, CreditCard, HandHelping, Pause, Play, Printer, ShieldCheck, Stethoscope, Store, Truck, Undo2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PdfPreviewDialog } from "@/components/common/pdf-preview";
import { PillArt } from "@/components/common/pill-art";
import { OrderBadge, RxBadge } from "@/components/common/status-badge";
import { ConfirmDialog, Field, GuardedButton, notify, Pick, TextLink } from "@/components/common/ui";
import { CounsellingDialog } from "@/components/forms/counselling-form";
import { RxReviewDialog } from "@/components/forms/rx-review-dialog";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { ORDER_LABEL, orderPath } from "@/lib/orders";
import { tokenPdf } from "@/lib/pdf/documents";
import { invoiceTotals, rupees } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { Order, PaymentMethod } from "@/types";

const FINAL_CHECKS = ["Correct patient and prescription", "Correct medicines and strengths", "Correct quantities", "Batch and expiry checked", "Label and directions correct", "Counselling needs considered"];
const ID_METHODS = ["Patient QR card scanned", "Photo ID checked", "Name and date of birth confirmed", "Authorised representative with ID"];

export function OrderStepper({ order }: { order: Order }) {
  const path = orderPath(order);
  const status = order.status === "on-hold" && order.heldFrom ? order.heldFrom : order.status;
  const idx = path.indexOf(status);
  return (
    <ol className="flex flex-wrap items-center gap-1 text-[12px]">
      {path.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span className={cn("flex size-5 items-center justify-center rounded-full border text-[10px] font-bold", i < idx ? "border-primary bg-primary text-white" : i === idx ? (order.status === "on-hold" || order.status === "cancelled" ? "border-danger text-danger" : "border-primary text-primary") : "border-input text-muted-foreground")}>
            {i < idx ? <Check className="size-3" strokeWidth={3} /> : i + 1}
          </span>
          <span className={cn(i === idx ? "font-semibold" : "text-muted-foreground")}>{s === "ready-collection" && order.fulfilment === "delivery" ? "Ready for dispatch" : ORDER_LABEL[s]}</span>
          {i < path.length - 1 && <span className="mx-0.5 h-px w-3 bg-input" />}
        </li>
      ))}
    </ol>
  );
}

export function TokenDialog({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const order = useAppStore((s) => s.orders.find((o) => o.id === orderId));
  const logDocument = useAppStore((s) => s.logDocument);
  if (!order) return null;
  return (
    <PdfPreviewDialog
      open={!!orderId} onOpenChange={(o) => !o && onClose()}
      title={`Token ${order.token}`} description={`${order.id}. The slip shows the token and reference only, never medicine names.`}
      build={() => tokenPdf(useAppStore.getState(), order.token, order.id, order.estimatedReady)}
      filename={`Token-${order.token}-${order.id}-DEMO.pdf`}
      onOutput={(verb) => logDocument("token", `Token ${order.token}`, verb, order.patientId, order.id)}
    >
      <div className="flex items-center gap-4 rounded-xl bg-sidebar p-4 text-white">
        <span className="text-5xl font-bold tracking-tight">{order.token}</span>
        <span className="text-[13px] text-[#C9D5E6]">{order.id}<br />Estimated ready {fmtDateTime(order.estimatedReady)}</span>
      </div>
    </PdfPreviewDialog>
  );
}

export function OrderSheet({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const state = useAppStore();
  const order = state.orders.find((o) => o.id === orderId);
  const patient = state.patients.find((p) => p.id === order?.patientId);
  const rx = state.prescriptions.find((p) => p.id === order?.prescriptionId);
  const invoice = state.invoices.find((i) => i.id === order?.invoiceId);
  const counselling = state.counselling.find((c) => c.id === order?.counsellingId);
  const [method, setMethod] = useState<PaymentMethod>("UPI");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [collector, setCollector] = useState("");
  const [idMethod, setIdMethod] = useState("");
  const [idOk, setIdOk] = useState(false);
  const [dlg, setDlg] = useState<null | "reject-review" | "reject-final" | "hold" | "cancel">(null);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [rxReview, setRxReview] = useState<string | null>(null);
  const [counselOpen, setCounselOpen] = useState(false);
  const [estimate, setEstimate] = useState("");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setChecks({}); setIdOk(false); setIdMethod("");
    setCollector(patient?.name ?? "");
    if (order) { const d = new Date(order.estimatedReady); setEstimate(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)); }
  }, [orderId, order?.status, patient?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!order) return <Sheet open={false} />;
  const t = invoice ? invoiceTotals(invoice) : null;
  const allChecked = FINAL_CHECKS.every((c) => checks[c]);

  return (
    <>
      <Sheet open={!!orderId} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-[640px]">
          <SheetHeader className="border-b border-border pr-12">
            <div className="flex items-center gap-3">
              <span className="shrink-0 rounded-lg bg-sidebar px-3 py-1.5 text-2xl font-bold tracking-tight whitespace-nowrap text-white">{order.token}</span>
              <div className="min-w-0">
                <SheetTitle className="flex flex-wrap items-center gap-2 text-lg">{order.id} <OrderBadge order={order} /></SheetTitle>
                <SheetDescription>
                  <TextLink href={`/patients/${order.patientId}`}>{patient?.name}</TextLink> ({order.patientId}). Created {fmtDateTime(order.createdAt)} by {order.createdBy}.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <div className="space-y-4 p-4">
            <OrderStepper order={order} />
            {order.status === "on-hold" && <p className="rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn"><Pause className="mr-1 inline size-3.5" /> On hold from {ORDER_LABEL[order.heldFrom!]}. {order.events.at(-1)?.note}</p>}
            {patient && patient.allergies.length > 0 && <p className="flex items-center gap-1.5 rounded-lg bg-danger-bg px-3 py-2 text-[13px] font-semibold text-danger"><AlertTriangle className="size-4" /> Allergy on record: {patient.allergies.join(", ")}</p>}

            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <div><dt className="text-xs text-muted-foreground">Patient confirmed</dt><dd>{order.patientConfirmed.method}<span className="block text-xs text-muted-foreground">{order.patientConfirmed.by}</span></dd></div>
              <div><dt className="text-xs text-muted-foreground">Prescription</dt><dd>{rx ? <span className="flex items-center gap-1.5">{rx.id} v{rx.version} <RxBadge status={rx.status} /></span> : "Medication request (no prescription)"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Fulfilment</dt><dd>{order.fulfilment === "delivery" ? `Delivery to ${order.deliveryAddress}` : "Collection at the counter"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">{order.fulfilment === "delivery" ? "Estimated dispatch" : "Estimated ready"}</dt><dd>{fmtDateTime(order.estimatedReady)}</dd></div>
            </dl>

            <div className="rounded-lg border border-border">
              <p className="border-b border-border px-3 py-2 text-[13px] font-semibold">Medicines</p>
              <ul className="divide-y divide-border">
                {order.lines.map((l) => {
                  const m = state.medicines.find((x) => x.id === l.medicineId);
                  return (
                    <li key={l.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-[13px]">
                      {m && <PillArt medicine={m} size={28} />}
                      <span className="min-w-[180px] flex-1">
                        <strong>{m?.brand} {l.strength}</strong> × {l.qty}
                        <span className="block text-xs text-muted-foreground">{l.instructions || "No directions"}</span>
                        {l.allocations.length > 0 && <span className="block text-xs text-muted-foreground">Batch {l.allocations.map((a) => { const b = state.batches.find((x) => x.id === a.batchId); return `${b?.batchNumber} (${a.qty}, exp ${fmtDate(b?.expiryDate)})`; }).join(", ")}{order.inventoryDeducted ? ", deducted" : ", held"}</span>}
                      </span>
                      <span>{rupees(l.qty * l.unitPrice)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border p-3 text-[13px]">
                <p className="text-xs text-muted-foreground">Payment</p>
                {invoice && t ? (
                  <>
                    <p className="font-semibold">{rupees(t.total)}</p>
                    <p className="text-xs">{t.balance <= 0 ? "Paid (simulated)" : `Balance ${rupees(t.balance)}`}</p>
                    <Link to={`/billing?invoice=${invoice.id}`} className="text-xs font-medium text-primary hover:underline">{invoice.id}</Link>
                  </>
                ) : <p className="font-semibold">After review</p>}
              </div>
              <div className="rounded-lg border border-border p-3 text-[13px]">
                <p className="text-xs text-muted-foreground">Preparation</p>
                <p className="font-semibold capitalize">{order.preparation.status.replace("-", " ")}</p>
                <p className="text-xs">{order.preparation.by ?? ""}{order.preparation.doneAt ? `, ${fmtDateTime(order.preparation.doneAt)}` : ""}</p>
              </div>
              <div className="rounded-lg border border-border p-3 text-[13px]">
                <p className="text-xs text-muted-foreground">Final verification</p>
                <p className="font-semibold capitalize">{order.verification.status}</p>
                <p className="text-xs">{order.verification.by ? `${order.verification.by}, ${fmtDateTime(order.verification.at)}` : ""}</p>
              </div>
            </div>

            {/* The one next step, gated by role. */}
            <div className="space-y-2 rounded-xl border border-primary/30 bg-accent/30 p-3">
              <p className="text-[13px] font-semibold">Next step</p>
              {order.status === "new" && <GuardedButton perm="order.create" what="submit orders" onClick={() => notify(state.submitOrder(order.id))}><Check /> Submit for pharmacist review</GuardedButton>}
              {order.status === "awaiting-review" && (
                <div className="flex flex-wrap gap-2">
                  {rx?.status === "pending" && <GuardedButton perm="rx.review" what="review prescriptions" variant="outline" onClick={() => setRxReview(rx.id)}><Stethoscope /> Review {rx.id} first</GuardedButton>}
                  <GuardedButton perm="order.review" what="review orders" disabled={rx?.status === "pending"} onClick={() => notify(state.reviewOrder(order.id, "approved"))}><ShieldCheck /> Approve: check stock and charges</GuardedButton>
                  <GuardedButton perm="order.review" what="reject orders" variant="destructive" onClick={() => setDlg("reject-review")}><XCircle /> Reject</GuardedButton>
                </div>
              )}
              {order.status === "awaiting-payment" && (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Payment method (simulated)" className="w-[200px]"><Pick value={method} onChange={setMethod} options={(["UPI", "Cash", "Card", "Bank transfer"] as PaymentMethod[]).map((m) => ({ value: m, label: m }))} /></Field>
                  <GuardedButton perm="order.payment" what="record payments" onClick={() => notify(state.recordOrderPayment(order.id, method))}><CreditCard /> Record payment {t ? rupees(t.balance) : ""}</GuardedButton>
                </div>
              )}
              {order.status === "payment-received" && <GuardedButton perm="order.prepare" what="prepare orders" onClick={() => notify(state.startOrderPreparation(order.id))}><HandHelping /> Start preparation</GuardedButton>}
              {order.status === "in-preparation" && (
                <>
                  {order.verification.status === "rejected" && <p className="text-[13px] text-danger">Returned by the pharmacist: {order.verification.note}</p>}
                  <GuardedButton perm="order.prepare" what="prepare orders" onClick={() => notify(state.completeOrderPreparation(order.id))}><ClipboardCheck /> Prepared and labelled: send for final check</GuardedButton>
                </>
              )}
              {order.status === "awaiting-verification" && (
                <div className="space-y-2">
                  <div className="grid gap-1 sm:grid-cols-2">
                    {FINAL_CHECKS.map((c) => (
                      <Label key={c} className="flex items-center gap-2 text-[13px] font-normal"><Checkbox checked={!!checks[c]} onCheckedChange={(v) => setChecks((x) => ({ ...x, [c]: !!v }))} /> {c}</Label>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <GuardedButton perm="order.verify" what="verify orders" disabled={!allChecked} onClick={() => notify(state.verifyOrder(order.id, "approved"))}><ShieldCheck /> Approve final check</GuardedButton>
                    <GuardedButton perm="order.verify" what="return orders" variant="outline" onClick={() => setDlg("reject-final")}><Undo2 /> Return to preparation</GuardedButton>
                  </div>
                </div>
              )}
              {order.status === "ready-collection" && order.fulfilment === "collection" && (
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="Collected by"><Input value={collector} onChange={(e) => setCollector(e.target.value)} placeholder={patient?.representative ? `${patient.name} or ${patient.representative.name}` : patient?.name} /></Field>
                    <Field label="Identity confirmation"><Pick value={idMethod} onChange={setIdMethod} placeholder="How was identity confirmed?" options={ID_METHODS.map((m) => ({ value: m, label: m }))} /></Field>
                  </div>
                  <Label className="flex items-center gap-2 text-[13px] font-normal"><Checkbox checked={idOk} onCheckedChange={(v) => setIdOk(!!v)} /> Identity confirmed and medicines handed over (simulated)</Label>
                  <GuardedButton perm="order.fulfil" what="hand over orders" disabled={!idOk || !idMethod || !collector.trim()} onClick={() => notify(state.recordCollection(order.id, collector, idMethod))}><Store /> Record collection</GuardedButton>
                </div>
              )}
              {order.status === "ready-collection" && order.fulfilment === "delivery" && <Button render={<Link to="/collection?tab=delivery" />}><Truck /> Dispatch from delivery management</Button>}
              {order.status === "out-for-delivery" && <Button render={<Link to="/collection?tab=delivery" />}><Truck /> Confirm delivery</Button>}
              {order.status === "on-hold" && <GuardedButton perm="order.create" what="resume orders" onClick={() => notify(state.resumeOrder(order.id))}><Play /> Resume</GuardedButton>}
              {["collected", "delivered"].includes(order.status) && <p className="text-[13px] text-muted-foreground">Completed {fmtDateTime(order.completedAt)}{order.collectedBy ? `, ${order.status === "delivered" ? "received" : "collected"} by ${order.collectedBy}` : ""}. Recorded in the patient's dispensing history.</p>}
              {order.status === "cancelled" && <p className="text-[13px] text-muted-foreground">Cancelled. {order.events.at(-1)?.note}</p>}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setTokenOpen(true)}><Printer /> Print token</Button>
              {!counselling && <GuardedButton size="sm" variant="outline" perm="counselling.record" what="record counselling" onClick={() => setCounselOpen(true)}><Stethoscope /> Add counselling record</GuardedButton>}
              {["awaiting-review", "awaiting-payment", "payment-received", "in-preparation", "ready-collection"].includes(order.status) && <GuardedButton size="sm" variant="outline" perm="order.create" what="hold orders" onClick={() => setDlg("hold")}><Pause /> Hold</GuardedButton>}
              {["new", "awaiting-review", "awaiting-payment", "payment-received", "on-hold"].includes(order.status) && <GuardedButton size="sm" variant="outline" perm="order.create" what="cancel orders" onClick={() => setDlg("cancel")}><Ban /> Cancel</GuardedButton>}
            </div>
            {!["collected", "delivered", "cancelled"].includes(order.status) && (
              <div className="flex flex-wrap items-end gap-2">
                <Field label={order.fulfilment === "delivery" ? "Estimated dispatch" : "Estimated ready"} className="w-[230px]"><Input type="datetime-local" value={estimate} onChange={(e) => setEstimate(e.target.value)} /></Field>
                <GuardedButton size="sm" variant="ghost" perm="order.fulfil" what="change estimates" onClick={() => estimate && notify(state.setOrderEstimate(order.id, new Date(estimate).toISOString()))}>Save estimate</GuardedButton>
              </div>
            )}

            {counselling && (
              <div className="rounded-lg border border-border p-3 text-[13px]">
                <p className="font-semibold">Counselling {counselling.id}</p>
                {counselling.symptoms && <p>Symptoms: {counselling.symptoms}{counselling.duration ? `, ${counselling.duration}` : ""}</p>}
                <p>Advice: {counselling.advice}</p>
                {counselling.referral && <p className="text-warn">Referral: {counselling.referralNotes}</p>}
                <p className="text-xs text-muted-foreground">{counselling.by}, {fmtDateTime(counselling.at)}</p>
              </div>
            )}

            <div>
              <p className="mb-2 text-[13px] font-semibold">Timestamp history</p>
              <ol className="space-y-2 border-l-2 border-border pl-3">
                {[...order.events].reverse().map((e, i) => (
                  <li key={i} className="text-[13px]">
                    <span className="font-medium">{e.action}</span>
                    <span className="block text-xs text-muted-foreground">{e.by}, {fmtDateTime(e.at)}{e.status ? ` · ${ORDER_LABEL[e.status]}` : ""}</span>
                    {e.note && <span className="block text-xs">{e.note}</span>}
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <ConfirmDialog
            open={!!dlg} onOpenChange={(o) => !o && setDlg(null)}
            title={dlg === "reject-review" ? `Reject ${order.id}?` : dlg === "reject-final" ? "Return to preparation?" : dlg === "hold" ? `Put ${order.token} on hold?` : `Cancel ${order.id}?`}
            description={dlg === "cancel" ? "Reserved stock is released. Any simulated payment is refunded." : dlg === "reject-review" ? "The order is cancelled with your reason." : "Add a note for the team."}
            reasonLabel="Reason" reasonRequired destructive={dlg === "cancel" || dlg === "reject-review"}
            confirmLabel={dlg === "reject-review" ? "Reject order" : dlg === "reject-final" ? "Return" : dlg === "hold" ? "Hold" : "Cancel order"}
            onConfirm={(note) => {
              if (dlg === "reject-review") notify(state.reviewOrder(order.id, "rejected", note));
              if (dlg === "reject-final") notify(state.verifyOrder(order.id, "rejected", note));
              if (dlg === "hold") notify(state.holdOrder(order.id, note));
              if (dlg === "cancel") notify(state.cancelOrder(order.id, note));
              setDlg(null);
            }}
          />
          <TokenDialog orderId={tokenOpen ? order.id : null} onClose={() => setTokenOpen(false)} />
          <RxReviewDialog id={rxReview} onClose={() => setRxReview(null)} />
          <CounsellingDialog open={counselOpen} onOpenChange={setCounselOpen} patientId={order.patientId} orderId={order.id} />
        </SheetContent>
      </Sheet>
    </>
  );
}

