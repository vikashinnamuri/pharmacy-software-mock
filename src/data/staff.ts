import type { Role, StaffUser } from "@/types";

export const STAFF: StaffUser[] = [
  { id: "U-ADM", name: "Meena K. (demo)", role: "admin", roleLabel: "Administrator", initials: "MK" },
  { id: "U-PHA", name: "Arjun R. (demo)", role: "pharmacist", roleLabel: "Pharmacist", initials: "AR" },
  { id: "U-DIS", name: "Divya S. (demo)", role: "dispenser", roleLabel: "Dispensing Staff", initials: "DS" },
];

export const staffFor = (role: Role) => STAFF.find((s) => s.role === role)!;
