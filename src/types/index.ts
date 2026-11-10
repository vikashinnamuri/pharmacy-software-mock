/** Demo roles. UI simulations only, never security controls. */
export type Role = "admin" | "pharmacist" | "dispenser" | "mds" | "reception" | "delivery";
export const ROLES: Role[] = ["admin", "pharmacist", "dispenser", "mds", "reception", "delivery"];

export interface StaffUser {
  id: string;
  name: string;
  role: Role;
  roleLabel: string;
  initials: string;
}

/**
 * Administration periods. The four standard rows are always available. The
 * "bf-*" periods are Before Food doses tied to a specific meal; a pharmacist
 * approves them per patient on the MDS enrolment, so BF is never one global time.
 */
export type Period = "bf-breakfast" | "morning" | "bf-lunch" | "lunchtime" | "bf-evening" | "evening" | "bedtime";
export const PERIODS: Period[] = ["morning", "lunchtime", "evening", "bedtime"];
export const BF_PERIODS: Period[] = ["bf-breakfast", "bf-lunch", "bf-evening"];
/** Display order of every period, top to bottom on a tray. */
export const ALL_PERIODS: Period[] = ["bf-breakfast", "morning", "bf-lunch", "lunchtime", "bf-evening", "evening", "bedtime"];
export const isBf = (p: Period) => BF_PERIODS.includes(p);

export type MealRelation = "none" | "before-food" | "with-food" | "after-food";

export type DosageForm = "Tablet" | "Capsule" | "Caplet" | "Soft gel" | "Syrup" | "Inhaler" | "Sachet";
export type PillShape = "round" | "oval" | "capsule" | "caplet" | "softgel" | "liquid" | "device" | "sachet";
export type Suitability = "suitable" | "review-required" | "unsuitable";

export interface Medicine {
  id: string;
  generic: string;
  brand: string;
  strength: string;
  form: DosageForm;
  /** e.g. Immediate release, Enteric coated, Modified release. */
  formulation: string;
  manufacturer: string;
  packSize: number;
  /** Synthetic product identification code. Not a real GTIN or licence number. */
  productCode: string;
  suitability: Suitability;
  suitabilityNote: string;
  pill: { shape: PillShape; color: string; color2?: string; scored?: boolean };
  imageDataUrl?: string;
  unitPrice: number;
  reorderLevel: number;
  isUserAdded?: boolean;
}

/** Mirrors the MDS enrolment so existing lists and badges keep working. */
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

export interface Consent {
  given: boolean;
  /** Who gave consent. */
  by: "patient" | "caregiver" | "representative";
  recordedOn: string;
}

export interface Patient {
  id: string;
  /** Non-sensitive identifier encoded in the patient QR code. Reveals nothing clinical. */
  qrToken: string;
  name: string;
  dob: string;
  gender: "Female" | "Male" | "Other" | "Not stated";
  phone: string;
  email?: string;
  address: string;
  doctor: { name: string; clinic: string; phone: string };
  caregiver?: Contact;
  /** Authorised to collect or act for the patient. */
  representative?: Contact;
  emergencyContact: Contact;
  conditions: string[];
  allergies: string[];
  /** What the patient reports taking at registration. Not an authorised medicine list. */
  reportedMedication: string;
  consent: Consent;
  mdsStatus: MdsStatus;
  registeredOn: string;
  notes?: string;
  documents: PatientDocument[];
  createdInDemo?: boolean;
}

/* ------------------------------------------------------------------ */
/* MDS enrolment                                                       */
/* ------------------------------------------------------------------ */

export type EnrolmentStatus = "pending-review" | "active" | "suspended" | "discontinued" | "declined";
export type SuitabilityReview = "pending" | "suitable" | "not-suitable";

export interface EnrolmentEvent {
  at: string;
  by: string;
  role: Role;
  action: string;
  note?: string;
}

export interface MdsEnrolment {
  id: string;
  patientId: string;
  status: EnrolmentStatus;
  enrolledOn: string;
  responsiblePharmacist: string;
  prescriber: string;
  caregiver?: string;
  consent: boolean;
  consentBy: Consent["by"];
  /** 0 = Monday. The day this patient's weekly tray is prepared. */
  prepDay: number;
  fulfilment: "collection" | "delivery";
  suitability: SuitabilityReview;
  suitabilityNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  /** Extra administration periods approved for this patient, such as Before Breakfast. */
  approvedPeriods: Period[];
  /** Local times for this patient's periods, e.g. { "bf-breakfast": "07:30" }. */
  periodTimes: Partial<Record<Period, string>>;
  history: EnrolmentEvent[];
}

