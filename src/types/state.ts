export * from "./index";
import type { Activity, Batch, Invoice, Medicine, Patient, PharmacySettings, Prescription, StaffUser, StockMovement, Subscription, Tray } from "./index";

export interface AppData {
  patients: Patient[];
  medicines: Medicine[];
  prescriptions: Prescription[];
  batches: Batch[];
  movements: StockMovement[];
  trays: Tray[];
  invoices: Invoice[];
  subscriptions: Subscription[];
  activity: Activity[];
  staff: StaffUser[];
  settings: PharmacySettings;
}
