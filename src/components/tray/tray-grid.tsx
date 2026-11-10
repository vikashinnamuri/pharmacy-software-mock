
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AlertTriangle, Check, CornerDownLeft, Eye, RotateCcw } from "lucide-react";
import { PillArt } from "@/components/common/pill-art";
import { PERIOD_META } from "@/components/common/ui";
import { addDays, DAY_NAMES, fmtShort, today } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Compartment, Medicine, Tray } from "@/types";
import { ALL_PERIODS } from "@/types";

export type TrayDensity = "full" | "compact";

/** A compartment drawn as a recessed blister well. Foil seals over it when prepared. */
function Well({
  c, medicines, density, selected, dimmed, glowing, inspected, dropDelay, onSelect, tabbable, label,
}: {
  c: Compartment;
  medicines: Medicine[];
  density: TrayDensity;
  selected: boolean;
  dimmed: boolean;
  glowing: boolean;
  inspected: boolean;
  dropDelay?: number;
  onSelect?: () => void;
  tabbable: boolean;
  label: string;
}) {
  const empty = c.items.length === 0;
  const prepared = c.status === "prepared";
  const previous = useRef(c.status);
  const justSealed = previous.current !== "prepared" && prepared;
  useEffect(() => { previous.current = c.status; }, [c.status]);

  const units = c.items.flatMap((i) => {
    const m = medicines.find((x) => x.id === i.medicineId);
    return m ? Array.from({ length: Math.min(i.qty, 4) }, (_, n) => ({ key: `${i.id}-${n}`, m })) : [];
  });
  const pillSize = density === "compact" ? (units.length > 3 ? 16 : 20) : units.length > 4 ? 20 : units.length > 2 ? 24 : 30;
  const summary = c.items.map((i) => {
    const m = medicines.find((x) => x.id === i.medicineId);
    return `${m?.brand ?? "Unknown"} ${i.strength}, quantity ${i.qty}`;
  }).join("; ");
  const statusWord = empty ? "Empty" : prepared ? "Prepared" : c.status === "discrepancy" ? "Discrepancy" : c.correctionNote ? "Correction" : "To prepare";

  return (
    <button
      type="button"
      data-well={c.id}
      data-empty={empty}
      data-selected={selected}
      data-dim={dimmed}
      data-glow={glowing}
      data-status={c.status}
      data-correction={!!c.correctionNote && !prepared}
      tabIndex={tabbable ? 0 : -1}
      disabled={empty}
      onClick={onSelect}
      aria-label={`${label}. ${statusWord}. ${summary}`}
      aria-pressed={selected}
      className={cn("well flex w-full flex-col p-1.5", density === "full" ? "min-h-[122px]" : "min-h-[74px]", !empty && "cursor-pointer")}
    >
      {!empty && (
        <>
          <span className={cn("relative z-[1] flex flex-wrap items-center gap-0.5", density === "full" ? "min-h-[34px]" : "min-h-[26px] justify-center")}>
            {units.slice(0, density === "full" ? 6 : 5).map((u, n) => (
              <span
                key={u.key}
                className={dropDelay !== undefined ? "pill-drop" : undefined}
                style={dropDelay !== undefined ? ({ "--drop-delay": `${dropDelay + n * 45}ms` } as React.CSSProperties) : undefined}
              >
                <PillArt medicine={u.m} size={pillSize} />
              </span>
            ))}
          </span>
          {density === "full" ? (
            <span className="relative z-[1] mt-1 flex-1 space-y-0.5">
              {c.items.slice(0, 3).map((i) => {
                const m = medicines.find((x) => x.id === i.medicineId);
                return (
                  <span key={i.id} className="block truncate text-[11.5px] leading-[1.25] text-foreground">
                    <strong className="font-semibold">{m?.brand}</strong> {i.strength} <span className="text-muted-foreground">×{i.qty}</span>
                  </span>
                );
              })}
              {c.items.length > 3 && <span className="block text-[11px] font-medium text-muted-foreground">+{c.items.length - 3} more</span>}
            </span>
          ) : (
            <span className="relative z-[1] mt-auto text-center text-[11px] font-semibold text-muted-foreground">{c.items.reduce((n, i) => n + i.qty, 0)} {c.items.reduce((n, i) => n + i.qty, 0) > 1 ? "units" : "unit"}</span>
          )}
          {density === "full" && (
            <span className={cn("relative z-[1] mt-1 flex items-center gap-1 text-[11px] font-semibold",
              prepared ? "text-accent-foreground" : c.status === "discrepancy" ? "text-warn" : c.correctionNote ? "text-danger" : "text-muted-foreground")}>
              {c.status === "discrepancy" ? <AlertTriangle className="size-3" /> : c.correctionNote && !prepared ? <RotateCcw className="size-3" /> : !prepared ? <span className="size-2 rounded-full border-[1.5px] border-current" /> : null}
              {statusWord}
            </span>
          )}
          {prepared && (
            <>
              <span className="foil" data-animate={justSealed} aria-hidden />
              <span className={cn("stamp absolute top-1 right-1 z-[2] flex items-center justify-center rounded-full bg-primary text-white shadow-sm", density === "full" ? "size-[18px]" : "size-3.5")} data-animate={justSealed} aria-hidden>
                <Check className={density === "full" ? "size-3" : "size-2.5"} strokeWidth={3} />
              </span>
            </>
          )}
          {density === "compact" && !prepared && c.status === "discrepancy" && <AlertTriangle className="absolute top-1 right-1 z-[2] size-3.5 text-warn" aria-hidden />}
          {inspected && <Eye className="absolute top-1 left-1 z-[2] size-3 text-primary" aria-hidden />}
        </>
      )}
    </button>
  );
}

