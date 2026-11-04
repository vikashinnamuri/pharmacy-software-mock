import type { Medicine } from "@/types";

const EDGE = "rgba(18,38,74,.28)";

/** Illustrated placeholder for a medicine. Never a photograph of a real product. */
export function PillArt({ medicine, size = 40, className }: { medicine: Pick<Medicine, "pill" | "imageDataUrl" | "brand">; size?: number; className?: string }) {
  if (medicine.imageDataUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={medicine.imageDataUrl} alt={`${medicine.brand} sample`} width={size} height={size} className={className} style={{ width: size, height: size, objectFit: "contain", borderRadius: 6 }} />;
  }
  const { shape, color, color2, scored } = medicine.pill;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label={`${medicine.brand} illustration`}>
      {shape === "round" && (
        <g>
          <ellipse cx="32" cy="35" rx="23" ry="22" fill="rgba(18,38,74,.14)" />
          <circle cx="32" cy="32" r="22" fill={color} stroke={EDGE} strokeWidth="1.5" />
          <circle cx="32" cy="32" r="16.5" fill="none" stroke="rgba(18,38,74,.08)" strokeWidth="1.5" />
          {scored && <line x1="13" y1="32" x2="51" y2="32" stroke="rgba(18,38,74,.3)" strokeWidth="2" />}
          <ellipse cx="25" cy="23" rx="8" ry="4.5" fill="#fff" opacity=".55" transform="rotate(-24 25 23)" />
        </g>
      )}
      {shape === "oval" && (
        <g transform="rotate(-22 32 32)">
          <ellipse cx="32" cy="35" rx="27" ry="16" fill="rgba(18,38,74,.14)" />
          <ellipse cx="32" cy="32" rx="26" ry="15.5" fill={color} stroke={EDGE} strokeWidth="1.5" />
          <ellipse cx="26" cy="26" rx="11" ry="3.5" fill="#fff" opacity=".55" />
        </g>
      )}
      {shape === "caplet" && (
        <g transform="rotate(-22 32 32)">
          <rect x="5" y="20" width="54" height="26" rx="13" fill="rgba(18,38,74,.14)" />
          <rect x="6" y="18" width="52" height="26" rx="13" fill={color} stroke={EDGE} strokeWidth="1.5" />
          {scored && <line x1="32" y1="19" x2="32" y2="43" stroke="rgba(18,38,74,.3)" strokeWidth="2" />}
          <rect x="13" y="22" width="26" height="4" rx="2" fill="#fff" opacity=".6" />
        </g>
      )}
      {shape === "capsule" && (
        <g transform="rotate(-32 32 32)">
          <rect x="5" y="21" width="54" height="24" rx="12" fill="rgba(18,38,74,.14)" />
          <path d="M18 19h14v24H18a12 12 0 0 1 0-24Z" fill={color} stroke={EDGE} strokeWidth="1.5" />
          <path d="M32 19h14a12 12 0 0 1 0 24H32Z" fill={color2 ?? "#fff"} stroke={EDGE} strokeWidth="1.5" />
          <rect x="13" y="23" width="30" height="3.5" rx="1.75" fill="#fff" opacity=".55" />
        </g>
      )}
      {shape === "softgel" && (
        <g transform="rotate(-18 32 32)">
          <ellipse cx="32" cy="35" rx="25" ry="16" fill="rgba(18,38,74,.14)" />
          <ellipse cx="32" cy="32" rx="24" ry="15" fill={color} stroke="rgba(120,80,0,.4)" strokeWidth="1.5" opacity=".92" />
          <ellipse cx="26" cy="25" rx="11" ry="3.5" fill="#fff" opacity=".7" />
        </g>
      )}
      {shape === "liquid" && (
        <g>
          <rect x="25" y="5" width="14" height="9" rx="2" fill="#35507E" />
          <path d="M23 14h18l5 9v31a5 5 0 0 1-5 5H23a5 5 0 0 1-5-5V23Z" fill="#fff" stroke={EDGE} strokeWidth="1.5" />
          <path d="M18 33h28v21a5 5 0 0 1-5 5H23a5 5 0 0 1-5-5Z" fill={color} />
        </g>
      )}
      {shape === "device" && (
        <g>
          <rect x="24" y="4" width="16" height="30" rx="4" fill="#fff" stroke={EDGE} strokeWidth="1.5" transform="rotate(10 32 19)" />
          <path d="M18 28h22a5 5 0 0 1 5 5v12l9 6v8H36l-6-8H23a5 5 0 0 1-5-5Z" fill={color} stroke={EDGE} strokeWidth="1.5" />
        </g>
      )}
      {shape === "sachet" && (
        <g>
          <rect x="12" y="8" width="40" height="48" rx="3" fill={color} stroke={EDGE} strokeWidth="1.5" />
          <line x1="12" y1="16" x2="52" y2="16" stroke="rgba(255,255,255,.7)" strokeWidth="2" strokeDasharray="3 2" />
        </g>
      )}
    </svg>
  );
}
