import type { Role } from "@/types";

export type Permission =
  | "patient.edit"
  | "rx.enter"
  | "rx.review"
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
  "patient.edit": ["admin", "pharmacist", "dispenser"],
  "rx.enter": ["pharmacist", "dispenser"],
  "rx.review": ["pharmacist"],
  "tray.generate": ["pharmacist", "dispenser"],
  "tray.approveSchedule": ["pharmacist"],
  "tray.prepare": ["dispenser"],
  "tray.verify": ["pharmacist"],
  "tray.supply": ["pharmacist", "dispenser"],
  "inventory.edit": ["admin", "pharmacist"],
  "catalogue.edit": ["admin", "pharmacist"],
  "billing.edit": ["admin", "dispenser"],
  "reports.view": ["admin", "pharmacist"],
  "settings.edit": ["admin"],
};

export const can = (role: Role, perm: Permission) => MATRIX[perm].includes(role);
export const rolesFor = (perm: Permission) => MATRIX[perm];
export const ROLE_LABEL: Record<Role, string> = { admin: "Administrator", pharmacist: "Pharmacist", dispenser: "Dispensing Staff" };
export const PERMISSION_MATRIX = MATRIX;
