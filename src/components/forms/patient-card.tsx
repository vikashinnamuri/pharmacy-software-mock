import { useNavigate } from "react-router";
import { FilePlus2, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PdfPreviewDialog } from "@/components/common/pdf-preview";
import { QrCode } from "@/components/common/qr-code";
import { patientCardPdf } from "@/lib/pdf/documents";
import { useAppStore } from "@/store/app-store";

/** Printable patient card. Shown straight after registration and from the patient record. */
export function PatientCardDialog({ patientId, onClose, justRegistered }: { patientId: string | null; onClose: () => void; justRegistered?: boolean }) {
  const navigate = useNavigate();
  const state = useAppStore();
  const patient = state.patients.find((p) => p.id === patientId);
  if (!patient) return null;
  return (
    <PdfPreviewDialog
      open={!!patientId}
      onOpenChange={(o) => !o && onClose()}
      title={justRegistered ? `Registered ${patient.name}` : `Patient card for ${patient.name}`}
      description="The QR code holds only the card code. It reveals no medical information."
      build={() => patientCardPdf(useAppStore.getState(), patient)}
      filename={`Patient-Card-${patient.id}-DEMO.pdf`}
      onOutput={(verb) => state.logDocument("patient-card", "Patient card", verb, patient.id, patient.id)}
    >
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-muted/40 p-4">
        <QrCode value={patient.qrToken} size={104} />
        <div className="min-w-[180px] flex-1">
          <p className="text-xs text-muted-foreground">Permanent patient ID</p>
          <p className="text-2xl font-bold tracking-tight">{patient.id}</p>
          <p className="mt-1 text-[13px]">Card code <code className="rounded bg-card px-1.5 py-0.5 font-semibold">{patient.qrToken}</code></p>
          <p className="text-xs text-muted-foreground">Searchable everywhere by ID, name and date of birth, mobile number or this code.</p>
        </div>
        {justRegistered && (
          <div className="flex flex-col gap-2">
            <Button size="sm" variant="outline" onClick={() => { onClose(); navigate(`/prescriptions?new=${patient.id}`); }}><FilePlus2 /> Add prescription</Button>
            <Button size="sm" variant="outline" onClick={() => { onClose(); navigate(`/dispensing?new=${patient.id}`); }}><ShoppingBag /> New dispensing order</Button>
          </div>
        )}
      </div>
    </PdfPreviewDialog>
  );
}
