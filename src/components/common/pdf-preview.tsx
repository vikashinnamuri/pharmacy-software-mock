import { useEffect, useRef, useState, type ReactNode } from "react";
import type { jsPDF } from "jspdf";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Print preview for any generated document. The builder runs in the browser, nothing is uploaded. */
export function PdfPreviewDialog({
  open, onOpenChange, title, description, build, filename, onOutput, children, wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  build: () => jsPDF | null;
  filename: string;
  /** Called after a print or download, for the document version history. */
  onOutput?: (verb: "printed" | "downloaded") => void;
  children?: ReactNode;
  wide?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const buildRef = useRef(build);
  buildRef.current = build;

  useEffect(() => {
    if (!open) return;
    const doc = buildRef.current();
    if (!doc) return;
    const u = URL.createObjectURL(doc.output("blob"));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [open, title, filename]);

  const print = () => {
    try {
      frame.current?.contentWindow?.focus();
      frame.current?.contentWindow?.print();
      onOutput?.("printed");
    } catch {
      toast.error("The browser blocked printing from the preview. Download the PDF and print that.");
    }
  };
  const download = () => {
    const doc = build();
    if (!doc) return;
    doc.save(filename);
    onOutput?.("downloaded");
    toast.success(`Downloaded ${filename}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={wide ? "max-h-[94vh] overflow-y-auto sm:max-w-4xl" : "max-h-[94vh] overflow-y-auto sm:max-w-2xl"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {url ? <iframe ref={frame} key={url} src={url} title={`${title} preview`} className="h-[60vh] w-full rounded-lg border border-border bg-muted" /> : <p className="py-10 text-center text-sm text-muted-foreground">Nothing to preview.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" disabled={!url} onClick={print}><Printer /> Print</Button>
          <Button disabled={!url} onClick={download}><Download /> Download PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
