# Marina Care Pharmacy: PMR and MDS demo

**DEMO — NOT FOR CLINICAL USE.** A frontend-only prototype of a pharmacy Patient Medication Record and weekly Monitored Dosage System workflow, built for a client discovery meeting. All people, medicines, prescribers and companies are fictional.

There is no backend, database, authentication or API. Everything runs in the browser and persists in `localStorage`. Role checks are UI simulations, not security.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
# or a production build
npm run build && npm run preview
# deploy the static build to Cloudflare (Workers Static Assets, SPA fallback)
npm run deploy
```

## Presenting it

A walkthrough panel sits in the bottom-right corner. It covers the 16-step journey from the brief, advances by itself as you work, and can switch role and take you to the right screen. Turn it off, or use **Reset Demo Data**, in Settings.

Useful moments to show:

- **MDS Weekly Trays**: hover a medicine under the tray to see every compartment it sits in. Arrow keys move between compartments. Generate a schedule for a patient with no tray to watch the wells fill.
- **Tray Preparation**: press `P` to seal a compartment, `D` to report a discrepancy, `V` to view the prescription, `N` for next.
- **Switch roles** in the header at any time. A blocked action explains why and offers to switch.
- **Change something after approval**: amend or discontinue a prescription behind an approved tray, or change a batch, and the approval is invalidated.

Seeded scenarios: TRY-1004 ready to supply, TRY-1005 awaiting preparation, TRY-1006 part prepared, TRY-1007 awaiting verification, TRY-1008 rejected with TRY-1009 as its replacement, TRY-1010 approval invalidated, TRY-1011 unsuitable medicines left out, TRY-1012 correction requested.

## Workflow rules

- The schedule generator reads verified prescriptions only and never infers a time, dose or suitability. Anything else shows as "Requires Pharmacist Review" and stays out of the tray.
- Prescriptions are never verified automatically. Each line needs an explicit tray decision.
- Dispensing Staff prepare but cannot approve. Only the simulated Pharmacist verifies.
- An approval lapses when its prescription, medicine or tray contents change (fingerprint comparison in `src/store/app-store.ts`).
- Stock is reserved on schedule approval and deducted once on supply, never below zero. Expired batches are never allocated.

## Code map

| Path | What it holds |
| --- | --- |
| `src/main.tsx`, `src/routes.tsx` | App entry and the route table (each page lazy-loaded) |
| `src/pages` | One component per screen |
| `src/types` | Domain interfaces |
| `src/data` | Seed records; dates are relative to the day of first load |
| `src/store/app-store.ts` | The single Zustand store and every workflow action |
| `src/lib/tray-engine.ts` | Schedule generation, stock allocation, fingerprints |
| `src/lib/selectors.ts`, `reports.ts` | Derived counts shared by dashboard, tables and charts |
| `src/lib/pdf/documents.ts` | Client-side jsPDF documents |
| `src/components/tray` | The tray grid, compartment drawer and lifecycle |

Requires Node 22.22 or later.

Stack: Vite, React, React Router, TypeScript, Tailwind CSS, shadcn/ui on Base UI, Lucide, Zustand, React Hook Form with Zod, TanStack Table, Recharts, jsPDF.
