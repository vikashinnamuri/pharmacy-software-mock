
import { Link, useLocation, useNavigate } from "react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3, Bell, Boxes, CalendarRange, ClipboardCheck, CreditCard, FileText, Grid3x3, HandHelping, LayoutDashboard, Menu, Pill, ScrollText, Search, Settings, ShieldAlert,
  ShoppingBag, Store, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PillArt } from "@/components/common/pill-art";
import { kpis, notificationsFor } from "@/lib/selectors";
import { fmtShort } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { Role } from "@/types";
import { ROLES } from "@/types";
import { ROLE_LABEL } from "@/lib/permissions";
import { DemoGuide } from "./demo-guide";

const NAV = [
  { href: "/", label: "Overview Dashboard", icon: LayoutDashboard },
  { href: "/patients", label: "Patients / PMR", icon: Users },
  { href: "/prescriptions", label: "Prescription Management", icon: ScrollText, count: "pendingRx" },
  { href: "/dispensing", label: "Dispensing Queue", icon: ShoppingBag, count: "ordersAwaitingReview" },
  { href: "/collection", label: "Collection & Delivery", icon: Store, count: "readyForCollection" },
  { href: "/mds", label: "MDS Management", icon: CalendarRange, count: "enrolmentsPending" },
  { href: "/trays", label: "MDS Weekly Trays", icon: Grid3x3 },
  { href: "/preparation", label: "MDS Preparation Queue", icon: HandHelping, count: "pendingPreparation" },
  { href: "/verification", label: "Pharmacist Verification", icon: ClipboardCheck, count: "allAwaitingVerification" },
  { href: "/catalogue", label: "Medicine Catalogue", icon: Pill },
  { href: "/inventory", label: "Inventory Management", icon: Boxes, count: "lowStock" },
  { href: "/documents", label: "Documents & MAR Charts", icon: FileText },
  { href: "/billing", label: "Billing & Payments", icon: CreditCard, count: "awaitingPayment" },
  { href: "/reports", label: "Reports & Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings & Admin", icon: Settings },
] as const;

function BrandMark() {
  // A tiny blister card: the product's own object.
  return (
    <svg viewBox="0 0 36 36" className="size-9 shrink-0" aria-hidden>
      <rect x="1" y="1" width="34" height="34" rx="9" fill="#1C3560" stroke="#2BB5B0" strokeOpacity=".5" />
      {[0, 1, 2].map((y) => [0, 1, 2].map((x) => (
        <rect key={`${x}${y}`} x={7 + x * 8} y={7 + y * 8} width="6" height="6" rx="1.8" fill={x === y ? "#2BB5B0" : "#3A5688"} />
      )))}
    </svg>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const name = useAppStore((s) => s.settings.pharmacyName);
  const state = useAppStore();
  const counts = useMemo(() => kpis(state), [state]);
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Link to="/" onClick={onNavigate} className="flex items-center gap-2.5 px-4 py-4">
        <BrandMark />
        <span>
          <span className="block leading-tight font-bold text-white">{name}</span>
          <span className="block text-xs text-[#9FB2CC]">Dispensing and MDS Dossett</span>
        </span>
      </Link>
      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-3">
        {NAV.map((n) => {
          const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          const count = "count" in n ? (counts[n.count] as number) : 0;
          return (
            <Link
              key={n.href}
              to={n.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
                active ? "bg-sidebar-accent font-semibold text-white shadow-[inset_3px_0_0_var(--sidebar-primary)]" : "hover:bg-sidebar-accent/60 hover:text-white",
              )}
            >
              <n.icon className={cn("size-[18px] shrink-0", active && "text-sidebar-primary")} />
              <span className="flex-1 leading-tight">{n.label}</span>
              {count > 0 && <span className="rounded-full bg-[#2A4778] px-1.5 text-xs font-semibold text-white">{count}</span>}
            </Link>
          );
        })}
      </nav>
      <p className="border-t border-sidebar-border px-4 py-3 text-xs leading-snug text-[#9FB2CC]">
        Runs entirely in this browser. Synthetic data only.
      </p>
    </div>
  );
}

function RoleSwitcher() {
  const role = useAppStore((s) => s.role);
  const setRole = useAppStore((s) => s.setRole);
  const staff = useAppStore((s) => s.staff);
  const user = staff.find((u) => u.role === role)!;
  return (
    <div className="flex items-center gap-2.5">
      <label className="flex items-center gap-1.5 text-[13px]" title="UI-only simulation, not security enforcement">
        <span className="hidden text-muted-foreground sm:inline">Demo role</span>
        <select
          aria-label="Demo role. UI simulation only, not security."
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="h-9 rounded-lg border border-input bg-sidebar px-2.5 text-[13px] font-semibold text-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </label>
      <div className="hidden items-center gap-2 xl:flex">
        <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">{user.initials}</span>
        <span className="leading-tight">
          <span className="block text-[13px] font-semibold">{user.name}</span>
          <span className="block text-xs text-muted-foreground">{user.roleLabel}, simulated</span>
        </span>
      </div>
    </div>
  );
}

