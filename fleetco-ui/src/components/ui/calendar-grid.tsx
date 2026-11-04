import { cn } from "@/lib/utils";
import {
  WEEKDAYS,
  fmtMonth,
  isSameDay,
  isWithin,
  monthGrid,
  startOfMonth,
} from "@/lib/date";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * One month of days. **The same grid serves the single picker and the range picker** —
 * a range is two dates chosen on this grid, not a different component. Building a
 * second one is how "today" ends up meaning two different days and the keyboard works
 * in one place and not the other.
 *
 * It renders a month and reports clicks. It owns no selection state and no popover: the
 * pickers above it decide what a click means, which is the only thing that actually
 * differs between picking one date and picking two.
 */
export function CalendarGrid({
  month,
  onMonthChange,
  today,
  isSelected,
  isRangeEnd,
  range,
  onPick,
  onHover,
  min,
  max,
  showNav = "both",
}: {
  month: Date;
  onMonthChange: (d: Date) => void;
  today: Date;
  isSelected: (d: Date) => boolean;
  /** First or last day of a range — square on the inside, rounded on the outside. */
  isRangeEnd?: (d: Date) => "from" | "to" | "both" | null;
  /** The span to tint, including the half-formed one being hovered. */
  range?: { from: Date; to: Date } | null;
  onPick: (d: Date) => void;
  onHover?: (d: Date | null) => void;
  min?: Date;
  max?: Date;
  /** The second month of a two-up pair only needs its own forward arrow. */
  showNav?: "both" | "left" | "right" | "none";
}) {
  const days = monthGrid(month);
  const thisMonth = startOfMonth(month).getMonth();

  return (
    /* `mx-auto` so the grid centres inside the phone's bottom sheet, where the sheet is
       full-width and the grid is not. It does nothing in the desktop popover, which is
       sized to its content. */
    <div className="mx-auto w-[248px] select-none">
      <div className="mb-1.5 flex h-8 items-center justify-between">
        <NavBtn
          dir="prev"
          show={showNav === "both" || showNav === "left"}
          onClick={() => onMonthChange(addMonth(month, -1))}
        />
        <span className="text-sm font-medium">{fmtMonth(month)}</span>
        <NavBtn
          dir="next"
          show={showNav === "both" || showNav === "right"}
          onClick={() => onMonthChange(addMonth(month, 1))}
        />
      </div>

      <div className="grid grid-cols-7">
        {WEEKDAYS.map((w) => (
          <span
            key={w}
            className="grid h-7 place-items-center text-[11px] font-medium text-muted-foreground"
          >
            {w}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7" onMouseLeave={() => onHover?.(null)}>
        {days.map((d) => {
          const outside = d.getMonth() !== thisMonth;
          const disabled = (min && d < min) || (max && d > max);
          const selected = isSelected(d);
          const end = isRangeEnd?.(d) ?? null;
          const inRange = range ? isWithin(d, range.from, range.to) : false;
          const isToday = isSameDay(d, today);

          return (
            <button
              key={d.getTime()}
              type="button"
              disabled={disabled}
              onClick={() => onPick(d)}
              onMouseEnter={() => onHover?.(d)}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={selected}
              className={cn(
                "relative grid h-8 place-items-center text-[13px] tnum",
                // The in-range tint is a background on the CELL, so neighbouring days
                // join into one band instead of a row of separate chips.
                inRange && !selected && "bg-accent",
                inRange && end === null && "rounded-none",
                end === "from" && "rounded-l-md",
                end === "to" && "rounded-r-md",
                disabled && "cursor-not-allowed opacity-30",
                // Days from the neighbouring month stay visible but recede. Blanking
                // them loses the week shape, which is how people find "next Monday".
                outside && !selected && "text-muted-foreground/60"
              )}
            >
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-md",
                  selected && "bg-nav-active font-medium text-nav-active-fg",
                  !selected && !disabled && "hover:bg-accent",
                  // Today is an outline, never a fill. A fill here competes with the
                  // selection, and on the day you happen to open it they sit together.
                  !selected && isToday && "ring-1 ring-nav-active ring-inset font-medium"
                )}
              >
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function addMonth(d: Date, n: number) {
  const out = startOfMonth(d);
  out.setMonth(out.getMonth() + n);
  return out;
}

function NavBtn({
  dir,
  show,
  onClick,
}: {
  dir: "prev" | "next";
  show: boolean;
  onClick: () => void;
}) {
  // Rendered invisible rather than omitted, so the month name stays centred in a
  // two-up pair where only the outer arrows are live.
  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={show ? 0 : -1}
      aria-hidden={!show}
      aria-label={dir === "prev" ? "Previous month" : "Next month"}
      className={cn(
        "grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
        !show && "invisible"
      )}
    >
      {dir === "prev" ? (
        <ChevronLeft className="size-4" />
      ) : (
        <ChevronRight className="size-4" />
      )}
    </button>
  );
}
