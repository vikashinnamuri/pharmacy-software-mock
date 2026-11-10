import { useMemo, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PillArt } from "@/components/common/pill-art";
import { SuitabilityBadge } from "@/components/common/status-badge";
import { useAppStore } from "@/store/app-store";

/**
 * Searchable medicine picker. Typing a generic or brand name groups the
 * matching catalogue entries so the available strengths and forms show together.
 */
export function MedicineCombobox({ value, onChange, id, placeholder = "Search generic or brand name", invalid }: { value?: string; onChange: (id: string) => void; id?: string; placeholder?: string; invalid?: boolean }) {
  const medicines = useAppStore((s) => s.medicines);
  const [open, setOpen] = useState(false);
  const current = medicines.find((m) => m.id === value);
  const groups = useMemo(() => {
    const g = new Map<string, typeof medicines>();
    [...medicines].sort((a, b) => a.generic.localeCompare(b.generic) || a.strength.localeCompare(b.strength)).forEach((m) => g.set(m.generic, [...(g.get(m.generic) ?? []), m]));
    return [...g.entries()];
  }, [medicines]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={
        <Button id={id} type="button" variant="outline" aria-invalid={invalid} className="h-auto min-h-9 w-full justify-between gap-2 bg-card px-2.5 py-1.5 text-left font-normal">
          {current ? (
            <span className="flex min-w-0 items-center gap-2">
              <PillArt medicine={current} size={22} />
              <span className="min-w-0 leading-tight">
                <span className="block truncate font-semibold">{current.brand} {current.strength}</span>
                <span className="block truncate text-xs text-muted-foreground">{current.generic}, {current.form.toLowerCase()}, {current.formulation.toLowerCase()}</span>
              </span>
            </span>
          ) : <span className="text-muted-foreground">{placeholder}</span>}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      } />
      <PopoverContent align="start" className="w-[min(420px,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder="Type a medicine name, for example metformin" />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>No medicine in the demo catalogue matches. Add it from the Medicine Catalogue.</CommandEmpty>
            {groups.map(([generic, list]) => (
              <CommandGroup key={generic} heading={`${generic}: ${list.map((m) => `${m.strength} ${m.form.toLowerCase()}`).join(", ")}`}>
                {list.map((m) => (
                  <CommandItem key={m.id} value={`${m.generic} ${m.brand} ${m.strength} ${m.form} ${m.productCode}`} onSelect={() => { onChange(m.id); setOpen(false); }}>
                    <PillArt medicine={m} size={22} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block font-medium">{m.brand} {m.strength}</span>
                      <span className="block text-xs text-muted-foreground">{m.form}, {m.formulation}. Pack of {m.packSize}</span>
                    </span>
                    <SuitabilityBadge status={m.suitability} />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