function Notifications() {
  const navigate = useNavigate();
  const state = useAppStore();
  const [open, setOpen] = useState(false);
  const items = useMemo(() => notificationsFor(state, state.role), [state]);
  const read = state.readNotifications;
  const unread = items.filter((i) => !read.includes(i.id));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={`Notifications, ${unread.length} unread`} className="relative">
            <Bell className="size-[18px]" />
            {unread.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10.5px] font-bold text-white">{unread.length}</span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[360px] gap-0 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <p className="font-semibold">Notifications</p>
          <button type="button" className="text-[13px] font-medium text-primary hover:underline disabled:opacity-50" disabled={!unread.length} onClick={() => state.markNotificationsRead(items.map((i) => i.id))}>Mark all as read</button>
        </div>
        <div className="max-h-[380px] overflow-y-auto">
          {items.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nothing needs this role right now.</p>}
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => { state.markNotificationsRead([n.id]); setOpen(false); navigate(n.href); }}
              className="flex w-full items-start gap-2.5 border-b border-border/60 px-4 py-2.5 text-left last:border-0 hover:bg-accent/50"
            >
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.tone === "danger" ? "bg-danger" : n.tone === "warn" ? "bg-warn" : "bg-info", read.includes(n.id) && "opacity-25")} />
              <span>
                <span className={cn("block text-[13px]", !read.includes(n.id) && "font-semibold")}>{n.title}</span>
                <span className="block text-[13px] text-muted-foreground">{n.detail}</span>
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const patients = useAppStore((s) => s.patients);
  const medicines = useAppStore((s) => s.medicines);
  const prescriptions = useAppStore((s) => s.prescriptions);
  const trays = useAppStore((s) => s.trays);
  const orders = useAppStore((s) => s.orders);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const go = (href: string) => { setOpen(false); navigate(href); };
  const pname = (id: string) => patients.find((p) => p.id === id)?.name ?? id;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm text-muted-foreground hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate text-left">Search patients, QR codes, orders, tokens, medicines, trays</span>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 text-xs md:inline">⌘K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Find patients, medicines, prescriptions, trays and pages">
        <CommandInput placeholder="Type a name, ID or batch..." />
        <CommandList>
          <CommandEmpty>Nothing matches that search.</CommandEmpty>
          <CommandGroup heading="Patients">
            {patients.map((p) => (
              <CommandItem key={p.id} value={`${p.name} ${p.id} ${p.phone} ${p.qrToken} ${p.dob}`} onSelect={() => go(`/patients/${p.id}`)}>
                <Users className="size-4" /> {p.name} <span className="ml-auto text-xs text-muted-foreground">{p.id}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Medicines">
            {medicines.map((m) => (
              <CommandItem key={m.id} value={`${m.brand} ${m.generic} ${m.strength} ${m.id}`} onSelect={() => go(`/catalogue?q=${encodeURIComponent(m.brand)}`)}>
                <PillArt medicine={m} size={18} /> {m.brand} {m.strength} <span className="ml-auto text-xs text-muted-foreground">{m.generic}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Prescriptions">
            {prescriptions.map((p) => (
              <CommandItem key={p.id} value={`${p.id} ${pname(p.patientId)} prescription`} onSelect={() => go(`/prescriptions?view=${p.id}`)}>
                <ScrollText className="size-4" /> {p.id} <span className="ml-auto text-xs text-muted-foreground">{pname(p.patientId)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Dispensing orders">
            {orders.map((o) => (
              <CommandItem key={o.id} value={`${o.id} ${o.token} ${pname(o.patientId)} order token`} onSelect={() => go(`/dispensing?order=${o.id}`)}>
                <ShoppingBag className="size-4" /> {o.id} <span className="font-semibold">{o.token}</span> <span className="ml-auto text-xs text-muted-foreground">{pname(o.patientId)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Trays">
            {trays.map((t) => (
              <CommandItem key={t.id} value={`${t.id} ${pname(t.patientId)} tray`} onSelect={() => go(`/trays?tray=${t.id}`)}>
                <Grid3x3 className="size-4" /> {t.id} <span className="ml-auto text-xs text-muted-foreground">{pname(t.patientId)}, week of {fmtShort(t.weekStart)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Pages">
            {NAV.map((n) => (
              <CommandItem key={n.href} value={`page ${n.label}`} onSelect={() => go(n.href)}>
                <n.icon className="size-4" /> {n.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const { pathname } = useLocation();
  const name = useAppStore((s) => s.settings.pharmacyName);
  const markVisit = useAppStore((s) => s.markVisit);
  const journeyStep = useAppStore((s) => s.journeyStep);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- the store reads localStorage, so render only after mount
  useEffect(() => setMounted(true), []);
  useEffect(() => { if (mounted) markVisit(pathname); }, [pathname, mounted, markVisit, journeyStep]);

  // The public collection display is meant for a screen facing patients: no navigation, no staff tools.
  if (pathname === "/display") return <>{children}</>;

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sidebar">
        <BrandMark />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden w-[248px] shrink-0 lg:block"><SidebarBody /></aside>
      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-[260px] border-0 p-0" showCloseButton={false}>
          <SheetHeader className="sr-only"><SheetTitle>Navigation</SheetTitle><SheetDescription>Main navigation</SheetDescription></SheetHeader>
          <SidebarBody onNavigate={() => setMobileNav(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <div role="note" className="flex items-center justify-center gap-1.5 bg-[#7A4B05] px-3 py-1 text-center text-xs font-semibold text-white">
          <ShieldAlert className="size-3.5 shrink-0" /> DEMO — NOT FOR CLINICAL USE. Fictional data. Role checks are UI simulations, not security.
        </div>
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-4 py-2 lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu /></Button>
          <p className="hidden font-bold whitespace-nowrap md:block">{name}</p>
          <div className="min-w-[180px] flex-1"><GlobalSearch /></div>
          <Notifications />
          <RoleSwitcher />
        </header>
        <main id="main" className="min-w-0 flex-1 overflow-y-auto px-4 py-5 lg:px-6">
          <div className="mx-auto max-w-[1500px] pb-24">{children}</div>
        </main>
      </div>
      <DemoGuide />
    </div>
  );
}
