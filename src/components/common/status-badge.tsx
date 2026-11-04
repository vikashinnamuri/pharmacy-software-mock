import {
  AlertTriangle, Ban, CheckCircle2, CircleDashed, CircleDot, Clock, FilePen, FileQuestion, Hourglass, PackageCheck, PackageX, Pause,
  RotateCcw, ShieldCheck, ShieldX, Timer, XCircle, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StockStatus } from "@/lib/selectors";
import type { InvoiceStatus, MdsStatus, RxStatus, Subscription, Suitability, TrayStatus } from "@/types";

type Tone = "ok" | "warn" | "danger" | "info" | "violet" | "neutral" | "teal";
const TONES: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  violet: "bg-violet-bg text-violet",
  neutral: "bg-neutral-bg text-neutral",
  teal: "bg-accent text-accent-foreground",
};

export function Badge({ tone, icon: Icon, children, className }: { tone: Tone; icon?: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", TONES[tone], className)}>
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  );
}

const TRAY: Record<TrayStatus, [Tone, LucideIcon, string]> = {
  proposed: ["violet", FileQuestion, "Proposed schedule"],
  "awaiting-preparation": ["info", CircleDashed, "Awaiting preparation"],
  "in-preparation": ["teal", CircleDot, "In preparation"],
  "awaiting-verification": ["warn", Hourglass, "Awaiting verification"],
  "correction-requested": ["danger", RotateCcw, "Correction requested"],
  approved: ["ok", ShieldCheck, "Approved"],
  "approval-invalidated": ["danger", ShieldX, "Approval invalidated"],
  rejected: ["danger", XCircle, "Rejected"],
  supplied: ["neutral", PackageCheck, "Supplied"],
};
export const trayStatusLabel = (s: TrayStatus) => TRAY[s][2];
export const TrayBadge = ({ status }: { status: TrayStatus }) => {
  const [t, i, l] = TRAY[status];
  return <Badge tone={t} icon={i}>{l}</Badge>;
};

const RX: Record<RxStatus, [Tone, LucideIcon, string]> = {
  draft: ["neutral", FilePen, "Draft"],
  pending: ["warn", Hourglass, "Pending Review"],
  verified: ["ok", CheckCircle2, "Verified"],
  rejected: ["danger", XCircle, "Rejected"],
  discontinued: ["neutral", Ban, "Discontinued"],
};
export const rxStatusLabel = (s: RxStatus) => RX[s][2];
export const RxBadge = ({ status }: { status: RxStatus }) => {
  const [t, i, l] = RX[status];
  return <Badge tone={t} icon={i}>{l}</Badge>;
};

const SUIT: Record<Suitability, [Tone, LucideIcon, string]> = {
  suitable: ["ok", CheckCircle2, "Suitable for tray"],
  "review-required": ["warn", FileQuestion, "Review required"],
  unsuitable: ["danger", Ban, "Not for trays"],
};
export const SuitabilityBadge = ({ status }: { status: Suitability }) => {
  const [t, i, l] = SUIT[status];
  return <Badge tone={t} icon={i}>{l}</Badge>;
};

const STOCK: Record<StockStatus, [Tone, LucideIcon, string]> = {
  expired: ["danger", XCircle, "Expired"],
  expiring: ["warn", Timer, "Expiring soon"],
  out: ["danger", PackageX, "Out of stock"],
  low: ["warn", AlertTriangle, "Low stock"],
  ok: ["ok", CheckCircle2, "In stock"],
};
export const StockBadge = ({ status }: { status: StockStatus }) => {
  const [t, i, l] = STOCK[status];
  return <Badge tone={t} icon={i}>{l}</Badge>;
};

const MDS: Record<MdsStatus, [Tone, string]> = {
  active: ["teal", "Active tray"],
  assessment: ["info", "In assessment"],
  paused: ["warn", "Paused"],
  none: ["neutral", "Not on trays"],
};
export const MdsBadge = ({ status }: { status: MdsStatus }) => <Badge tone={MDS[status][0]}>{MDS[status][1]}</Badge>;

const INV: Record<InvoiceStatus, [Tone, LucideIcon, string]> = {
  draft: ["neutral", FilePen, "Draft"],
  issued: ["info", Clock, "Issued"],
  paid: ["ok", CheckCircle2, "Paid (simulated)"],
  overdue: ["danger", AlertTriangle, "Overdue"],
};
export const InvoiceBadge = ({ status }: { status: InvoiceStatus }) => <Badge tone={INV[status][0]} icon={INV[status][1]}>{INV[status][2]}</Badge>;

const SUB: Record<Subscription["status"], [Tone, LucideIcon, string]> = {
  active: ["ok", CheckCircle2, "Active"],
  paused: ["warn", Pause, "Paused"],
  cancelled: ["neutral", Ban, "Cancelled"],
};
export const SubBadge = ({ status }: { status: Subscription["status"] }) => <Badge tone={SUB[status][0]} icon={SUB[status][1]}>{SUB[status][2]}</Badge>;
