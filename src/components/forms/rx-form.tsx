import { useEffect, useMemo } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Plus, Trash2, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, notify, PERIOD_META, Pick } from "@/components/common/ui";
import { MedicineCombobox } from "@/components/common/medicine-combobox";
import { PillArt } from "@/components/common/pill-art";
import { SuitabilityBadge } from "@/components/common/status-badge";
import { addDays, DAY_NAMES, daysBetween, today } from "@/lib/dates";
import { enrolmentFor } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { Frequency, MealRelation, Period, Prescription } from "@/types";
import { ALL_PERIODS, isBf } from "@/types";
import { FREQUENCY_LABEL } from "@/components/tray/rx-detail-dialog";

const EXPECTED: Partial<Record<Frequency, number>> = { "once-daily": 1, "twice-daily": 2, "three-times-daily": 3, "four-times-daily": 4, "at-bedtime": 1 };
const MEAL: { value: MealRelation; label: string }[] = [
  { value: "none", label: "No meal instruction" }, { value: "before-food", label: "Before food" }, { value: "with-food", label: "With food" }, { value: "after-food", label: "After food" },
];

const lineSchema = z.object({
  medicineId: z.string().min(1, "Choose a medicine"),
  strength: z.string().trim().min(1, "Enter a strength"),
  units: z.number({ error: "Enter a number" }).int("Use whole units").min(1, "At least 1").max(10, "Check this dose"),
  frequency: z.enum(["once-daily", "twice-daily", "three-times-daily", "four-times-daily", "at-bedtime", "weekly", "as-required", "unclear"]),
  times: z.array(z.enum(ALL_PERIODS)),
  days: z.array(z.number().int().min(0).max(6)),
  mealRelation: z.enum(["none", "before-food", "with-food", "after-food"]),
  quantity: z.number({ error: "Enter a quantity" }).int().min(1, "At least 1"),
  durationDays: z.number({ error: "Enter days" }).int().min(1, "At least 1 day").max(366, "Check the duration"),
  instructions: z.string(),
  startDate: z.string().min(1, "Set a start date"),
  endDate: z.string().min(1, "Set an end date"),
}).superRefine((l, ctx) => {
  if (l.endDate < l.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date is before the start date" });
  const need = EXPECTED[l.frequency];
  if (need !== undefined && l.times.length !== need) ctx.addIssue({ code: "custom", path: ["times"], message: `${FREQUENCY_LABEL[l.frequency]} needs exactly ${need} time${need > 1 ? "s" : ""}` });
  if (l.frequency === "weekly" && l.days.length !== 1) ctx.addIssue({ code: "custom", path: ["days"], message: "A weekly medicine needs exactly one day" });
  if (l.frequency === "weekly" && l.times.length !== 1) ctx.addIssue({ code: "custom", path: ["times"], message: "Choose the one time it is taken" });
  if (l.times.some(isBf) && l.mealRelation !== "before-food") ctx.addIssue({ code: "custom", path: ["mealRelation"], message: "A Before Food period needs the Before food instruction" });
});

const schema = z.object({
  patientId: z.string().min(1, "Choose a patient"),
  prescriber: z.string().trim().min(2, "Enter the prescriber"),
  clinic: z.string().trim().min(2, "Enter the clinic"),
  issuedOn: z.string().min(1, "Set the issue date"),
  lines: z.array(lineSchema).min(1),
});
type Values = z.infer<typeof schema>;
type LineValues = Values["lines"][number];

const blankLine = (): LineValues => ({
  medicineId: "", strength: "", units: 1, frequency: "once-daily", times: ["morning"], days: [], mealRelation: "none", quantity: 28, durationDays: 28, instructions: "",
  startDate: today(), endDate: addDays(today(), 27),
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
  const enrolments = useAppStore((s) => s.enrolments);
  const saveRx = useAppStore((s) => s.saveRx);
  const source = editing ?? amend;

  const defaults = useMemo<Values>(() => {
    const p = patients.find((x) => x.id === (source?.patientId ?? patientId));
    return {
      patientId: source?.patientId ?? p?.id ?? "",
      prescriber: source?.prescriber ?? p?.doctor.name ?? "",
      clinic: source?.clinic ?? p?.doctor.clinic ?? "",
      issuedOn: source?.issuedOn && editing ? source.issuedOn : today(),
      lines: source
        ? source.lines.map((l) => ({
          medicineId: l.medicineId, strength: l.strength, units: l.unitsPerDose ?? 1, frequency: l.frequency, times: l.times, days: l.days ?? [],
          mealRelation: l.mealRelation ?? "none", quantity: l.quantity ?? (l.unitsPerDose ?? 1) * Math.max(1, l.times.length) * 28,
          durationDays: l.durationDays ?? Math.max(1, daysBetween(l.startDate, l.endDate) + 1), instructions: l.instructions, startDate: l.startDate, endDate: l.endDate,
        }))
        : [blankLine()],
    };
  }, [source, editing, patientId, patients]);

  const { register, control, handleSubmit, reset, setValue, getValues, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const watched = useWatch({ control, name: "lines" });
  const watchedPatient = useWatch({ control, name: "patientId" });
  const patient = patients.find((p) => p.id === watchedPatient);
  const approved = enrolmentFor({ enrolments }, watchedPatient)?.approvedPeriods ?? [];

  useEffect(() => { if (open) reset(defaults); }, [open, defaults, reset]);

  const onPatient = (id: string) => {
    setValue("patientId", id, { shouldValidate: true });
    const p = patients.find((x) => x.id === id);
    if (p) { setValue("prescriber", p.doctor.name); setValue("clinic", p.doctor.clinic); }
  };
  const recalcQty = (i: number) => {
    const l = getValues(`lines.${i}`);
    const perDay = l.frequency === "weekly" ? 1 / 7 : Math.max(1, l.times.length);
    if (l.frequency !== "as-required" && l.frequency !== "unclear") setValue(`lines.${i}.quantity`, Math.max(1, Math.ceil(l.units * perDay * l.durationDays)), { shouldValidate: true });
  };

  const save = (submitForReview: boolean) => (v: Values) => {
    const r = saveRx({
      id: editing?.id, patientId: v.patientId, prescriber: v.prescriber, clinic: v.clinic, issuedOn: v.issuedOn, supersedes: amend?.id,
      lines: v.lines.map((l) => {
        const med = medicines.find((m) => m.id === l.medicineId);
        return {
          medicineId: l.medicineId, strength: l.strength, unitsPerDose: l.units,
          dosage: `${l.units} ${med?.form.toLowerCase() ?? "unit"}${l.units > 1 ? "s" : ""}`,
          frequency: l.frequency, times: l.times as Period[], days: l.days.length && l.days.length < 7 ? [...l.days].sort() : undefined,
          mealRelation: l.mealRelation, quantity: l.quantity, durationDays: l.durationDays,
          instructions: l.instructions, startDate: l.startDate, endDate: l.endDate,
        };
      }),
    }, submitForReview);
    if (notify(r)) { onOpenChange(false); if (r.id) onSaved?.(r.id, submitForReview); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.id}` : amend ? `Amend ${amend.id} (new version)` : "New prescription"}</DialogTitle>
          <DialogDescription>
            {amend ? "The new version replaces this one only after a pharmacist verifies it. The earlier version is kept. Planned MDS weeks built from it are flagged for review." : "Enter what is written on the script. A pharmacist reviews it before it can be dispensed or reach a tray."}
          </DialogDescription>
        </DialogHeader>
        <form id="rx-form" className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Patient" error={errors.patientId?.message} className="sm:col-span-2">
              <Pick value={watchedPatient} onChange={onPatient} placeholder="Select patient" options={patients.map((p) => ({ value: p.id, label: `${p.name} (${p.id})` }))} />
            </Field>
            <Field label="Issued on" error={errors.issuedOn?.message}><Input type="date" {...register("issuedOn")} /></Field>
            <div />
            <Field label="Prescriber" error={errors.prescriber?.message} className="sm:col-span-2"><Input {...register("prescriber")} /></Field>
            <Field label="Clinic" error={errors.clinic?.message} className="sm:col-span-2"><Input {...register("clinic")} /></Field>
          </div>
          {patient && patient.allergies.length > 0 && (
            <p className="flex items-center gap-1.5 rounded-lg bg-danger-bg px-3 py-2 text-[13px] font-semibold text-danger"><AlertTriangle className="size-4" /> Allergy on record: {patient.allergies.join(", ")}</p>
          )}
          <div className="space-y-3">
            {fields.map((f, i) => {
              const line = watched?.[i];
              const med = medicines.find((m) => m.id === line?.medicineId);
              const lineErrors = errors.lines?.[i];
              const showTimes = line?.frequency !== "as-required" && line?.frequency !== "unclear";
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
                      <MedicineCombobox value={line?.medicineId} invalid={!!lineErrors?.medicineId} onChange={(v) => {
                        setValue(`lines.${i}.medicineId`, v, { shouldValidate: true });
                        const m = medicines.find((x) => x.id === v);
                        if (m) setValue(`lines.${i}.strength`, m.strength, { shouldValidate: true });
                      }} />
                    </Field>
                    <Field label="Strength" error={lineErrors?.strength?.message}><Input {...register(`lines.${i}.strength`)} /></Field>
                    <Field label="Dose (units)" error={lineErrors?.units?.message}><Input type="number" min={1} step={1} {...register(`lines.${i}.units`, { valueAsNumber: true, onChange: () => recalcQty(i) })} /></Field>
                    <Field label="Frequency">
                      <Controller control={control} name={`lines.${i}.frequency`} render={({ field }) => (
                        <Pick value={field.value} onChange={(v) => {
                          field.onChange(v);
                          if (v === "at-bedtime") setValue(`lines.${i}.times`, ["bedtime"], { shouldValidate: true });
                          if (v === "as-required" || v === "unclear") { setValue(`lines.${i}.times`, [], { shouldValidate: true }); setValue(`lines.${i}.days`, []); }
                          if (v === "weekly" && !getValues(`lines.${i}.times`).length) setValue(`lines.${i}.times`, ["morning"]);
                          if (v !== "weekly") setValue(`lines.${i}.days`, []);
                          recalcQty(i);
                        }} options={(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((k) => ({ value: k, label: FREQUENCY_LABEL[k] }))} />
                      )} />
                    </Field>
                    {showTimes && (
                      <Field label="Administration schedule" error={(lineErrors?.times as { message?: string } | undefined)?.message} className="sm:col-span-6">
                        <Controller control={control} name={`lines.${i}.times`} render={({ field }) => (
                          <div className="grid gap-1 sm:grid-cols-4 lg:grid-cols-7">
                            {ALL_PERIODS.map((p) => {
                              const on = field.value?.includes(p);
                              const M = PERIOD_META[p];
                              const needsApproval = M.bf && !approved.includes(p);
                              return (
                                <Label key={p} title={needsApproval ? "Needs approval on this patient's MDS enrolment before it can go in a tray" : undefined} className={cn("flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1.5 text-[12.5px] font-normal", on ? "border-primary bg-accent" : "border-input", M.bf && !on && "border-dashed")}>
                                  <Checkbox checked={!!on} onCheckedChange={(v) => {
                                    const next = v ? ALL_PERIODS.filter((x) => field.value?.includes(x) || x === p) : field.value.filter((x: Period) => x !== p);
                                    field.onChange(next);
                                    if (v && M.bf) setValue(`lines.${i}.mealRelation`, "before-food", { shouldValidate: true });
                                    recalcQty(i);
                                  }} />
                                  <M.icon className={`size-3.5 ${M.tint}`} /> {M.short}{needsApproval && <span className="text-[10.5px] text-warn">*</span>}
                                </Label>
                              );
                            })}
                          </div>
                        )} />
                      </Field>
                    )}
                    {line?.frequency === "weekly" && (
                      <Field label="Day of the week" error={(lineErrors?.days as { message?: string } | undefined)?.message} className="sm:col-span-6">
                        <Controller control={control} name={`lines.${i}.days`} render={({ field }) => (
                          <div className="flex flex-wrap gap-1">
                            {DAY_NAMES.map((d, n) => (
                              <Button key={d} type="button" size="sm" variant={field.value?.includes(n) ? "default" : "outline"} onClick={() => field.onChange([n])}>{d}</Button>
                            ))}
                          </div>
                        )} />
                      </Field>
                    )}
                    {showTimes && line?.frequency !== "weekly" && (
                      <Field label="Days of the week" hint={line?.days?.length ? undefined : "Every day unless you pick specific days"} className="sm:col-span-3">
                        <Controller control={control} name={`lines.${i}.days`} render={({ field }) => (
                          <div className="flex flex-wrap gap-1">
                            {DAY_NAMES.map((d, n) => {
                              const on = !field.value?.length || field.value.includes(n);
                              return (
                                <Button key={d} type="button" size="xs" variant={on ? "secondary" : "outline"} className={cn(!on && "text-muted-foreground")} onClick={() => {
                                  const cur = field.value?.length ? field.value : [0, 1, 2, 3, 4, 5, 6];
                                  const next = cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n].sort();
                                  field.onChange(next.length === 7 ? [] : next);
                                }}>{d}</Button>
                              );
                            })}
                          </div>
                        )} />
                      </Field>
                    )}
                    <Field label="Meal relation" error={lineErrors?.mealRelation?.message} className={showTimes && line?.frequency !== "weekly" ? "sm:col-span-3" : "sm:col-span-2"}>
                      <Controller control={control} name={`lines.${i}.mealRelation`} render={({ field }) => <Pick value={field.value} onChange={field.onChange} options={MEAL} />} />
                    </Field>
                    <Field label="Quantity to supply" error={lineErrors?.quantity?.message}><Input type="number" min={1} {...register(`lines.${i}.quantity`, { valueAsNumber: true })} /></Field>
                    <Field label="Duration (days)" error={lineErrors?.durationDays?.message}>
                      <Input type="number" min={1} {...register(`lines.${i}.durationDays`, {
                        valueAsNumber: true,
                        onChange: (e) => { const n = Number(e.target.value); if (n > 0) setValue(`lines.${i}.endDate`, addDays(getValues(`lines.${i}.startDate`), n - 1)); recalcQty(i); },
                      })} />
                    </Field>
                    <Field label="Start date" error={lineErrors?.startDate?.message}><Input type="date" {...register(`lines.${i}.startDate`, { onChange: (e) => setValue(`lines.${i}.endDate`, addDays(e.target.value, (getValues(`lines.${i}.durationDays`) || 1) - 1)) })} /></Field>
                    <Field label="End date" error={lineErrors?.endDate?.message}><Input type="date" {...register(`lines.${i}.endDate`, { onChange: (e) => { const d = daysBetween(getValues(`lines.${i}.startDate`), e.target.value) + 1; if (d > 0) setValue(`lines.${i}.durationDays`, d); } })} /></Field>
                    <Field label="Additional instructions" className="sm:col-span-2"><Input placeholder="Swallow whole" {...register(`lines.${i}.instructions`)} /></Field>
                  </div>
                  {line?.times?.some((t) => isBf(t) && !approved.includes(t)) && (
                    <p className="mt-2 flex gap-1.5 text-[13px] text-warn"><Utensils className="mt-0.5 size-3.5 shrink-0" /> * This Before Food period is not approved on the patient's MDS enrolment yet. It can be dispensed, but it stays out of any tray until a pharmacist approves the period.</p>
                  )}
                  {med?.suitability === "unsuitable" && (
                    <p className="mt-2 flex gap-1.5 text-[13px] text-danger"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {med.suitabilityNote}</p>
                  )}
                  {(line?.frequency === "unclear" || line?.frequency === "as-required") && (
                    <p className="mt-2 flex gap-1.5 text-[13px] text-warn"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> This line will show as Requires Pharmacist Review and stay out of any tray.</p>
                  )}
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={() => {
              const last = getValues("lines").at(-1);
              append({ ...blankLine(), startDate: last?.startDate ?? today(), endDate: last?.endDate ?? addDays(today(), 27), durationDays: last?.durationDays ?? 28 });
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