/* ------------------------------------------------------------------ */
/* Prescriptions                                                       */
/* ------------------------------------------------------------------ */

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
  /** Days of the week the dose is taken, 0 = Monday. Empty or missing means every day. */
  days?: number[];
  mealRelation?: MealRelation;
  /** Quantity authorised for supply. */
  quantity?: number;
  durationDays?: number;
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

/* ------------------------------------------------------------------ */
/* MDS trays and cycles                                                */
/* ------------------------------------------------------------------ */

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
  | "scheduled"
  | "awaiting-rx-validation"
  | "proposed"
  | "awaiting-preparation"
  | "in-preparation"
  | "awaiting-verification"
  | "correction-requested"
  | "approved"
  | "approval-invalidated"
  | "ready"
  | "rejected"
  | "supplied"
  | "on-hold"
  | "cancelled";

export interface TrayEvent {
  id: string;
  at: string;
  by: string;
  role: Role;
  type:
    | "generated"
    | "released"
    | "change-flagged"
    | "schedule-approved"
    | "schedule-edited"
    | "submitted"
    | "approved"
    | "rejected"
    | "correction-requested"
    | "invalidated"
    | "ready"
    | "supplied"
    | "replacement-created"
    | "held"
    | "resumed"
    | "cancelled"
    | "assigned";
  note?: string;
}

/** A prescription line the generator refused to place. */
export interface TrayFlag {
  lineId: string;
  prescriptionId: string;
  medicineId: string;
  reason: string;
}

/** An earlier version of a tray's proposed contents, kept when the schedule is rebuilt. */
export interface TrayRevision {
  id: string;
  at: string;
  by: string;
  reason: string;
  /** Human-readable medicine lines, e.g. "Glucora 500 mg ×1: Mon–Sun morning, evening". */
  lines: string[];
  prescriptionIds: string[];
  statusBefore: TrayStatus;
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
  /** What would change if the tray were rebuilt from today's prescriptions. */
  pendingChanges?: string[];
  revisions: TrayRevision[];
  /** Prescription lines a pharmacist left out of this week only. */
  exclusions: { lineId: string; note: string; by: string }[];
  events: TrayEvent[];
  inventoryDeducted: boolean;
  suppliedAt?: string;
  cycleId?: string;
  cycleWeek?: number;
  assignedTo?: string;
  heldFrom?: TrayStatus;
  fulfilment?: { method: "collection" | "delivery"; token?: string; estimatedReady?: string; collectedBy?: string; deliveryId?: string };
  createdInDemo?: boolean;
}

export interface MdsCycle {
  id: string;
  patientId: string;
  startWeek: string;
  /** Tray ids for weeks 1 to 4. Each week keeps its own approval and preparation record. */
  trayIds: string[];
  status: "active" | "completed" | "cancelled";
  createdAt: string;
  createdBy: string;
  notes?: string;
}

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

export interface Batch {
  id: string;
  medicineId: string;
  batchNumber: string;
  manufacturer: string;
  expiryDate: string;
  available: number;
  location: string;
  receivedOn: string;
  supplierId?: string;
}

export type MovementType = "received" | "adjusted" | "dispensed" | "written-off" | "returned";

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

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  leadTimeDays: number;
}

export interface PurchaseLine {
  id: string;
  medicineId: string;
  qty: number;
  unitCost: number;
  /** Filled when received. */
  batchNumber?: string;
  expiryDate?: string;
}

export interface Purchase {
  id: string;
  supplierId: string;
  orderedOn: string;
  expectedOn: string;
  status: "ordered" | "received" | "cancelled";
  lines: PurchaseLine[];
  receivedOn?: string;
  receivedBy?: string;
  notes?: string;
}

/* ------------------------------------------------------------------ */
/* Standard dispensing                                                 */
/* ------------------------------------------------------------------ */

export type OrderStatus =
  | "new"
  | "awaiting-review"
  | "awaiting-payment"
  | "payment-received"
  | "in-preparation"
  | "awaiting-verification"
  | "ready-collection"
  | "out-for-delivery"
  | "collected"
  | "delivered"
  | "cancelled"
  | "on-hold";

export interface OrderLine {
  id: string;
  medicineId: string;
  strength: string;
  qty: number;
  unitPrice: number;
  gstRate: number;
  rxLineId?: string;
  instructions: string;
  /** Set at pharmacist review. Stock is held against these batches until hand-over. */
  allocations: { batchId: string; qty: number }[];
}

export interface OrderEvent {
  at: string;
  by: string;
  role: Role;
  action: string;
  status?: OrderStatus;
  note?: string;
}

