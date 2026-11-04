import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Briefcase,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Lock,
  Users,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { useShell } from "@/shell/shell-context";
import {
  Btn,
  DetailHeader,
  ListDetailLayout,
  ListHeader,
  ListRow,
  Monogram,
  PageHeader,
  Pill,
} from "@/shell/ListDetailLayout";
import { PunchClock, useTimeClock, LeftRunningChip } from "@/components/ui/timer";
import { CorrectTimeDialog } from "@/components/ui/correct-time";
import { Popover } from "@/components/ui/popover";
import { Section } from "./Customers";
import type { DateRange } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
import {
  addDays,
  fmtRange,
  fromISODate,
  isSameDay,
  isWithin,
  startOfDay,
  startOfWeek,
  toISODate,
} from "@/lib/date";
import {
  DAY_ISO,
  TODAY_LABEL,
  DAYS,
  approvedPeriodStarts,
  at,
  employees,
  nameOf,
  entries as seedEntries,
  hours,
  isLeftRunning,
  jobLabel,
  minutesOf,
  punches,
} from "@/data/time";

export function TimePage() {
  const { role } = useShell();
  return role === "owner" ? <Review /> : <MyDay />;
}

/* ------------------------------------------------------------------ technician */

/**
 * The technician's day. One screen: am I punched in, what am I timing, what have I
 * logged. Nothing here can be edited — `TIME-008` says a technician flags an entry for
 * correction rather than changing it, even their own.
 */
