import { useState } from "react";
import { Check, Lock } from "lucide-react";
import { toast } from "sonner";
import { useShell } from "@/shell/shell-context";
import { Btn, PageHeader, Pill } from "@/shell/ListDetailLayout";
import { PunchClock, useTimeClock, LeftRunningChip, FlaggedPill } from "@/components/ui/timer";
import { ConfirmWithReason } from "@/components/ui/confirm";
import { Section } from "./Customers";
import {
  DAYS,
  TODAY_LABEL,
  at,
  employees,
  entries as seedEntries,
  hours,
  isLeftRunning,
  jobLabel,
  minutesOf,
  punches,
} from "@/data/time";
import { cn } from "@/lib/utils";

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
  const [flagging, setFlagging] = useState<string | null>(null);

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
                    {e.flagged ? (
                      <FlaggedPill />
                    ) : (
                      // TIME-008: this is the technician's ONLY route to a change.
                      <button
                        type="button"
                        onClick={() => setFlagging(e.id)}
                        className="rounded-md px-2 py-1 text-xs text-muted-foreground underline-offset-2 hover:bg-accent hover:text-foreground"
                      >
                        Ask for a correction
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <p className="text-xs text-muted-foreground">
            You cannot edit your own time (TIME-008). Flagging sends it to Cam, who makes
            the change with a reason and keeps both versions.
          </p>
        </div>
      </div>

      <ConfirmWithReason
        open={flagging !== null}
        onOpenChange={(v) => !v && setFlagging(null)}
        title="Ask for a correction"
        consequence="Cam will see this entry in timesheet review. Say what is wrong with it."
        reasonLabel="What needs changing?"
        tone="warning"
        confirmLabel="Send"
        onConfirm={(reason) => {
          toast.success("Sent to Cam", { description: reason });
          setFlagging(null);
        }}
      />
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
function Review() {
  const [approved, setApproved] = useState(false);
  const [correcting, setCorrecting] = useState<string | null>(null);

  const rows = employees.map((emp) => {
    const theirPunches = punches.filter((p) => p.who === emp.id);
    const theirEntries = seedEntries.filter((e) => e.who === emp.id);
    return {
      emp,
      payable: theirPunches.reduce((a, p) => a + minutesOf(p), 0),
      job: theirEntries.reduce((a, e) => a + minutesOf(e), 0),
      running: theirPunches.filter(isLeftRunning),
      flagged: theirEntries.filter((e) => e.flagged),
      corrected: theirEntries.filter((e) => e.correctedFrom),
    };
  });

  const blocking = rows.reduce((a, r) => a + r.running.length + r.flagged.length, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Timesheet review"
        action={
          approved ? (
            <Pill tone="good">
              <span className="inline-flex items-center gap-1">
                <Lock className="size-3" /> Approved
              </span>
            </Pill>
          ) : (
            <span
              onClick={() => {
                // TIME-009 locks the period, and TIME-010 pays from approved periods
                // only — so approving over an unresolved flag is how a wrong number
                // reaches payroll. Refuse, and say exactly how many.
                if (blocking > 0) {
                  toast.error("Resolve the flags first", {
                    description: `${blocking} entr${blocking === 1 ? "y" : "ies"} still need you. Approving locks the period.`,
                  });
                  return;
                }
                setApproved(true);
                toast.success("Pay period approved", {
                  description: "Entries are locked. Reopening is audited.",
                });
              }}
            >
              <Btn primary>Approve period</Btn>
            </span>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 text-right font-medium">Payable</th>
                  <th className="px-3 py-2 text-right font-medium">On jobs</th>
                  <th className="px-3 py-2 font-medium">Needs you</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.emp.id} className="border-b last:border-0">
                    <td className="px-3 py-2">{r.emp.name}</td>
                    <td className="tnum px-3 py-2 text-right font-medium">{hours(r.payable)} h</td>
                    <td className="tnum px-3 py-2 text-right text-muted-foreground">
                      {hours(r.job)} h
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {r.running.map((p) => (
                          <LeftRunningChip key={p.id} />
                        ))}
                        {r.flagged.map((e) => (
                          <FlaggedPill key={e.id} />
                        ))}
                        {r.running.length + r.flagged.length === 0 && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* TIME-006 made structural: the two columns have separate totals and
                  there is deliberately no grand total, because adding payable hours to
                  job hours is the single most expensive mistake this screen could make. */}
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td className="px-3 py-2">Payroll takes the left column only</td>
                  <td className="tnum px-3 py-2 text-right">
                    {hours(rows.reduce((a, r) => a + r.payable, 0))} h
                  </td>
                  <td className="tnum px-3 py-2 text-right text-muted-foreground">
                    {hours(rows.reduce((a, r) => a + r.job, 0))} h
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <Section title="Entries that need you">
            <ul className="divide-y">
              {punches.filter(isLeftRunning).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block">
                      {employees.find((e) => e.id === p.who)?.name} · punch still running
                    </span>
                    <span className="tnum text-xs text-muted-foreground">
                      {p.day} from {at(p.in)} · {hours(minutesOf(p))} h
                    </span>
                  </span>
                  <LeftRunningChip />
                  <span onClick={() => setCorrecting(p.id)}>
                    <Btn>Correct…</Btn>
                  </span>
                </li>
              ))}
              {seedEntries
                .filter((e) => e.flagged)
                .map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block">
                        {employees.find((x) => x.id === e.who)?.name} ·{" "}
                        {e.jobNo ? jobLabel(e.jobNo) : e.activity}
                      </span>
                      <span className="tnum text-xs text-muted-foreground">
                        {e.day} {at(e.start)}–{at(e.end!)} · {hours(minutesOf(e))} h
                      </span>
                      <span className="mt-0.5 block text-xs italic text-muted-foreground">
                        “{e.flagged}”
                      </span>
                    </span>
                    <FlaggedPill />
                    <span onClick={() => setCorrecting(e.id)}>
                      <Btn>Correct…</Btn>
                    </span>
                  </li>
                ))}
            </ul>
          </Section>

          {/* TIME-008: the corrected value never replaces the original silently. Both
              are kept, the same way an approval correction supersedes rather than
              overwrites (AUTH-003). */}
          <Section title="Corrections already made">
            <ul className="divide-y">
              {seedEntries
                .filter((e) => e.correctedFrom)
                .map((e) => (
                  <li key={e.id} className="p-3 text-sm">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium">
                        {employees.find((x) => x.id === e.who)?.name}
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

          <div className={cn("flex items-start gap-2 rounded-lg border p-3 text-xs", "text-muted-foreground")}>
            <Check className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Payable hours come from punches only (TIME-006). Job time is costing
              (TIME-011) and is never added to pay. Approving locks the period
              (TIME-009); payroll exports approved periods only (TIME-010).
            </span>
          </div>
        </div>
      </div>

      <ConfirmWithReason
        open={correcting !== null}
        onOpenChange={(v) => !v && setCorrecting(null)}
        title="Correct this entry"
        consequence="The original is kept beside your change. Both stay on the record."
        reasonLabel="Why are you changing it?"
        tone="warning"
        confirmLabel="Save correction"
        onConfirm={(reason) => {
          toast.success("Correction saved", { description: reason });
          setCorrecting(null);
        }}
      />
    </div>
  );
}

export { DAYS };
