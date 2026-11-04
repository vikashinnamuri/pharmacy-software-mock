"use client";

import { useEffect, useMemo } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, notify, PERIOD_META, Pick } from "@/components/common/ui";
import { PillArt } from "@/components/common/pill-art";
import { SuitabilityBadge } from "@/components/common/status-badge";
import { addDays, today } from "@/lib/dates";
import { useAppStore } from "@/store/app-store";
import type { Frequency, Period, Prescription } from "@/types";
import { PERIODS } from "@/types";
import { FREQUENCY_LABEL } from "@/components/tray/rx-detail-dialog";

const EXPECTED: Partial<Record<Frequency, number>> = { "once-daily": 1, "twice-daily": 2, "three-times-daily": 3, "four-times-daily": 4, "at-bedtime": 1 };

const lineSchema = z.object({
  medicineId: z.string().min(1, "Choose a medicine"),
  strength: z.string().trim().min(1, "Enter a strength"),
  units: z.number({ error: "Enter a number" }).int("Use whole units").min(1, "At least 1").max(10, "Check this dose"),
  frequency: z.enum(["once-daily", "twice-daily", "three-times-daily", "four-times-daily", "at-bedtime", "weekly", "as-required", "unclear"]),
  times: z.array(z.enum(PERIODS)),
  instructions: z.string(),
  startDate: z.string().min(1, "Set a start date"),
  endDate: z.string().min(1, "Set an end date"),
}).superRefine((l, ctx) => {
  if (l.endDate < l.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date is before the start date" });
  const need = EXPECTED[l.frequency];
  if (need !== undefined && l.times.length !== need) ctx.addIssue({ code: "custom", path: ["times"], message: `${FREQUENCY_LABEL[l.frequency]} needs exactly ${need} time${need > 1 ? "s" : ""}` });
});

const schema = z.object({
  patientId: z.string().min(1, "Choose a patient"),
  prescriber: z.string().trim().min(2, "Enter the prescriber"),
  clinic: z.string().trim().min(2, "Enter the clinic"),
  issuedOn: z.string().min(1, "Set the issue date"),
  lines: z.array(lineSchema).min(1),
});
type Values = z.infer<typeof schema>;

const blankLine = (): Values["lines"][number] => ({
  medicineId: "", strength: "", units: 1, frequency: "once-daily", times: ["morning"], instructions: "",
  startDate: today(), endDate: addDays(today(), 90),
});

export function RxForm({
  open, onOpenChange, patientId, editing, amend, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patientId?: string;
  /** Edit a draft or rejected prescription. */
  editing?: Prescription;
  /** Create a new version of a verified prescription. */
  amend?: Prescription;
  onSaved?: (id: string, submitted: boolean) => void;
}) {
  const patients = useAppStore((s) => s.patients);
  const medicines = useAppStore((s) => s.medicines);
  const saveRx = useAppStore((s) => s.saveRx);
  const source = editing ?? amend;

  const defaults = useMemo<Values>(() => {
    const p = patients.find((x) => x.id === (source?.patientId ?? patientId));
    return {
      patientId: source?.patientId ?? patientId ?? "",
      prescriber: source?.prescriber ?? p?.doctor.name ?? "",
      clinic: source?.clinic ?? p?.doctor.clinic ?? "",
      issuedOn: source?.issuedOn && editing ? source.issuedOn : today(),
      lines: source
        ? source.lines.map((l) => ({ medicineId: l.medicineId, strength: l.strength, units: l.unitsPerDose ?? 1, frequency: l.frequency, times: l.times, instructions: l.instructions, startDate: l.startDate, endDate: l.endDate }))
        : [blankLine()],
    };
  }, [source, editing, patientId, patients]);

  const { register, control, handleSubmit, reset, setValue, getValues, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const watched = useWatch({ control, name: "lines" });
  const watchedPatient = useWatch({ control, name: "patientId" });
  const patient = patients.find((p) => p.id === watchedPatient);

  useEffect(() => { if (open) reset(defaults); }, [open, defaults, reset]);

  const onPatient = (id: string) => {
    setValue("patientId", id, { shouldValidate: true });
    const p = patients.find((x) => x.id === id);
    if (p) { setValue("prescriber", p.doctor.name); setValue("clinic", p.doctor.clinic); }
  };

  const save = (submitForReview: boolean) => (v: Values) => {
    const r = saveRx({
      id: editing?.id, patientId: v.patientId, prescriber: v.prescriber, clinic: v.clinic, issuedOn: v.issuedOn, supersedes: amend?.id,
      lines: v.lines.map((l) => {
        const med = medicines.find((m) => m.id === l.medicineId);
        return {
          medicineId: l.medicineId, strength: l.strength, unitsPerDose: l.units,
          dosage: `${l.units} ${med?.form.toLowerCase() ?? "unit"}${l.units > 1 ? "s" : ""}`,
          frequency: l.frequency, times: l.times as Period[], instructions: l.instructions, startDate: l.startDate, endDate: l.endDate,
        };
      }),
    }, submitForReview);
    if (notify(r)) { onOpenChange(false); if (r.id) onSaved?.(r.id, submitForReview); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.id}` : amend ? `Amend ${amend.id}` : "Add prescription"}</DialogTitle>
          <DialogDescription>
            {amend ? "The new version replaces this one only after a pharmacist verifies it. Any approved tray built from the old version then loses its approval." : "Enter what is written on the script. A pharmacist reviews it before it can reach a tray."}
          </DialogDescription>
        </DialogHeader>
        <form id="rx-form" className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Patient" error={errors.patientId?.message}>
              <Pick value={watchedPatient} onChange={onPatient} placeholder="Select patient" options={patients.map((p) => ({ value: p.id, label: `${p.name} (${p.id})` }))} />
            </Field>
            <Field label="Issued on" error={errors.issuedOn?.message}><Input type="date" {...register("issuedOn")} /></Field>
            <Field label="Prescriber" error={errors.prescriber?.message}><Input {...register("prescriber")} /></Field>
            <Field label="Clinic" error={errors.clinic?.message}><Input {...register("clinic")} /></Field>
          </div>
          {patient && patient.allergies.length > 0 && (
            <p className="flex items-center gap-1.5 rounded-lg bg-danger-bg px-3 py-2 text-[13px] font-semibold text-danger"><AlertTriangle className="size-4" /> Allergy on record: {patient.allergies.join(", ")}</p>
          )}
          <div className="space-y-3">
            {fields.map((f, i) => {
              const line = watched?.[i];
              const med = medicines.find((m) => m.id === line?.medicineId);
              const lineErrors = errors.lines?.[i];
              return (
                <div key={f.id} className="rounded-xl border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="flex items-center gap-2 text-[13px] font-semibold">
                      {med && <PillArt medicine={med} size={26} />} Medicine {i + 1} {med && <SuitabilityBadge status={med.suitability} />}
                    </p>
                    {fields.length > 1 && <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove medicine ${i + 1}`} onClick={() => remove(i)}><Trash2 /></Button>}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-6">
                    <Field label="Medicine" error={lineErrors?.medicineId?.message} className="sm:col-span-3">
                      <Pick
                        value={line?.medicineId}
                        placeholder="Select medicine"
                        onChange={(v) => {
                          setValue(`lines.${i}.medicineId`, v, { shouldValidate: true });
                          const m = medicines.find((x) => x.id === v);
                          if (m) setValue(`lines.${i}.strength`, m.strength, { shouldValidate: true });
                        }}
                        options={medicines.map((m) => ({ value: m.id, label: `${m.brand} ${m.strength} (${m.generic})` }))}
                      />
                    </Field>
                    <Field label="Strength" error={lineErrors?.strength?.message} className="sm:col-span-1"><Input {...register(`lines.${i}.strength`)} /></Field>
                    <Field label="Units per dose" error={lineErrors?.units?.message} className="sm:col-span-2"><Input type="number" min={1} step={1} {...register(`lines.${i}.units`, { valueAsNumber: true })} /></Field>
                    <Field label="Frequency" className="sm:col-span-3">
                      <Controller control={control} name={`lines.${i}.frequency`} render={({ field }) => (
                        <Pick value={field.value} onChange={(v) => {
                          field.onChange(v);
                          if (v === "at-bedtime") setValue(`lines.${i}.times`, ["bedtime"], { shouldValidate: true });
                          if (v === "as-required" || v === "unclear" || v === "weekly") setValue(`lines.${i}.times`, [], { shouldValidate: true });
                        }} options={(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((k) => ({ value: k, label: FREQUENCY_LABEL[k] }))} />
                      )} />
                    </Field>
                    <Field label="Administration times" error={(lineErrors?.times as { message?: string } | undefined)?.message} className="sm:col-span-3">
                      <Controller control={control} name={`lines.${i}.times`} render={({ field }) => (
                        <div className="grid grid-cols-2 gap-1">
                          {PERIODS.map((p) => {
                            const on = field.value?.includes(p);
                            const M = PERIOD_META[p];
                            return (
                              <Label key={p} className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1.5 text-[13px] font-normal ${on ? "border-primary bg-accent" : "border-input"}`}>
                                <Checkbox checked={!!on} onCheckedChange={(v) => field.onChange(v ? PERIODS.filter((x) => field.value?.includes(x) || x === p) : field.value.filter((x: Period) => x !== p))} />
                                <M.icon className={`size-3.5 ${M.tint}`} /> {M.label}
                              </Label>
                            );
                          })}
                        </div>
                      )} />
                    </Field>
                    <Field label="Start date" className="sm:col-span-2" error={lineErrors?.startDate?.message}><Input type="date" {...register(`lines.${i}.startDate`)} /></Field>
                    <Field label="End date" className="sm:col-span-2" error={lineErrors?.endDate?.message}><Input type="date" {...register(`lines.${i}.endDate`)} /></Field>
                    <Field label="Instructions" className="sm:col-span-2"><Input placeholder="With food" {...register(`lines.${i}.instructions`)} /></Field>
                  </div>
                  {med?.suitability === "unsuitable" && (
                    <p className="mt-2 flex gap-1.5 text-[13px] text-danger"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {med.suitabilityNote}</p>
                  )}
                  {(line?.frequency === "unclear" || line?.frequency === "as-required" || line?.frequency === "weekly") && (
                    <p className="mt-2 flex gap-1.5 text-[13px] text-warn"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> This line will show as Requires Pharmacist Review and stay out of any tray.</p>
                  )}
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={() => {
              const last = getValues("lines").at(-1);
              append({ ...blankLine(), startDate: last?.startDate ?? today(), endDate: last?.endDate ?? addDays(today(), 90) });
            }}><Plus /> Add another medicine</Button>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="secondary" onClick={handleSubmit(save(false))}>Save draft</Button>
          <Button onClick={handleSubmit(save(true))}>Submit for Review</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
