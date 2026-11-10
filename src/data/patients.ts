import { addDays, today } from "@/lib/dates";
import { makeQrToken } from "@/lib/ids";
import type { MdsStatus, Patient, PatientDocument } from "@/types";

type Row = {
  id: string; name: string; dob: string; gender: Patient["gender"]; area: string; mds: MdsStatus;
  doctor: [string, string]; caregiver?: [string, string]; emergency: [string, string];
  conditions: string[]; allergies: string[]; regDaysAgo: number; notes?: string;
};

// All people below are fictional. Phone numbers use a reserved-looking demo prefix.
const ROWS: Row[] = [
  { id: "PT-1001", name: "Lakshmi Sundaram", dob: "1948-03-12", gender: "Female", area: "Mylapore", mds: "active", doctor: ["Dr. Priya Natarajan", "Kapaleeshwar Clinic"], caregiver: ["Karthik Sundaram", "Son"], emergency: ["Karthik Sundaram", "Son"], conditions: ["Type 2 diabetes", "Hypertension", "High cholesterol"], allergies: ["Penicillin"], regDaysAgo: 214, notes: "Prefers large-print labels. Son collects the tray on Saturdays." },
  { id: "PT-1002", name: "Raghavan Iyer", dob: "1941-11-02", gender: "Male", area: "T. Nagar", mds: "active", doctor: ["Dr. S. Bhaskar", "Panagal Park Medical"], caregiver: ["Uma Raghavan", "Wife"], emergency: ["Uma Raghavan", "Wife"], conditions: ["Hypertension", "Atrial fibrillation"], allergies: [], regDaysAgo: 243 },
  { id: "PT-1003", name: "Kamala Devi", dob: "1952-07-25", gender: "Female", area: "Adyar", mds: "active", doctor: ["Dr. Priya Natarajan", "Kapaleeshwar Clinic"], emergency: ["Suresh Devi", "Nephew"], conditions: ["Type 2 diabetes", "Hypothyroidism"], allergies: ["Sulfonamides"], regDaysAgo: 198 },
  { id: "PT-1004", name: "Murugan Pillai", dob: "1946-01-30", gender: "Male", area: "Velachery", mds: "active", doctor: ["Dr. Anitha Rao", "Velachery Family Practice"], caregiver: ["Selvi Murugan", "Daughter"], emergency: ["Selvi Murugan", "Daughter"], conditions: ["Heart failure", "Hypertension"], allergies: [], regDaysAgo: 171 },
  { id: "PT-1005", name: "Saroja Venkatesh", dob: "1939-09-18", gender: "Female", area: "Besant Nagar", mds: "active", doctor: ["Dr. S. Bhaskar", "Panagal Park Medical"], caregiver: ["Ramesh Venkatesh", "Son"], emergency: ["Ramesh Venkatesh", "Son"], conditions: ["Alzheimer's disease", "Hypertension", "Osteoarthritis"], allergies: ["Aspirin"], regDaysAgo: 155, notes: "Caregiver gives all doses." },
  { id: "PT-1006", name: "Thomas Mathew", dob: "1950-05-05", gender: "Male", area: "Anna Nagar", mds: "active", doctor: ["Dr. Rekha Menon", "Anna Nagar Heart Centre"], emergency: ["Annie Mathew", "Wife"], conditions: ["Coronary artery disease", "High cholesterol"], allergies: [], regDaysAgo: 142 },
  { id: "PT-1007", name: "Fathima Begum", dob: "1955-12-14", gender: "Female", area: "Royapettah", mds: "active", doctor: ["Dr. Rekha Menon", "Anna Nagar Heart Centre"], caregiver: ["Ayesha Begum", "Daughter"], emergency: ["Ayesha Begum", "Daughter"], conditions: ["Hypertension", "Type 2 diabetes"], allergies: ["Codeine"], regDaysAgo: 128 },
  { id: "PT-1008", name: "Gopal Krishnan", dob: "1944-04-22", gender: "Male", area: "Nungambakkam", mds: "active", doctor: ["Dr. Anitha Rao", "Velachery Family Practice"], emergency: ["Mohan Krishnan", "Brother"], conditions: ["Atrial fibrillation", "Epilepsy"], allergies: [], regDaysAgo: 110, notes: "Some medicines are not tray-appropriate. Keep separate packs." },
  { id: "PT-1009", name: "Vasantha Rao", dob: "1947-08-09", gender: "Female", area: "Alwarpet", mds: "active", doctor: ["Dr. S. Bhaskar", "Panagal Park Medical"], caregiver: ["Nirmala Rao", "Daughter-in-law"], emergency: ["Nirmala Rao", "Daughter-in-law"], conditions: ["Depression", "Hypertension"], allergies: ["Lactose"], regDaysAgo: 96 },
  { id: "PT-1010", name: "Selvam Arumugam", dob: "1953-02-17", gender: "Male", area: "Tambaram", mds: "active", doctor: ["Dr. Vijay Chandran", "Tambaram Health Point"], emergency: ["Geetha Selvam", "Wife"], conditions: ["Benign prostatic enlargement", "Type 2 diabetes"], allergies: [], regDaysAgo: 83 },
  { id: "PT-1011", name: "Janaki Raman", dob: "1949-10-28", gender: "Female", area: "Kodambakkam", mds: "assessment", doctor: ["Dr. Vijay Chandran", "Tambaram Health Point"], caregiver: ["Latha Raman", "Daughter"], emergency: ["Latha Raman", "Daughter"], conditions: ["Osteoporosis", "Hypertension"], allergies: [], regDaysAgo: 61, notes: "Being assessed for weekly trays." },
  { id: "PT-1012", name: "Imran Sheriff", dob: "1968-06-11", gender: "Male", area: "Triplicane", mds: "none", doctor: ["Dr. Priya Natarajan", "Kapaleeshwar Clinic"], emergency: ["Sameena Sheriff", "Wife"], conditions: ["Chest infection"], allergies: [], regDaysAgo: 44 },
  { id: "PT-1013", name: "Padma Nair", dob: "1958-03-03", gender: "Female", area: "Guindy", mds: "none", doctor: ["Dr. Anitha Rao", "Velachery Family Practice"], emergency: ["Vinod Nair", "Husband"], conditions: ["Hypothyroidism"], allergies: ["Ibuprofen"], regDaysAgo: 30 },
  { id: "PT-1014", name: "David Joseph", dob: "1962-09-20", gender: "Male", area: "Perambur", mds: "none", doctor: ["Dr. Rekha Menon", "Anna Nagar Heart Centre"], emergency: ["Mary Joseph", "Wife"], conditions: ["Asthma"], allergies: [], regDaysAgo: 21 },
  { id: "PT-1015", name: "Revathi Balaji", dob: "1951-12-01", gender: "Female", area: "Porur", mds: "none", doctor: ["Dr. Vijay Chandran", "Tambaram Health Point"], caregiver: ["Balaji Kumar", "Husband"], emergency: ["Balaji Kumar", "Husband"], conditions: ["Type 2 diabetes", "Neuropathy"], allergies: [], regDaysAgo: 12, notes: "Husband asked about weekly trays. Not yet enrolled." },
  { id: "PT-1016", name: "Anand Subramanian", dob: "1943-06-27", gender: "Male", area: "Egmore", mds: "paused", doctor: ["Dr. S. Bhaskar", "Panagal Park Medical"], emergency: ["Shanthi Anand", "Wife"], conditions: ["High cholesterol", "Hypertension"], allergies: [], regDaysAgo: 5, notes: "Trays paused during a hospital stay." },
  // Standard dispensing customers, not on MDS.
  { id: "PT-1017", name: "Arul Prakash", dob: "1979-08-14", gender: "Male", area: "Saidapet", mds: "none", doctor: ["Dr. Rekha Menon", "Anna Nagar Heart Centre"], emergency: ["Deepa Prakash", "Wife"], conditions: ["Hypertension", "High cholesterol"], allergies: [], regDaysAgo: 60 },
  { id: "PT-1018", name: "Nisha Varghese", dob: "1990-02-03", gender: "Female", area: "Kilpauk", mds: "none", doctor: ["Dr. Anitha Rao", "Velachery Family Practice"], emergency: ["Thomas Varghese", "Father"], conditions: ["Hypothyroidism"], allergies: ["Latex"], regDaysAgo: 9 },
];

