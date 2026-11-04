"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cloneElement, isValidElement, useId, useState } from "react";
import { AlertTriangle, Lock, Sunrise, Sun, Sunset, Moon, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { can, ROLE_LABEL, rolesFor, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useAppStore, type Result } from "@/store/app-store";
import type { Period, Role } from "@/types";

export function notify(r: Result) {
  if (r.ok) toast.success(r.message);
  else toast.error(r.message);
  return r.ok;
}

export function Card({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div className={cn("rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(18_38_74/0.05)]", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({ title, action, hint }: { title: string; action?: ReactNode; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div>
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        {hint && <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="max-w-2xl">
        <h1 className="text-[26px] leading-tight font-bold tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ClinicalNotice({ children }: { children?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-warn/25 bg-warn-bg px-3 py-2 text-[13px] text-warn">
      <ShieldAlert className="mt-0.5 size-4 shrink-0" />
      <span>
        <strong>Demonstration only, not for clinical use.</strong> {children ?? "All people, medicines and decisions on this screen are simulated."}
      </span>
    </div>
  );
}

const BUTTON_ROLE_PRIORITY: Role[] = ["pharmacist", "dispenser", "admin"];

/** Hook for the "blocked action" explanation: tell why, offer the role that can do it. */
export function useGuard() {
  const role = useAppStore((s) => s.role);
  const setRole = useAppStore((s) => s.setRole);
  return (perm: Permission, what: string) => {
    if (can(role, perm)) return true;
    const target = BUTTON_ROLE_PRIORITY.find((r) => rolesFor(perm).includes(r))!;
    toast.warning(`${ROLE_LABEL[role]} cannot ${what}`, {
      description: `Only ${rolesFor(perm).map((r) => ROLE_LABEL[r]).join(" or ")} can do this in the demo. This is a UI simulation, not security.`,
      action: { label: `Switch to ${ROLE_LABEL[target]}`, onClick: () => setRole(target) },
    });
    return false;
  };
}

/**
 * A button tied to a simulated permission. If the role lacks it, the button stays
 * clickable and explains why, with a one-click role switch. Nothing is ever dead.
 */
export function GuardedButton({
  perm, what, onClick, children, variant, size, className, disabled, type,
}: {
  perm: Permission;
  what: string;
  onClick?: () => void;
} & Pick<ComponentProps<typeof Button>, "children" | "variant" | "size" | "className" | "disabled" | "type">) {
  const role = useAppStore((s) => s.role);
  const guard = useGuard();
  const ok = can(role, perm);
  return (
    <Button
      type={type ?? "button"}
      variant={ok ? variant : "outline"}
      size={size}
      className={cn(!ok && "border-dashed text-muted-foreground", className)}
      disabled={disabled && ok}
      onClick={() => {
        if (guard(perm, what)) onClick?.();
      }}
    >
      {!ok && <Lock className="size-3.5" />}
      {children}
    </Button>
  );
}

export function Pick<T extends string>({
  value, onChange, options, placeholder, className, id, size,
}: {
  value: T | "" | undefined;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  placeholder?: string;
  className?: string;
  id?: string;
  size?: "sm" | "default";
}) {
  return (
    <Select<string> items={options} value={(value ?? "") as string} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger id={id} size={size} className={cn("w-full bg-card", className)}>
        <SelectValue placeholder={placeholder ?? "Select"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Labels its control automatically: the single child element receives the generated id. */
export function Field({ label, error, children, hint, className, htmlFor }: { label: string; error?: string; children: ReactNode; hint?: string; className?: string; htmlFor?: string }) {
  const generated = useId();
  const child = isValidElement<{ id?: string; "aria-invalid"?: boolean }>(children) ? children : null;
  const id = htmlFor ?? child?.props.id ?? generated;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-[13px] font-medium text-foreground">{label}</Label>
      {child ? cloneElement(child, { id, "aria-invalid": error ? true : undefined }) : children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="flex items-center gap-1 text-xs text-danger"><AlertTriangle className="size-3" />{error}</p>}
    </div>
  );
}

/** Dialog that asks for confirmation, optionally with a required reason. */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel, onConfirm, reasonLabel, reasonRequired, destructive, placeholder, children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: (reason: string) => void;
  reasonLabel?: string;
  reasonRequired?: boolean;
  destructive?: boolean;
  placeholder?: string;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setReason(""); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {reasonLabel && (
          <Field label={reasonLabel}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} rows={3} autoFocus />
          </Field>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={reasonRequired && !reason.trim()}
            onClick={() => { onConfirm(reason.trim()); setReason(""); onOpenChange(false); }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon && <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export const PERIOD_META: Record<Period, { label: string; time: string; icon: typeof Sun; tint: string }> = {
  morning: { label: "Morning", time: "8 am", icon: Sunrise, tint: "text-[#B9750F]" },
  lunchtime: { label: "Lunchtime", time: "1 pm", icon: Sun, tint: "text-[#C9860B]" },
  evening: { label: "Evening", time: "6 pm", icon: Sunset, tint: "text-[#C2571A]" },
  bedtime: { label: "Bedtime", time: "10 pm", icon: Moon, tint: "text-[#35507E]" },
};

export function TextLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return <Link href={href} className={cn("font-medium text-primary hover:underline", className)}>{children}</Link>;
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={cn("h-9 max-w-xs bg-card", className)} />;
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div>
      <div className={cn("text-xl font-bold", tone)}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
