import type { Permission } from "@/lib/permissions";
import type { Activity, ActivityKind, StaffUser } from "@/types";
import type { AppState } from "./app-store";

export interface Result { ok: boolean; message: string; id?: string }
export const fail = (message: string): Result => ({ ok: false, message });
export const pass = (message: string, id?: string): Result => ({ ok: true, message, id });

/** Shared helpers every store slice uses, so all modules write the same state the same way. */
export interface Ctx {
  set: (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void;
  get: () => AppState;
  actor: () => StaffUser;
  allowed: (perm: Permission) => boolean;
  denied: (what: string) => Result;
  log: (kind: ActivityKind, summary: string, refs?: Partial<Activity>) => void;
  patientName: (id: string) => string;
  uid: (prefix: string) => string;
  nextNumber: (ids: string[], prefix: string, floor: number) => string;
  /** Re-checks every tray against its source prescriptions. Returns how many approvals were lost. */
  revalidate: () => number;
  now: () => string;
}
