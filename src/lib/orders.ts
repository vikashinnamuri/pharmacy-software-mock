import type { Order, OrderLine, OrderStatus } from "@/types";

/**
 * Every status an order may move to from each status. The store refuses any
 * other move, so the UI can never skip review, payment or the final check.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ["awaiting-review", "cancelled"],
  "awaiting-review": ["awaiting-payment", "on-hold", "cancelled"],
  "awaiting-payment": ["payment-received", "on-hold", "cancelled"],
  "payment-received": ["in-preparation", "on-hold", "cancelled"],
  "in-preparation": ["awaiting-verification", "on-hold"],
  "awaiting-verification": ["ready-collection", "in-preparation"],
  "ready-collection": ["collected", "out-for-delivery", "on-hold"],
  "out-for-delivery": ["delivered", "ready-collection"],
  collected: [],
  delivered: [],
  cancelled: [],
  "on-hold": [],
};

export const canMove = (from: OrderStatus, to: OrderStatus) => ORDER_TRANSITIONS[from].includes(to);

export const ORDER_LABEL: Record<OrderStatus, string> = {
  new: "New Order",
  "awaiting-review": "Awaiting Prescription Review",
  "awaiting-payment": "Awaiting Payment",
  "payment-received": "Payment Received",
  "in-preparation": "In Preparation",
  "awaiting-verification": "Awaiting Pharmacist Verification",
  "ready-collection": "Ready for Collection",
  "out-for-delivery": "Out for Delivery",
  collected: "Collected",
  delivered: "Delivered",
  cancelled: "Cancelled",
  "on-hold": "On Hold",
};

/** A delivery order that has passed its final check waits for dispatch, not collection. */
export const orderLabel = (o: Pick<Order, "status" | "fulfilment">) =>
  o.status === "ready-collection" && o.fulfilment === "delivery" ? "Ready for Dispatch" : ORDER_LABEL[o.status];

export const ACTIVE_ORDER: OrderStatus[] = ["new", "awaiting-review", "awaiting-payment", "payment-received", "in-preparation", "awaiting-verification", "ready-collection", "out-for-delivery", "on-hold"];
export const DONE_ORDER: OrderStatus[] = ["collected", "delivered"];
/** Statuses where the public display shows the token as being prepared. */
export const DISPLAY_PREPARING: OrderStatus[] = ["awaiting-review", "awaiting-payment", "payment-received", "in-preparation", "awaiting-verification"];

/** The happy path for the lifecycle stepper. */
export const orderPath = (o: Pick<Order, "fulfilment">): OrderStatus[] => [
  "new", "awaiting-review", "awaiting-payment", "payment-received", "in-preparation", "awaiting-verification", "ready-collection",
  ...(o.fulfilment === "delivery" ? (["out-for-delivery", "delivered"] as OrderStatus[]) : (["collected"] as OrderStatus[])),
];

export function orderCharges(lines: Pick<OrderLine, "qty" | "unitPrice" | "gstRate">[]) {
  const subtotal = lines.reduce((n, l) => n + l.qty * l.unitPrice, 0);
  const gst = lines.reduce((n, l) => n + (l.qty * l.unitPrice * l.gstRate) / 100, 0);
  return { subtotal, gst, total: subtotal + gst };
}

/** Next token in today's sequence, e.g. P-007. Tokens restart each day. */
export function nextToken(existing: string[], prefix: "P" | "M") {
  const n = existing.filter((t) => t.startsWith(`${prefix}-`)).map((t) => Number(t.split("-")[1]) || 0);
  return `${prefix}-${String(Math.max(0, ...n) + 1).padStart(3, "0")}`;
}
