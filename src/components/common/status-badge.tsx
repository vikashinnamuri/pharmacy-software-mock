import {
  AlertTriangle, Ban, Bike, CalendarClock, CheckCircle2, CircleDashed, CircleDot, Clock, CreditCard, FilePen, FileQuestion, FileSearch, Hourglass, PackageCheck, PackageOpen,
  PackageX, Pause, RotateCcw, ShieldCheck, ShieldQuestion, ShieldX, Store, Timer, Truck, Undo2, XCircle, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { orderLabel } from "@/lib/orders";
import type { StockStatus } from "@/lib/selectors";
import type { Delivery, EnrolmentStatus, InvoiceStatus, MdsStatus, Order, OrderStatus, RxStatus, Subscription, Suitability, SuitabilityReview, TrayStatus } from "@/types";

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

/** MDS lifecycle wording follows the client's requested statuses. */
const TRAY: Record<TrayStatus, [Tone, LucideIcon, string]> = {
  scheduled: ["neutral", CalendarClock, "Scheduled"],
  "awaiting-rx-validation": ["warn", FileSearch, "Awaiting Prescription Validation"],
  proposed: ["violet", ShieldQuestion, "Awaiting Clinical Suitability Review"],
  "awaiting-preparation": ["info", CircleDashed, "Awaiting Preparation"],
  "in-preparation": ["teal", CircleDot, "Preparation in Progress"],
  "awaiting-verification": ["warn", Hourglass, "Awaiting Pharmacist Check"],
  "correction-requested": ["danger", RotateCcw, "Correction Requested"],
  approved: ["ok", ShieldCheck, "Pharmacist Approved"],
  "approval-invalidated": ["danger", ShieldX, "Approval Invalidated"],
  ready: ["ok", PackageOpen, "Ready for Collection / Delivery"],
  rejected: ["danger", XCircle, "Rejected"],
  supplied: ["neutral", PackageCheck, "Completed"],
  "on-hold": ["warn", Pause, "On Hold"],
  cancelled: ["neutral", Ban, "Cancelled"],
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
  active: ["teal", "MDS active"],
  assessment: ["info", "MDS review pending"],
  paused: ["warn", "MDS suspended"],
  none: ["neutral", "Not on MDS"],
};
export const MdsBadge = ({ status }: { status: MdsStatus }) => <Badge tone={MDS[status][0]}>{MDS[status][1]}</Badge>;

const ENROL: Record<EnrolmentStatus, [Tone, LucideIcon, string]> = {
  "pending-review": ["info", ShieldQuestion, "Awaiting suitability review"],
  active: ["teal", ShieldCheck, "Active"],
  suspended: ["warn", Pause, "Suspended"],
  discontinued: ["neutral", Ban, "Discontinued"],
  declined: ["danger", ShieldX, "Not suitable"],
};
export const EnrolmentBadge = ({ status }: { status: EnrolmentStatus }) => <Badge tone={ENROL[status][0]} icon={ENROL[status][1]}>{ENROL[status][2]}</Badge>;

const SREV: Record<SuitabilityReview, [Tone, string]> = { pending: ["warn", "Review pending"], suitable: ["ok", "Suitable"], "not-suitable": ["danger", "Not suitable"] };
export const SuitabilityReviewBadge = ({ status }: { status: SuitabilityReview }) => <Badge tone={SREV[status][0]}>{SREV[status][1]}</Badge>;

const INV: Record<InvoiceStatus, [Tone, LucideIcon, string]> = {
  draft: ["neutral", FilePen, "Draft"],
  issued: ["info", Clock, "Issued"],
  paid: ["ok", CheckCircle2, "Paid (simulated)"],
  overdue: ["danger", AlertTriangle, "Overdue"],
  refunded: ["violet", Undo2, "Refunded"],
  cancelled: ["neutral", Ban, "Cancelled"],
};
export const InvoiceBadge = ({ status }: { status: InvoiceStatus }) => <Badge tone={INV[status][0]} icon={INV[status][1]}>{INV[status][2]}</Badge>;

const SUB: Record<Subscription["status"], [Tone, LucideIcon, string]> = {
  active: ["ok", CheckCircle2, "Active"],
  paused: ["warn", Pause, "Paused"],
  cancelled: ["neutral", Ban, "Cancelled"],
};
export const SubBadge = ({ status }: { status: Subscription["status"] }) => <Badge tone={SUB[status][0]} icon={SUB[status][1]}>{SUB[status][2]}</Badge>;

const ORDER: Record<OrderStatus, [Tone, LucideIcon]> = {
  new: ["neutral", FilePen],
  "awaiting-review": ["violet", ShieldQuestion],
  "awaiting-payment": ["warn", CreditCard],
  "payment-received": ["info", CheckCircle2],
  "in-preparation": ["teal", CircleDot],
  "awaiting-verification": ["warn", Hourglass],
  "ready-collection": ["ok", Store],
  "out-for-delivery": ["info", Truck],
  collected: ["neutral", PackageCheck],
  delivered: ["neutral", PackageCheck],
  cancelled: ["neutral", Ban],
  "on-hold": ["warn", Pause],
};
export const OrderBadge = ({ order }: { order: Pick<Order, "status" | "fulfilment"> }) => {
  const [t, i] = ORDER[order.status];
  return <Badge tone={t} icon={order.status === "ready-collection" && order.fulfilment === "delivery" ? Bike : i}>{orderLabel(order)}</Badge>;
};

const DLV: Record<Delivery["status"], [Tone, LucideIcon, string]> = {
  scheduled: ["info", CalendarClock, "Awaiting dispatch"],
  out: ["warn", Truck, "Out for delivery"],
  delivered: ["ok", PackageCheck, "Delivered"],
  failed: ["danger", XCircle, "Failed, back at pharmacy"],
};
export const DeliveryBadge = ({ status }: { status: Delivery["status"] }) => <Badge tone={DLV[status][0]} icon={DLV[status][1]}>{DLV[status][2]}</Badge>;
