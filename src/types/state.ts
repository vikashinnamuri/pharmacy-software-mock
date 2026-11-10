export * from "./index";
import type {
  Activity, Batch, Counselling, Delivery, GeneratedDocument, Invoice, MdsCycle, MdsEnrolment, Medicine, Order, Patient, PharmacySettings,
  Prescription, Purchase, StaffUser, StockMovement, Subscription, Supplier, Tray,
} from "./index";

/** Every record both workflows share. One copy, never duplicated per module. */
export interface AppData {
  patients: Patient[];
  medicines: Medicine[];
  prescriptions: Prescription[];
  batches: Batch[];
  movements: StockMovement[];
  suppliers: Supplier[];
  purchases: Purchase[];
  trays: Tray[];
  cycles: MdsCycle[];
  enrolments: MdsEnrolment[];
  orders: Order[];
  deliveries: Delivery[];
  counselling: Counselling[];
  invoices: Invoice[];
  subscriptions: Subscription[];
  documents: GeneratedDocument[];
  activity: Activity[];
  staff: StaffUser[];
  settings: PharmacySettings;
}
