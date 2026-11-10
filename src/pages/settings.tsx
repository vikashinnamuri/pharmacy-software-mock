import { useEffect, useState } from "react";
import { Check, Minus, Plus, RotateCcw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardTitle, ConfirmDialog, Field, GuardedButton, notify, PageHeader, Pick } from "@/components/common/ui";
import { PERMISSION_MATRIX, ROLE_LABEL, ROLE_SHORT, type Permission } from "@/lib/permissions";
import { useAppStore } from "@/store/app-store";
import type { BackingTemplate } from "@/types";
import { ROLES } from "@/types";

const PERM_LABEL: Record<Permission, string> = {
  "patient.edit": "Register and edit patients",
  "rx.enter": "Enter prescriptions",
  "rx.review": "Review and verify prescriptions",
  "order.create": "Create dispensing orders and tokens",
  "order.review": "Pharmacist review of orders",
  "order.payment": "Record simulated payments",
  "order.prepare": "Prepare dispensing orders",
  "order.verify": "Final pharmacist verification",
  "order.fulfil": "Hand over at collection",
  "delivery.manage": "Manage deliveries",
  "counselling.record": "Record counselling",
  "mds.enrol": "Request MDS enrolment",
  "mds.approve": "MDS suitability review and periods",
  "tray.generate": "Plan and generate MDS schedules",
  "tray.approveSchedule": "Approve proposed MDS schedules",
  "tray.prepare": "Prepare MDS compartments",
  "tray.verify": "Approve or reject MDS trays",
  "tray.supply": "Hand over MDS trays",
  "inventory.edit": "Change stock, purchases and returns",
  "catalogue.edit": "Change the medicine catalogue",
  "billing.edit": "Invoices, refunds and plans",
  "reports.view": "View reports",
  "settings.edit": "Change settings and templates",
};

