import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { DISPLAY_PREPARING } from "@/lib/orders";
import { useAppStore } from "@/store/app-store";

/**
 * Simulated public collection screen. Shows token numbers and status only.
 * Never a name, a medicine or anything clinical. Open it in a second tab or
 * window; it follows changes made in the main app.
 */
export default function DisplayPage() {
  const orders = useAppStore((s) => s.orders);
  const trays = useAppStore((s) => s.trays);
  const pharmacy = useAppStore((s) => s.settings.pharmacyName);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 15_000); return () => window.clearInterval(t); }, []);

  const preparing = orders.filter((o) => DISPLAY_PREPARING.includes(o.status) && o.fulfilment === "collection").sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((o) => o.token);
  const ready = [
    ...orders.filter((o) => o.status === "ready-collection" && o.fulfilment === "collection").map((o) => o.token),
    ...trays.filter((t) => t.status === "ready" && t.fulfilment?.token).map((t) => t.fulfilment!.token!),
  ];

  return (
    <div className="flex min-h-screen flex-col bg-sidebar text-white">
      <div role="note" className="flex items-center justify-center gap-1.5 bg-[#7A4B05] px-3 py-1 text-xs font-semibold"><ShieldAlert className="size-3.5" /> DEMO — NOT FOR CLINICAL USE. Simulated collection display.</div>
      <header className="flex items-center justify-between px-8 py-5">
        <div>
          <p className="text-2xl font-bold">{pharmacy}</p>
          <p className="text-[#9FB2CC]">Collection display. Please wait for your token.</p>
        </div>
        <p className="text-3xl font-bold tabular-nums">{now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</p>
      </header>
      <main className="grid flex-1 gap-6 px-8 pb-8 md:grid-cols-2">
        <section aria-label="Being prepared" className="rounded-2xl bg-sidebar-accent p-6">
          <h2 className="mb-4 text-xl font-semibold text-[#C9D5E6]">Being prepared</h2>
          <ul className="flex flex-wrap gap-3">
            {preparing.map((t) => <li key={t} className="rounded-xl bg-[#2A4778] px-5 py-3 text-4xl font-bold tabular-nums">{t}</li>)}
            {!preparing.length && <li className="text-[#9FB2CC]">No tokens in preparation</li>}
          </ul>
        </section>
        <section aria-label="Ready to collect" className="rounded-2xl bg-[#0B5E5C] p-6">
          <h2 className="mb-4 text-xl font-semibold text-[#BDEDEA]">Ready to collect</h2>
          <ul className="flex flex-wrap gap-3">
            {ready.map((t) => <li key={t} className="rounded-xl bg-[#2BB5B0] px-5 py-3 text-5xl font-bold text-[#06302F] tabular-nums">{t}</li>)}
            {!ready.length && <li className="text-[#BDEDEA]">Nothing ready yet</li>}
          </ul>
        </section>
      </main>
      <footer className="px-8 pb-4 text-xs text-[#9FB2CC]">Tokens only. Patient names and medicines are never shown on this screen.</footer>
    </div>
  );
}