function MyDay() {
  const clock = useTimeClock(punches.find((p) => p.id === "p3")!.in, {
    jobNo: "G-1052",
    activity: null,
    start: 13 * 60 + 10,
  });

  const mine = seedEntries.filter((e) => e.who === "T1" && e.day === TODAY_LABEL);
  const jobMinutes = mine.reduce((a, e) => a + minutesOf(e), 0);
  const punchMinutes = clock.punchedInAt !== null ? minutesOf({ in: clock.punchedInAt }) : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="My time" />
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="mx-auto max-w-2xl space-y-3">
          <PunchClock
            punchedInAt={clock.punchedInAt}
            timer={clock.timer}
            onPunchIn={clock.punchIn}
            onPunchOut={clock.punchOut}
            onStop={clock.stop}
            onStart={(t) => clock.start(t)}
          />

          {/* TIME-006, stated where it is easiest to get wrong. The two numbers sit
              side by side and there is NO total — adding them would double the day,
              and someone would eventually be paid from the wrong one. */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
            <div className="bg-surface-3 p-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Payable today
              </div>
              <div className="tnum mt-0.5 text-xl font-semibold">{hours(punchMinutes)} h</div>
              <div className="text-xs text-muted-foreground">From your punch</div>
            </div>
            <div className="bg-surface-3 p-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                On jobs today
              </div>
              <div className="tnum mt-0.5 text-xl font-semibold">
                {hours(jobMinutes + (clock.timer ? minutesOf({ start: clock.timer.start }) : 0))} h
              </div>
              <div className="text-xs text-muted-foreground">Costing only · not pay</div>
            </div>
          </div>

          <Section title="Today's entries">
            {mine.length === 0 && !clock.timer ? (
              <p className="p-3 text-sm text-muted-foreground">Nothing logged yet today.</p>
            ) : (
              <ul className="divide-y">
                {clock.timer && (
                  <li className="flex items-center gap-3 p-3 text-sm">
                    <span className="size-2 shrink-0 animate-pulse rounded-full bg-nav-active" />
                    <span className="min-w-0 flex-1 truncate">
                      {clock.timer.jobNo ? jobLabel(clock.timer.jobNo) : clock.timer.activity}
                    </span>
                    <span className="tnum text-muted-foreground">
                      {at(clock.timer.start)} → running
                    </span>
                  </li>
                )}
                {mine.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {e.jobNo ? jobLabel(e.jobNo) : e.activity}
                    </span>
                    <span className="tnum text-muted-foreground">
                      {at(e.start)}–{at(e.end!)} · {hours(minutesOf(e))} h
                    </span>

                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* TIME-008, and no queue behind it. In a three-person shop the technician
              tells Cam, who corrects it — a flag workflow would be a ticketing system
              for a ten-second conversation. */}
          <p className="text-xs text-muted-foreground">
            You cannot edit your own time (TIME-008). If something here is wrong, tell
            Cam — he can correct it, with a reason, and both versions are kept.
          </p>
        </div>
      </div>

    </div>
  );
}

/* ----------------------------------------------------------------------- owner */

/**
 * Timesheet review. The Owner's job here is to make a period safe to pay from, so the
 * screen is built around the three things that stop that: entries left running
 * (`TIME-013`), entries flagged for correction (`TIME-008`), and the approval that
 * locks the period (`TIME-009`).
 */
/**
 * Timesheet review, as a list-detail screen rather than one long page.
 *
 * **Left is the PERIOD. Right is the SELECTION.** That split is the whole layout, and it
 * settles the question that a single scrolling page kept getting wrong: approving locks
 * the period for everyone, so the Approve button lives on the left, in the pane that
 * represents everyone. Put it in a detail header titled "Technician 2" and it reads as
 * approving Technician 2 — which is exactly the misreading the period-wide blocking
 * count exists to prevent.
 *
 * The employee list also absorbs the summary table that used to sit above the entries.
 * Each row already has to show a name, payable hours and whether something needs doing;
 * that IS the summary, and keeping a separate table meant two places to read the same
 * three numbers.
 */
function Review() {
  /** Keyed by the period's start, so the picker can say which are already done. */
  const [approvedPeriods, setApprovedPeriods] = useState<Set<string>>(
    () => new Set(approvedPeriodStarts)
  );
  const [correcting, setCorrecting] = useState<
    | { kind: "punch" | "entry"; id: string; what: string; when: string; start: number; end: number | null }
    | null
  >(null);
  const [, bump] = useState(0);
  /**
   * A pay PERIOD, stepped — not a free date range.
   *
   * `TIME-009` approves a pay period and `TIME-010` exports approved periods, so an
   * arbitrary range cannot be the unit of approval: approve Nov 2–4 and nobody can say
   * what Nov 5–8 is, which periods are approved, or what reopening would reopen. The
   * control therefore does not offer a range it would then have to refuse.
   *
   * Ad-hoc ranges are a reporting question and already have a home — Clocked hours and
   * Job hours take any range, because looking is not approving.
   */
  const [periodStart, setPeriodStart] = useState(() =>
    startOfWeek(fromISODate(DAY_ISO[TODAY_LABEL])!)
  );
  const period: DateRange = { from: periodStart, to: addDays(periodStart, 6) };
  const thisPeriodStart = startOfWeek(fromISODate(DAY_ISO[TODAY_LABEL])!);
  const approved = approvedPeriods.has(toISODate(periodStart));

  const { id } = useParams();
  const { href } = useShell();
  const navigate = useNavigate();
  // No id means Everyone — the period as a whole, which is also what a fresh visit wants.
  const who = id ?? "all";
  const selectedEmployee = employees.find((e) => e.id === who);

  const inPeriod = (day: string) => {
    const d = fromISODate(DAY_ISO[day] ?? "");
    return d ? isWithin(d, startOfDay(period.from), startOfDay(period.to)) : true;
  };

  const periodPunches = punches.filter((p) => inPeriod(p.day));
  const periodEntries = seedEntries.filter((e) => inPeriod(e.day));
  const shownPunches = periodPunches.filter((p) => who === "all" || p.who === who);
  const shownEntries = periodEntries.filter((e) => who === "all" || e.who === who);

  const forEmployee = (empId: string) => ({
    payable: periodPunches.filter((p) => p.who === empId).reduce((a, p) => a + minutesOf(p), 0),
    job: periodEntries.filter((e) => e.who === empId).reduce((a, e) => a + minutesOf(e), 0),
    running: periodPunches.filter((p) => p.who === empId && isLeftRunning(p)).length,
  });

  const totals = {
    payable: periodPunches.reduce((a, p) => a + minutesOf(p), 0),
    job: periodEntries.reduce((a, e) => a + minutesOf(e), 0),
  };

  /** Counted across the whole period, never the selection. See the note above. */
  const blocking = periodPunches.filter(isLeftRunning).length;

  const selectionPayable = shownPunches.reduce((a, p) => a + minutesOf(p), 0);
  const selectionJob = shownEntries.reduce((a, e) => a + minutesOf(e), 0);

  /**
   * Punches and entries as one chronological list.
   *
   * `TIME-001` keeps attendance and job time apart, so the KIND is on every row rather
   * than implied by which list it sits in. Order is day then clock, because a timesheet
   * is read against a day.
   */
  type Rec = {
    key: string;
    kind: "attendance" | "job" | "activity";
    label: string;
    start: number;
    end: number | null;
    /** Minutes, in the column this record FEEDS — never both. */
    payable: number | null;
    job: number | null;
    attention: boolean;
    corrected: boolean;
    onCorrect: () => void;
  };

  /**
   * Grouped by day, and every record's hours land in the column that total is made of.
   *
   * The flat list this replaces failed at the thing the screen is for: with one hours
   * figure per row you could not see which rows added up to "payable" and which to "on
   * jobs", and the kind was carried by a text prefix nobody scans.
   *
   * Two columns is `TIME-006` made visible rather than merely obeyed — attendance can
   * only ever fill the left column, job time the right, and nothing can appear in both.
   * Reading straight down a column reaches the number in the header.
   */
  const days = DAYS.filter((day) =>
    [...shownPunches, ...shownEntries].some((r) => r.day === day)
  ).map((day) => {
    const recs: Rec[] = [
      ...shownPunches
        .filter((p) => p.day === day)
        .map((p) => ({
          key: `p-${p.id}`,
          kind: "attendance" as const,
          label: "Attendance",
          start: p.in,
          end: p.out,
          payable: minutesOf(p),
          job: null,
          attention: isLeftRunning(p),
          corrected: false,
          onCorrect: () => correctPunch(p),
        })),
      ...shownEntries
        .filter((e) => e.day === day)
        .map((e) => ({
          key: `e-${e.id}`,
          kind: (e.jobNo ? "job" : "activity") as "job" | "activity",
          label: (e.jobNo ? jobLabel(e.jobNo) : e.activity) ?? "",
          start: e.start,
          end: e.end,
          payable: null,
          job: minutesOf(e),
          attention: false,
          corrected: Boolean(e.correctedFrom),
          onCorrect: () => correctEntry(e),
        })),
    ].sort((a, b) => a.start - b.start);

    return {
      day,
      recs,
      payable: recs.reduce((a, r) => a + (r.payable ?? 0), 0),
      job: recs.reduce((a, r) => a + (r.job ?? 0), 0),
    };
  });

  const correctPunch = (p: (typeof punches)[number]) =>
    setCorrecting({
      kind: "punch",
      id: p.id,
      what: `${nameOf(p.who)} · punch`,
      when: p.day,
      start: p.in,
      end: p.out,
    });

  const correctEntry = (e: (typeof seedEntries)[number]) =>
    setCorrecting({
      kind: "entry",
      id: e.id,
      what: `${nameOf(e.who)} · ${
        e.jobNo ? jobLabel(e.jobNo) : e.activity
      }`,
      when: e.day,
      start: e.start,
      end: e.end,
    });

  return (
    <ListDetailLayout
      hasSelection
      backTo="/app/time"
      empty="Pick someone."
      list={
        <>
          <ListHeader title="Timesheet review" count={employees.length} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ListRow
              to={href("/app/time")}
              selected={who === "all"}
              /* A lead of its own, so every title in the column starts at the same x.
                 Without it "Everyone" hangs 44px left of the names under it and the
                 column reads as two lists. */
              lead={
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Users className="size-4" />
                </span>
              }
              title="Summary"
              /* No attention chip here. Summary is a roll-up, and the person who needs
                 you is already named on their own row below — a chip here would be the
                 same fact a second time, one row away from where it can be acted on. */
              subtitle={`${employees.length} people`}
              meta={`${hours(totals.payable)} h`}
              metaSub="payable"
            />
            {employees.map((emp) => {
              const s = forEmployee(emp.id);
              return (
                <ListRow
                  key={emp.id}
                  to={href(`/app/time/${emp.id}`)}
                  selected={who === emp.id}
                  lead={<Monogram name={emp.name} />}
                  title={emp.name}
                  subtitle={`${hours(s.job)} h on jobs`}
                  meta={`${hours(s.payable)} h`}
                  metaSub="payable"
                  attention={s.running > 0 ? "Running over 12 h" : undefined}
                />
              );
            })}
          </div>

        </>
      }
      detail={
        <div className="flex h-full min-h-0 flex-col">
          <DetailHeader
            eyebrow={`Timesheet · ${fmtRange(period.from, period.to, new Date())}`}
            title={selectedEmployee ? selectedEmployee.name : "Summary"}
            actions={
              <>
                {/* The period applies to the WHOLE screen, so it is on every pane.
                    Unlike Approve, changing it from Marco's pane is not a misreading —
                    you get Marco's other period, which is what you asked for. Approve
                    has a side effect on everyone, which is why it stays on Summary. */}
                <PeriodPicker
                  value={periodStart}
                  onChange={setPeriodStart}
                  current={thisPeriodStart}
                  statusOf={(start) => ({
                    approved: approvedPeriods.has(toISODate(start)),
                    blocking: punches.filter(
                      (p) =>
                        isLeftRunning(p) &&
                        withinWeek(DAY_ISO[p.day], start)
                    ).length,
                  })}
                />
                {/* Approving locks the period for everyone, so it belongs with the
                    period's totals — not on a pane headed with one person's name. */}
                {who === "all" &&
                  (approved ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-sm text-muted-foreground">
                      <Lock className="size-3.5" /> Approved
                    </span>
                  ) : (
                  <span
                    onClick={() => {
                      if (blocking > 0) {
                        toast.error("Resolve what needs you first", {
                          description: `${blocking} entr${blocking === 1 ? "y" : "ies"} in this period still need you. Approving locks it for everyone.`,
                        });
                        return;
                      }
                      setApprovedPeriods((s) =>
                        new Set(s).add(toISODate(periodStart))
                      );
                      toast.success("Pay period approved", {
                        description: `${fmtRange(period.from, period.to, new Date())} is locked. Reopening is audited.`,
                      });
                    }}
                  >
                    <Btn primary>Approve period</Btn>
                  </span>
                  ))}
              </>
            }
            sub={
              /* TIME-006 at the top of whatever you selected. Two numbers, side by
                 side, never summed — the same refusal the old table made structural. */
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>
                  <span className="tnum font-medium text-foreground">
                    {hours(selectionPayable)} h
                  </span>{" "}
                  payable
                </span>
                <span>
                  <span className="tnum">{hours(selectionJob)} h</span> on jobs · costing
                  only
                </span>
              </span>
            }
          />

          <div className="min-h-0 flex-1 overflow-auto p-3">
            <div className="space-y-3">
              {/* Two different answers to "what am I looking at".

                  SUMMARY is a roll-up. Seven people's records interleaved by day is a
                  report nobody reads, and the per-person view already does detail, so
                  this answers the question Summary is actually asked: who worked how
                  much, and does it look right.

                  ONE PERSON gets their punches and entries in a single list. Two lists
                  each ending in a Correct… button was the same affordance twice, and it
                  separated what needed attention from the record it belongs to. Every
                  row states its KIND, though — a punch is attendance and an entry is
                  job time, and TIME-001 keeps those apart. Merging the lists must not
                  merge the meanings. */}
              {who === "all" ? (
                <Section title="Hours by employee">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Employee</th>
                        <th className="px-3 py-2 text-right font-medium">Payable</th>
                        <th className="px-3 py-2 text-right font-medium">On jobs</th>
                        <th className="px-3 py-2 text-right font-medium">Entries</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((emp) => {
                        const s = forEmployee(emp.id);
                        const n = periodEntries.filter((e) => e.who === emp.id).length;
                        return (
                          <tr
                            key={emp.id}
                            onClick={() => navigate(href(`/app/time/${emp.id}`))}
                            className="cursor-pointer border-b last:border-0 hover:bg-accent/50"
                          >
                            <td className="px-3 py-2">
                              <Link
                                to={href(`/app/time/${emp.id}`)}
                                className="underline-offset-2 hover:underline"
                              >
                                {emp.name}
                              </Link>
                            </td>
                            <td className="tnum px-3 py-2 text-right font-medium">
                              {/* The mark sits on the FIGURE it affects. A punch still
                                  running is inflating this number, so the dot belongs
                                  here rather than in a separate list — and the row is
                                  the way to go and fix it. */}
                              <span className="inline-flex items-center gap-1.5">
                                {s.running > 0 && (
                                  <span
                                    aria-label="Includes a punch still running"
                                    title="Includes a punch still running"
                                    className="size-2 shrink-0 rounded-full bg-attention"
                                  />
                                )}
                                {hours(s.payable)} h
                              </span>
                            </td>
                            <td className="tnum px-3 py-2 text-right text-muted-foreground">
                              {hours(s.job)} h
                            </td>
                            <td className="tnum px-3 py-2 text-right text-muted-foreground">
                              {n}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {/* TIME-006 again, at the only place a grand total would be
                        tempting. Two columns, two totals, no sum across them. */}
                    <tfoot>
                      <tr className="border-t-2 font-semibold">
                        <td className="px-3 py-2">Payroll takes this column →</td>
                        <td className="tnum px-3 py-2 text-right">
                          {hours(totals.payable)} h
                        </td>
                        <td className="tnum px-3 py-2 text-right text-muted-foreground">
                          {hours(totals.job)} h
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </Section>
              ) : (
              <Section title="Time records">
                {days.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    Nothing in this period.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Record</th>
                        <th className="hidden px-3 py-2 font-medium sm:table-cell">
                          Time
                        </th>
                        <th className="px-3 py-2 text-right font-medium">Payable</th>
                        <th className="px-3 py-2 text-right font-medium">On jobs</th>
                        <th className="w-px px-3 py-2" />
                      </tr>
                    </thead>

                    {days.map((d) => (
                      <tbody key={d.day} className="border-b last:border-0">
                        {/* The day's own subtotals, in the same two columns, so a day
                            can be checked without adding anything up. */}
                        <tr className="bg-muted/50">
                          <td className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
                            {d.day}
                          </td>
                          <td className="hidden sm:table-cell" />
                          <td className="tnum px-3 py-1.5 text-right text-xs font-semibold">
                            {d.payable > 0 ? `${hours(d.payable)} h` : "—"}
                          </td>
                          <td className="tnum px-3 py-1.5 text-right text-xs text-muted-foreground">
                            {d.job > 0 ? `${hours(d.job)} h` : "—"}
                          </td>
                          <td />
                        </tr>

                        {d.recs.map((r) => (
                          <tr key={r.key} className="border-t">
                            <td className="px-3 py-2">
                              <span className="flex items-center gap-2">
                                {/* An icon per kind, so the type is seen rather than
                                    read. The column the hours land in says it a second
                                    time — two cues for the distinction TIME-001 turns
                                    on. */}
                                <KindIcon kind={r.kind} />
                                <span className="min-w-0 truncate">{r.label}</span>
                                {r.attention && <LeftRunningChip />}
                                {r.corrected && <Pill tone="muted">Corrected</Pill>}
                              </span>
                            </td>
                            <td className="tnum hidden px-3 py-2 text-muted-foreground sm:table-cell">
                              {at(r.start)}
                              {r.end === null ? " → running" : `–${at(r.end)}`}
                            </td>
                            <td className="tnum px-3 py-2 text-right">
                              {r.payable === null ? (
                                <span className="text-muted-foreground/30">·</span>
                              ) : (
                                `${hours(r.payable)} h`
                              )}
                            </td>
                            <td className="tnum px-3 py-2 text-right text-muted-foreground">
                              {r.job === null ? (
                                <span className="text-muted-foreground/30">·</span>
                              ) : (
                                `${hours(r.job)} h`
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span onClick={r.onCorrect}>
                                <Btn>Correct…</Btn>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    ))}

                    {/* These two match the header exactly, which is the point of the
                        whole table. They are never added together. */}
                    <tfoot>
                      <tr className="border-t-2 font-semibold">
                        <td className="px-3 py-2">Period</td>
                        <td className="hidden sm:table-cell" />
                        <td className="tnum px-3 py-2 text-right">
                          {hours(selectionPayable)} h
                        </td>
                        <td className="tnum px-3 py-2 text-right text-muted-foreground">
                          {hours(selectionJob)} h
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </Section>
              )}

              {shownEntries.some((e) => e.correctedFrom) && (
                <Section title="Corrections">
                  <ul className="divide-y">
                    {shownEntries
                      .filter((e) => e.correctedFrom)
                      .map((e) => (
                        <li key={e.id} className="p-3 text-sm">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="font-medium">
                              {nameOf(e.who)}
                            </span>
                            <span className="text-muted-foreground">
                              {e.jobNo ? jobLabel(e.jobNo) : e.activity} · {e.day}
                            </span>
                          </div>
                          <div className="tnum mt-1 flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-muted-foreground line-through">
                              {at(e.correctedFrom!.start)}–{at(e.correctedFrom!.end)}
                            </span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-medium">
                              {at(e.start)}–{at(e.end!)}
                            </span>
                            <span className="text-muted-foreground">
                              · by {e.correctedFrom!.by}
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs italic text-muted-foreground">
                            “{e.correctedFrom!.reason}”
                          </div>
                        </li>
                      ))}
                  </ul>
                </Section>
              )}

              <p className="flex items-start gap-2 p-1 text-xs text-muted-foreground">
                <Check className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Payable hours come from punches only (TIME-006). Job time is costing
                  (TIME-011) and is never added to pay. A technician cannot edit their own
                  time (TIME-008); corrections keep both values.
                </span>
              </p>
            </div>
          </div>
        </div>
      }
      after={
        correcting && (
          <CorrectTimeDialog
            open
            onOpenChange={(v) => !v && setCorrecting(null)}
            what={correcting.what}
            when={correcting.when}
            start={correcting.start}
            end={correcting.end}
            endRequired={correcting.end === null}
            onSave={({ start, end, reason }) => {
              if (correcting.kind === "punch") {
                const p = punches.find((x) => x.id === correcting.id)!;
                const before = { start: p.in, end: p.out ?? end, reason, by: "Cam" };
                p.in = start;
                p.out = end;
                seedEntries.push({
                  id: `${p.id}-c`,
                  who: p.who,
                  day: p.day,
                  jobNo: null,
                  activity: "Punch correction",
                  start,
                  end,
                  correctedFrom: before,
                });
              } else {
                const e = seedEntries.find((x) => x.id === correcting.id)!;
                e.correctedFrom = { start: e.start, end: e.end ?? end, reason, by: "Cam" };
                e.start = start;
                e.end = end;
              }
              bump((n) => n + 1);
              toast.success("Correction saved", {
                description: `${at(start)}–${at(end)} · ${hours(end - start)} h. The original is kept.`,
              });
              setCorrecting(null);
            }}
          />
        )
      }
    />
  );
}

/** Is this day inside the week beginning `start`? */
function withinWeek(dayISO: string | undefined, start: Date) {
  const d = dayISO ? fromISODate(dayISO) : null;
  return d ? isWithin(d, start, addDays(start, 6)) : false;
}

/**
 * The pay period, as a list rather than a stepper.
 *
 * A stepper can only answer "what is next to this one". The list answers the question
 * `TIME-010` actually turns on — **which periods are approved** — by showing the state
 * of each one beside it. With a stepper you would have to visit a period to find out.
 *
 * It offers whole periods only, for the same reason review has no date range: approving
 * half a period is not a thing, so the control never lets you express one.
 */
const PERIODS_BACK = 8;

function PeriodPicker({
  value,
  onChange,
  current,
  statusOf,
}: {
  value: Date;
  onChange: (d: Date) => void;
  current: Date;
  statusOf: (start: Date) => { approved: boolean; blocking: number };
}) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const periods = Array.from({ length: PERIODS_BACK }, (_, i) =>
    addDays(current, -7 * i)
  );

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      label="Choose a pay period"
      trigger={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-md border px-2.5 text-sm hover:bg-accent/50",
            open && "ring-2 ring-ring/40"
          )}
        >
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <span className="tnum whitespace-nowrap">
            {fmtRange(value, addDays(value, 6), today)}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      }
    >
      <div className="w-64">
        <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Pay period · weekly
        </div>
        <ul className="max-h-72 overflow-y-auto">
          {periods.map((start) => {
            const s = statusOf(start);
            const on = isSameDay(start, value);
            return (
              <li key={toISODate(start)}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(start);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    on ? "bg-accent font-medium" : "hover:bg-accent/60"
                  )}
                >
                  <span className="tnum flex-1 whitespace-nowrap">
                    {fmtRange(start, addDays(start, 6), today)}
                  </span>
                  {isSameDay(start, current) && (
                    <span className="text-[11px] text-muted-foreground">now</span>
                  )}
                  {/* The state is the point of the list. Approved is settled and quiet;
                      a count is the attention colour, same as everywhere else. */}
                  {s.approved ? (
                    <Lock className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : s.blocking > 0 ? (
                    <span className="tnum rounded-full bg-attention px-1.5 text-[10px] font-semibold text-attention-fg">
                      {s.blocking}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Popover>
  );
}

/** Attendance, a job, or shop time — recognised at a glance rather than read. */
function KindIcon({ kind }: { kind: "attendance" | "job" | "activity" }) {
  const Icon = kind === "attendance" ? Clock : kind === "job" ? Briefcase : Wrench;
  return (
    <span
      title={kind === "attendance" ? "Attendance · payable" : "Job time · costing only"}
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-md",
        kind === "attendance"
          ? "bg-foreground/10 text-foreground"
          : "bg-muted text-muted-foreground"
      )}
    >
      <Icon className="size-3.5" />
    </span>
  );
}