export interface Order {
  id: string;
  token: string;
  patientId: string;
  /** Prescription reference. Missing for a non-prescription medication request. */
  prescriptionId?: string;
  source: "prescription" | "request";
  lines: OrderLine[];
  fulfilment: "collection" | "delivery";
  status: OrderStatus;
  heldFrom?: OrderStatus;
  patientConfirmed: { by: string; at: string; method: string };
  review?: { by: string; at: string; outcome: "approved" | "rejected"; note?: string };
  invoiceId?: string;
  preparation: { status: "not-started" | "in-progress" | "done"; by?: string; startedAt?: string; doneAt?: string };
  verification: { status: "pending" | "approved" | "rejected"; by?: string; at?: string; note?: string };
  estimatedReady: string;
  deliveryAddress?: string;
  deliveryId?: string;
  collectedBy?: string;
  completedAt?: string;
  inventoryDeducted: boolean;
  counsellingId?: string;
  createdAt: string;
  createdBy: string;
  notes?: string;
  events: OrderEvent[];
}

export interface Delivery {
  id: string;
  kind: "order" | "tray";
  refId: string;
  patientId: string;
  address: string;
  assignedTo?: string;
  estimatedDate: string;
  status: "scheduled" | "out" | "delivered" | "failed";
  authorisedRecipient: string;
  receivedBy?: string;
  dispatchedAt?: string;
  deliveredAt?: string;
  notes?: string;
}

export interface Counselling {
  id: string;
  patientId?: string;
  orderId?: string;
  forWhom: "patient" | "child" | "other-adult";
  forName?: string;
  reasonType: "symptoms" | "repeat" | "advice";
  symptoms?: string;
  duration?: string;
  otherMedicines?: string;
  allergies?: string;
  history?: string;
  advice: string;
  referral: boolean;
  referralNotes?: string;
  at: string;
  by: string;
}

/* ------------------------------------------------------------------ */
/* Billing                                                             */
/* ------------------------------------------------------------------ */

export type InvoiceStatus = "draft" | "issued" | "paid" | "overdue" | "refunded" | "cancelled";
export type PaymentMethod = "Cash" | "UPI" | "Card" | "Bank transfer";

export interface InvoiceLine {
  id: string;
  description: string;
  /** product = medicine charge, service = MDS or other service charge. */
  kind: "product" | "service";
  medicineId?: string;
  qty: number;
  unitPrice: number;
  /** Discount on the line, in rupees. */
  discount?: number;
  gstRate: number;
}

export interface Payment {
  id: string;
  at: string;
  /** Positive for payments and charges, negative for refunds and credits. */
  amount: number;
  kind: "payment" | "refund" | "adjustment";
  method?: PaymentMethod;
  note?: string;
  by: string;
}

export interface Invoice {
  id: string;
  patientId: string;
  issuedOn: string;
  dueOn: string;
  status: InvoiceStatus;
  lines: InvoiceLine[];
  payments?: Payment[];
  orderId?: string;
  trayId?: string;
  cycleId?: string;
  /**
   * The patient already obtained their medicines lawfully and pays only for the
   * medication-management service. An accounting distinction only: it never
   * skips a pharmacist check or authorises repackaging.
   */
  ownMedicinesDeclared?: boolean;
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

/* ------------------------------------------------------------------ */
/* Activity, documents, settings                                       */
/* ------------------------------------------------------------------ */

export type ActivityKind =
  | "patient"
  | "prescription"
  | "tray"
  | "preparation"
  | "verification"
  | "inventory"
  | "document"
  | "billing"
  | "order"
  | "delivery"
  | "mds"
  | "counselling"
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
  orderId?: string;
  documentType?: DocumentType;
}

export type DocumentType =
  | "label"
  | "backing"
  | "identification"
  | "med-chart-weekly"
  | "med-chart-monthly"
  | "mar-weekly"
  | "mar-monthly"
  | "mar-template"
  | "current-meds"
  | "med-history"
  | "cycle-report"
  | "dispensing-history"
  | "fulfilment-history"
  | "summary"
  | "patient-card"
  | "token"
  | "invoice";

/** A generated document, kept so reprints have a version history. */
export interface GeneratedDocument {
  id: string;
  type: DocumentType;
  refId: string;
  patientId?: string;
  version: number;
  action: "previewed" | "printed" | "downloaded" | "reprinted";
  templateId?: string;
  at: string;
  by: string;
}

export interface BackingTemplate {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  showQr: boolean;
  showIdentification: boolean;
  note: string;
}

export interface PharmacySettings {
  pharmacyName: string;
  addressLine: string;
  phone: string;
  gstPlaceholder: string;
  defaultGstRate: number;
  serviceGstRate: number;
  mdsWeeklyFee: number;
  deliveryFee: number;
  tokenPrepMinutes: number;
  lowStockDays: number;
  expiryWarningDays: number;
  autoAdvance: boolean;
  tourEnabled: boolean;
  backingTemplates: BackingTemplate[];
  defaultTemplateId: string;
  deliveryStaff: string[];
}
