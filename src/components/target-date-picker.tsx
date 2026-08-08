import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { fmtBRShort } from "@/lib/utils";

function iso(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

interface Props {
  value: string | undefined;
  onChange: (targetDate: string) => void;
}

/**
 * Unlike DateRangePicker/ImportCalendar (restricted to `availableDates`
 * that already have data), Production Planning has no such restriction in
 * either direction: a future day is a forecast (planning ahead), a past
 * day recomputes what the forecast would have said (conferência, or
 * catching up on a day someone forgot to check before it happened) -- see
 * docs/planejamento-producao-perecveis-2026-08-07.md. The proc itself
 * already only ever looks at sale_date strictly before p_target_date, so
 * a past target date isn't a special case for it, just a normal call.
 */
export function TargetDatePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const selected = value ? new Date(value + "T00:00:00") : undefined;

  const handleSelect = (d: Date | undefined) => {
    if (!d) return;
    onChange(iso(d));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 w-full max-w-full justify-start gap-2 text-left font-normal"
        >
          <CalendarIcon className="size-4 opacity-60" />
          <span className="truncate whitespace-nowrap min-w-0">
            {value ? fmtBRShort(value) : "Selecione um dia"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" collisionPadding={24}>
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          defaultMonth={selected}
          numberOfMonths={1}
          className="p-2 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}
