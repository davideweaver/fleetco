import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { clock, TODAY, WEEK, type CalendarEntry } from "@/data/sample";
import {
  at,
  entries as seedEntries,
  hours,
  jobLabel,
  minutesOf,
  nameOf,
  openJobsFor,
  punches,
  TODAY_LABEL,
} from "@/data/time";
import { dayPlans, leftToday, ME, whenIs, type DayPlan } from "@/data/today";
import { attentionAll, type AttentionRow } from "@/nav/attention";
import { AttentionChip } from "@/components/ui/attention";
import { PunchClock, useTimeClock } from "@/components/ui/timer";
import { useShell } from "@/shell/shell-context";
import { PageHeader } from "@/shell/ListDetailLayout";
import { cn } from "@/lib/utils";

/**
 * Today — the screen signing in lands on, for both roles.
 *
 * The brief was "not widget-heavy", and two rules keep it that way. **Nothing that is
 * not an obligation**: no revenue, no utilisation, no charts, because a number that does
 * not imply an action pushes the ones that do further down the page. And **one reading
 * order per column** — you start at the top and stop when you run out, rather than
 * choosing which tile to look at first.
 *
 * The two roles get different shapes, not different amounts of the same shape:
 *
 * Both roles use the same two columns — **main is what you read, side is what you act
 * on** — and differ only in what fills them:
 *
 *   OWNER  The day beside the decisions. Scheduled work and decisions are two kinds of
 *          debt: one has a clock on it and someone already assigned, the other sits still
 *          until a person chooses something. In one list you re-sort them on every pass.
 *
 *   TECH   The day beside the clock, because this IS the clock screen. A technician's day
 *          has one question at the top of it — am I punched in — and sending them to a
 *          second page to answer it made Today a thing to read rather than a thing to
 *          use. `/app/time` now redirects here; `Time & payroll` is the Owner's section.
 *
 * Settled 2026-11-05 after three organising principles were built side by side in the
 * lab — by time, by kind of obligation, by urgency — the way the calendar's entry
 * treatment was settled. By-kind won for the Owner. The other two are deleted rather
 * than parked behind a flag.
 */
export function TodayPage() {
  const { role } = useShell();
  return role === "owner" ? <OwnerToday /> : <TechToday />;
}

/* ======================================================================================
   Owner — two columns
   ====================================================================================== */

function OwnerToday() {
  const { href } = useShell();
  const plans = dayPlans("owner");
  const needs = attentionAll("owner");
  const today = plans[0];
  const rest = plans.slice(1);
  const remaining = leftToday(today);

  return (
    <Page>
      <Lede>
        {remaining.length > 0 ? (
          <>
            {remaining.length} {remaining.length === 1 ? "job" : "jobs"} still to run today
          </>
        ) : (
          <>Today&rsquo;s schedule is clear</>
        )}
        {needs.length > 0 ? (
          <>
            , and {needs.length} {needs.length === 1 ? "thing needs" : "things need"} you.
          </>
        ) : (
          <>, and nothing is waiting on you.</>
        )}
      </Lede>

      <Columns
        main={
          <>
            <Block title="Today" aside={today.date} count={today.entries.length || undefined}>
              {today.entries.length === 0 ? (
                <Quiet>Nothing scheduled.</Quiet>
              ) : (
                today.entries.map((e) => (
                  <EntryRow key={e.id} entry={e} plan={today} owner to={href(`/app/jobs/${e.jobNo}`)} />
                ))
              )}
            </Block>
            <Block title="Rest of the week">
              <WeekAhead plans={rest} href={href} />
            </Block>
          </>
        }
        side={
          <Block title="Needs you" count={needs.length || undefined}>
            {needs.length === 0 ? (
              <Quiet>Nothing is waiting on you.</Quiet>
            ) : (
              needs.map((n) => (
                <NeedsRow key={`${n.section}-${n.id}`} row={n} to={href(n.path)} stacked />
              ))
            )}
          </Block>
        }
      />
    </Page>
  );
}

