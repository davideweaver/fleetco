import { useState } from "react";
import { useParams } from "react-router-dom";
import { Check, Lock } from "lucide-react";
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
import { Section } from "./Customers";
import { DateRangePicker, type DateRange } from "@/components/ui/date-picker";
import { fmtRange, fromISODate, isWithin, startOfDay } from "@/lib/date";
import {
  DAYS,
  DAY_ISO,
  TODAY_LABEL,
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
  const [approved, setApproved] = useState(false);
  const [correcting, setCorrecting] = useState<
    | { kind: "punch" | "entry"; id: string; what: string; when: string; start: number; end: number | null }
    | null
  >(null);
  const [, bump] = useState(0);
  const [period, setPeriod] = useState<DateRange>({
    from: fromISODate(DAY_ISO[DAYS[0]])!,
    to: fromISODate(DAY_ISO[TODAY_LABEL])!,
  });

  const { id } = useParams();
  const { href } = useShell();
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
          <div className="border-b px-2 py-1.5">
            <DateRangePicker value={period} onChange={setPeriod} />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <ListRow
              to={href("/app/time")}
              selected={who === "all"}
              title="Everyone"
              subtitle={`${employees.length} people`}
              meta={`${hours(totals.payable)} h`}
              metaSub="payable"
              attention={blocking > 0 ? `${blocking} needs you` : undefined}
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

          {/* Pinned to the pane that means "the whole period", so it can never be read
              as approving only whoever is selected on the right. */}
          <div className="shrink-0 border-t p-2">
            {approved ? (
              <div className="flex items-center justify-center gap-1.5 rounded-md bg-muted py-2 text-sm text-muted-foreground">
                <Lock className="size-3.5" /> Period approved
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (blocking > 0) {
                    toast.error("Resolve what needs you first", {
                      description: `${blocking} entr${blocking === 1 ? "y" : "ies"} in this period still need you. Approving locks it for everyone.`,
                    });
                    return;
                  }
                  setApproved(true);
                  toast.success("Pay period approved", {
                    description: "Entries are locked. Reopening is audited.",
                  });
                }}
                className="w-full rounded-md border border-primary bg-primary py-2 text-sm font-medium text-primary-foreground"
              >
                Approve period
              </button>
            )}
            <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
              Locks every employee · payroll exports approved periods only
            </p>
          </div>
        </>
      }
      detail={
        <div className="flex h-full min-h-0 flex-col">
          <DetailHeader
            eyebrow={`Timesheet · ${fmtRange(period.from, period.to, new Date())}`}
            title={selectedEmployee ? selectedEmployee.name : "Everyone"}
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
              {shownPunches.some(isLeftRunning) && (
                <Section title="Needs you">
                  <ul className="divide-y">
                    {shownPunches.filter(isLeftRunning).map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="block">
                            {nameOf(p.who)} · punch still
                            running
                          </span>
                          <span className="tnum text-xs text-muted-foreground">
                            {p.day} from {at(p.in)} · {hours(minutesOf(p))} h
                          </span>
                        </span>
                        <LeftRunningChip />
                        <span onClick={() => correctPunch(p)}>
                          <Btn>Correct…</Btn>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              <Section title={who === "all" ? "All entries" : "Entries"}>
                {shownEntries.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    No entries in this period.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {shownEntries.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">
                            {/* The name is redundant once one person is selected. */}
                            {who === "all" && (
                              <>{nameOf(e.who)} · </>
                            )}
                            {e.jobNo ? jobLabel(e.jobNo) : e.activity}
                          </span>
                          <span className="tnum text-xs text-muted-foreground">
                            {e.day} {at(e.start)}–{at(e.end!)} · {hours(minutesOf(e))} h
                          </span>
                        </span>
                        {e.correctedFrom && <Pill tone="muted">Corrected</Pill>}
                        <span onClick={() => correctEntry(e)}>
                          <Btn>Correct…</Btn>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

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
