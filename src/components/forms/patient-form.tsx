"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, notify, Pick } from "@/components/common/ui";
import { useAppStore } from "@/store/app-store";
import type { MdsStatus, Patient } from "@/types";

const schema = z.object({
  name: z.string().trim().min(2, "Enter the patient's full name"),
  dob: z.string().min(1, "Enter a date of birth").refine((d) => new Date(d) <= new Date(), "Date of birth cannot be in the future"),
  gender: z.enum(["Female", "Male", "Other"]),
  phone: z.string().trim().min(8, "Enter a contact number"),
  address: z.string().trim().min(4, "Enter an address"),
  doctorName: z.string().trim().min(2, "Enter the doctor's name"),
  doctorClinic: z.string().trim().min(2, "Enter the clinic"),
  doctorPhone: z.string().trim(),
  caregiverName: z.string().trim(),
  caregiverRelation: z.string().trim(),
  caregiverPhone: z.string().trim(),
  emergencyName: z.string().trim().min(2, "Enter an emergency contact"),
  emergencyRelation: z.string().trim(),
  emergencyPhone: z.string().trim().min(8, "Enter the emergency contact's number"),
  conditions: z.string(),
  allergies: z.string(),
  mdsStatus: z.enum(["active", "assessment", "paused", "none"]),
  notes: z.string(),
});
type Values = z.infer<typeof schema>;

const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

const toValues = (p?: Patient): Values => ({
  name: p?.name ?? "", dob: p?.dob ?? "", gender: p?.gender ?? "Female", phone: p?.phone ?? "", address: p?.address ?? "",
  doctorName: p?.doctor.name ?? "", doctorClinic: p?.doctor.clinic ?? "", doctorPhone: p?.doctor.phone ?? "",
  caregiverName: p?.caregiver?.name ?? "", caregiverRelation: p?.caregiver?.relation ?? "", caregiverPhone: p?.caregiver?.phone ?? "",
  emergencyName: p?.emergencyContact.name ?? "", emergencyRelation: p?.emergencyContact.relation ?? "", emergencyPhone: p?.emergencyContact.phone ?? "",
  conditions: p?.conditions.join(", ") ?? "", allergies: p?.allergies.join(", ") ?? "", mdsStatus: p?.mdsStatus ?? "assessment", notes: p?.notes ?? "",
});

export function PatientForm({ open, onOpenChange, patient, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; patient?: Patient; onSaved?: (id: string) => void }) {
  const savePatient = useAppStore((s) => s.savePatient);
  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(patient) });
  useEffect(() => { if (open) reset(toValues(patient)); }, [open, patient, reset]);

  const submit = (v: Values) => {
    const r = savePatient({
      id: patient?.id, name: v.name, dob: v.dob, gender: v.gender, phone: v.phone, address: v.address,
      doctor: { name: v.doctorName, clinic: v.doctorClinic, phone: v.doctorPhone },
      caregiver: v.caregiverName ? { name: v.caregiverName, relation: v.caregiverRelation, phone: v.caregiverPhone } : undefined,
      emergencyContact: { name: v.emergencyName, relation: v.emergencyRelation, phone: v.emergencyPhone },
      conditions: splitList(v.conditions), allergies: splitList(v.allergies), mdsStatus: v.mdsStatus as MdsStatus, notes: v.notes || undefined,
    });
    if (notify(r)) { onOpenChange(false); if (r.id) onSaved?.(r.id); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{patient ? `Edit ${patient.name}` : "Add patient"}</DialogTitle>
          <DialogDescription>Use fictional details only. This demo must never hold real patient information.</DialogDescription>
        </DialogHeader>
        <form id="patient-form" onSubmit={handleSubmit(submit)} className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" error={errors.name?.message}><Input {...register("name")} /></Field>
          <Field label="Date of birth" error={errors.dob?.message}><Input type="date" {...register("dob")} /></Field>
          <Field label="Gender"><Controller control={control} name="gender" render={({ field }) => <Pick value={field.value} onChange={field.onChange} options={["Female", "Male", "Other"].map((g) => ({ value: g as Values["gender"], label: g }))} />} /></Field>
          <Field label="Contact number" error={errors.phone?.message}><Input {...register("phone")} /></Field>
          <Field label="Address" error={errors.address?.message} className="sm:col-span-2"><Input {...register("address")} /></Field>
          <Field label="Doctor" error={errors.doctorName?.message}><Input {...register("doctorName")} /></Field>
          <Field label="Clinic" error={errors.doctorClinic?.message}><Input {...register("doctorClinic")} /></Field>
          <Field label="Caregiver (optional)"><Input {...register("caregiverName")} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Relation"><Input {...register("caregiverRelation")} /></Field>
            <Field label="Phone"><Input {...register("caregiverPhone")} /></Field>
          </div>
          <Field label="Emergency contact" error={errors.emergencyName?.message}><Input {...register("emergencyName")} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Relation"><Input {...register("emergencyRelation")} /></Field>
            <Field label="Phone" error={errors.emergencyPhone?.message}><Input {...register("emergencyPhone")} /></Field>
          </div>
          <Field label="Conditions" hint="Separate with commas"><Input {...register("conditions")} /></Field>
          <Field label="Allergies" hint="Separate with commas"><Input {...register("allergies")} /></Field>
          <Field label="MDS status">
            <Controller control={control} name="mdsStatus" render={({ field }) => (
              <Pick value={field.value} onChange={field.onChange} options={[{ value: "active", label: "Active tray" }, { value: "assessment", label: "In assessment" }, { value: "paused", label: "Paused" }, { value: "none", label: "Not on trays" }]} />
            )} />
          </Field>
          <Field label="Notes"><Textarea rows={2} {...register("notes")} /></Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="patient-form">{patient ? "Save patient" : "Add patient"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
