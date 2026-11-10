
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  BarChart3, Boxes, CalendarRange, CheckCircle2, ClipboardCheck, CreditCard, FileClock, FilePlus2, Hourglass, ListChecks, PackageCheck, Pill, ScrollText,
  Search, ShoppingBag, Store, Truck, UserPlus, Users, Wallet, HandHelping, type LucideIcon,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PatientFinder } from "@/components/common/patient-finder";
import { PillArt } from "@/components/common/pill-art";
import { RxBadge, TrayBadge } from "@/components/common/status-badge";
import { Card, CardTitle, ClinicalNotice, PageHeader } from "@/components/common/ui";
import { daysBetween, fmtDate, fmtRelative, fmtShort, parseDate, today } from "@/lib/dates";
import { kpis, upcomingPreparations } from "@/lib/selectors";
import { monthlyDispensing } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

function QuickAction({ to, onClick, label, icon: Icon }: { to?: string; onClick?: () => void; label: string; icon: LucideIcon }) {
  const cls = "flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[13px] font-medium transition-colors hover:border-primary hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none";
  const inner = <><Icon className="size-4 shrink-0 text-primary" /><span className="leading-tight">{label}</span></>;
  return to ? <Link to={to} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} className={cn(cls, "text-left")}>{inner}</button>;
}

