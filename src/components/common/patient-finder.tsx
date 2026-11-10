import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, CameraOff, CheckCircle2, QrCode as QrIcon, ScanLine, Search, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge, MdsBadge } from "@/components/common/status-badge";
import { Field, Pick } from "@/components/common/ui";
import { ageFrom, fmtDate } from "@/lib/dates";
import { QR_PREFIX } from "@/lib/ids";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { Patient } from "@/types";

const METHODS = ["Name and date of birth confirmed verbally", "Patient QR card scanned", "Photo ID checked", "Authorised representative confirmed"];

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
const hasDetector = () => typeof window !== "undefined" && "BarcodeDetector" in window;

function QrScan({ onToken }: { onToken: (token: string) => void }) {
  const patients = useAppStore((s) => s.patients);
  const video = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<"off" | "on" | "error">("off");
  const [manual, setManual] = useState("");
  const supported = hasDetector();

  useEffect(() => {
    if (camera !== "on") return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        const detector = new Ctor({ formats: ["qr_code"] });
        timer = window.setInterval(async () => {
          if (!video.current) return;
          const codes = await detector.detect(video.current).catch(() => []);
          const hit = codes.find((c) => c.rawValue.startsWith(QR_PREFIX));
          if (hit) { onToken(hit.rawValue.trim()); setCamera("off"); }
        }, 500);
      } catch {
        if (!stopped) setCamera("error");
      }
    })();
    return () => { stopped = true; window.clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [camera, onToken]);

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted-foreground">The QR code holds only a demo identifier such as <code className="rounded bg-muted px-1">MCQR-ABCD-1234</code>. It never contains a name, date of birth or medical detail.</p>
      {supported ? (
        <div className="rounded-lg border border-border p-3">
          {camera === "on" ? (
            <div className="space-y-2">
              <video ref={video} className="aspect-video w-full rounded-md bg-black object-cover" muted playsInline />
              <Button type="button" variant="outline" size="sm" onClick={() => setCamera("off")}><CameraOff /> Stop camera</Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setCamera("on")}><Camera /> Scan with camera</Button>
              {camera === "error" && <span className="text-[13px] text-warn">The camera is not available. Use the manual entry below.</span>}
            </div>
          )}
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-lg bg-info-bg px-3 py-2 text-[13px] text-info"><CameraOff className="size-4 shrink-0" /> This browser cannot read QR codes from the camera. Use manual entry or the simulated scan.</p>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input value={manual} onChange={(e) => setManual(e.target.value.toUpperCase())} placeholder="Type or paste the code, e.g. MCQR-ABCD-1234" aria-label="QR identifier" />
        <Button type="button" variant="secondary" disabled={!manual.trim()} onClick={() => onToken(manual.trim())}><ScanLine /> Look up code</Button>
      </div>
      <Field label="Simulated scan (demo only)" hint="Pretends a patient's card was scanned.">
        <Pick value="" placeholder="Choose a demo patient card" onChange={(id) => { const p = patients.find((x) => x.id === id); if (p) onToken(p.qrToken); }} options={patients.map((p) => ({ value: p.id, label: `${p.qrToken} (card of ${p.name})` }))} />
      </Field>
    </div>
  );
}