export function TrayGrid({
  tray, medicines, density = "full", selectedId, onSelect, highlightMedicineId, inspected, drop, className, ghost,
}: {
  tray: Pick<Tray, "compartments" | "weekStart">;
  medicines: Medicine[];
  density?: TrayDensity;
  selectedId?: string | null;
  onSelect?: (c: Compartment) => void;
  highlightMedicineId?: string | null;
  inspected?: Set<string>;
  /** When true, pills fall into the wells in a day-by-day wave. */
  drop?: boolean;
  className?: string;
  ghost?: boolean;
}) {
  const [hover, setHover] = useState<{ day: number; period: string } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const now = today();
  const byKey = useMemo(() => {
    const m = new Map<string, Compartment>();
    tray.compartments.forEach((c) => m.set(`${c.day}-${c.period}`, c));
    return m;
  }, [tray.compartments]);
  const firstFilled = useMemo(() => tray.compartments.find((c) => c.items.length)?.id, [tray.compartments]);
  /** Rows come from the tray itself, so approved Before Food periods appear only for that patient. */
  const PERIODS = useMemo(() => ALL_PERIODS.filter((p) => tray.compartments.some((c) => c.period === p)), [tray.compartments]);

  /** Arrow keys move between filled wells; Enter (native click) opens one. */
  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    const mv = moves[e.key];
    const target = e.target as HTMLElement;
    const id = target.getAttribute?.("data-well");
    if (!mv || !id) return;
    const cur = tray.compartments.find((c) => c.id === id);
    if (!cur) return;
    e.preventDefault();
    let day = cur.day;
    let p = PERIODS.indexOf(cur.period);
    for (let i = 0; i < 28; i++) {
      day += mv[0];
      p += mv[1];
      if (day < 0 || day > 6 || p < 0 || p > PERIODS.length - 1) return;
      const next = byKey.get(`${day}-${PERIODS[p]}`);
      if (next?.items.length) {
        rootRef.current?.querySelector<HTMLButtonElement>(`[data-well="${next.id}"]`)?.focus();
        return;
      }
    }
  }, [byKey, tray.compartments, PERIODS]);

  const col = density === "full" ? "grid-cols-[76px_repeat(7,minmax(112px,1fr))]" : "grid-cols-[34px_repeat(7,minmax(48px,1fr))]";

  return (
    <div className={cn("tray-card overflow-x-auto rounded-2xl p-3", className)}>
      <div ref={rootRef} role="group" aria-label="Weekly tray. Use arrow keys to move between compartments." onKeyDown={onKeyDown} onMouseLeave={() => setHover(null)} className={cn("grid gap-1.5", col, density === "full" ? "min-w-[860px]" : "min-w-[400px]")}>
        <div />
        {DAY_NAMES.map((d, i) => {
          const date = addDays(tray.weekStart, i);
          const isToday = date === now;
          return (
            <div key={d} className={cn("rounded-md py-0.5 text-center transition-colors", hover?.day === i && "bg-white/80")}>
              <div className={cn("text-[13px] font-bold", isToday ? "text-primary" : "text-foreground")}>{d}</div>
              {density === "full" && <div className={cn("text-[11.5px]", isToday ? "font-semibold text-primary" : "text-muted-foreground")}>{isToday ? "Today" : fmtShort(date)}</div>}
            </div>
          );
        })}
        {PERIODS.map((period) => {
          const meta = PERIOD_META[period];
          return (
            <div key={period} className="contents">
              <div className={cn("flex flex-col items-center justify-center rounded-md text-center transition-colors", meta.bf && "bg-accent/60", hover?.period === period && "bg-white/80")}>
                <meta.icon className={cn(density === "full" ? "size-[18px]" : "size-4", meta.tint)} aria-hidden />
                {density === "full" ? (
                  <>
                    <span className="mt-0.5 text-[12.5px] leading-tight font-semibold">{meta.label}</span>
                    <span className="text-[11px] text-muted-foreground">{meta.bf ? "BF, set per patient" : meta.time}</span>
                  </>
                ) : <span className="sr-only">{meta.label}</span>}
              </div>
              {DAY_NAMES.map((d, day) => {
                const c = byKey.get(`${day}-${period}`);
                if (!c) return <div key={d} className="well" data-empty="true" />;
                const hasHighlight = !!highlightMedicineId;
                const match = hasHighlight && c.items.some((i) => i.medicineId === highlightMedicineId);
                return (
                  <div key={c.id} onMouseEnter={() => setHover({ day, period })} className="contents">
                    <Well
                      c={c}
                      medicines={medicines}
                      density={density}
                      selected={selectedId === c.id}
                      dimmed={hasHighlight && !match}
                      glowing={!!match}
                      inspected={!!inspected?.has(c.id)}
                      dropDelay={drop && !ghost ? day * 70 + PERIODS.indexOf(period) * 40 : undefined}
                      onSelect={onSelect ? () => onSelect(c) : undefined}
                      tabbable={c.id === (selectedId ?? firstFilled)}
                      label={`${d} ${meta.label}`}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {density === "full" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CornerDownLeft className="size-3.5" /> Click a compartment, or use arrow keys and Enter. Sealed foil means prepared.
        </p>
      )}
    </div>
  );
}

/** Medicines in the tray. Hover or click one to see where it sits. */
export function TrayLegend({
  tray, medicines, highlight, onHighlight, batchNumber,
}: {
  tray: Pick<Tray, "compartments">;
  medicines: Medicine[];
  highlight: string | null;
  onHighlight: (id: string | null) => void;
  batchNumber: (id: string | null) => string;
}) {
  const [locked, setLocked] = useState(false);
  const rows = useMemo(() => {
    const m = new Map<string, { qty: number; slots: number; batches: Set<string | null> }>();
    tray.compartments.forEach((c) =>
      c.items.forEach((i) => {
        const r = m.get(i.medicineId) ?? { qty: 0, slots: 0, batches: new Set() };
        r.qty += i.qty;
        r.slots += 1;
        r.batches.add(i.batchId);
        m.set(i.medicineId, r);
      }),
    );
    return [...m.entries()];
  }, [tray.compartments]);
  return (
    <div className="flex flex-wrap gap-2" onMouseLeave={() => !locked && onHighlight(null)}>
      {rows.map(([id, r]) => {
        const med = medicines.find((x) => x.id === id);
        if (!med) return null;
        const on = highlight === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on && locked}
            onMouseEnter={() => !locked && onHighlight(id)}
            onFocus={() => !locked && onHighlight(id)}
            onClick={() => {
              if (on && locked) { setLocked(false); onHighlight(null); } else { setLocked(true); onHighlight(id); }
            }}
            className={cn(
              "flex items-center gap-2 rounded-lg border bg-card py-1.5 pr-3 pl-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              on ? "border-sidebar ring-1 ring-sidebar" : "border-border hover:border-primary/50",
            )}
          >
            <PillArt medicine={med} size={30} />
            <span className="leading-tight">
              <span className="block text-[13px] font-semibold">{med.brand} {med.strength}</span>
              <span className="block text-xs text-muted-foreground">{r.qty} units this week, batch {[...r.batches].map(batchNumber).join(", ")}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
