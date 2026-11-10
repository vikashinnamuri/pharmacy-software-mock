import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Field, notify, Pick } from "@/components/common/ui";
import { today } from "@/lib/dates";
import { useAppStore } from "@/store/app-store";
import type { Patient } from "@/types";

const schema = z.object({
  name: z.string().trim().min(2, "Enter the patient's full name"),
  dob: z.string().min(1, "Enter a date of birth").refine((d) => new Date(d) <= new Date(), "Date of birth cannot be in the future"),
  gender: z.enum(["Female", "Male", "Other", "Not stated"]),
  phone: z.string().trim().regex(/^[+\d][\d\s-]{7,}$/, "Enter a mobile number with at least 8 digits"),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email or leave it blank")]),
  address: z.string().trim().min(4, "Enter a residential address"),
  doctorName: z.string().trim().min(2, "Enter the doctor or prescriber"),
  doctorClinic: z.string().trim().min(2, "Enter the clinic"),
  doctorPhone: z.string().trim(),
  caregiverName: z.string().trim(),
  caregiverRelation: z.string().trim(),
  caregiverPhone: z.string().trim(),
  repName: z.string().trim(),
  repRelation: z.string().trim(),
  repPhone: z.string().trim(),
  emergencyName: z.string().trim().min(2, "Enter an emergency contact"),
  emergencyRelation: z.string().trim(),
  emergencyPhone: z.string().trim().min(8, "Enter the emergency contact's number"),
  conditions: z.string(),
  allergies: z.string(),
  noAllergies: z.boolean(),
  reportedMedication: z.string(),
  consentGiven: z.boolean().refine((v) => v, "Consent is needed to hold this record"),
  consentBy: z.enum(["patient", "caregiver", "representative"]),
  notes: z.string(),
}).superRefine((v, ctx) => {
  if (!v.noAllergies && !v.allergies.trim()) ctx.addIssue({ code: "custom", path: ["allergies"], message: "List known allergies, or tick No known allergies" });
  if (v.consentBy === "caregiver" && !v.caregiverName) ctx.addIssue({ code: "custom", path: ["caregiverName"], message: "Name the caregiver who gave consent" });
  if (v.consentBy === "representative" && !v.repName) ctx.addIssue({ code: "custom", path: ["repName"], message: "Name the authorised representative" });
});
type Values = z.infer<typeof schema>;

const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

const toValues = (p?: Patient): Values => ({
  name: p?.name ?? "", dob: p?.dob ?? "", gender: p?.gender ?? "Female", phone: p?.phone ?? "", email: p?.email ?? "", address: p?.address ?? "",
  doctorName: p?.doctor.name ?? "", doctorClinic: p?.doctor.clinic ?? "", doctorPhone: p?.doctor.phone ?? "",
  caregiverName: p?.caregiver?.name ?? "", caregiverRelation: p?.caregiver?.relation ?? "", caregiverPhone: p?.caregiver?.phone ?? "",
  repName: p?.representative?.name ?? "", repRelation: p?.representative?.relation ?? "", repPhone: p?.representative?.phone ?? "",
  emergencyName: p?.emergencyContact.name ?? "", emergencyRelation: p?.emergencyContact.relation ?? "", emergencyPhone: p?.emergencyContact.phone ?? "",
  conditions: p?.conditions.join(", ") ?? "", allergies: p?.allergies.join(", ") ?? "", noAllergies: p ? p.allergies.length === 0 : false,
  reportedMedication: p?.reportedMedication ?? "", consentGiven: p?.consent.given ?? false, consentBy: p?.consent.by ?? "patient", notes: p?.notes ?? "",
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
      <legend className="mb-1 text-[13px] font-semibold text-primary">{title}</legend>
      {children}
    </fieldset>
  );
}

