import { Link, useSearchParams } from "react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, FileText, History, Printer, Settings2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, ClinicalNotice, Field, PageHeader, Pick } from "@/components/common/ui";
import { TrayBadge } from "@/components/common/status-badge";
import { fmtDateTime, weekLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { buildDocument, DOCUMENTS } from "@/lib/pdf/documents";
import type { DocumentType } from "@/types";

export default function DocumentsPage() {
  const [params] = useSearchParams();
  const state = useAppStore();
  const { patients, trays, logDocument, settings, documents } = state;
  const paramTray = trays.find((t) => t.id === params.get("tray"));
  const [type, setType] = useState<DocumentType>((params.get("type") as DocumentType) ?? "backing");
  const [patientId, setPatientId] = useState(paramTray?.patientId ?? params.get("patient") ?? "PT-1003");
  const patientTrays = useMemo(() => trays.filter((t) => t.patientId === patientId && t.compartments.some((c) => c.items.length)).sort((a, b) => b.weekStart.localeCompare(a.weekStart)), [trays, patientId]);
  const [trayId, setTrayId] = useState<string>(paramTray?.id ?? "");
  const [templateId, setTemplateId] = useState(settings.defaultTemplateId);
  const [url, setUrl] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const logged = useRef<string>("");

  const paramTrayId = params.get("tray");
  const paramType = params.get("type") as DocumentType | null;
  const paramPatient = params.get("patient");
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (paramType) setType(paramType);
    const t = trays.find((x) => x.id === paramTrayId);
    if (t) { setPatientId(t.patientId); setTrayId(t.id); } else if (paramPatient) { setPatientId(paramPatient); setTrayId(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTrayId, paramType, paramPatient]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const tray = patientTrays.find((t) => t.id === trayId) ?? patientTrays[0];
  const patient = patients.find((p) => p.id === patientId);
  const meta = DOCUMENTS.find((d) => d.type === type) ?? DOCUMENTS[0];
  const needsTrayMissing = meta.needsTray && !tray;
  const refId = meta.needsTray || type === "cycle-report" ? tray?.id ?? patientId : patientId;
  const history = documents.filter((d) => d.type === type && d.refId === refId && d.action !== "previewed");
  const nextVersion = history.length + 1;
  const template = settings.backingTemplates.find((t) => t.id === templateId) ?? settings.backingTemplates[0];

  const makeDoc = (version: number) => (patient ? buildDocument(type, { data: useAppStore.getState(), patient, tray, template, version }) : null);

  // Rebuild the preview whenever the inputs or the record behind them change.
  const fingerprint = `${type}|${patientId}|${tray?.id}|${tray?.status}|${tray?.events.length}|${templateId}|${JSON.stringify(template)}|${settings.pharmacyName}|${nextVersion}`;
  useEffect(() => {
    if (needsTrayMissing || !patient) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrl(null);
      return;
    }
    const doc = makeDoc(nextVersion);
    if (!doc) return;
    const u = URL.createObjectURL(doc.output("blob"));
    setUrl(u);
    if (logged.current !== `${type}|${patientId}|${tray?.id}`) {
      logged.current = `${type}|${patientId}|${tray?.id}`;
      logDocument(type, meta.title, "previewed", patientId, refId, type === "backing" ? templateId : undefined);
    }
    return () => URL.revokeObjectURL(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, needsTrayMissing]);

  const filename = `${meta.title.replace(/[^a-z0-9]+/gi, "-")}-${refId}-v${nextVersion}-DEMO.pdf`;
  const download = () => {
    const doc = makeDoc(nextVersion);
    if (!doc) return;
    doc.save(filename);
    const v = logDocument(type, meta.title, "downloaded", patientId, refId, type === "backing" ? templateId : undefined);
    toast.success(`Downloaded ${filename}${v > 1 ? ` (reprint, version ${v})` : ""}`);
  };
  const print = () => {
    try {
      frameRef.current?.contentWindow?.focus();
      frameRef.current?.contentWindow?.print();
      logDocument(type, meta.title, "printed", patientId, refId, type === "backing" ? templateId : undefined);
    } catch {
      toast.error("The browser blocked printing from the preview. Download the PDF and print that.");
    }
  };
  const groups = ["MDS tray", "Charts", "Records"] as const;

  return (
    <>
      <PageHeader title="Documents & MAR Charts" description="Generated in this browser from the current demo records. Every page carries the demo notice, and reprints are versioned." />
      <ClinicalNotice>MAR charts are blank samples and medication charts show scheduled doses only. Nothing here suggests a medicine has been given.</ClinicalNotice>
      <div className="grid gap-3 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-3">
          <Card className="space-y-3 p-4">
            <Field label="Patient"><Pick value={patientId} onChange={(v) => { setPatientId(v); setTrayId(""); }} options={patients.map((p) => ({ value: p.id, label: `${p.name} (${p.id})` }))} /></Field>
            <Field label="Weekly tray" hint={patientTrays.length ? undefined : "This patient has no tray yet."}>
              <Pick value={tray?.id ?? ""} onChange={setTrayId} placeholder="No tray" options={patientTrays.map((t) => ({ value: t.id, label: `${t.id}, ${weekLabel(t.weekStart)}${t.cycleWeek ? `, week ${t.cycleWeek}` : ""}` }))} />
            </Field>
            {tray && <TrayBadge status={tray.status} />}
            {type === "backing" && (
              <Field label="Backing sheet template" hint={`${template.widthMm} × ${template.heightMm} mm, margins ${template.marginTop}/${template.marginRight}/${template.marginBottom}/${template.marginLeft} mm`}>
                <Pick value={templateId} onChange={setTemplateId} options={settings.backingTemplates.map((t) => ({ value: t.id, label: t.name }))} />
              </Field>
            )}
            {type === "backing" && <Button size="sm" variant="ghost" render={<Link to="/settings#templates" />}><Settings2 /> Edit template dimensions</Button>}
          </Card>
          <Card className="p-2">
            {groups.map((g) => (
              <div key={g} className="mb-1">
                <p className="px-2.5 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g}</p>
                <ul role="listbox" aria-label={`${g} documents`}>
                  {DOCUMENTS.filter((d) => d.group === g).map((d) => (
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
              </div>
            ))}
          </Card>
          <Card className="p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold"><History className="size-4 text-muted-foreground" /> Version history for {refId}</p>
            {history.length === 0 && <p className="text-[13px] text-muted-foreground">Not printed or downloaded yet. The next output is version 1.</p>}
            <ol className="space-y-1 text-[13px]">
              {history.slice(0, 12).map((d) => (
                <li key={d.id} className="flex justify-between gap-2"><span>Version {d.version}, {d.action}{d.templateId ? `, ${settings.backingTemplates.find((t) => t.id === d.templateId)?.name ?? d.templateId}` : ""}</span><span className="text-right text-muted-foreground">{d.by}, {fmtDateTime(d.at)}</span></li>
              ))}
            </ol>
          </Card>
        </div>
        <Card className="flex min-h-[640px] flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <p className="mr-auto flex items-center gap-1.5 font-semibold"><Eye className="size-4 text-muted-foreground" /> Print preview: {meta.title}{nextVersion > 1 ? ` (next output is reprint version ${nextVersion})` : ""}</p>
            <Button variant="outline" disabled={!url} onClick={print}><Printer /> {nextVersion > 1 ? "Reprint" : "Print"}</Button>
            <Button disabled={!url} onClick={download}><Download /> Download PDF</Button>
          </div>
          {type === "backing" && <p className="border-b border-border bg-warn-bg px-3 py-1.5 text-xs text-warn">Template dimensions are for demonstration. Final alignment needs the chosen physical Dossett tray and printer specifications.</p>}
          {url ? (
            <iframe ref={frameRef} key={url} src={url} title={`${meta.title} preview`} className="min-h-[600px] w-full flex-1 bg-muted" />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <TriangleAlert className="size-6 text-warn" />
              <p className="font-semibold">{meta.title} needs a tray</p>
              <p className="max-w-sm text-sm text-muted-foreground">Choose a patient with a weekly tray, or plan one from MDS Management.</p>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
