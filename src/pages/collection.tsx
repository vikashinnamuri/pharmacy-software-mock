import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CheckCircle2, MonitorPlay, PackageCheck, Store, Truck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge, DeliveryBadge, OrderBadge, TrayBadge } from "@/components/common/status-badge";
import { Card, ClinicalNotice, ConfirmDialog, EmptyState, Field, GuardedButton, notify, PageHeader, Pick, TextLink } from "@/components/common/ui";
import { OrderSheet } from "@/components/orders/order-sheet";
import { fmtDate, fmtDateTime, weekLabel } from "@/lib/dates";
import { useAppStore } from "@/store/app-store";
import type { Delivery } from "@/types";

const ID_METHODS = ["Patient QR card scanned", "Photo ID checked", "Name and date of birth confirmed", "Authorised representative with ID"];

interface Handover { kind: "order" | "tray"; id: string; patientId: string; token?: string }

function HandoverDialog({ item, onClose }: { item: Handover | null; onClose: () => void }) {
  const state = useAppStore();
  const patient = state.patients.find((p) => p.id === item?.patientId);
  const [name, setName] = useState("");
  const [method, setMethod] = useState("");
  const [ok, setOk] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setName(patient?.name ?? ""); setMethod(""); setOk(false); }, [item, patient?.name]);
  if (!item || !patient) return null;
  const authorised = [patient.name, patient.representative?.name, patient.caregiver?.name].filter(Boolean) as string[];
  const confirm = () => {
    const r = item.kind === "order" ? state.recordCollection(item.id, name, method) : state.supplyTray(item.id, `${name} (${method})`);
    if (notify(r)) onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm collection{item.token ? `, token ${item.token}` : ""}</DialogTitle>
          <DialogDescription>{item.id} for {patient.name}. Authorised to collect: {authorised.join(", ")}. Simulated identity check.</DialogDescription>
        </DialogHeader>
        <Field label="Collected by"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        {name && !authorised.some((a) => a.toLowerCase() === name.trim().toLowerCase()) && <p className="text-[13px] text-warn">This person is not on the authorised list. Check their authority before handing over.</p>}
        <Field label="Identity confirmation"><Pick value={method} onChange={setMethod} placeholder="How was identity confirmed?" options={ID_METHODS.map((m) => ({ value: m, label: m }))} /></Field>
        <Label className="flex items-center gap-2 text-[13px] font-normal"><Checkbox checked={ok} onCheckedChange={(v) => setOk(!!v)} /> Identity confirmed and items handed over</Label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <GuardedButton perm={item.kind === "order" ? "order.fulfil" : "tray.supply"} what="hand over" disabled={!ok || !method || !name.trim()} onClick={confirm}><PackageCheck /> Record collection</GuardedButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CollectionPage() {
  const [params] = useSearchParams();
  const state = useAppStore();
  const { orders, trays, deliveries, patients, settings } = state;
  const [tab, setTab] = useState(params.get("tab") ?? "collection");
  const [handover, setHandover] = useState<Handover | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [deliver, setDeliver] = useState<Delivery | null>(null);
  const [receivedBy, setReceivedBy] = useState("");
  const [failFor, setFailFor] = useState<Delivery | null>(null);
  const [assign, setAssign] = useState<Record<string, string>>({});
  const pTab = params.get("tab");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (pTab) setTab(pTab); }, [pTab]);

  const name = (id: string) => patients.find((p) => p.id === id)?.name ?? id;
  const readyOrders = orders.filter((o) => o.status === "ready-collection" && o.fulfilment === "collection");
  const readyTrays = trays.filter((t) => t.status === "ready" && t.fulfilment?.method !== "delivery");
  const preparing = orders.filter((o) => o.fulfilment === "collection" && ["payment-received", "in-preparation", "awaiting-verification"].includes(o.status));
  const openDeliveries = deliveries.filter((d) => d.status !== "delivered").sort((a, b) => a.estimatedDate.localeCompare(b.estimatedDate));
  const history = useMemo(() => [
    ...orders.filter((o) => o.status === "collected" || o.status === "delivered").map((o) => ({ at: o.completedAt ?? o.createdAt, ref: o.id, token: o.token, patientId: o.patientId, what: o.status === "delivered" ? "Order delivered" : "Order collected", by: o.collectedBy ?? "" })),
    ...trays.filter((t) => t.status === "supplied").map((t) => ({ at: t.suppliedAt ?? t.weekStart, ref: t.id, token: t.fulfilment?.token, patientId: t.patientId, what: `MDS tray, week ${weekLabel(t.weekStart)}`, by: t.fulfilment?.collectedBy ?? "" })),
  ].sort((a, b) => b.at.localeCompare(a.at)), [orders, trays]);

  return (
    <>
      <PageHeader
        title="Collection & Delivery"
        description="Hand over prepared orders and MDS trays, and manage home deliveries. Completed hand-overs appear in the patient's record."
        actions={<Button variant="outline" render={<Link to="/display" target="_blank" />}><MonitorPlay /> Public collection display</Button>}
      />
      <ClinicalNotice>Identity checks and delivery confirmations are simulated. No messages are sent to patients.</ClinicalNotice>
      <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
        <TabsList>
          <TabsTrigger value="collection">Collection ({readyOrders.length + readyTrays.length})</TabsTrigger>
          <TabsTrigger value="delivery">Home delivery ({openDeliveries.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="collection" className="space-y-3 pt-2">
          <Card>
            <div className="px-5 pt-4 pb-2"><h2 className="font-semibold">Ready for collection</h2></div>
            {readyOrders.length + readyTrays.length === 0 && <EmptyState icon={<Store className="size-5" />} title="Nothing is waiting to be collected" body="Orders appear here after the pharmacist's final check. MDS trays appear once marked ready." />}
            <ul className="divide-y divide-border">
              {readyOrders.map((o) => {
                const p = patients.find((x) => x.id === o.patientId);
                return (
                  <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <span className="rounded-lg bg-sidebar px-2.5 py-1 text-lg font-bold text-white">{o.token}</span>
                    <span className="min-w-[200px] flex-1 text-[13px]">
                      <button type="button" className="font-semibold hover:underline" onClick={() => setOrderId(o.id)}>{o.id}</button> for <TextLink href={`/patients/${o.patientId}`}>{p?.name}</TextLink>
                      <span className="block text-muted-foreground">Ready since {fmtDateTime(o.events.findLast((e) => e.status === "ready-collection")?.at)}. Representative: {p?.representative?.name ?? "none recorded"}</span>
                    </span>
                    <OrderBadge order={o} />
                    <GuardedButton size="sm" perm="order.fulfil" what="hand over orders" onClick={() => setHandover({ kind: "order", id: o.id, patientId: o.patientId, token: o.token })}><PackageCheck /> Confirm collection</GuardedButton>
                  </li>
                );
              })}
              {readyTrays.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="rounded-lg bg-primary px-2.5 py-1 text-lg font-bold text-white">{t.fulfilment?.token ?? "MDS"}</span>
                  <span className="min-w-[200px] flex-1 text-[13px]">
                    <TextLink href={`/trays?tray=${t.id}`}>{t.id}</TextLink> for <TextLink href={`/patients/${t.patientId}`}>{name(t.patientId)}</TextLink>
                    <span className="block text-muted-foreground">MDS tray, week {weekLabel(t.weekStart)}{t.fulfilment?.estimatedReady ? `. Ready ${fmtDateTime(t.fulfilment.estimatedReady)}` : ""}</span>
                  </span>
                  <TrayBadge status={t.status} />
                  <GuardedButton size="sm" perm="tray.supply" what="hand over trays" onClick={() => setHandover({ kind: "tray", id: t.id, patientId: t.patientId, token: t.fulfilment?.token })}><PackageCheck /> Confirm collection</GuardedButton>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <div className="px-5 pt-4 pb-2"><h2 className="font-semibold">Being prepared</h2><p className="text-[13px] text-muted-foreground">Estimated ready times can be changed on each order.</p></div>
            <ul className="divide-y divide-border">
              {preparing.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-[13px]">
                  <span className="rounded-md bg-muted px-2 py-0.5 font-bold">{o.token}</span>
                  <button type="button" className="flex-1 text-left hover:underline" onClick={() => setOrderId(o.id)}>{o.id} for {name(o.patientId)}</button>
                  <span className="text-muted-foreground">Est. {fmtDateTime(o.estimatedReady)}</span>
                  <OrderBadge order={o} />
                </li>
              ))}
              {!preparing.length && <li className="px-5 py-4 text-[13px] text-muted-foreground">No collection orders in preparation.</li>}
            </ul>
          </Card>
        </TabsContent>

        <TabsContent value="delivery" className="pt-2">
          <Card>
            {openDeliveries.length === 0 && <EmptyState icon={<Truck className="size-5" />} title="No open deliveries" body="Delivery orders appear here after their final check. MDS trays for delivery appear when marked ready." />}
            <ul className="divide-y divide-border">
              {openDeliveries.map((d) => {
                const staff = assign[d.id] ?? d.assignedTo ?? "";
                return (
                  <li key={d.id} className="grid gap-3 px-5 py-3 lg:grid-cols-[1.3fr_1fr_1fr_auto] lg:items-center">
                    <div className="text-[13px]">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">{d.id} <DeliveryBadge status={d.status} /> <Badge tone="neutral">{d.kind === "order" ? "Order" : "MDS tray"}</Badge></p>
                      <p>{d.kind === "order" ? <button type="button" className="text-primary hover:underline" onClick={() => setOrderId(d.refId)}>{d.refId}</button> : <TextLink href={`/trays?tray=${d.refId}`}>{d.refId}</TextLink>} for <TextLink href={`/patients/${d.patientId}`}>{name(d.patientId)}</TextLink></p>
                      <p className="text-muted-foreground">{d.address}</p>
                      <p className="text-muted-foreground">Authorised recipient: {d.authorisedRecipient}{d.notes ? `. ${d.notes}` : ""}</p>
                    </div>
                    <Field label="Delivery staff"><Pick value={staff} onChange={(v) => { setAssign((a) => ({ ...a, [d.id]: v })); notify(state.updateDelivery(d.id, { assignedTo: v })); }} placeholder="Assign" options={settings.deliveryStaff.map((s) => ({ value: s, label: s }))} /></Field>
                    <Field label="Estimated delivery date"><Input type="date" value={d.estimatedDate} onChange={(e) => e.target.value && state.updateDelivery(d.id, { estimatedDate: e.target.value })} /></Field>
                    <div className="flex flex-wrap gap-1.5">
                      {(d.status === "scheduled" || d.status === "failed") && <GuardedButton size="sm" perm="delivery.manage" what="dispatch deliveries" disabled={!staff} onClick={() => notify(state.dispatchDelivery(d.id, staff))}><Truck /> Dispatch</GuardedButton>}
                      {d.status === "out" && <GuardedButton size="sm" perm="delivery.manage" what="confirm deliveries" onClick={() => { setDeliver(d); setReceivedBy(d.authorisedRecipient); }}><CheckCircle2 /> Delivered</GuardedButton>}
                      {d.status === "out" && <GuardedButton size="sm" variant="outline" perm="delivery.manage" what="update deliveries" onClick={() => setFailFor(d)}><XCircle /> Failed</GuardedButton>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="pt-2">
          <Card>
            <ul className="divide-y divide-border">
              {history.slice(0, 80).map((h) => (
                <li key={h.ref} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-[13px]">
                  <span className="w-[150px] text-muted-foreground">{fmtDateTime(h.at)}</span>
                  {h.token && <span className="rounded-md bg-muted px-2 py-0.5 font-bold">{h.token}</span>}
                  <span className="flex-1"><strong>{h.ref}</strong> {h.what} for <TextLink href={`/patients/${h.patientId}`}>{name(h.patientId)}</TextLink></span>
                  <span className="text-muted-foreground">{h.by}</span>
                </li>
              ))}
              {!history.length && <li className="px-5 py-6 text-center text-[13px] text-muted-foreground">No completed hand-overs yet.</li>}
            </ul>
          </Card>
        </TabsContent>
      </Tabs>

      <HandoverDialog item={handover} onClose={() => setHandover(null)} />
      <OrderSheet orderId={orderId} onClose={() => setOrderId(null)} />
      <Dialog open={!!deliver} onOpenChange={(o) => !o && setDeliver(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Confirm delivery {deliver?.id}</DialogTitle><DialogDescription>Delivered on {fmtDate(new Date().toISOString().slice(0, 10))}. Authorised recipient: {deliver?.authorisedRecipient}.</DialogDescription></DialogHeader>
          <Field label="Received by"><Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} /></Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliver(null)}>Cancel</Button>
            <GuardedButton perm="delivery.manage" what="confirm deliveries" disabled={!receivedBy.trim()} onClick={() => { if (deliver && notify(state.completeDelivery(deliver.id, receivedBy))) setDeliver(null); }}><CheckCircle2 /> Confirm delivered</GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!failFor} onOpenChange={(o) => !o && setFailFor(null)} title={`Mark ${failFor?.id} as failed?`} description="The items come back to the pharmacy for re-dispatch. Stock is not deducted again." reasonLabel="What happened?" reasonRequired confirmLabel="Mark failed" onConfirm={(note) => { if (failFor) notify(state.failDelivery(failFor.id, note)); setFailFor(null); }} />
    </>
  );
}