function TemplateEditor() {
  const settings = useAppStore((s) => s.settings);
  const saveTemplate = useAppStore((s) => s.saveTemplate);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [id, setId] = useState(settings.defaultTemplateId);
  const current = settings.backingTemplates.find((t) => t.id === id) ?? settings.backingTemplates[0];
  const [t, setT] = useState<BackingTemplate>(current);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setT(current), [current]);
  const num = (k: keyof BackingTemplate) => (e: React.ChangeEvent<HTMLInputElement>) => setT({ ...t, [k]: Number(e.target.value) });
  return (
    <Card id="templates" className="xl:col-span-2">
      <CardTitle title="Dossett backing sheet templates" hint="Demonstration dimensions. Final printer compatibility and alignment need the selected physical tray and printer specifications." />
      <div className="grid gap-3 px-5 pb-5 md:grid-cols-[260px_1fr]">
        <div className="space-y-2">
          <Field label="Template"><Pick value={id} onChange={setId} options={settings.backingTemplates.map((x) => ({ value: x.id, label: x.name }))} /></Field>
          <GuardedButton size="sm" variant="outline" perm="settings.edit" what="add templates" onClick={() => { const n = { ...current, id: `TPL-${Date.now().toString().slice(-5)}`, name: `${current.name} (copy)` }; if (notify(saveTemplate(n))) setId(n.id); }}><Plus /> Duplicate as new</GuardedButton>
          <p className="text-xs text-muted-foreground">Default: {settings.backingTemplates.find((x) => x.id === settings.defaultTemplateId)?.name}</p>
          {id !== settings.defaultTemplateId && <GuardedButton size="sm" variant="ghost" perm="settings.edit" what="change the default" onClick={() => { updateSettings({ defaultTemplateId: id }); toast.success("Default template changed"); }}>Make default</GuardedButton>}
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Name" className="sm:col-span-4"><Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} /></Field>
          <Field label="Width (mm)"><Input type="number" value={t.widthMm} onChange={num("widthMm")} /></Field>
          <Field label="Height (mm)"><Input type="number" value={t.heightMm} onChange={num("heightMm")} /></Field>
          <Field label="Top margin"><Input type="number" value={t.marginTop} onChange={num("marginTop")} /></Field>
          <Field label="Bottom margin"><Input type="number" value={t.marginBottom} onChange={num("marginBottom")} /></Field>
          <Field label="Left margin"><Input type="number" value={t.marginLeft} onChange={num("marginLeft")} /></Field>
          <Field label="Right margin"><Input type="number" value={t.marginRight} onChange={num("marginRight")} /></Field>
          <Label className="flex items-center gap-2 text-[13px] font-normal"><Checkbox checked={t.showQr} onCheckedChange={(v) => setT({ ...t, showQr: !!v })} /> QR code</Label>
          <Label className="flex items-center gap-2 text-[13px] font-normal"><Checkbox checked={t.showIdentification} onCheckedChange={(v) => setT({ ...t, showIdentification: !!v })} /> Identification details</Label>
          <Field label="Note" className="sm:col-span-4"><Input value={t.note} onChange={(e) => setT({ ...t, note: e.target.value })} /></Field>
          <div className="sm:col-span-4"><GuardedButton perm="settings.edit" what="change templates" onClick={() => notify(saveTemplate(t))}>Save template</GuardedButton></div>
        </div>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const resetDemo = useAppStore((s) => s.resetDemo);
  const staff = useAppStore((s) => s.staff);
  const setRole = useAppStore((s) => s.setRole);
  const role = useAppStore((s) => s.role);
  const setJourneyOpen = useAppStore((s) => s.setJourneyOpen);
  const setJourneyStep = useAppStore((s) => s.setJourneyStep);
  const [draft, setDraft] = useState(settings);
  const [resetOpen, setResetOpen] = useState(false);
  useEffect(() => { if (hash) document.querySelector(hash)?.scrollIntoView({ behavior: "smooth" }); }, [hash]);

  return (
    <>
      <PageHeader title="Settings & Administration" description="Demo pharmacy details, billing defaults, document templates, role simulation and sample data." />
      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardTitle title="Pharmacy and billing" hint="Shown on documents and used for simulated charges." />
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
            <Field label="Pharmacy name" className="sm:col-span-2"><Input value={draft.pharmacyName} onChange={(e) => setDraft({ ...draft, pharmacyName: e.target.value })} /></Field>
            <Field label="Address" className="sm:col-span-2"><Input value={draft.addressLine} onChange={(e) => setDraft({ ...draft, addressLine: e.target.value })} /></Field>
            <Field label="Phone"><Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
            <Field label="GST number field (placeholder)"><Input value={draft.gstPlaceholder} onChange={(e) => setDraft({ ...draft, gstPlaceholder: e.target.value })} /></Field>
            <Field label="Medicine GST % (sample)"><Input type="number" min={0} max={100} value={draft.defaultGstRate} onChange={(e) => setDraft({ ...draft, defaultGstRate: Number(e.target.value) })} /></Field>
            <Field label="Service GST % (sample)"><Input type="number" min={0} max={100} value={draft.serviceGstRate} onChange={(e) => setDraft({ ...draft, serviceGstRate: Number(e.target.value) })} /></Field>
            <Field label="MDS weekly service fee (₹)"><Input type="number" min={0} value={draft.mdsWeeklyFee} onChange={(e) => setDraft({ ...draft, mdsWeeklyFee: Number(e.target.value) })} /></Field>
            <Field label="Delivery fee (₹)"><Input type="number" min={0} value={draft.deliveryFee} onChange={(e) => setDraft({ ...draft, deliveryFee: Number(e.target.value) })} /></Field>
            <Field label="Default token preparation time (minutes)"><Input type="number" min={5} value={draft.tokenPrepMinutes} onChange={(e) => setDraft({ ...draft, tokenPrepMinutes: Number(e.target.value) })} /></Field>
            <Field label="Near-expiry warning (days)"><Input type="number" min={1} value={draft.expiryWarningDays} onChange={(e) => setDraft({ ...draft, expiryWarningDays: Number(e.target.value) })} /></Field>
            <Field label="Delivery staff (comma separated)" className="sm:col-span-2"><Input value={draft.deliveryStaff.join(", ")} onChange={(e) => setDraft({ ...draft, deliveryStaff: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></Field>
            <div className="sm:col-span-2">
              <GuardedButton perm="settings.edit" what="change settings" disabled={!draft.pharmacyName.trim()} onClick={() => { updateSettings({ ...draft, backingTemplates: settings.backingTemplates, defaultTemplateId: settings.defaultTemplateId }); toast.success("Saved settings"); }}>Save settings</GuardedButton>
            </div>
          </div>
        </Card>
        <div className="space-y-3">
          <Card>
            <CardTitle title="Demo controls" />
            <div className="space-y-3 px-5 pb-5">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span><span className="block font-medium">Show the scenario guide</span><span className="block text-[13px] text-muted-foreground">Guided scenarios A, B and C plus the original tray tour.</span></span>
                <Switch checked={settings.tourEnabled} onCheckedChange={(v) => updateSettings({ tourEnabled: v })} />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span><span className="block font-medium">Auto-advance during preparation</span><span className="block text-[13px] text-muted-foreground">Move to the next compartment after sealing one.</span></span>
                <Switch checked={settings.autoAdvance} onCheckedChange={(v) => updateSettings({ autoAdvance: v })} />
              </label>
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <Button variant="outline" onClick={() => { updateSettings({ tourEnabled: true }); setJourneyStep(0); setJourneyOpen(true); toast.info("Scenario restarted at step 1"); }}>Restart current scenario</Button>
                <Button variant="destructive" onClick={() => setResetOpen(true)}><RotateCcw /> Reset Demo Data</Button>
              </div>
            </div>
          </Card>
          <Card>
            <CardTitle title="Sample accounts" hint="No real login exists. Pick a role to simulate it." />
            <ul className="px-5 pb-4">
              {staff.map((u) => (
                <li key={u.id} className="flex items-center gap-3 border-t border-border py-2.5">
                  <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">{u.initials}</span>
                  <span className="flex-1"><span className="block text-sm font-semibold">{u.name}</span><span className="block text-[13px] text-muted-foreground">{u.roleLabel}</span></span>
                  {role === u.role ? <span className="text-[13px] font-semibold text-primary">Current</span> : <Button size="sm" variant="outline" onClick={() => setRole(u.role)}>Switch</Button>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <TemplateEditor />
        <Card className="xl:col-span-2">
          <CardTitle title="What each role can do" />
          <p className="mx-5 mb-3 flex items-center gap-2 rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn"><ShieldAlert className="size-4 shrink-0" /> These checks run only in the browser to show the workflow. They are not security controls and do not meet any regulatory standard.</p>
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[13px]">
                  <th className="py-2 font-semibold text-muted-foreground">Action</th>
                  {ROLES.map((r) => <th key={r} className="px-2 py-2 text-center font-semibold text-muted-foreground" title={ROLE_LABEL[r]}>{ROLE_SHORT[r]}</th>)}
                </tr>
              </thead>
              <tbody>
                {(Object.keys(PERM_LABEL) as Permission[]).map((p) => (
                  <tr key={p} className="border-b border-border/60 last:border-0">
                    <td className="py-1.5">{PERM_LABEL[p]}</td>
                    {ROLES.map((r) => (
                      <td key={r} className="px-2 py-1.5 text-center">
                        {PERMISSION_MATRIX[p].includes(r)
                          ? <span className="inline-flex items-center gap-1 text-ok"><Check className="size-4" /><span className="sr-only">Yes</span></span>
                          : <span className="inline-flex text-muted-foreground/50"><Minus className="size-4" /><span className="sr-only">No</span></span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset all demo data?"
        description="Removes everything you added or changed in this browser and restores the original sample records. The scenario guide returns to step 1."
        confirmLabel="Reset Demo Data"
        destructive
        onConfirm={() => { resetDemo(); setDraft(useAppStore.getState().settings); toast.success("Demo data reset"); navigate("/"); }}
      />
    </>
  );
}