/* ======================================================================================
   Technician — one column, clock first
   ====================================================================================== */

/**
 * The technician's day, in the order the questions get asked: what is on me today, am I
 * on the clock, what is waiting, what have I actually logged.
 *
 * The clock card and the day log moved here wholesale from `Time`. Two screens asking
 * "what is my day" is how they drift — and the technician's version of Time was never
 * about payroll, which is the only thing left on that section now.
 *
 * `TIME-008`: a technician cannot change their own time. The screen says so in one
 * sentence rather than showing edit affordances that would refuse.
 */
function TechToday() {
  const { href } = useShell();
  const plans = dayPlans("tech");
  const needs = attentionAll("tech");
  const today = plans[0];
  const rest = plans.slice(1);

  const timeClock = useTimeClock(punches.find((p) => p.id === "p3")!.in, {
    jobNo: "G-1052",
    activity: null,
    start: 13 * 60 + 10,
  });
  const logged = seedEntries.filter((e) => e.who === ME && e.day === TODAY_LABEL);
  const runningMinutes = timeClock.timer ? minutesOf({ start: timeClock.timer.start }) : 0;
  const jobMinutes = logged.reduce((a, e) => a + minutesOf(e), 0) + runningMinutes;
  const dayMinutes =
    timeClock.punchedInAt === null ? 0 : minutesOf({ in: timeClock.punchedInAt });

  return (
    <Page>
      <Lede>
        {today.entries.length > 0 ? (
          <>
            {today.entries.length} {today.entries.length === 1 ? "job" : "jobs"} on your
            schedule today
          </>
        ) : (
          <>Nothing on your schedule today</>
        )}
        {needs.length > 0 ? (
          <>
            , and {needs.length} {needs.length === 1 ? "is" : "are"} not started yet.
          </>
        ) : (
          <>.</>
        )}
      </Lede>

      <Columns
        main={
          <>
            <Block title="Today" aside={today.date} count={today.entries.length || undefined}>
              {today.entries.length === 0 ? (
                <Quiet>Nothing scheduled.</Quiet>
              ) : (
                today.entries.map((e) => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    plan={today}
                    owner={false}
                    to={href(`/app/jobs/${e.jobNo}`)}
                  />
                ))
              )}
            </Block>

            {/* Planned and actual are two different questions, so they are two blocks,
                stacked in the reading column where they can be compared. The one above is
                what the schedule says; this is what the clock recorded. */}
            <Block
              title="Logged today"
              aside={
                /* `TIME-006` as a fact, not a warning. "6.18 of 7.57 h" is a part of a
                   whole, and a part cannot be added to its whole — which is exactly what
                   two separate tiles invited. */
                dayMinutes > 0
                  ? `${hours(jobMinutes)} of ${hours(dayMinutes)} h on jobs`
                  : `${hours(jobMinutes)} h on jobs`
              }
            >
              {logged.length === 0 && !timeClock.timer ? (
                <Quiet>Nothing yet today. Start something from the clock.</Quiet>
              ) : (
                <>
                  {timeClock.timer && (
                    <div className="flex items-center gap-3 border-b py-2.5 text-sm">
                      <span className="size-2 shrink-0 animate-pulse rounded-full bg-nav-active" />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {timeClock.timer.jobNo
                          ? jobLabel(timeClock.timer.jobNo)
                          : timeClock.timer.activity}
                      </span>
                      <span className="tnum shrink-0 text-xs text-muted-foreground">
                        {at(timeClock.timer.start)} → now
                      </span>
                    </div>
                  )}
                  {[...logged].reverse().map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center gap-3 border-b py-2.5 text-sm last:border-0"
                    >
                      <span className="size-2 shrink-0 rounded-full bg-muted-foreground/30" />
                      <span className="min-w-0 flex-1 truncate">
                        {e.jobNo ? jobLabel(e.jobNo) : e.activity}
                      </span>
                      <span className="tnum shrink-0 text-xs text-muted-foreground">
                        {at(e.start)}–{at(e.end!)}
                        <span className="hidden sm:inline"> · {hours(minutesOf(e))} h</span>
                      </span>
                    </div>
                  ))}
                </>
              )}
            </Block>

            <Block title="Rest of the week">
              <WeekAhead plans={rest} href={href} />
            </Block>
          </>
        }
        side={
          <>
            {/* The clock is not inside a block — a heading over it would file the day's
                only control under a category. It sits at the top of the sticky column so
                it stays reachable however far down the day you have scrolled, and it
                wraps to a full-width button at this width rather than shrinking. */}
            <PunchClock
              punchedInAt={timeClock.punchedInAt}
              timer={timeClock.timer}
              jobs={openJobsFor(ME)}
              onPunchIn={timeClock.punchIn}
              onPunchOut={timeClock.punchOut}
              onStop={timeClock.stop}
              onStart={(t) => timeClock.start(t)}
            />

            {needs.length > 0 && (
              <div className="mt-8">
                <Block title="Needs you" count={needs.length}>
                  {needs.map((n) => (
                    <NeedsRow key={`${n.section}-${n.id}`} row={n} to={href(n.path)} stacked />
                  ))}
                </Block>
              </div>
            )}
          </>
        }
      />
    </Page>
  );
}

