import { useState } from "react";
import { AlertTriangle, LogIn, LogOut, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Btn, Pill } from "@/shell/ListDetailLayout";
import { AttentionChip } from "./attention";
import { ACTIVITIES, at, hours, jobLabel, minutesOf, NOW } from "@/data/time";
import { cn } from "@/lib/utils";

/**
 * The technician's main control, and the one screen where getting the model wrong
 * costs real money.
 *
 * TWO CLOCKS, never one (`TIME-001`):
 *
 *   The PUNCH is the day. It is attendance, and it is the only thing that is payable
 *   (`TIME-006`). It is drawn as the frame.
 *   The TIMER is what you are working on right now. It is job or activity time, used
 *   for costing and never for pay (`TIME-011`). It is drawn INSIDE the frame.
 *
 * The nesting is the argument: job time happens within an attendance day, so the
 * layout says so before anyone reads a label. A technician who thinks the timer is
 * what pays them will stop it at lunch and lose half a day's wages.
 */

export type RunningTimer = { jobNo: string | null; activity: string | null; start: number };

export function PunchClock({
  punchedInAt,
  timer,
  onPunchIn,
  onPunchOut,
  onStop,
  onStart,
}: {
  punchedInAt: number | null;
  timer: RunningTimer | null;
  onPunchIn: () => void;
  onPunchOut: () => void;
  onStop: () => void;
  onStart: (t: { jobNo: string | null; activity: string | null }) => void;
}) {
  const [picking, setPicking] = useState(false);
  const punchedIn = punchedInAt !== null;

  return (
    <div className="rounded-xl border bg-surface-3">
      {/* The frame: attendance. */}
      <div className="flex flex-wrap items-center gap-3 border-b px-3 py-2.5">
        <span
          className={cn(
            "grid size-2.5 shrink-0 rounded-full",
            punchedIn ? "bg-success" : "bg-muted-foreground/40"
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">
            {punchedIn ? `Punched in at ${at(punchedInAt)}` : "Not punched in"}
          </div>
          <div className="text-xs text-muted-foreground">
            {punchedIn
              ? `${hours(NOW - punchedInAt)} h today · this is what gets paid`
              : "Attendance. Payable hours come from here, not from job timers."}
          </div>
        </div>
        {punchedIn ? (
          <span onClick={onPunchOut}>
            <Btn>
              <span className="flex items-center gap-1.5">
                <LogOut className="size-4" /> Punch out
              </span>
            </Btn>
          </span>
        ) : (
          <span onClick={onPunchIn}>
            <Btn primary>
              <span className="flex items-center gap-1.5">
                <LogIn className="size-4" /> Punch in
              </span>
            </Btn>
          </span>
        )}
      </div>

      {/* Inside the frame: job and activity time. */}
      <div className="px-3 py-2.5">
        {timer ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-2.5 shrink-0 animate-pulse rounded-full bg-nav-active" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {timer.jobNo ? jobLabel(timer.jobNo) : timer.activity}
              </div>
              <div className="tnum text-xs text-muted-foreground">
                {at(timer.start)} → now · {hours(NOW - timer.start)} h · costing only
              </div>
            </div>
            <span onClick={onStop}>
              <Btn>
                <span className="flex items-center gap-1.5">
                  <Square className="size-3.5" /> Stop
                </span>
              </Btn>
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-2.5 shrink-0 rounded-full bg-muted-foreground/30" />
            <span className="flex-1 text-sm text-muted-foreground">No timer running</span>
            <span onClick={() => setPicking((v) => !v)}>
              <Btn>
                <span className="flex items-center gap-1.5">
                  <Play className="size-3.5" /> Start
                </span>
              </Btn>
            </span>
          </div>
        )}

        {picking && !timer && (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t pt-2">
            {ACTIVITIES.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => {
                  setPicking(false);
                  onStart({ jobNo: null, activity: a });
                }}
                className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
              >
                {a}
              </button>
            ))}
            <span className="self-center text-xs text-muted-foreground">
              — or start a timer from a job.
            </span>
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
      toast.success(`Punched in at ${at(NOW)}`);
    },

    punchOut() {
      if (timer) {
        // TIME-005. Stopping it silently would leave someone wondering where the
        // afternoon went, so the toast says what was stopped and for how long.
        record(timer, NOW);
        const label = timer.jobNo ?? timer.activity;
        setTimer(null);
        toast.success(`Punched out at ${at(NOW)}`, {
          description: `${label} stopped too — ${hours(NOW - timer.start)} h.`,
        });
      } else {
        toast.success(`Punched out at ${at(NOW)}`);
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
        toast.error("Punch in first", {
          description: "A job timer needs an active punch.",
          action: {
            label: "Punch in",
            onClick: () => {
              setPunchedInAt(NOW);
              setTimer({ jobNo: next.jobNo, activity: next.activity, start: NOW });
              toast.success(`Punched in and started ${next.jobNo ?? next.activity}`);
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
        description: `${hours(NOW - timer.start)} h logged for costing.`,
      });
      setTimer(null);
    },
  };
}

/** `TIME-013`. Shown wherever a punch or entry is listed, not only in review. */
export function LeftRunningChip() {
  return <AttentionChip reason="Running over 12 h" />;
}

export function FlaggedPill() {
  return (
    <Pill tone="warn">
      <span className="inline-flex items-center gap-1">
        <AlertTriangle className="size-3" /> Flagged
      </span>
    </Pill>
  );
}
