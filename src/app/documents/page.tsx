"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, FileText, Printer, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, ClinicalNotice, Field, PageHeader, Pick } from "@/components/common/ui";
import { TrayBadge } from "@/components/common/status-badge";
import { weekLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { buildDocument, DOCUMENTS } from "@/lib/pdf/documents";
import type { DocumentType } from "@/types";

function Inner() {
  const params = useSearchParams();
  const state = useAppStore();
  const { patients, trays, logDocument } = state;
  const paramTray = trays.find((t) => t.id === params.get("tray"));
  const [type, setType] = useState<DocumentType>((params.get("type") as DocumentType) ?? "backing");
  const [patientId, setPatientId] = useState(paramTray?.patientId ?? params.get("patient") ?? "PT-1001");
  const patientTrays = useMemo(() => trays.filter((t) => t.patientId === patientId).sort((a, b) => b.weekStart.localeCompare(a.weekStart)), [trays, patientId]);
  const [trayId, setTrayId] = useState<string>(paramTray?.id ?? "");
  const [url, setUrl] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const logged = useRef<string>("");

  const paramTrayId = params.get("tray");
  const paramType = params.get("type") as DocumentType | null;
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (paramType) setType(paramType);
    const t = trays.find((x) => x.id === paramTrayId);
    if (t) { setPatientId(t.patientId); setTrayId(t.id); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTrayId, paramType]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const tray = patientTrays.find((t) => t.id === trayId) ?? patientTrays[0];
  const patient = patients.find((p) => p.id === patientId);
  const meta = DOCUMENTS.find((d) => d.type === type)!;
  const needsTrayMissing = meta.needsTray && !tray;

  const makeDoc = () => (patient ? buildDocument(type, { data: state, patient, tray }) : null);

  // Rebuild the preview whenever the inputs or the record behind them change.
  const fingerprint = `${type}|${patientId}|${tray?.id}|${tray?.status}|${tray?.events.length}|${state.settings.pharmacyName}`;
  useEffect(() => {
    if (needsTrayMissing || !patient) { 
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrl(null);
      return;
    }
    const doc = makeDoc();
    if (!doc) return;
    const u = URL.createObjectURL(doc.output("blob"));
    setUrl(u);
    if (logged.current !== `${type}|${patientId}|${tray?.id}`) {
      logged.current = `${type}|${patientId}|${tray?.id}`;
      logDocument(type, meta.title, "previewed", patientId, tray?.id);
    }
    return () => URL.revokeObjectURL(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, needsTrayMissing]);

  const filename = `${meta.title.replace(/[^a-z0-9]+/gi, "-")}-${tray?.id ?? patientId}-DEMO.pdf`;
  const download = () => {
    const doc = makeDoc();
    if (!doc) return;
    doc.save(filename);
    logDocument(type, meta.title, "downloaded", patientId, tray?.id);
    toast.success(`Downloaded ${filename}`);
  };
  const print = () => {
    try {
      frameRef.current?.contentWindow?.focus();
      frameRef.current?.contentWindow?.print();
      logDocument(type, meta.title, "printed", patientId, tray?.id);
    } catch {
      toast.error("The browser blocked printing from the preview. Download the PDF and print that.");
    }
  };

  return (
    <>
      <PageHeader title="Documents & MAR Charts" description="Generated in this browser from the current demo records. Every page carries the demo notice." />
      <ClinicalNotice>MAR charts are blank samples. They never suggest a medicine has been given.</ClinicalNotice>
      <div className="grid gap-3 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-3">
          <Card className="space-y-3 p-4">
            <Field label="Patient"><Pick value={patientId} onChange={(v) => { setPatientId(v); setTrayId(""); }} options={patients.map((p) => ({ value: p.id, label: `${p.name} (${p.id})` }))} /></Field>
            <Field label="Tray" hint={patientTrays.length ? undefined : "This patient has no tray yet."}>
              <Pick value={tray?.id ?? ""} onChange={setTrayId} placeholder="No tray" options={patientTrays.map((t) => ({ value: t.id, label: `${t.id}, ${weekLabel(t.weekStart)}` }))} />
            </Field>
            {tray && <TrayBadge status={tray.status} />}
          </Card>
          <Card className="p-2">
            <ul role="listbox" aria-label="Document type">
              {DOCUMENTS.map((d) => (
                <li key={d.type}>
                  <button type="button" role="option" aria-selected={type === d.type} onClick={() => setType(d.type)}
                    className={cn("flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", type === d.type ? "bg-accent" : "hover:bg-muted")}>
                    <FileText className={cn("mt-0.5 size-4 shrink-0", type === d.type ? "text-primary" : "text-muted-foreground")} />
                    <span>
                      <span className="block text-sm font-semibold">{d.title}</span>
                      <span className="block text-[13px] leading-snug text-muted-foreground">{d.description}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <Card className="flex min-h-[640px] flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <p className="mr-auto flex items-center gap-1.5 font-semibold"><Eye className="size-4 text-muted-foreground" /> Print preview: {meta.title}</p>
            <Button variant="outline" disabled={!url} onClick={print}><Printer /> Print</Button>
            <Button disabled={!url} onClick={download}><Download /> Download PDF</Button>
          </div>
          {url ? (
            <iframe ref={frameRef} key={url} src={url} title={`${meta.title} preview`} className="min-h-[600px] w-full flex-1 bg-muted" />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <TriangleAlert className="size-6 text-warn" />
              <p className="font-semibold">{meta.title} needs a tray</p>
              <p className="max-w-sm text-sm text-muted-foreground">Choose a patient with a weekly tray, or generate one from MDS Weekly Trays.</p>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

export default function DocumentsPage() {
  return <Suspense><Inner /></Suspense>;
}
