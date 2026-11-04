import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Popover } from "./popover";
import { CalendarGrid } from "./calendar-grid";
import { cn } from "@/lib/utils";
import {
  addDays,
  addMonths,
  endOfMonth,
  fmtDay,
  fmtRange,
  isBefore,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
} from "@/lib/date";

/**
 * Two pickers, one grid.
 *
 * `DatePicker` chooses a day — a job's due date, an invoice date. `DateRangePicker`
 * chooses a span — a report period, the schedule's week. They share `CalendarGrid`, so
 * "today" is one definition and a month renders identically in both.
 *
 * Both are **shop-local** (`PLAT-003`). Nothing here touches a UTC instant.
 */

/** The shop's "now". Injected so the lab can pin it and screenshots stay stable. */
const now = () => startOfDay(new Date());

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  min,
  max,
  clearable = false,
  id,
  invalid,
}: {
  value: Date | null;
  onChange: (d: Date | null) => void;
  placeholder?: string;
  min?: Date;
  max?: Date;
  clearable?: boolean;
  id?: string;
  invalid?: boolean;
}) {
  const today = now();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(startOfMonth(value ?? today));

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label="Choose a date"
      trigger={
        <FieldButton
          id={id}
          open={open}
          invalid={invalid}
          empty={!value}
          onClick={() => {
            setMonth(startOfMonth(value ?? today));
            setOpen((v) => !v);
          }}
        >
          {value ? fmtDay(value, today) : placeholder}
        </FieldButton>
      }
    >
      <CalendarGrid
        month={month}
        onMonthChange={setMonth}
        today={today}
        min={min}
        max={max}
        isSelected={(d) => (value ? isSameDay(d, value) : false)}
        onPick={(d) => {
          onChange(d);
          setOpen(false);
        }}
      />
      <Footer>
        <TextBtn
          onClick={() => {
            onChange(today);
            setOpen(false);
          }}
        >
          Today
        </TextBtn>
        {clearable && value && (
          <TextBtn
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            Clear
          </TextBtn>
        )}
      </Footer>
    </Popover>
  );
}

export type DateRange = { from: Date; to: Date };

/**
 * Presets first, calendar second.
 *
 * Nearly every range anyone asks a shop system for has a name — this month, last month,
 * the quarter. Making someone click two days to express "last month" is the common
 * failure of range pickers, so the named spans are the primary control and the grid is
 * there for the one time a week that they are not enough.
 */
const PRESETS: { label: string; of: (t: Date) => DateRange }[] = [
  { label: "Today", of: (t) => ({ from: t, to: t }) },
  { label: "Yesterday", of: (t) => ({ from: addDays(t, -1), to: addDays(t, -1) }) },
  { label: "This week", of: (t) => ({ from: startOfWeek(t), to: t }) },
  { label: "Last 7 days", of: (t) => ({ from: addDays(t, -6), to: t }) },
  { label: "Last 30 days", of: (t) => ({ from: addDays(t, -29), to: t }) },
  { label: "This month", of: (t) => ({ from: startOfMonth(t), to: t }) },
  {
    label: "Last month",
    of: (t) => ({
      from: startOfMonth(addMonths(t, -1)),
      to: endOfMonth(addMonths(t, -1)),
    }),
  },
  { label: "This quarter", of: (t) => ({ from: startOfQuarter(t), to: t }) },
  { label: "Year to date", of: (t) => ({ from: new Date(t.getFullYear(), 0, 1), to: t }) },
];

