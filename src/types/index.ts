export type Role = "admin" | "pharmacist" | "dispenser";

export interface StaffUser {
  id: string;
  name: string;
  role: Role;
  roleLabel: string;
  initials: string;
}

export type Period = "morning" | "lunchtime" | "evening" | "bedtime";
export const PERIODS: Period[] = ["morning", "lunchtime", "evening", "bedtime"];

export type DosageForm = "Tablet" | "Capsule" | "Caplet" | "Soft gel" | "Syrup" | "Inhaler" | "Sachet";
export type PillShape = "round" | "oval" | "capsule" | "caplet" | "softgel" | "liquid" | "device" | "sachet";
export type Suitability = "suitable" | "review-required" | "unsuitable";

export interface Medicine {
  id: string;
  generic: string;
  brand: string;
  strength: string;
  form: DosageForm;
  manufacturer: string;
  packSize: number;
  suitability: Suitability;
  suitabilityNote: string;
  pill: { shape: PillShape; color: string; color2?: string; scored?: boolean };
  imageDataUrl?: string;
  unitPrice: number;
  reorderLevel: number;
  isUserAdded?: boolean;
}

export type MdsStatus = "active" | "assessment" | "paused" | "none";

export interface Contact {
  name: string;
  relation?: string;
  phone: string;
}

export interface PatientDocument {
  id: string;
  title: string;
  kind: "Prescription file" | "Consent record" | "Assessment";
  addedOn: string;
  status: "On file" | "Awaiting signature" | "Expired";
}

export interface Patient {
  id: string;
  name: string;
  dob: string;
  gender: "Female" | "Male" | "Other";
  phone: string;
  address: string;
  doctor: { name: string; clinic: string; phone: string };
  caregiver?: Contact;
  emergencyContact: Contact;
  conditions: string[];
  allergies: string[];
  mdsStatus: MdsStatus;
  registeredOn: string;
  notes?: string;
  documents: PatientDocument[];
}

export type RxStatus = "draft" | "pending" | "verified" | "rejected" | "discontinued";
export type Frequency =
  | "once-daily"
  | "twice-daily"
  | "three-times-daily"
  | "four-times-daily"
  | "at-bedtime"
  | "weekly"
  | "as-required"
  | "unclear";

/** The pharmacist's explicit decision about a line going into a tray. */
export type TrayDecision = "undecided" | "include" | "keep-out";

export interface PrescriptionLine {
  id: string;
  medicineId: string;
  strength: string;
  /** Free text as written, e.g. "1 tablet". */
  dosage: string;
  /** Structured units per administration. null = could not be structured. */
  unitsPerDose: number | null;
  frequency: Frequency;
  times: Period[];
  instructions: string;
  startDate: string;
  endDate: string;
  trayDecision: TrayDecision;
  decisionNote?: string;
  changeNote?: string;
}

export interface RxEvent {
  at: string;
  by: string;
  role: Role;
  action: string;
  note?: string;
}

export interface Prescription {
  id: string;
  patientId: string;
  prescriber: string;
  clinic: string;
  issuedOn: string;
  status: RxStatus;
  lines: PrescriptionLine[];
  version: number;
  /** Id of the prescription this one replaces. */
  supersedes?: string;
  supersededBy?: string;
  createdBy: string;
  review?: { by: string; at: string; note?: string; outcome: "verified" | "rejected" };
  history: RxEvent[];
}

export type CompartmentStatus = "empty" | "pending" | "prepared" | "discrepancy";

export interface TrayItem {
  id: string;
  lineId: string;
  prescriptionId: string;
  medicineId: string;
  strength: string;
  qty: number;
  batchId: string | null;
}

export interface Compartment {
  id: string;
  day: number; // 0 = Monday
  period: Period;
  items: TrayItem[];
  status: CompartmentStatus;
  preparedBy?: string;
  preparedAt?: string;
  discrepancy?: { note: string; by: string; at: string };
  correctionNote?: string;
}

export type TrayStatus =
  | "proposed"
  | "awaiting-preparation"
  | "in-preparation"
  | "awaiting-verification"
  | "correction-requested"
  | "approved"
  | "approval-invalidated"
  | "rejected"
  | "supplied";

export interface TrayEvent {
  id: string;
  at: string;
  by: string;
  role: Role;
  type:
    | "generated"
    | "schedule-approved"
    | "submitted"
    | "approved"
    | "rejected"
    | "correction-requested"
    | "invalidated"
    | "supplied"
    | "replacement-created";
  note?: string;
}

/** A prescription line the generator refused to place. */
export interface TrayFlag {
  lineId: string;
  prescriptionId: string;
  medicineId: string;
  reason: string;
}

export interface Tray {
  id: string;
  patientId: string;
  weekStart: string;
  type: "standard" | "replacement";
  replacementOf?: string;
  status: TrayStatus;
  compartments: Compartment[];
  flags: TrayFlag[];
  prescriptionIds: string[];
  /** Fingerprint of the prescriptions and medicines the tray was built from. */
  sourceFingerprint: string;
  /** Fingerprint of the tray contents, taken at approval. */
  approvedFingerprint?: string;
  invalidatedReason?: string;
  needsRegeneration?: boolean;
  events: TrayEvent[];
  inventoryDeducted: boolean;
  suppliedAt?: string;
  createdInDemo?: boolean;
}

export interface Batch {
  id: string;
  medicineId: string;
  batchNumber: string;
  manufacturer: string;
  expiryDate: string;
  available: number;
  location: string;
  receivedOn: string;
}

export type MovementType = "received" | "adjusted" | "dispensed" | "written-off";

export interface StockMovement {
  id: string;
  at: string;
  batchId: string;
  medicineId: string;
  type: MovementType;
  qty: number; // signed
  reference: string;
  by: string;
}

export type InvoiceStatus = "draft" | "issued" | "paid" | "overdue";

export interface InvoiceLine {
  id: string;
  description: string;
  kind: "product" | "service";
  medicineId?: string;
  qty: number;
  unitPrice: number;
  gstRate: number;
}

export interface Invoice {
  id: string;
  patientId: string;
  issuedOn: string;
  dueOn: string;
  status: InvoiceStatus;
  lines: InvoiceLine[];
  notes?: string;
}

export interface Subscription {
  id: string;
  patientId: string;
  plan: "weekly" | "monthly";
  price: number;
  status: "active" | "paused" | "cancelled";
  renewalDate: string;
  startedOn: string;
}

export type ActivityKind =
  | "patient"
  | "prescription"
  | "tray"
  | "preparation"
  | "verification"
  | "inventory"
  | "document"
  | "billing"
  | "system";

export interface Activity {
  id: string;
  at: string;
  actor: string;
  role: Role;
  kind: ActivityKind;
  summary: string;
  patientId?: string;
  trayId?: string;
  prescriptionId?: string;
  documentType?: DocumentType;
}

export type DocumentType =
  | "label"
  | "backing"
  | "identification"
  | "mar-weekly"
  | "mar-monthly"
  | "summary";

export interface PharmacySettings {
  pharmacyName: string;
  addressLine: string;
  phone: string;
  gstPlaceholder: string;
  defaultGstRate: number;
  lowStockDays: number;
  expiryWarningDays: number;
  autoAdvance: boolean;
  tourEnabled: boolean;
}