/* ======================================================================================
   Shared parts
   ====================================================================================== */

/**
 * The page shell. Capped at a reading width and centred — content here is prose-shaped,
 * and a line running the full 1440px is one your eye has to track back across.
 */
function Page({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Today" aside={`${WEEK[TODAY].label} ${WEEK[TODAY].date}`} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1000px] px-5 py-7 pad:px-8">{children}</div>
      </div>
    </div>
  );
}

/**
 * The two-column body, shared by both roles so there is one layout rather than two that
 * drift. **Main is what you read, side is what you act on.** For the Owner that is the
 * day beside the decisions; for a technician it is the day beside the clock.
 *
 * Stacked on a phone the side column goes FIRST — it holds the clock and the things
 * nothing else on the page can do, and burying those under a scroll is the one mistake
 * this layout can make. Side by side it moves right, because the eye starts left and the
 * reading column should be what it lands on.
 */
function Columns({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="order-2 min-w-0 lg:order-1">{main}</div>
      <div className="order-1 min-w-0 lg:order-2 lg:sticky lg:top-7 lg:self-start">{side}</div>
    </div>
  );
}

/**
 * The one sentence the page opens with. Set at heading weight and size, not as a caption
 * — it is the summary a person reads from the doorway, and at `text-base` muted it read
 * as a subtitle for the block under it rather than as the state of the day.
 */
function Lede({ children }: { children: ReactNode }) {
  return (
    <p className="mb-8 max-w-[34ch] text-[1.625rem] leading-[1.25] font-semibold tracking-tight text-balance">
      {children}
    </p>
  );
}

/**
 * A titled run of rows. A heading, a hairline, and the rows — no card, no shadow, no
 * fill. Surfaces separate panes; inside one pane a heading and a rule are enough, and
 * boxing every group is exactly what turns a page like this into a widget board.
 */
function Block({
  title,
  aside,
  count,
  children,
}: {
  title: string;
  aside?: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="mb-8 last:mb-0">
      <div className="flex items-baseline gap-2 border-b pb-1.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide">{title}</h2>
        {aside && <span className="tnum text-xs text-muted-foreground">{aside}</span>}
        {count !== undefined && (
          <span className="tnum ml-auto text-xs text-muted-foreground">{count}</span>
        )}
      </div>
      {children}
    </section>
  );
}

const Quiet = ({ children }: { children: ReactNode }) => (
  <p className="py-4 text-sm text-muted-foreground">{children}</p>
);

