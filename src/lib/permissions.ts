import type { Role } from "@/types";

export type Permission =
  | "patient.edit"
  | "rx.enter"
  | "rx.review"
  | "order.create"
  | "order.review"
  | "order.payment"
  | "order.prepare"
  | "order.verify"
  | "order.fulfil"
  | "delivery.manage"
  | "counselling.record"
  | "mds.enrol"
  | "mds.approve"
  | "tray.generate"
  | "tray.approveSchedule"
  | "tray.prepare"
  | "tray.verify"
  | "tray.supply"
  | "inventory.edit"
  | "catalogue.edit"
  | "billing.edit"
  | "reports.view"
  | "settings.edit";

/** UI-only simulation. Nothing here is security enforcement. */
const MATRIX: Record<Permission, Role[]> = {
  "patient.edit": ["admin", "pharmacist", "dispenser", "reception"],
  "rx.enter": ["pharmacist", "dispenser"],
  "rx.review": ["pharmacist"],
  "order.create": ["pharmacist", "dispenser", "reception"],
  "order.review": ["pharmacist"],
  "order.payment": ["reception", "admin"],
  "order.prepare": ["dispenser"],
  "order.verify": ["pharmacist"],
  "order.fulfil": ["pharmacist", "dispenser", "reception"],
  "delivery.manage": ["delivery", "reception", "admin"],
  "counselling.record": ["pharmacist", "dispenser"],
  "mds.enrol": ["pharmacist", "dispenser", "admin"],
  "mds.approve": ["pharmacist"],
  "tray.generate": ["pharmacist", "dispenser", "mds"],
  "tray.approveSchedule": ["pharmacist"],
  "tray.prepare": ["dispenser", "mds"],
  "tray.verify": ["pharmacist"],
  "tray.supply": ["pharmacist", "dispenser", "mds", "reception"],
  "inventory.edit": ["admin", "pharmacist"],
  "catalogue.edit": ["admin", "pharmacist"],
  "billing.edit": ["admin", "reception"],
  "reports.view": ["admin", "pharmacist"],
  "settings.edit": ["admin"],
};

export const can = (role: Role, perm: Permission) => MATRIX[perm].includes(role);
export const rolesFor = (perm: Permission) => MATRIX[perm];
export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrator",
  pharmacist: "Registered Pharmacist",
  dispenser: "Pharmacy Staff",
  mds: "MDS Preparation Staff",
  reception: "Billing / Reception",
  delivery: "Delivery Staff",
};
export const ROLE_SHORT: Record<Role, string> = {
  admin: "Admin",
  pharmacist: "Pharmacist",
  dispenser: "Pharmacy",
  mds: "MDS Prep",
  reception: "Reception",
  delivery: "Delivery",
};
export const PERMISSION_MATRIX = MATRIX;
