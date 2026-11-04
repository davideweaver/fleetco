import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  calendarEntries as seed,
  clock,
  DAY_END,
  DAY_START,
  layoutDay,
  TODAY,
  WEEK,
  type CalendarEntry,
  type EntryKind,
} from "@/data/sample";
import { useSearchParams } from "react-router-dom";
import { useShell } from "@/shell/shell-context";
import { PageHeader } from "@/shell/ListDetailLayout";
import { cn } from "@/lib/utils";

/**
 * The schedule. BUILT, not bought — and the rules are the reason.
 *
 * What makes calendar libraries expensive is recurrence, timezones and overlap
 * resolution. V1 has no recurring entries, one shop timezone (PLAT-003), and JOB-016
 * says overlaps are allowed and unmanaged. Strip those three and what is left is a
 * positioned grid, which is cheaper to own than to configure.
 *
 * What we give up, and should revisit rather than forget: keyboard navigation, a month
 * view, print, and real timezone handling if OTC ever runs a shop in another one.
 *
 *   JOB-014  An entry is production or installation, belongs to one job, has its own
 *            start and end, and carries one or more employees.
 *   JOB-015  Moving an entry changes dates and NOTHING ELSE. The board does not move.
 *   JOB-016  Overlaps are allowed, so the grid lays them out side by side rather than
 *            refusing them. No warning — the rule says V1 stays quiet.
 */
const PX_PER_MIN = 48 / 60;
const SNAP = 15;

/**
 * How production and installation are told apart. Three candidates, because the first
 * answer — a thick rounded left bar — spent the accent colour on "kind", which is not a
 * status, and fought the square grid it sits in.
 *
 *   fill    Shape and weight carry the meaning. Production is outlined, installation is
 *           filled. Survives print and colour blindness, and leaves the accent free.
 *   stripe  A hairline across the top instead of the left, square corners.
 *   both    Stripe and fill together — colour to find it, weight to confirm it. The
 *           redundant cue is the point: it still reads on a printed schedule, and it
 *           still reads for someone who cannot tell the two hues apart.
 */
export type EntryStyle = "fill" | "stripe" | "both";

export function CalendarPage() {
  const { role } = useShell();
  const [params] = useSearchParams();
  const style = (params.get("entry") as EntryStyle) ?? "both";
  const [entries, setEntries] = useState(seed);
  const [filter, setFilter] = useState<"all" | EntryKind>("all");

  const owner = role === "owner";
  const mine = owner ? entries : entries.filter((e) => e.who.includes("T1"));
  const shown = filter === "all" ? mine : mine.filter((e) => e.kind === filter);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const entry = entries.find((x) => x.id === e.active.id);
    if (!entry || e.over == null) return;

    const day = Number(e.over.id);
    const shift = Math.round(e.delta.y / PX_PER_MIN / SNAP) * SNAP;
    const length = entry.end - entry.start;
    let start = Math.max(DAY_START, Math.min(entry.start + shift, DAY_END - length));
    if (day === entry.day && shift === 0) return;

    setEntries((all) =>
      all.map((x) => (x.id === entry.id ? { ...x, day, start, end: start + length } : x))
    );

    // JOB-015, said out loud. The two systems being separate is the kind of thing a user
    // only half believes until the software tells them.
    toast.success(`${entry.jobNo} ${entry.kind} moved to ${WEEK[day].label} ${clock(start)}`, {
      description: "Dates only. The job board is unchanged.",
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Schedule"
        action={
          <div className="flex items-center gap-2">
            <Seg value={filter} onChange={setFilter} />
            <div className="hidden items-center rounded-lg border pad:flex">
              <IconBtn label="Previous week"><ChevronLeft className="size-4" /></IconBtn>
              <span className="px-2 text-xs font-medium">Nov 2 – 6</span>
              <IconBtn label="Next week"><ChevronRight className="size-4" /></IconBtn>
            </div>
          </div>
        }
      />

      {/* A grid at 390px is unreadable, so a phone gets the day as a list instead. The
          week view is a desktop and tablet thing. */}
      <DayList entries={shown.filter((e) => e.day === TODAY)} />

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="hidden min-h-0 flex-1 overflow-auto pad:block">
          <div className="flex min-h-full min-w-[760px]">
            <TimeGutter />
            <div className="grid flex-1 grid-cols-5">
              {WEEK.map((d, i) => (
                <DayColumn
                  key={d.label}
                  index={i}
                  label={d.label}
                  date={d.date}
                  today={i === TODAY}
                  entries={shown.filter((e) => e.day === i)}
                  draggable={owner}
                  style={style}
                />
              ))}
            </div>
          </div>
        </div>
      </DndContext>
    </div>
  );
}

function TimeGutter() {
  const hours = [];
  for (let m = DAY_START; m < DAY_END; m += 60) hours.push(m);
  return (
    <div className="sticky left-0 z-10 w-14 shrink-0 bg-surface-3">
      <div className="h-12 border-b" />
      {hours.map((m) => (
        <div key={m} className="relative h-12 border-b border-border/50">
          <span className="absolute -top-2 right-2 text-[11px] text-muted-foreground">
            {clock(m)}
          </span>
        </div>
      ))}
    </div>
  );
}

function DayColumn({
  index,
  label,
  date,
  today,
  entries,
  draggable,
  style,
}: {
  index: number;
  label: string;
  date: string;
  today: boolean;
  entries: CalendarEntry[];
  draggable: boolean;
  style: EntryStyle;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: String(index) });
  const hours = [];
  for (let m = DAY_START; m < DAY_END; m += 60) hours.push(m);
  const placed = layoutDay(entries);

  return (
    <div className="flex min-w-0 flex-col border-l">
      <div
        className={cn(
          "sticky top-0 z-10 flex h-12 items-center gap-1.5 border-b bg-surface-3 px-2",
          today && "bg-brand/8"
        )}
      >
        <span className="text-xs font-semibold">{label}</span>
        <span className={cn("text-xs", today ? "font-medium text-brand" : "text-muted-foreground")}>
          {date}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn("relative flex-1 transition-colors", isOver && "bg-brand/5")}
      >
        {hours.map((m) => (
          <div key={m} className="h-12 border-b border-border/50" />
        ))}
        {placed.map(({ entry, lane, lanes }) => (
          <Entry key={entry.id} entry={entry} lane={lane} lanes={lanes} draggable={draggable} style={style} />
        ))}
      </div>
    </div>
  );
}