export function PatientFinderPanel({ onConfirm, confirmLabel = "Confirm patient", requireConfirm = true }: { onConfirm: (patientId: string, method: string) => void; confirmLabel?: string; requireConfirm?: boolean }) {
  const patients = useAppStore((s) => s.patients);
  const [mode, setMode] = useState("id");
  const [q, setQ] = useState("");
  const [dob, setDob] = useState("");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [scanMiss, setScanMiss] = useState<string | null>(null);
  const [method, setMethod] = useState(METHODS[0]);
  const [confirmed, setConfirmed] = useState(false);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (mode === "id") return needle ? patients.filter((p) => p.id.toLowerCase().includes(needle)) : [];
    if (mode === "phone") {
      const digits = needle.replace(/\D/g, "");
      return digits.length >= 3 ? patients.filter((p) => p.phone.replace(/\D/g, "").includes(digits)) : [];
    }
    if (mode === "name") return needle.length >= 2 ? patients.filter((p) => p.name.toLowerCase().includes(needle) && (!dob || p.dob === dob)) : [];
    return [];
  }, [patients, q, dob, mode]);

  const pick = (p: Patient, m?: string) => { setSelected(p); setConfirmed(false); if (m) setMethod(m); };
  const onToken = (token: string) => {
    const p = patients.find((x) => x.qrToken === token);
    if (p) { setScanMiss(null); pick(p, "Patient QR card scanned"); } else setScanMiss(token);
  };

  if (selected) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-primary/40 bg-accent/40 p-4">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-base font-bold text-accent-foreground">{selected.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
          <div className="min-w-[200px] flex-1">
            <p className="text-lg leading-tight font-bold">{selected.name}</p>
            <p className="text-[13px] text-muted-foreground">{selected.id}. Born {fmtDate(selected.dob)} ({ageFrom(selected.dob)} years). {selected.phone}</p>
            <p className="text-[13px] text-muted-foreground">{selected.address}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <MdsBadge status={selected.mdsStatus} />
              {selected.allergies.length ? <Badge tone="danger" icon={AlertTriangle}>Allergy: {selected.allergies.join(", ")}</Badge> : <Badge tone="neutral">No allergies recorded</Badge>}
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(null)}>Choose another</Button>
        </div>
        {requireConfirm && (
          <>
            <Field label="How was the patient's identity confirmed?">
              <Pick value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m, label: m }))} />
            </Field>
            <Label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-[13px] font-normal">
              <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} className="mt-0.5" />
              <span>I have confirmed this is the right patient before dispensing. <span className="text-muted-foreground">(Simulated check for the demo.)</span></span>
            </Label>
          </>
        )}
        <Button type="button" disabled={requireConfirm && !confirmed} onClick={() => onConfirm(selected.id, method)}><CheckCircle2 /> {confirmLabel}</Button>
      </div>
    );
  }

  return (
    <Tabs value={mode} onValueChange={(v) => { setMode(v as string); setQ(""); setDob(""); }}>
      <TabsList className="flex-wrap">
        <TabsTrigger value="id">Patient ID</TabsTrigger>
        <TabsTrigger value="name">Name and date of birth</TabsTrigger>
        <TabsTrigger value="phone">Mobile number</TabsTrigger>
        <TabsTrigger value="qr"><QrIcon className="size-3.5" /> QR code</TabsTrigger>
      </TabsList>
      <TabsContent value="qr" className="pt-3">
        <QrScan onToken={onToken} />
        {scanMiss && <p className="mt-2 text-[13px] text-danger">No patient has the code {scanMiss}.</p>}
      </TabsContent>
      {mode !== "qr" && (
        <div className="space-y-3 pt-3">
          <div className={cn("grid gap-2", mode === "name" && "sm:grid-cols-2")}>
            <Field label={mode === "id" ? "Patient ID" : mode === "phone" ? "Mobile number" : "Full or partial name"}>
              <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={mode === "id" ? "PT-1001" : mode === "phone" ? "90000 10001" : "Lakshmi"} />
            </Field>
            {mode === "name" && <Field label="Date of birth" hint="Narrows results to the right person."><Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></Field>}
          </div>
          <ul className="max-h-[260px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {results.length === 0 && <li className="flex items-center gap-2 px-3 py-4 text-[13px] text-muted-foreground"><Search className="size-4" /> {q ? "No matching patient." : "Start typing to search."}</li>}
            {results.slice(0, 12).map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => pick(p)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent/50">
                  <UserRound className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1"><span className="block font-medium">{p.name}</span><span className="block text-xs text-muted-foreground">{p.id}, born {fmtDate(p.dob)}, {p.phone}</span></span>
                  <MdsBadge status={p.mdsStatus} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tabs>
  );
}

export function PatientFinder({ open, onOpenChange, onConfirm, title = "Find a patient", confirmLabel, requireConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (patientId: string, method: string) => void; title?: string; confirmLabel?: string; requireConfirm?: boolean }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Search by patient ID, name and date of birth, mobile number or QR code. Fictional records only.</DialogDescription>
        </DialogHeader>
        {open && <PatientFinderPanel onConfirm={(id, m) => { onConfirm(id, m); onOpenChange(false); }} confirmLabel={confirmLabel} requireConfirm={requireConfirm} />}
      </DialogContent>
    </Dialog>
  );
}
