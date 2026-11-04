import { useState } from "react";
import { Field } from "@/components/ui/field";
import {
  DatePicker,
  DateRangePicker,
  type DateRange,
} from "@/components/ui/date-picker";
import { addDays, fmtRange, startOfDay, startOfMonth } from "@/lib/date";

/**
 * Both pickers, and the two places they get used: a form field and a header control.
 * Lives in the detail pane of Settings' demo section — see Sections.tsx.
 */
export function DatesDemo() {
  const today = startOfDay(new Date());
  const [due, setDue] = useState<Date | null>(addDays(today, 3));
  const [empty, setEmpty] = useState<Date | null>(null);
  const [period, setPeriod] = useState<DateRange>({
    from: startOfMonth(today),
    to: today,
  });
  const [week, setWeek] = useState<DateRange>({
    from: addDays(today, -2),
    to: addDays(today, 2),
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        <Card
          title="One date"
          note="A job's due date. Today is an outline, the chosen day is filled."
        >
          <div className="max-w-[260px] space-y-3">
            <Field label="Due date" hint="Shop local — PLAT-003.">
              {({ id }) => <DatePicker id={id} value={due} onChange={setDue} />}
            </Field>
            <Field label="Follow up" hint="Optional, so it can be cleared.">
              {({ id }) => (
                <DatePicker
                  id={id}
                  value={empty}
                  onChange={setEmpty}
                  placeholder="No date"
                  clearable
                />
              )}
            </Field>
          </div>
        </Card>

        <Card
          title="A range"
          note="Presets first. Every period a report asks for has a name."
        >
          <div className="max-w-[320px]">
            <Field label="Period" hint="Both ends included.">
              {() => (
                <DateRangePicker
                  value={period}
                  onChange={setPeriod}
                  max={today}
                />
              )}
            </Field>
            <p className="mt-2 text-xs text-muted-foreground">
              Selected: {fmtRange(period.from, period.to, today)}
            </p>
          </div>
        </Card>

        <Card
          title="No upper bound"
          note="The schedule looks forward, so future days stay live here."
        >
          <div className="max-w-[320px]">
            <DateRangePicker value={week} onChange={setWeek} />
          </div>
        </Card>

        <Card
          title="What it refuses"
          note="A range picker with no end chosen is not a range."
        >
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>
              Clicking backwards swaps the ends rather than rejecting the click.
            </li>
            <li>Closing mid-pick discards the half-formed range.</li>
            <li>Days past the limit are visible but not clickable.</li>
            <li>
              The grid is always six weeks, so it never resizes under the
              cursor.
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Card({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-surface-3 p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{note}</p>
      {children}
    </section>
  );
}
