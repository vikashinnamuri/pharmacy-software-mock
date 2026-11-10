import { useMemo } from "react";
import { qrMatrix } from "@/lib/qr";

/** Draws a QR code as SVG. Only ever pass a non-sensitive identifier. */
export function QrCode({ value, size = 120, className, label }: { value: string; size?: number; className?: string; label?: string }) {
  const path = useMemo(() => {
    const m = qrMatrix(value);
    let d = "";
    for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.dark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
    return { d, n: m.size + 4 };
  }, [value]);
  return (
    <svg viewBox={`0 0 ${path.n} ${path.n}`} width={size} height={size} className={className} role="img" aria-label={label ?? `QR code for ${value}`} shapeRendering="crispEdges">
      <rect width={path.n} height={path.n} fill="#fff" />
      <path d={path.d} fill="#12264A" />
    </svg>
  );
}
