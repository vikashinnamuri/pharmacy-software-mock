"use client";

import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, notify, Pick } from "@/components/common/ui";
import { PillArt } from "@/components/common/pill-art";
import { useAppStore } from "@/store/app-store";
import type { DosageForm, Medicine, PillShape, Suitability } from "@/types";
import { toast } from "sonner";

const FORMS: DosageForm[] = ["Tablet", "Capsule", "Caplet", "Soft gel", "Syrup", "Inhaler", "Sachet"];
const SHAPES: { value: PillShape; label: string }[] = [
  { value: "round", label: "Round tablet" }, { value: "oval", label: "Oval tablet" }, { value: "caplet", label: "Caplet" }, { value: "capsule", label: "Capsule" },
  { value: "softgel", label: "Soft gel" }, { value: "liquid", label: "Bottle" }, { value: "device", label: "Inhaler" }, { value: "sachet", label: "Sachet" },
];
const SWATCHES = ["#FFFFFF", "#F4D9A0", "#BFE3D2", "#F2B5B5", "#BCD7F5", "#D6C5F0", "#F5C451", "#E58E8E", "#7FB2E5"];

const schema = z.object({
  generic: z.string().trim().min(2, "Enter the generic name"),
  brand: z.string().trim().min(2, "Enter a brand name"),
  strength: z.string().trim().min(1, "Enter a strength"),
  form: z.enum(FORMS as [DosageForm, ...DosageForm[]]),
  manufacturer: z.string().trim().min(2, "Enter a manufacturer"),
  packSize: z.number({ error: "Enter a number" }).int().min(1, "At least 1"),
  unitPrice: z.number({ error: "Enter a number" }).min(0, "Cannot be negative"),
  reorderLevel: z.number({ error: "Enter a number" }).int().min(0, "Cannot be negative"),
  suitability: z.enum(["suitable", "review-required", "unsuitable"]),
  suitabilityNote: z.string().trim().min(3, "Add a short note"),
  shape: z.enum(["round", "oval", "capsule", "caplet", "softgel", "liquid", "device", "sachet"]),
  color: z.string(),
});
type Values = z.infer<typeof schema>;

const toValues = (m?: Medicine): Values => ({
  generic: m?.generic ?? "", brand: m?.brand ?? "", strength: m?.strength ?? "", form: m?.form ?? "Tablet", manufacturer: m?.manufacturer ?? "",
  packSize: m?.packSize ?? 30, unitPrice: m?.unitPrice ?? 1, reorderLevel: m?.reorderLevel ?? 30,
  suitability: m?.suitability ?? "review-required", suitabilityNote: m?.suitabilityNote ?? "New entry. A pharmacist decides per patient in this demo.",
  shape: m?.pill.shape ?? "round", color: m?.pill.color ?? "#FFFFFF",
});

/** Downscales an uploaded image so it fits comfortably in localStorage. */
async function toSmallDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 240 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function MedicineForm({ open, onOpenChange, medicine, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; medicine?: Medicine; onSaved?: (id: string) => void }) {
  const saveMedicine = useAppStore((s) => s.saveMedicine);
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | undefined>(medicine?.imageDataUrl);
  const { register, control, handleSubmit, reset, setValue, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(medicine) });
  const shape = useWatch({ control, name: "shape" });
  const color = useWatch({ control, name: "color" });
  const brand = useWatch({ control, name: "brand" });

  useEffect(() => {
    if (open) {
      reset(toValues(medicine));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setImage(medicine?.imageDataUrl);
    }
  }, [open, medicine, reset]);

  const submit = (v: Values) => {
    const r = saveMedicine({
      id: medicine?.id, generic: v.generic, brand: v.brand, strength: v.strength, form: v.form as DosageForm, manufacturer: v.manufacturer,
      packSize: v.packSize, unitPrice: v.unitPrice, reorderLevel: v.reorderLevel, suitability: v.suitability as Suitability, suitabilityNote: v.suitabilityNote,
      pill: { ...(medicine?.pill ?? {}), shape: v.shape as PillShape, color: v.color }, imageDataUrl: image, isUserAdded: medicine?.isUserAdded ?? true,
    });
    if (notify(r)) { onOpenChange(false); if (r.id) onSaved?.(r.id); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{medicine ? `Edit ${medicine.brand}` : "Add mock medicine"}</DialogTitle>
          <DialogDescription>A synthetic catalogue entry. Changing suitability or strength invalidates approved trays that use it.</DialogDescription>
        </DialogHeader>
        <form id="medicine-form" onSubmit={handleSubmit(submit)} className="grid gap-3 sm:grid-cols-[150px_1fr]">
          <div className="space-y-2">
            <div className="flex aspect-square items-center justify-center rounded-xl bg-muted">
              <PillArt medicine={{ brand: brand || "New medicine", pill: { shape, color }, imageDataUrl: image }} size={96} />
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="Upload image" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                try { setImage(await toSmallDataUrl(f)); } catch { toast.error("That file could not be read as an image."); }
              }
              e.target.value = "";
            }} />
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => fileRef.current?.click()}><ImagePlus /> Upload image</Button>
            {image && <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => setImage(undefined)}><X /> Use illustration</Button>}
            {!image && (
              <div className="flex flex-wrap gap-1" role="group" aria-label="Illustration colour">
                {SWATCHES.map((c) => (
                  <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={color === c} onClick={() => setValue("color", c)} className={`size-5 rounded-full border ${color === c ? "ring-2 ring-primary ring-offset-1" : "border-input"}`} style={{ background: c }} />
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Generic name" error={errors.generic?.message}><Input {...register("generic")} /></Field>
            <Field label="Brand name" error={errors.brand?.message}><Input {...register("brand")} /></Field>
            <Field label="Strength" error={errors.strength?.message}><Input placeholder="500 mg" {...register("strength")} /></Field>
            <Field label="Dosage form"><Controller control={control} name="form" render={({ field }) => <Pick value={field.value} onChange={field.onChange} options={FORMS.map((f) => ({ value: f, label: f }))} />} /></Field>
            <Field label="Manufacturer" error={errors.manufacturer?.message}><Input {...register("manufacturer")} /></Field>
            <Field label="Illustration"><Controller control={control} name="shape" render={({ field }) => <Pick value={field.value} onChange={field.onChange} options={SHAPES} />} /></Field>
            <Field label="Pack size" error={errors.packSize?.message}><Input type="number" {...register("packSize", { valueAsNumber: true })} /></Field>
            <Field label="Unit price (₹, mock)" error={errors.unitPrice?.message}><Input type="number" step="0.1" {...register("unitPrice", { valueAsNumber: true })} /></Field>
            <Field label="Reorder level" error={errors.reorderLevel?.message}><Input type="number" {...register("reorderLevel", { valueAsNumber: true })} /></Field>
            <Field label="MDS suitability review">
              <Controller control={control} name="suitability" render={({ field }) => <Pick value={field.value} onChange={field.onChange} options={[{ value: "suitable", label: "Suitable for tray" }, { value: "review-required", label: "Review required" }, { value: "unsuitable", label: "Not for trays" }]} />} />
            </Field>
            <Field label="Suitability note" error={errors.suitabilityNote?.message} className="sm:col-span-2"><Textarea rows={2} {...register("suitabilityNote")} /></Field>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="medicine-form">{medicine ? "Save medicine" : "Add medicine"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