export function PatientForm({ open, onOpenChange, patient, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; patient?: Patient; onSaved?: (id: string, isNew: boolean) => void }) {
  const savePatient = useAppStore((s) => s.savePatient);
  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(patient) });
  const noAllergies = useWatch({ control, name: "noAllergies" });
  useEffect(() => { if (open) reset(toValues(patient)); }, [open, patient, reset]);

  const submit = (v: Values) => {
    const r = savePatient({
      id: patient?.id, name: v.name, dob: v.dob, gender: v.gender, phone: v.phone, email: v.email || undefined, address: v.address,
      doctor: { name: v.doctorName, clinic: v.doctorClinic, phone: v.doctorPhone },
      caregiver: v.caregiverName ? { name: v.caregiverName, relation: v.caregiverRelation, phone: v.caregiverPhone } : undefined,
      representative: v.repName ? { name: v.repName, relation: v.repRelation, phone: v.repPhone } : undefined,
      emergencyContact: { name: v.emergencyName, relation: v.emergencyRelation, phone: v.emergencyPhone },
      conditions: splitList(v.conditions), allergies: v.noAllergies ? [] : splitList(v.allergies),
      reportedMedication: v.reportedMedication.trim() || "None reported at registration.",
      consent: { given: v.consentGiven, by: v.consentBy, recordedOn: patient?.consent.recordedOn ?? today() },
      notes: v.notes || undefined,
    });
    if (notify(r)) { onOpenChange(false); if (r.id) onSaved?.(r.id, !patient); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{patient ? `Edit ${patient.name}` : "Register new patient"}</DialogTitle>
          <DialogDescription>{patient ? `${patient.id}. The patient ID and QR code never change.` : "A permanent patient ID and QR code are issued on saving. Use fictional details only."} MDS enrolment is a separate step on the patient record.</DialogDescription>
        </DialogHeader>
        <form id="patient-form" onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2">
          <Section title="Patient">
            <Field label="Full name" error={errors.name?.message}><Input {...register("name")} /></Field>
            <Field label="Date of birth" error={errors.dob?.message}><Input type="date" {...register("dob")} /></Field>
            <Field label="Gender (where relevant)"><Controller control={control} name="gender" render={({ field }) => <Pick value={field.value} onChange={field.onChange} options={(["Female", "Male", "Other", "Not stated"] as const).map((g) => ({ value: g, label: g }))} />} /></Field>
            <Field label="Mobile number" error={errors.phone?.message}><Input inputMode="tel" {...register("phone")} /></Field>
            <Field label="Email (optional)" error={errors.email?.message}><Input type="email" {...register("email")} /></Field>
            <Field label="Residential address" error={errors.address?.message}><Input {...register("address")} /></Field>
          </Section>
          <Section title="Doctor or prescriber">
            <Field label="Doctor" error={errors.doctorName?.message}><Input {...register("doctorName")} /></Field>
            <Field label="Clinic" error={errors.doctorClinic?.message}><Input {...register("doctorClinic")} /></Field>
          </Section>
          <Section title="Clinical background">
            <Field label="Medical conditions" hint="Separate with commas"><Input {...register("conditions")} /></Field>
            <div className="space-y-1.5">
              <Field label="Known allergies" hint={noAllergies ? undefined : "Separate with commas"} error={errors.allergies?.message}><Input disabled={noAllergies} {...register("allergies")} /></Field>
              <Controller control={control} name="noAllergies" render={({ field }) => (
                <Label className="flex items-center gap-2 text-[13px] font-normal"><Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} /> No known allergies</Label>
              )} />
            </div>
            <Field label="Existing medication history (as reported)" hint="What the patient says they take. Kept apart from authorised prescriptions." className="sm:col-span-2"><Textarea rows={2} {...register("reportedMedication")} /></Field>
          </Section>
          <Section title="Caregiver, representative and emergency contact">
            <Field label="Caregiver (optional)" error={errors.caregiverName?.message}><Input {...register("caregiverName")} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Relation"><Input {...register("caregiverRelation")} /></Field>
              <Field label="Phone"><Input {...register("caregiverPhone")} /></Field>
            </div>
            <Field label="Authorised representative (optional)" hint="May collect or act for the patient." error={errors.repName?.message}><Input {...register("repName")} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Relation"><Input {...register("repRelation")} /></Field>
              <Field label="Phone"><Input {...register("repPhone")} /></Field>
            </div>
            <Field label="Emergency contact" error={errors.emergencyName?.message}><Input {...register("emergencyName")} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Relation"><Input {...register("emergencyRelation")} /></Field>
              <Field label="Phone" error={errors.emergencyPhone?.message}><Input {...register("emergencyPhone")} /></Field>
            </div>
          </Section>
          <Section title="Consent">
            <Field label="Consent given by"><Controller control={control} name="consentBy" render={({ field }) => <Pick value={field.value} onChange={field.onChange} options={[{ value: "patient", label: "Patient" }, { value: "caregiver", label: "Caregiver" }, { value: "representative", label: "Authorised representative" }]} />} /></Field>
            <div className="space-y-1">
              <Controller control={control} name="consentGiven" render={({ field }) => (
                <Label className="mt-6 flex cursor-pointer items-start gap-2 text-[13px] font-normal"><Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} className="mt-0.5" /> Consent recorded to hold this pharmacy record (simulated)</Label>
              )} />
              {errors.consentGiven && <p className="text-xs text-danger">{errors.consentGiven.message}</p>}
            </div>
            <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} {...register("notes")} /></Field>
          </Section>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="patient-form">{patient ? "Save patient" : "Register and issue ID"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
