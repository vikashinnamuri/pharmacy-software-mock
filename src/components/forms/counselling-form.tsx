import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Field, GuardedButton, notify, Pick } from "@/components/common/ui";
import { useAppStore } from "@/store/app-store";
import type { CounsellingInput } from "@/store/orders";

export const blankCounselling = (patientId?: string, allergies = ""): CounsellingInput => ({
  patientId, forWhom: "patient", reasonType: "symptoms", symptoms: "", duration: "", otherMedicines: "", allergies, history: "", advice: "", referral: false, referralNotes: "",
});

/** Conditional fields: only what applies to this interaction is asked for. */
export function CounsellingFields({ value, onChange }: { value: CounsellingInput; onChange: (v: CounsellingInput) => void }) {
  const set = (patch: Partial<CounsellingInput>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Who is the medicine for?">
        <Pick value={value.forWhom} onChange={(v) => set({ forWhom: v })} options={[{ value: "patient", label: "The patient" }, { value: "child", label: "A child" }, { value: "other-adult", label: "Another adult" }]} />
      </Field>
      {value.forWhom !== "patient" ? <Field label="Name of the person"><Input value={value.forName ?? ""} onChange={(e) => set({ forName: e.target.value })} /></Field> : <div className="hidden sm:block" />}
      <Field label="Reason for the request">
        <Pick value={value.reasonType} onChange={(v) => set({ reasonType: v })} options={[{ value: "symptoms", label: "Symptoms" }, { value: "repeat", label: "Repeat of a regular medicine" }, { value: "advice", label: "Advice only" }]} />
      </Field>
      {value.reasonType === "symptoms" ? (
        <Field label="Duration of symptoms"><Input placeholder="2 days" value={value.duration ?? ""} onChange={(e) => set({ duration: e.target.value })} /></Field>
      ) : <div className="hidden sm:block" />}
      {value.reasonType === "symptoms" && <Field label="Symptoms" className="sm:col-span-2"><Input value={value.symptoms ?? ""} onChange={(e) => set({ symptoms: e.target.value })} /></Field>}
      <Field label="Other medicines"><Input value={value.otherMedicines ?? ""} onChange={(e) => set({ otherMedicines: e.target.value })} /></Field>
      <Field label="Allergies"><Input value={value.allergies ?? ""} onChange={(e) => set({ allergies: e.target.value })} /></Field>
      <Field label="Relevant medical history" className="sm:col-span-2"><Input value={value.history ?? ""} onChange={(e) => set({ history: e.target.value })} /></Field>
      <Field label="Pharmacist advice" className="sm:col-span-2"><Textarea rows={2} value={value.advice} onChange={(e) => set({ advice: e.target.value })} /></Field>
      <Label className="flex items-center gap-2 text-[13px] font-normal sm:col-span-2"><Checkbox checked={value.referral} onCheckedChange={(v) => set({ referral: !!v })} /> Referral to a doctor or other service</Label>
      {value.referral && <Field label="Referral notes" className="sm:col-span-2"><Textarea rows={2} value={value.referralNotes ?? ""} onChange={(e) => set({ referralNotes: e.target.value })} /></Field>}
    </div>
  );
}

export function CounsellingDialog({ open, onOpenChange, patientId, orderId }: { open: boolean; onOpenChange: (o: boolean) => void; patientId?: string; orderId?: string }) {
  const patient = useAppStore((s) => s.patients.find((p) => p.id === patientId));
  const save = useAppStore((s) => s.saveCounselling);
  const [value, setValue] = useState<CounsellingInput>(blankCounselling(patientId));
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (open) setValue({ ...blankCounselling(patientId, patient?.allergies.join(", ") ?? ""), orderId }); }, [open, patientId, orderId, patient]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pharmacy counselling record</DialogTitle>
          <DialogDescription>{patient ? `For ${patient.name}.` : ""}{orderId ? ` Linked to ${orderId}.` : ""} Only fill in what applies. Fictional information only.</DialogDescription>
        </DialogHeader>
        <CounsellingFields value={value} onChange={setValue} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <GuardedButton perm="counselling.record" what="record counselling" onClick={() => { if (notify(save(value))) onOpenChange(false); }}>Save record</GuardedButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
