import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { fmtBRShort, todayISOBrazil } from "@/lib/utils";

function iso(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/**
 * Exported on its own so it's unit-testable without rendering the
 * Calendar: this project's jsdom setup has no Portal/ResizeObserver (see
 * admin-audit-panel.test.tsx), so a Radix Popover never actually opens in
 * a test. The strict `<=` here is exactly the kind of off-by-one that's
 * easy to invert by accident (blocks today AND the past, only allows
 * tomorrow onward).
 */
export function isPastOrToday(d: Date, todayIso: string): boolean {
  return iso(d) <= todayIso;
}

interface Props {
  value: string | undefined;
  onChange: (targetDate: string) => void;
}

/**
 * Every other date picker in this project (DateRangePicker,
 * ImportCalendar) restricts selection to PAST dates that already have
 * data. This one is the opposite: Production Planning always
 * predicts a day that hasn't happened yet, so `disabled` is inverted --
 * blocks today and the past instead of restricting to `availableDates`.
 * There's no "data available" concept to check against here; a thin
 * history for the chosen weekday shows up as more "Outros" in the table
 * itself, not as a disabled day on the calendar (see the design doc).
 */
export function TargetDatePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const today = todayISOBrazil();

  const selected = value ? new Date(value + "T00:00:00") : undefined;
  const isDisabled = (d: Date) => isPastOrToday(d, today);

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
            {value ? fmtBRShort(value) : "Selecione um dia futuro"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" collisionPadding={24}>
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          defaultMonth={selected}
          disabled={isDisabled}
          numberOfMonths={1}
          className="p-2 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}