function Metric({ href, label, value, icon: Icon, tone }: { href: string; label: string; value: number; icon: LucideIcon; tone?: "warn" | "danger" | "ok" }) {
  return (
    <Link to={href} className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-primary focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", tone === "warn" ? "bg-warn-bg text-warn" : tone === "danger" ? "bg-danger-bg text-danger" : tone === "ok" ? "bg-ok-bg text-ok" : "bg-accent text-accent-foreground")}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl leading-none font-bold">{value}</span>
        <span className="mt-1 block text-[13px] leading-tight text-muted-foreground group-hover:text-foreground">{label}</span>
      </span>
    </Link>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [finder, setFinder] = useState(false);
  const state = useAppStore();
  const k = useMemo(() => kpis(state), [state]);
  const upcoming = useMemo(() => upcomingPreparations(state).slice(0, 5), [state]);
  const chart = useMemo(() => monthlyDispensing(state), [state]);
  const name = (id?: string) => state.patients.find((p) => p.id === id)?.name ?? "";
  const pendingRx = state.prescriptions.filter((p) => p.status === "pending");
  const med = (id: string) => state.medicines.find((m) => m.id === id);
  const greetingDate = parseDate(today()).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <PageHeader title="Overview" description={`${greetingDate}. Everything below reflects the demo records in this browser.`} />
      <ClinicalNotice>Standard dispensing and MDS share one set of mock records. Every count updates as you work.</ClinicalNotice>

      <Card className="mb-3 p-4">
        <p className="mb-2 text-[13px] font-semibold text-muted-foreground">Quick actions</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-7">
          <QuickAction to="/patients?new=1" label="Register New Patient" icon={UserPlus} />
          <QuickAction onClick={() => setFinder(true)} label="Search Existing Patient" icon={Search} />
          <QuickAction to="/catalogue" label="Add / Edit Medication" icon={Pill} />
          <QuickAction to="/prescriptions?create=1" label="New Prescription" icon={FilePlus2} />
          <QuickAction to="/prescriptions?status=pending" label="Pending Prescriptions" icon={ScrollText} />
          <QuickAction to="/dispensing" label="Dispensing Queue" icon={ShoppingBag} />
          <QuickAction to="/verification" label="Pharmacist Verification" icon={ClipboardCheck} />
          <QuickAction to="/billing" label="Payment / Billing" icon={CreditCard} />
          <QuickAction to="/collection" label="Ready for Collection" icon={Store} />
          <QuickAction to="/collection?tab=delivery" label="Delivery Management" icon={Truck} />
          <QuickAction to="/mds" label="MDS Patients" icon={CalendarRange} />
          <QuickAction to="/preparation" label="MDS Preparation Queue" icon={HandHelping} />
          <QuickAction to="/inventory" label="Inventory" icon={Boxes} />
          <QuickAction to="/reports" label="Reports & Administration" icon={BarChart3} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Metric href="/dispensing?status=today" label="Today's Orders" value={k.todaysOrders} icon={ShoppingBag} />
        <Metric href="/prescriptions?status=pending" label="Pending Prescription Reviews" value={k.pendingReviews} icon={ScrollText} tone={k.pendingReviews ? "warn" : undefined} />
        <Metric href="/dispensing?status=waiting" label="Patients Waiting" value={k.patientsWaiting} icon={Users} />
        <Metric href="/dispensing?status=awaiting-payment" label="Awaiting Payment" value={k.awaitingPayment} icon={Wallet} tone={k.awaitingPayment ? "warn" : undefined} />
        <Metric href="/dispensing?status=in-preparation" label="Orders In Preparation" value={k.ordersInPreparation} icon={Hourglass} />
        <Metric href="/verification" label="Awaiting Verification" value={k.allAwaitingVerification} icon={ClipboardCheck} tone={k.allAwaitingVerification ? "warn" : undefined} />
        <Metric href="/collection" label="Ready for Collection" value={k.readyForCollection} icon={Store} tone="ok" />
        <Metric href="/collection?tab=delivery" label="Out for Delivery" value={k.outForDelivery} icon={Truck} />
        <Metric href="/preparation" label="MDS Trays Pending" value={k.mdsTraysPending} icon={ListChecks} tone={k.mdsTraysPending ? "warn" : undefined} />
        <Metric href="/dispensing?status=completed" label="Completed Orders (today)" value={k.completedOrders} icon={PackageCheck} tone="ok" />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle title="Upcoming weekly tray preparations" action={<Button size="sm" variant="ghost" render={<Link to="/preparation" />}>Open preparation</Button>} />
          <ul>
            {upcoming.map(({ tray, patient, progress }) => (
              <li key={tray.id} className="border-t border-border">
                <Link to={tray.status === "proposed" ? `/trays?tray=${tray.id}` : `/preparation?tray=${tray.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 hover:bg-accent/50">
                  <span className="min-w-[170px] flex-1">
                    <span className="block font-semibold">{patient?.name}</span>
                    <span className="block text-[13px] text-muted-foreground">{tray.id}, week of {fmtShort(tray.weekStart)}</span>
                  </span>
                  <span className="w-[130px]">
                    <span className="block text-xs text-muted-foreground">{progress.prepared} of {progress.total}</span>
                    <Progress value={progress.pct} aria-label={`Progress for ${tray.id}`} />
                  </span>
                  <TrayBadge status={tray.status} />
                </Link>
              </li>
            ))}
            {!upcoming.length && <li className="border-t border-border px-5 py-6 text-center text-[13px] text-muted-foreground">No trays are waiting to be prepared.</li>}
          </ul>
        </Card>
        <Card>
          <CardTitle title="Prescription review queue" action={<Button size="sm" variant="ghost" render={<Link to="/prescriptions?status=pending" />}>View all</Button>} />
          <ul>
            {pendingRx.map((p) => (
              <li key={p.id} className="border-t border-border">
                <Link to={`/prescriptions?review=${p.id}`} className="flex items-center justify-between gap-2 px-5 py-2.5 hover:bg-accent/50">
                  <span>
                    <span className="block font-semibold">{name(p.patientId)}</span>
                    <span className="block text-[13px] text-muted-foreground">{p.id}, {p.lines.length} line{p.lines.length > 1 ? "s" : ""}, {fmtDate(p.issuedOn)}</span>
                  </span>
                  <RxBadge status={p.status} />
                </Link>
              </li>
            ))}
            {!pendingRx.length && <li className="flex items-center justify-center gap-2 border-t border-border px-5 py-6 text-[13px] text-muted-foreground"><CheckCircle2 className="size-4 text-ok" /> No prescriptions are waiting for review.</li>}
          </ul>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <Card>
          <CardTitle title="Monthly dispensing" hint="Units leaving stock, from the stock movement history" />
          <div className="h-[230px] px-3 pb-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip cursor={{ fill: "var(--accent)" }} formatter={(v) => [`${v} units`, "Dispensed"]} />
                <Bar dataKey="units" fill="var(--chart-1)" radius={[5, 5, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardTitle title="Inventory alerts" action={<Button size="sm" variant="ghost" render={<Link to="/inventory" />}>Open inventory</Button>} />
          <ul className="max-h-[240px] overflow-y-auto">
            {k.alerts.expired.map((b) => {
              const m = med(b.medicineId);
              return (
                <li key={b.id} className="border-t border-border">
                  <Link to={`/inventory?q=${b.batchNumber}`} className="flex items-center gap-2.5 px-5 py-2 hover:bg-accent/50">
                    {m && <PillArt medicine={m} size={26} />}
                    <span className="flex-1 text-[13px]"><span className="font-semibold">{m?.brand} {m?.strength}</span> <span className="block text-danger">Batch {b.batchNumber} expired {fmtDate(b.expiryDate)}</span></span>
                  </Link>
                </li>
              );
            })}
            {k.alerts.expiring.slice(0, 4).map((b) => {
              const m = med(b.medicineId);
              return (
                <li key={b.id} className="border-t border-border">
                  <Link to={`/inventory?q=${b.batchNumber}`} className="flex items-center gap-2.5 px-5 py-2 hover:bg-accent/50">
                    {m && <PillArt medicine={m} size={26} />}
                    <span className="flex-1 text-[13px]"><span className="font-semibold">{m?.brand} {m?.strength}</span> <span className="block text-warn">Batch {b.batchNumber} expires in {daysBetween(today(), b.expiryDate)} days</span></span>
                  </Link>
                </li>
              );
            })}
            {k.alerts.low.slice(0, 5).map(({ medicine: m, free }) => (
              <li key={m.id} className="border-t border-border">
                <Link to={`/inventory?q=${encodeURIComponent(m.brand)}`} className="flex items-center gap-2.5 px-5 py-2 hover:bg-accent/50">
                  <PillArt medicine={m} size={26} />
                  <span className="flex-1 text-[13px]"><span className="font-semibold">{m.brand} {m.strength}</span> <span className="block text-warn">{free} free, reorder at {m.reorderLevel}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle title="Recent activity" />
          <ul className="max-h-[240px] overflow-y-auto">
            {state.activity.slice(0, 12).map((a) => (
              <li key={a.id} className="flex gap-2.5 border-t border-border px-5 py-2 text-[13px]">
                <FileClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  {a.trayId ? <Link className="hover:underline" to={`/trays?tray=${a.trayId}`}>{a.summary}</Link> : a.patientId ? <Link className="hover:underline" to={`/patients/${a.patientId}`}>{a.summary}</Link> : a.summary}
                  <span className="block text-xs text-muted-foreground">{a.actor}, {fmtRelative(a.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <PatientFinder open={finder} onOpenChange={setFinder} requireConfirm={false} confirmLabel="Open patient record" onConfirm={(id) => navigate(`/patients/${id}`)} />
    </>
  );
}
