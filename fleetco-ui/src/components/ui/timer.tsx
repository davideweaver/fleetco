import { useState } from "react";
import { Briefcase, ChevronRight, LogIn, LogOut, Play, Square, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Btn } from "@/shell/ListDetailLayout";
import { AttentionChip } from "./attention";
import { ACTIVITIES, at, hours, jobLabel, minutesOf, NOW } from "@/data/time";
import { cn } from "@/lib/utils";

/**
 * The technician's own control, and the screen where the wrong model costs real money.
 *
 * TWO CLOCKS, never one (`TIME-001`):
 *
 *   THE DAY — "on the clock". Attendance, and the only thing that is paid
 *             (`TIME-006`). Its own card, carrying the only large number on the screen
 *             and the only mention of money anywhere in the technician's view.
 *   THE JOB — what you are on right now. Costing only (`TIME-011`). A second, plainer
 *             card headed "Right now", which never raises the subject of pay at all.
 *
 * An earlier version nested the job timer INSIDE the punch, on the theory that the
 * layout would teach the containment. It did not. Two rows with the same dot, the same
 * type size and the same button shape read as two equal switches, and the labels sent to
 * rescue it — "costing only", "payable hours come from here, not from job timers" —
 * explained the data model to someone who only wants to know whether they are getting
 * paid. A screen that needs a paragraph to be understood is not understood.
 *
 * What replaced it needs no paragraph: pay is named once, on the card that pays, and the
 * other card stays silent about it. Nothing is nested, so nothing has to be decoded;
 * the hierarchy is carried by size and by two headings in plain words.
 *
 * There is still no grand total (`TIME-006`). Job hours appear once, as "6.18 of 7.57 h
 * on jobs" — a part of the day rather than a second number anyone could be paid from.
 */

export type RunningTimer = { jobNo: string | null; activity: string | null; start: number };

/** Just enough of a job to put it in the picker. */
export type PickableJob = { no: string; what: string };