export function DateRangePicker({
  value,
  onChange,
  max,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
  max?: Date;
}) {
  const today = now();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(startOfMonth(value.from));
  /** The first click of a new range. While this is set, the range is half-formed. */
  const [anchor, setAnchor] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);

  // What to paint: the committed range, or the one being drawn.
  const preview: DateRange | null = anchor
    ? hover
      ? isBefore(hover, anchor)
        ? { from: hover, to: anchor }
        : { from: anchor, to: hover }
      : { from: anchor, to: anchor }
    : value;

  const activePreset = PRESETS.find((p) => {
    const r = p.of(today);
    return isSameDay(r.from, value.from) && isSameDay(r.to, value.to);
  })?.label;

  function pick(d: Date) {
    if (!anchor) {
      setAnchor(d);
      return;
    }
    // Clicking backwards is a correction, not an error — swap rather than refuse.
    const r = isBefore(d, anchor) ? { from: d, to: anchor } : { from: anchor, to: d };
    setAnchor(null);
    setHover(null);
    onChange(r);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          // A half-formed range is discarded on close. Keeping it would leave the field
          // showing a span nobody finished choosing.
          setAnchor(null);
          setHover(null);
        }
      }}
      align="end"
      label="Choose a date range"
      trigger={
        <FieldButton open={open} empty={false} onClick={() => setOpen((v) => !v)}>
          {activePreset ?? fmtRange(value.from, value.to, today)}
        </FieldButton>
      }
    >
      <div className="flex flex-col gap-3 pad:flex-row">
        {/* Horizontal and scrollable on a phone, a column on anything wider. */}
        <div
          className={cn(
            "flex shrink-0 gap-1 overflow-x-auto pb-1",
            "pad:w-32 pad:flex-col pad:overflow-visible pad:border-r pad:pb-0 pad:pr-2"
          )}
        >
          {PRESETS.map((p) => {
            const on = activePreset === p.label;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  const r = p.of(today);
                  setMonth(startOfMonth(r.from));
                  setAnchor(null);
                  onChange(r);
                  setOpen(false);
                }}
                className={cn(
                  "whitespace-nowrap rounded-md px-2 py-1.5 text-left text-[13px]",
                  on
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div>
          {/* One month on a phone, two side by side from `pad` up — a range that
              crosses a month boundary is the normal case, not the exception. */}
          <div className="flex gap-4">
            <CalendarGrid
              month={month}
              onMonthChange={setMonth}
              today={today}
              max={max}
              showNav="both"
              range={preview}
              isSelected={(d) =>
                preview ? isSameDay(d, preview.from) || isSameDay(d, preview.to) : false
              }
              isRangeEnd={(d) => rangeEnd(d, preview)}
              onPick={pick}
              onHover={setHover}
            />
            <div className="hidden pad:block">
              <CalendarGrid
                month={addMonths(month, 1)}
                onMonthChange={(d) => setMonth(addMonths(d, -1))}
                today={today}
                max={max}
                showNav="right"
                range={preview}
                isSelected={(d) =>
                  preview ? isSameDay(d, preview.from) || isSameDay(d, preview.to) : false
                }
                isRangeEnd={(d) => rangeEnd(d, preview)}
                onPick={pick}
                onHover={setHover}
              />
            </div>
          </div>
          <Footer>
            <span className="text-xs text-muted-foreground">
              {anchor
                ? "Pick the end date"
                : fmtRange(value.from, value.to, today)}
            </span>
          </Footer>
        </div>
      </div>
    </Popover>
  );
}

function rangeEnd(d: Date, r: DateRange | null) {
  if (!r) return null;
  const from = isSameDay(d, r.from);
  const to = isSameDay(d, r.to);
  return from && to ? "both" : from ? "from" : to ? "to" : null;
}

/**
 * The trigger. A button rather than a text input: a range has no single value to type,
 * and giving the two pickers different trigger affordances is the sort of split that
 * makes one of them feel like someone else's component.
 */
function FieldButton({
  children,
  onClick,
  open,
  empty,
  invalid,
  id,
}: {
  children: React.ReactNode;
  onClick: () => void;
  open: boolean;
  empty: boolean;
  invalid?: boolean;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-invalid={invalid}
      className={cn(
        "inline-flex h-9 w-full items-center gap-2 rounded-md border px-2.5 text-sm",
        "hover:bg-accent/50",
        open && "ring-2 ring-ring/40",
        invalid && "border-destructive",
        empty && "text-muted-foreground"
      )}
    >
      <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{children}</span>
    </button>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
      {children}
    </div>
  );
}

function TextBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}
