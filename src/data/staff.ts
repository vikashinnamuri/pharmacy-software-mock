import type { Role, StaffUser } from "@/types";

// Fictional staff. Each simulated role signs actions with one of these names.
export const STAFF: StaffUser[] = [
  { id: "U-ADM", name: "Meena K. (demo)", role: "admin", roleLabel: "Administrator", initials: "MK" },
  { id: "U-PHA", name: "Arjun R. (demo)", role: "pharmacist", roleLabel: "Registered Pharmacist", initials: "AR" },
  { id: "U-DIS", name: "Divya S. (demo)", role: "dispenser", roleLabel: "Pharmacy Staff", initials: "DS" },
  { id: "U-MDS", name: "Farah N. (demo)", role: "mds", roleLabel: "MDS Preparation Staff", initials: "FN" },
  { id: "U-REC", name: "Kavya L. (demo)", role: "reception", roleLabel: "Billing / Reception", initials: "KL" },
  { id: "U-DEL", name: "Ravi T. (demo)", role: "delivery", roleLabel: "Delivery Staff", initials: "RT" },
];

export const DELIVERY_STAFF = ["Ravi T. (demo)", "Suresh P. (demo)"];

export const staffFor = (role: Role) => STAFF.find((s) => s.role === role)!;