function Entry({
  entry,
  lane,
  lanes,
  draggable,
  style,
}: {
  entry: CalendarEntry;
  lane: number;
  lanes: number;
  draggable: boolean;
  style: EntryStyle;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: entry.id,
    disabled: !draggable,
  });

  const install = entry.kind === "installation";
  const top = (entry.start - DAY_START) * PX_PER_MIN;
  const height = (entry.end - entry.start) * PX_PER_MIN;
  const width = `calc(${100 / lanes}% - 4px)`;
  const left = `calc(${(100 / lanes) * lane}% + 2px)`;

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      {...attributes}
      style={{
        top,
        height,
        width,
        left,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      className={cn(
        "absolute overflow-hidden rounded border px-2 py-1 text-xs",
        (style === "fill" || style === "both") &&
          (install
            ? "border-foreground/15 bg-foreground/8"
            : "border-border bg-surface-3"),
        (style === "stripe" || style === "both") &&
          cn("border-t-2", install ? "border-t-foreground/50" : "border-t-brand"),
        style === "stripe" && "border-border bg-surface-3",
        isDragging ? "z-30 opacity-90 shadow-lg" : "z-20",
        draggable && "cursor-grab active:cursor-grabbing"
      )}
    >
      <div className="truncate font-medium">{entry.jobNo}</div>
      {height > 42 && <div className="truncate text-muted-foreground">{entry.what}</div>}
      {height > 60 && (
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {style !== "both" && (
            <span className="uppercase tracking-wide">{install ? "Inst" : "Prod"}</span>
          )}
          <span>
            {clock(entry.start)}–{clock(entry.end)}
          </span>
          <span className="ml-auto flex -space-x-1">
            {entry.who.map((w) => (
              <span
                key={w}
                className="grid size-4 place-items-center rounded-full bg-surface-3 text-[8px] font-semibold ring-1 ring-border"
              >
                {w}
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

/** Phone: the day as a list. A time grid at 390px is a wall of empty boxes. */
function DayList({ entries }: { entries: CalendarEntry[] }) {
  const sorted = [...entries].sort((a, b) => a.start - b.start);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pad:hidden">
      <div className="border-b bg-brand/8 px-3 py-2 text-xs font-semibold">
        Today · {WEEK[TODAY].label} {WEEK[TODAY].date}
      </div>
      {sorted.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">Nothing scheduled today.</p>
      )}
      {sorted.map((e) => (
        <div key={e.id} className="flex gap-3 border-b px-3 py-3">
          <div className="tnum w-16 shrink-0 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">{clock(e.start)}</div>
            <div>{clock(e.end)}</div>
          </div>
          <div
            className={cn(
              "w-1 shrink-0 rounded-full",
              e.kind === "production" ? "bg-brand" : "bg-foreground/50"
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{e.jobNo}</div>
            <div className="truncate text-xs text-muted-foreground">{e.what}</div>
            <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              {e.kind} · {e.who.join(", ")}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Seg({
  value,
  onChange,
}: {
  value: "all" | EntryKind;
  onChange: (v: "all" | EntryKind) => void;
}) {
  const opts: { v: "all" | EntryKind; label: string }[] = [
    { v: "all", label: "All" },
    { v: "production", label: "Production" },
    { v: "installation", label: "Install" },
  ];
  return (
    <div className="flex items-center rounded-lg border p-0.5">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium",
            value === o.v ? "bg-brand/12 text-brand" : "text-muted-foreground hover:bg-accent"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function IconBtn({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent"
    >
      {children}
    </button>
  );
}
