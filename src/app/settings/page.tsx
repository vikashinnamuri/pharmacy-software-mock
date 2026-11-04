"use client";

import { useState } from "react";
import { Check, Minus, RotateCcw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardTitle, ConfirmDialog, Field, GuardedButton, PageHeader } from "@/components/common/ui";
import { PERMISSION_MATRIX, ROLE_LABEL, type Permission } from "@/lib/permissions";
import { useAppStore } from "@/store/app-store";
import type { Role } from "@/types";

const PERM_LABEL: Record<Permission, string> = {
  "patient.edit": "Add and edit patients",
  "rx.enter": "Enter prescriptions",
  "rx.review": "Review prescriptions",
  "tray.generate": "Generate proposed schedules",
  "tray.approveSchedule": "Approve proposed schedules",
  "tray.prepare": "Prepare compartments",
  "tray.verify": "Approve or reject trays",
  "tray.supply": "Mark trays supplied",
  "inventory.edit": "Change stock",
  "catalogue.edit": "Change the catalogue",
  "billing.edit": "Change billing",
  "reports.view": "View reports",
  "settings.edit": "Change settings",
};
const ROLES: Role[] = ["admin", "pharmacist", "dispenser"];

export default function SettingsPage() {
  const router = useRouter();
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

  return (
    <>
      <PageHeader title="Settings" description="Demo pharmacy details, role simulation and sample data." />
      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardTitle title="Pharmacy details" hint="Shown in the header and on generated documents." />
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
            <Field label="Pharmacy name" className="sm:col-span-2"><Input value={draft.pharmacyName} onChange={(e) => setDraft({ ...draft, pharmacyName: e.target.value })} /></Field>
            <Field label="Address" className="sm:col-span-2"><Input value={draft.addressLine} onChange={(e) => setDraft({ ...draft, addressLine: e.target.value })} /></Field>
            <Field label="Phone"><Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
            <Field label="GST number field (placeholder)"><Input value={draft.gstPlaceholder} onChange={(e) => setDraft({ ...draft, gstPlaceholder: e.target.value })} /></Field>
            <Field label="Default product GST %"><Input type="number" min={0} max={100} value={draft.defaultGstRate} onChange={(e) => setDraft({ ...draft, defaultGstRate: Number(e.target.value) })} /></Field>
            <Field label="Expiry warning (days)"><Input type="number" min={1} value={draft.expiryWarningDays} onChange={(e) => setDraft({ ...draft, expiryWarningDays: Number(e.target.value) })} /></Field>
            <div className="sm:col-span-2">
              <GuardedButton perm="settings.edit" what="change settings" disabled={!draft.pharmacyName.trim()} onClick={() => { updateSettings(draft); toast.success("Saved settings"); }}>Save settings</GuardedButton>
            </div>
          </div>
        </Card>
        <div className="space-y-3">
          <Card>
            <CardTitle title="Demo controls" />
            <div className="space-y-3 px-5 pb-5">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span><span className="block font-medium">Show the client walkthrough</span><span className="block text-[13px] text-muted-foreground">The 16-step guide in the corner of the screen.</span></span>
                <Switch checked={settings.tourEnabled} onCheckedChange={(v) => updateSettings({ tourEnabled: v })} />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span><span className="block font-medium">Auto-advance during preparation</span><span className="block text-[13px] text-muted-foreground">Move to the next compartment after sealing one.</span></span>
                <Switch checked={settings.autoAdvance} onCheckedChange={(v) => updateSettings({ autoAdvance: v })} />
              </label>
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <Button variant="outline" onClick={() => { updateSettings({ tourEnabled: true }); setJourneyStep(0); setJourneyOpen(true); toast.info("Walkthrough restarted at step 1"); }}>Restart walkthrough</Button>
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
        <Card className="xl:col-span-2">
          <CardTitle title="What each role can do" />
          <p className="mx-5 mb-3 flex items-center gap-2 rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn"><ShieldAlert className="size-4 shrink-0" /> These checks run only in the browser to show the workflow. They are not security controls and do not meet any regulatory standard.</p>
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[13px]">
                  <th className="py-2 font-semibold text-muted-foreground">Action</th>
                  {ROLES.map((r) => <th key={r} className="px-3 py-2 text-center font-semibold text-muted-foreground">{ROLE_LABEL[r]}</th>)}
                </tr>
              </thead>
              <tbody>
                {(Object.keys(PERM_LABEL) as Permission[]).map((p) => (
                  <tr key={p} className="border-b border-border/60 last:border-0">
                    <td className="py-1.5">{PERM_LABEL[p]}</td>
                    {ROLES.map((r) => (
                      <td key={r} className="px-3 py-1.5 text-center">
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
        description="Removes everything you added or changed in this browser and restores the original sample records. The walkthrough returns to step 1."
        confirmLabel="Reset Demo Data"
        destructive
        onConfirm={() => { resetDemo(); setDraft(useAppStore.getState().settings); toast.success("Demo data reset"); router.push("/"); }}
      />
    </>
  );
}
