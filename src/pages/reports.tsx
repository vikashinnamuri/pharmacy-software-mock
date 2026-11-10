
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Lock } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, EmptyState, PageHeader, Pick, Stat } from "@/components/common/ui";
import { can } from "@/lib/permissions";
import { patientRegistrations, pendingTrays, prescriptionsByStatus, revenueByMonth, verificationOutcomes, weeklyTraysPrepared } from "@/lib/reports";
import { inventoryAlerts, rupees } from "@/lib/selectors";
import { useAppStore } from "@/store/app-store";

const axis = { tickLine: false, axisLine: false, fontSize: 12 } as const;
const RX_COLOURS: Record<string, string> = { draft: "#8A97A8", pending: "#D98A1F", verified: "#0B7C7A", rejected: "#B3261E", discontinued: "#4C5A6C" };
const OUTCOME_COLOURS: Record<string, string> = { Approved: "#0B7C7A", "Correction requested": "#D98A1F", Rejected: "#B3261E", "Approval invalidated": "#7A5BB5" };

export default function ReportsPage() {
  const state = useAppStore();
  const [range, setRange] = useState("6");
  const months = Number(range);
  const reg = useMemo(() => patientRegistrations(state, months), [state, months]);
  const rx = useMemo(() => prescriptionsByStatus(state), [state]);
  const weekly = useMemo(() => weeklyTraysPrepared(state), [state]);
  const outcomes = useMemo(() => verificationOutcomes(state), [state]);
  const pending = useMemo(() => pendingTrays(state), [state]);
  const revenue = useMemo(() => revenueByMonth(state, months), [state, months]);
  const alerts = useMemo(() => inventoryAlerts(state), [state]);

  if (!can(state.role, "reports.view")) {
    return (
      <>
        <PageHeader title="Reports & Analytics" />
        <Card>
          <EmptyState
            icon={<Lock className="size-5" />}
            title="Dispensing Staff cannot open reports in this demo"
            body="Reports are for the Administrator and Pharmacist roles. This is a UI simulation, not security."
            action={<Button onClick={() => state.setRole("admin")}>Switch to Administrator</Button>}
          />
        </Card>
      </>
    );
  }

  const totalRevenue = revenue.reduce((n, r) => n + r.paid, 0);
  const pendingCount = pending.reduce((n, p) => n + p.count, 0);

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        description="Every chart reads the same records as the tables and dashboard, so it moves as you use the demo."
        actions={<Pick className="h-9 w-[150px]" value={range} onChange={setRange} options={[{ value: "3", label: "Last 3 months" }, { value: "6", label: "Last 6 months" }, { value: "8", label: "Last 8 months" }]} />}
      />
      <Card className="mb-3 grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
        <Stat label="Patients on record" value={state.patients.length} />
        <Stat label="Trays in progress" value={pendingCount} />
        <Stat label="Inventory alerts" value={alerts.low.length + alerts.expiring.length + alerts.expired.length} tone="text-warn" />
        <Stat label={`Paid in ${months} months (mock)`} value={rupees(totalRevenue)} />
      </Card>
      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardTitle title="Patient registration trend" hint="Patients on record at the end of each month" action={<Button size="sm" variant="ghost" render={<Link to="/patients" />}>Patients</Button>} />
          <div className="h-[240px] px-3 pb-3">
            <ResponsiveContainer>
              <AreaChart data={reg} margin={{ left: -18, right: 10, top: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="month" {...axis} /><YAxis allowDecimals={false} {...axis} />
                <Tooltip />
                <Area type="monotone" dataKey="total" name="On record" stroke="#0B7C7A" strokeWidth={2} fill="#0B7C7A" fillOpacity={0.12} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardTitle title="Prescriptions by status" action={<Button size="sm" variant="ghost" render={<Link to="/prescriptions" />}>Prescriptions</Button>} />
          <div className="h-[240px] px-3 pb-3">
            <ResponsiveContainer>
              <BarChart data={rx} layout="vertical" margin={{ left: 34, right: 18 }}>
                <CartesianGrid horizontal={false} stroke="var(--border)" />
                <XAxis type="number" allowDecimals={false} {...axis} /><YAxis type="category" dataKey="label" width={90} {...axis} />
                <Tooltip cursor={{ fill: "var(--accent)" }} />
                <Bar dataKey="count" name="Prescriptions" radius={[0, 5, 5, 0]} maxBarSize={24}>{rx.map((r) => <Cell key={r.status} fill={RX_COLOURS[r.status]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardTitle title="Weekly trays prepared" hint="Fully prepared trays against all trays for each week" />
          <div className="h-[240px] px-3 pb-3">
            <ResponsiveContainer>
              <BarChart data={weekly} margin={{ left: -18, right: 10, top: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="week" {...axis} /><YAxis allowDecimals={false} {...axis} />
                <Tooltip cursor={{ fill: "var(--accent)" }} />
                <Bar dataKey="total" name="All trays" fill="#C6D1D9" radius={[5, 5, 0, 0]} maxBarSize={28} />
                <Bar dataKey="prepared" name="Fully prepared" fill="#0B7C7A" radius={[5, 5, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardTitle title="Pharmacist verification outcomes" hint="All simulated decisions on record" action={<Button size="sm" variant="ghost" render={<Link to="/verification" />}>Verification</Button>} />
          <div className="h-[240px] px-3 pb-3">
            <ResponsiveContainer>
              <BarChart data={outcomes} layout="vertical" margin={{ left: 60, right: 18 }}>
                <CartesianGrid horizontal={false} stroke="var(--border)" />
                <XAxis type="number" allowDecimals={false} {...axis} /><YAxis type="category" dataKey="outcome" width={110} {...axis} />
                <Tooltip cursor={{ fill: "var(--accent)" }} />
                <Bar dataKey="count" name="Decisions" radius={[0, 5, 5, 0]} maxBarSize={24}>{outcomes.map((o) => <Cell key={o.outcome} fill={OUTCOME_COLOURS[o.outcome]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardTitle title="Pending trays" hint="Where open trays sit right now" action={<Button size="sm" variant="ghost" render={<Link to="/trays" />}>Trays</Button>} />
          <ul className="px-5 pb-4">
            {pending.map((p) => {
              const max = Math.max(1, ...pending.map((x) => x.count));
              return (
                <li key={p.label} className="flex items-center gap-3 py-1 text-[13px]">
                  <span className="w-[150px]">{p.label}</span>
                  <span className="h-2 flex-1 rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${(p.count / max) * 100}%` }} /></span>
                  <span className="w-5 text-right font-semibold">{p.count}</span>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <CardTitle title="Inventory alerts" action={<Button size="sm" variant="ghost" render={<Link to="/inventory" />}>Inventory</Button>} />
          <div className="grid grid-cols-3 gap-3 px-5 pb-3">
            <Stat label="Low stock" value={alerts.low.length} tone="text-warn" />
            <Stat label="Expiring soon" value={alerts.expiring.length} tone="text-warn" />
            <Stat label="Expired" value={alerts.expired.length} tone="text-danger" />
          </div>
          <ul className="max-h-[120px] overflow-y-auto border-t border-border px-5 py-2 text-[13px]">
            {alerts.low.map((l) => <li key={l.medicine.id} className="flex justify-between py-0.5"><span>{l.medicine.brand} {l.medicine.strength}</span><span className="text-muted-foreground">{l.free} free, reorder at {l.medicine.reorderLevel}</span></li>)}
          </ul>
        </Card>
        <Card className="xl:col-span-2">
          <CardTitle title="Mock revenue summary" hint="Simulated invoices only. No real payments are involved." action={<Button size="sm" variant="ghost" render={<Link to="/billing" />}>Billing</Button>} />
          <div className="h-[260px] px-3 pb-3">
            <ResponsiveContainer>
              <BarChart data={revenue} margin={{ left: 0, right: 10, top: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="month" {...axis} /><YAxis {...axis} tickFormatter={(v) => `₹${v}`} />
                <Tooltip cursor={{ fill: "var(--accent)" }} formatter={(v) => rupees(Number(v))} />
                <Bar dataKey="paid" name="Paid (simulated)" stackId="a" fill="#0B7C7A" maxBarSize={44} />
                <Bar dataKey="outstanding" name="Outstanding" stackId="a" fill="#D98A1F" radius={[5, 5, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </>
  );
}