// What each patient said they were taking when registered. Free text, not an authorised list.
const REPORTED: Record<string, string> = {
  "PT-1001": "Metformin twice daily, amlodipine, a statin at night (as reported by son).",
  "PT-1003": "Diabetes tablets and a thyroid tablet before breakfast.",
  "PT-1008": "Blood thinner from the anticoagulation clinic. Epilepsy tablets twice a day.",
  "PT-1012": "Occasional paracetamol.",
  "PT-1013": "Thyroid tablet, dose unsure.",
  "PT-1014": "Blue reliever inhaler when needed.",
  "PT-1015": "Metformin, and \"the same tablets as before\" for nerve pain.",
};

export const buildPatients = (): Patient[] =>
  ROWS.map((r, i) => {
    const registeredOn = addDays(today(), -r.regDaysAgo);
    const docs: PatientDocument[] = [
      { id: `DOC-${r.id}-1`, title: "Scanned prescription (sample)", kind: "Prescription file", addedOn: registeredOn, status: "On file" },
    ];
    if (r.mds !== "none") {
      docs.push({
        id: `DOC-${r.id}-2`,
        title: "Weekly tray consent (sample)",
        kind: "Consent record",
        addedOn: addDays(registeredOn, 2),
        status: r.mds === "assessment" ? "Awaiting signature" : "On file",
      });
      docs.push({ id: `DOC-${r.id}-3`, title: "Tray suitability assessment (sample)", kind: "Assessment", addedOn: addDays(registeredOn, 3), status: "On file" });
    }
    const first = r.name.split(" ")[0].toLowerCase();
    return {
      id: r.id,
      qrToken: makeQrToken(r.id),
      name: r.name,
      dob: r.dob,
      gender: r.gender,
      phone: `+91 90000 1${String(i + 1).padStart(4, "0")}`,
      email: i % 3 === 1 ? undefined : `${first}.demo@example.com`,
      reportedMedication: REPORTED[r.id] ?? "None reported at registration.",
      consent: { given: true, by: r.caregiver && r.mds !== "none" ? "caregiver" : "patient", recordedOn: registeredOn },
      representative: r.caregiver ? { name: r.caregiver[0], relation: r.caregiver[1], phone: `+91 90000 3${String(i + 1).padStart(4, "0")}` } : undefined,
      address: `${12 + i * 7}, Demo Street, ${r.area}, Chennai`,
      doctor: { name: r.doctor[0], clinic: r.doctor[1], phone: `+91 90000 2${String(i + 1).padStart(4, "0")}` },
      caregiver: r.caregiver ? { name: r.caregiver[0], relation: r.caregiver[1], phone: `+91 90000 3${String(i + 1).padStart(4, "0")}` } : undefined,
      emergencyContact: { name: r.emergency[0], relation: r.emergency[1], phone: `+91 90000 4${String(i + 1).padStart(4, "0")}` },
      conditions: r.conditions,
      allergies: r.allergies,
      mdsStatus: r.mds,
      registeredOn,
      notes: r.notes,
      documents: docs,
    };
  });

export const JOURNEY_PATIENT_ID = "PT-1001";
