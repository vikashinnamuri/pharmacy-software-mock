import { useEffect } from "react";
import { useNavigate } from "react-router";
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronUp, Compass, SkipForward, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { SCENARIOS, scenarioById } from "./journey";

/** Client-meeting guide. Three connected scenarios plus the original tour. Advances by watching real app state. */
export function DemoGuide() {
  const navigate = useNavigate();
  const state = useAppStore();
  const { journeyStep: step, journeyOpen: open, journeyScenario, setJourneyStep, setJourneyOpen, setJourneyScenario, setRole, role, settings } = state;
  const scenario = scenarioById(journeyScenario);
  const steps = scenario.steps;

  useEffect(() => {
    if (step < steps.length && steps[step].done(state)) {
      if (step === steps.length - 1) toast.success(`Scenario ${scenario.short} complete`);
      setJourneyStep(step + 1);
    }
  }, [state, step, steps, scenario.short, setJourneyStep]);

  if (!settings.tourEnabled) return null;
  const finished = step >= steps.length;
  const current = steps[Math.min(step, steps.length - 1)];
  const pct = Math.round((Math.min(step, steps.length) / steps.length) * 100);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setJourneyOpen(true)}
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-sidebar py-2 pr-4 pl-3 text-sm font-semibold text-white shadow-lg hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Compass className="size-4" /> {scenario.short} {Math.min(step, steps.length)}/{steps.length}
        <ChevronUp className="size-4" />
      </button>
    );
  }

  return (
    <aside aria-label="Demo scenarios" className="fixed right-4 bottom-4 z-40 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-sidebar-border bg-sidebar text-white shadow-2xl">
      <div className="h-1 bg-sidebar-accent"><div className="h-full bg-sidebar-primary transition-all duration-500" style={{ width: `${pct}%` }} /></div>
      <div className="flex flex-wrap gap-1 px-3 pt-2.5" role="tablist" aria-label="Choose a scenario">
        {SCENARIOS.map((sc) => (
          <button key={sc.id} type="button" role="tab" aria-selected={sc.id === scenario.id} onClick={() => setJourneyScenario(sc.id)}
            className={cn("rounded-md px-2 py-1 text-[11.5px] font-semibold transition-colors", sc.id === scenario.id ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-[#C9D5E6] hover:bg-sidebar-accent")}>
            {sc.short}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between px-4 pt-2">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[#9FD8D5]">
          <Compass className="size-4" /> {finished ? `${scenario.title}: complete` : `${scenario.title}, step ${step + 1} of ${steps.length}`}
        </p>
        <button type="button" aria-label="Minimise guide" onClick={() => setJourneyOpen(false)} className="rounded p-1 text-[#C9D5E6] hover:bg-sidebar-accent hover:text-white">
          <ChevronDown className="size-4" />
        </button>
      </div>
      {finished ? (
        <div className="px-4 pt-1 pb-4">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-5 text-sidebar-primary" /> All {steps.length} steps done</p>
          <p className="mt-1 text-[13px] text-[#C9D5E6]">Everything ran in this browser and survives a refresh. Try another scenario, or reset demo data in Settings.</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setJourneyStep(0)}>Replay</Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-sidebar-accent hover:text-white" onClick={() => setJourneyOpen(false)}><X className="size-3.5" /> Close</Button>
          </div>
        </div>
      ) : (
        <div className="px-4 pt-1 pb-3">
          <p className="font-semibold">{current.title}</p>
          <p className="mt-1 text-[13px] leading-snug text-[#C9D5E6]">{current.hint}</p>
          <div className="mt-3 flex items-center gap-1.5">
            <Button
              size="sm"
              className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-[#3CC6C1]"
              onClick={() => {
                if (current.role && current.role !== role) {
                  setRole(current.role);
                  toast.info(`Switched to ${ROLE_LABEL[current.role]}`);
                }
                navigate(current.href(useAppStore.getState()));
              }}
            >
              {current.role && current.role !== role ? `Switch to ${ROLE_LABEL[current.role]} and go` : "Take me there"}
            </Button>
            <div className="ml-auto flex">
              <button type="button" aria-label="Previous step" disabled={step === 0} onClick={() => setJourneyStep(Math.max(0, step - 1))} className={cn("rounded p-1.5 text-[#C9D5E6] hover:bg-sidebar-accent hover:text-white", step === 0 && "opacity-40")}>
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" aria-label="Skip this step" onClick={() => setJourneyStep(step + 1)} className="rounded p-1.5 text-[#C9D5E6] hover:bg-sidebar-accent hover:text-white">
                <SkipForward className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