/** The days after today: context, not work. One line each, no times broken out. */
function WeekAhead({ plans, href }: { plans: DayPlan[]; href: (p: string) => string }) {
  const rows = plans.flatMap((p) => p.entries.map((e) => ({ e, p })));
  if (rows.length === 0) return <Quiet>Nothing else booked.</Quiet>;
  return (
    <>
      {rows.map(({ e, p }) => (
        <Link
          key={e.id}
          to={href(`/app/jobs/${e.jobNo}`)}
          className="flex items-baseline gap-3 border-b py-2 text-sm transition-colors last:border-0 hover:bg-accent/40"
        >
          <span className="tnum w-[5.5rem] shrink-0 text-xs text-muted-foreground">
            {p.heading === "Tomorrow" ? "Tomorrow" : `${p.heading} ${p.date.split(" ")[1]}`}
          </span>
          <KindBar kind={e.kind} />
          <span className="min-w-0 flex-1 truncate">
            {e.jobNo} · {e.what}
          </span>
          <span className="tnum shrink-0 text-xs text-muted-foreground">{clock(e.start)}</span>
        </Link>
      ))}
    </>
  );
}

/**
 * One thing waiting on a person. The reason is the loud part — it is the only text on the
 * row that says what to DO — and it wears the chip rather than coloured text, because
 * amber text measured 4.06:1 on cream and a fill reads on any surface.
 */
function NeedsRow({ row, to, stacked = false }: { row: AttentionRow; to: string; stacked?: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        "border-b py-2.5 text-sm transition-colors last:border-0 hover:bg-accent/40",
        stacked ? "block" : "flex items-center gap-3"
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{row.label}</span>
        <span className="block truncate text-xs text-muted-foreground">{row.sub}</span>
      </span>
      {/* Empty reasons exist, because an OVERDUE invoice says it in its own status. The
          section supplies a word rather than letting the row end in nothing. */}
      <AttentionChip
        reason={row.reason || REASON_FALLBACK[row.section]}
        className={cn("shrink-0", stacked ? "mt-1" : "self-center")}
      />
    </Link>
  );
}

const REASON_FALLBACK: Record<string, string> = {
  invoices: "overdue",
  jobs: "not started",
  customers: "overdue",
  time: "still running",
};

/** Production or installation, as the calendar draws it: colour to find, weight to confirm. */
function KindBar({ kind }: { kind: CalendarEntry["kind"] }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-1 h-3.5 w-1 shrink-0 self-start rounded-full",
        kind === "production" ? "bg-brand" : "bg-foreground/40"
      )}
    />
  );
}

/**
 * One scheduled entry. Today's rows know where they sit against the clock: finished work
 * fades, the one running now is marked. That is the difference between a schedule and a
 * day sheet — the sheet knows what time it is.
 */
function EntryRow({
  entry,
  plan,
  owner,
  to,
}: {
  entry: CalendarEntry;
  plan: DayPlan;
  owner: boolean;
  to: string;
}) {
  const when = whenIs(entry, plan.isToday);
  return (
    <Link
      to={to}
      className={cn(
        "flex gap-3 border-b py-2.5 text-sm transition-colors last:border-0 hover:bg-accent/40",
        when === "past" && "opacity-45"
      )}
    >
      <span className="tnum w-[4.5rem] shrink-0 text-xs text-muted-foreground">
        <span className="block font-medium text-foreground">{clock(entry.start)}</span>
        <span className="block">{clock(entry.end)}</span>
      </span>
      <KindBar kind={entry.kind} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {entry.jobNo} · {entry.what}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {entry.customer}
          {/* A technician is the only person on their own list, so naming them on every
              row is noise. An owner is reading three people's days at once. */}
          {owner && ` · ${entry.who.map(nameOf).join(", ")}`}
        </span>
      </span>
      {when === "now" && (
        <span className="shrink-0 self-center rounded-full bg-brand/10 px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-brand">
          Now
        </span>
      )}
    </Link>
  );
}