export function PunchClock({
  punchedInAt,
  timer,
  jobs,
  onPunchIn,
  onPunchOut,
  onStop,
  onStart,
}: {
  punchedInAt: number | null;
  timer: RunningTimer | null;
  /** The technician's own open jobs, in the order they should be offered. */
  jobs: PickableJob[];
  onPunchIn: () => void;
  onPunchOut: () => void;
  onStop: () => void;
  onStart: (t: { jobNo: string | null; activity: string | null }) => void;
}) {
  const [picking, setPicking] = useState(false);
  const dayMinutes = punchedInAt === null ? 0 : minutesOf({ in: punchedInAt });

  function pick(next: { jobNo: string | null; activity: string | null }) {
    setPicking(false);
    onStart(next);
  }

  return (
    <div className="space-y-3">
      {/* THE DAY. The big number, and the only card that mentions money. */}
      <div className="rounded-xl border bg-surface-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  punchedInAt !== null ? "bg-success" : "bg-muted-foreground/40"
                )}
              />
              <span className="text-sm font-medium">
                {punchedInAt !== null
                  ? `On the clock since ${at(punchedInAt)}`
                  : "Not on the clock"}
              </span>
            </div>
            <div className="tnum mt-2 text-4xl font-semibold tracking-tight">
              {hours(dayMinutes)} h
            </div>
            {/* The one sentence about money on the whole screen. */}
            <div className="mt-0.5 text-sm text-muted-foreground">
              Hours you get paid for today
            </div>
          </div>
          {/* Green in, red out. The colour is doing the work here — a technician coming
              off a truck finds the button by hue and reads the word second, which is how
              every physical time clock in a shop has always worked. It is the one place
              in the app where red is not about destruction. */}
          <span onClick={punchedInAt !== null ? onPunchOut : onPunchIn}>
            <Btn big tone={punchedInAt !== null ? "destructive" : "success"}>
              <span className="flex items-center gap-1.5">
                {punchedInAt !== null ? (
                  <>
                    <LogOut className="size-4" /> Clock out
                  </>
                ) : (
                  <>
                    <LogIn className="size-4" /> Clock in
                  </>
                )}
              </span>
            </Btn>
          </span>
        </div>
      </div>

      {/* RIGHT NOW. Job and activity time, and not a word about pay. */}
      <div className="overflow-hidden rounded-xl border bg-surface-3">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Right now
            </div>
            {timer ? (
              <>
                <div className="mt-1 flex items-center gap-2">
                  <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-nav-active" />
                  <span className="truncate font-medium">
                    {timer.jobNo ? jobLabel(timer.jobNo) : timer.activity}
                  </span>
                </div>
                <div className="tnum mt-0.5 text-sm text-muted-foreground">
                  Started {at(timer.start)} · {hours(minutesOf({ start: timer.start }))} h
                </div>
              </>
            ) : (
              <div className="mt-1 text-muted-foreground">Not working on anything</div>
            )}
          </div>
          {timer ? (
            <div className="flex gap-2">
              <span onClick={() => setPicking((v) => !v)}>
                <Btn big>Switch</Btn>
              </span>
              <span
                onClick={() => {
                  setPicking(false);
                  onStop();
                }}
              >
                <Btn big>
                  <span className="flex items-center gap-1.5">
                    <Square className="size-3.5" /> Stop
                  </span>
                </Btn>
              </span>
            </div>
          ) : (
            <span onClick={() => setPicking((v) => !v)}>
              <Btn big primary>
                <span className="flex items-center gap-1.5">
                  <Play className="size-3.5" /> Start
                </span>
              </Btn>
            </span>
          )}
        </div>

        {/* The picker is the whole answer to "start what?", so it lists the jobs rather
            than telling someone to go and find one. The old version offered four
            activity chips and a sentence — "or start a timer from a job" — which sent
            the technician to another screen for the common case. */}
        {picking && (
          <div className="border-t">
            <div className="px-4 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Your jobs
            </div>
            {jobs.filter((j) => j.no !== timer?.jobNo).length === 0 && (
              <p className="px-4 pb-3 pt-1 text-sm text-muted-foreground">
                No open jobs assigned to you.
              </p>
            )}
            <ul className="mt-1 divide-y border-t empty:hidden empty:border-0">
              {jobs
                .filter((j) => j.no !== timer?.jobNo)
                .map((j) => (
                  <li key={j.no}>
                    <button
                      type="button"
                      onClick={() => pick({ jobNo: j.no, activity: null })}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-accent"
                    >
                      <Briefcase className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {j.no} · {j.what}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
            </ul>
            <div className="border-t px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Not a job
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {ACTIVITIES.filter((a) => a !== timer?.activity).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => pick({ jobNo: null, activity: a })}
                    className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent"
                  >
                    <Wrench className="size-3.5 text-muted-foreground" />
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


/**
 * The state machine behind the controls, kept in one place because the rules are about
 * how the two clocks interact and splitting them across screens is how they diverge.
 *
 *   TIME-002  One running timer. Starting a new one stops the old at the SAME instant —
 *             no gap, no overlap — and the handoff is announced, never silent.
 *   TIME-004  (open, D-C11) A timer needs an active punch. The proposed default refuses
 *             and offers the fix, rather than quietly starting one.
 *   TIME-005  Punching out stops the running timer at the same instant.
 *   TIME-014  No timer on a closed or cancelled job.
 */
export function useTimeClock(initialPunch: number | null, initialTimer: RunningTimer | null) {
  const [punchedInAt, setPunchedInAt] = useState<number | null>(initialPunch);
  const [timer, setTimer] = useState<RunningTimer | null>(initialTimer);
  const [done, setDone] = useState<{ what: string; minutes: number }[]>([]);

  function record(t: RunningTimer, end: number) {
    setDone((d) => [
      ...d,
      {
        what: t.jobNo ? t.jobNo : (t.activity ?? ""),
        minutes: minutesOf({ start: t.start, end }),
      },
    ]);
  }

  return {
    punchedInAt,
    timer,
    done,

    punchIn() {
      setPunchedInAt(NOW);
      toast.success(`Clocked in at ${at(NOW)}`);
    },

    punchOut() {
      if (timer) {
        // TIME-005. Stopping it silently would leave someone wondering where the
        // afternoon went, so the toast says what was stopped and for how long.
        record(timer, NOW);
        const label = timer.jobNo ?? timer.activity;
        setTimer(null);
        toast.success(`Clocked out at ${at(NOW)}`, {
          description: `${label} stopped too — ${hours(NOW - timer.start)} h.`,
        });
      } else {
        toast.success(`Clocked out at ${at(NOW)}`);
      }
      setPunchedInAt(null);
    },

    start(next: { jobNo: string | null; activity: string | null; closed?: boolean }) {
      // TIME-014 first: a refusal about the job itself beats one about the punch.
      if (next.closed) {
        toast.error("That job is closed", {
          description: "Time cannot be logged against a closed or cancelled job.",
        });
        return;
      }
      // TIME-004, proposed default for D-C11. Refuse, say why, and make the fix one tap
      // away — the same shape as the board's refused drop.
      if (punchedInAt === null) {
        toast.error("Clock in first", {
          description: "You have to be on the clock to start work.",
          action: {
            label: "Clock in",
            onClick: () => {
              setPunchedInAt(NOW);
              setTimer({ jobNo: next.jobNo, activity: next.activity, start: NOW });
              toast.success(`Clocked in and started ${next.jobNo ?? next.activity}`);
            },
          },
        });
        return;
      }
      // TIME-002: the previous timer closes at this instant, not a second later.
      if (timer) {
        record(timer, NOW);
        toast.success(`Switched to ${next.jobNo ?? next.activity}`, {
          description: `${timer.jobNo ?? timer.activity} stopped at ${at(NOW)} — ${hours(
            NOW - timer.start
          )} h.`,
        });
      } else {
        toast.success(`Started ${next.jobNo ?? next.activity} at ${at(NOW)}`);
      }
      setTimer({ jobNo: next.jobNo, activity: next.activity, start: NOW });
    },

    stop() {
      if (!timer) return;
      record(timer, NOW);
      toast.success(`Stopped ${timer.jobNo ?? timer.activity}`, {
        description: `${hours(NOW - timer.start)} h logged.`,
      });
      setTimer(null);
    },
  };
}

/** `TIME-013`. Shown wherever a punch or entry is listed, not only in review. */
export function LeftRunningChip() {
  return <AttentionChip reason="Running over 12 h" />;
}
