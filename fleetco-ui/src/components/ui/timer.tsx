import { useEffect, useState, type ReactNode } from "react";
import {
  Brush,
  GraduationCap,
  LogIn,
  LogOut,
  Play,
  Search,
  Square,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Btn } from "@/shell/ListDetailLayout";
import { AttentionChip } from "./attention";
import { Overlay } from "./overlay";
import { ACTIVITIES, at, hours, jobLabel, minutesOf, NOW } from "@/data/time";
import { cn } from "@/lib/utils";

/**
 * The technician's own control, and the screen where the wrong model costs real money.
 *
 * TWO CLOCKS, never one (`TIME-001`) — in ONE CARD, two named regions:
 *
 *   THE DAY   — "on the clock". Attendance, and the only thing that is paid
 *               (`TIME-006`). Carries the only large number and the only mention of
 *               money anywhere in the technician's view.
 *   RIGHT NOW — what you are on. Costing only (`TIME-011`). Recessed into the card on a
 *               step-back surface tone, and silent about pay.
 *
 * Three versions got here, and the two failures are the reason the third looks like
 * this. The FIRST nested the job timer inside the punch with no other signal, trusting
 * containment to teach itself; it read as two equal switches, because both halves had
 * the same dot, the same type size and the same button shape, and the captions sent to
 * rescue it — "costing only", "payable hours come from here, not from job timers" —
 * explained the data model to someone who only wants to know if they are getting paid.
 * The SECOND split them into two separate cards, which was legible but said nothing: two
 * cards in a column are two peers, and job time is not a peer of the day, it is a part
 * of it.
 *
 * This one is the containment of the first with the legibility of the second. The two
 * regions are headed in plain words — "The day", "Right now" — and the hierarchy is
 * carried by weight: the day keeps the 4xl figure and the single coloured 44px button;
 * Right now gets a smaller dot, body type, plain buttons, and a recessed surface. No
 * paragraph required, which is the actual test.
 *
 * There is still no grand total (`TIME-006`). Job hours appear once, as "6.18 of 7.57 h
 * on jobs" — a part of the day rather than a second number anyone could be paid from.
 */

export type RunningTimer = { jobNo: string | null; activity: string | null; start: number };

/** Just enough of a job to put it in the picker. */
export type PickableJob = { no: string; what: string; customer?: string };

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
    <div className="overflow-hidden rounded-xl border bg-surface-3">
      {/* THE DAY. The big number, and the only part that mentions money. */}
      <div className="p-4">
        <Region label="The day" />
        <div className="mt-2 flex items-center gap-2">
          <span
            className={cn(
              "size-2.5 shrink-0 rounded-full",
              punchedInAt !== null ? "bg-success" : "bg-muted-foreground/40"
            )}
          />
          <span className="text-sm font-medium">
            {punchedInAt !== null ? `On the clock since ${at(punchedInAt)}` : "Not on the clock"}
          </span>
        </div>
        <div className="tnum mt-2 text-4xl font-semibold tracking-tight">{hours(dayMinutes)} h</div>
        {/* The one sentence about money on the whole screen. */}
        <div className="mt-0.5 text-sm text-muted-foreground">Hours you get paid for today</div>
        {/* Green in, red out. The colour is doing the work — a technician coming off a
            truck finds the button by hue and reads the word second, which is how every
            physical time clock in a shop has always worked. It is the one place in the
            app where red is not about destruction. */}
        <span className="mt-3 inline-block" onClick={punchedInAt !== null ? onPunchOut : onPunchIn}>
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

      {/* RIGHT NOW. Job and activity time, and not a word about pay.

          One card, two regions — and the second is RECESSED, a step back in surface tone
          rather than a twin beside it. That is what the two-card version was buying with
          a gap, and what the nested version failed to say at all: job time happens inside
          an attendance day, so it is drawn inside the day. The earlier nesting read as
          two equal switches because both halves had the same dot, the same type size and
          the same button shape. Here the day keeps the 4xl figure and the one coloured
          44px button; this region gets a smaller dot, body type and plain buttons. The
          containment is carried by weight, not by a caption explaining the data model. */}
      <div className="border-t bg-surface-2 p-4">
        <Region label="Right now" />
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {timer ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="size-2 shrink-0 animate-pulse rounded-full bg-nav-active" />
                  <span className="truncate text-sm font-medium">
                    {timer.jobNo ? jobLabel(timer.jobNo) : timer.activity}
                  </span>
                </div>
                <div className="tnum mt-0.5 text-sm text-muted-foreground">
                  Started {at(timer.start)} · {hours(minutesOf({ start: timer.start }))} h
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Not working on anything</div>
            )}
          </div>
          {timer ? (
            <div className="flex gap-2">
              <span onClick={() => setPicking(true)}>
                <Btn>Switch</Btn>
              </span>
              <span onClick={onStop}>
                <Btn>
                  <span className="flex items-center gap-1.5">
                    <Square className="size-3.5" /> Stop
                  </span>
                </Btn>
              </span>
            </div>
          ) : (
            <span onClick={() => setPicking(true)}>
              <Btn primary>
                <span className="flex items-center gap-1.5">
                  <Play className="size-3.5" /> Start
                </span>
              </Btn>
            </span>
          )}
        </div>
      </div>

      <JobPicker
        open={picking}
        onOpenChange={setPicking}
        jobs={jobs}
        timer={timer}
        onPick={pick}
      />
    </div>
  );
}

/** The small heading that names a region of the clock card. Two words, no caption. */
function Region({ label }: { label: string }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </div>
  );
}

/**
 * "What are you working on?" — the dialog behind Start and Switch.
 *
 * It was an expanding panel inside the card, which worked while the clock was the whole
 * screen. On Today it is one card in a 320px column beside a day of rows, and a panel
 * that pushes that column past the page moves everything the technician was looking at.
 * A choice that blocks until it is answered is a dialog, the same as closing a job.
 *
 * The first dialog read as a navigation menu, and four things were doing that:
 *
 *   - "Switch to" as a title. A dangling fragment is not a question, and the technician
 *     has to finish the sentence before they know what the screen wants.
 *   - The eyebrow shouting `SWITCHING FROM G-1052 · BOX TRUCK LOGO KIT` in caps, louder
 *     and longer than the title, for the least important fact on the screen.
 *   - "Not a job" as a heading. It names what the options are NOT, which is no help to
 *     someone trying to find "Cleanup", and the chips under it were a second way of
 *     picking, beside the rows, for the same kind of decision.
 *   - Chevrons on every row, which mean "there is more behind this" — so a list of
 *     final answers looked like a list of doors.
 *
 * So: a plain question for a title, ONE list with one row shape, groups named for what
 * they contain, and `TIME-002`'s handoff spelled out in a sentence where it will be read
 * rather than crammed into an eyebrow.
 */
function JobPicker({
  open,
  onOpenChange,
  jobs,
  timer,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  jobs: PickableJob[];
  timer: RunningTimer | null;
  onPick: (t: { jobNo: string | null; activity: string | null }) => void;
}) {
  const [q, setQ] = useState("");
  const open_ = open;
  // The field is cleared on every open, not kept: a picker that reopens still filtered
  // by last week's search shows an empty list and no reason for it.
  useEffect(() => {
    if (open_) setQ("");
  }, [open_]);

  const mine = jobs.filter((j) => j.no !== timer?.jobNo);
  const activities = ACTIVITIES.filter((a) => a !== timer?.activity);

  // A filter only once there is something to filter. Below the threshold the whole list
  // is on screen, and a search box over five rows is a control that can only slow you
  // down. FILTER_FROM is the point at which "Shop time" stops fitting under the jobs.
  const filtering = mine.length >= FILTER_FROM;
  const term = q.trim().toLowerCase();
  const offered = term
    ? mine.filter((j) => `${j.no} ${j.what} ${j.customer ?? ""}`.toLowerCase().includes(term))
    : mine;

  return (
    <Overlay
      kind="dialog"
      open={open}
      onOpenChange={onOpenChange}
      title="What are you working on?"
      note={
        <>
          {/* TIME-002 in a sentence, and pinned. The rule is that the running timer stops
              at the SAME instant — no gap, no overlap — so it is the consequence of every
              row below it, and a consequence that scrolls away from its own list is one
              the technician reads once and never again. */}
          {timer && (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              Picking one stops{" "}
              <span className="font-medium text-foreground">
                {timer.jobNo ? jobLabel(timer.jobNo) : timer.activity}
              </span>{" "}
              at {at(NOW)}, after {hours(minutesOf({ start: timer.start }))} h.
            </p>
          )}
          {filtering && (
            <div
              className={cn(
                "flex items-center gap-2.5 px-4 py-2.5",
                timer && "border-t"
              )}
            >
              <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Filter ${mine.length} jobs…`}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}
        </>
      }
    >
      <PickGroup label="Your jobs">
        {offered.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            {mine.length === 0
              ? "No open jobs assigned to you."
              : `No job matches “${q.trim()}”.`}
          </p>
        ) : (
          offered.map((j) => (
            <JobRow key={j.no} job={j} onClick={() => onPick({ jobNo: j.no, activity: null })} />
          ))
        )}
      </PickGroup>

      {/* Named for what it holds, not for what it is not. "Not a job" told the
          technician the one thing about these options that cannot help them choose.

          Shop time is never filtered. It is four fixed rows, it is the half of this
          dialog a long job list pushes off the screen, and a technician typing "clean"
          to find Cleanup should not have to notice which group the field applies to. */}
      <PickGroup label="Shop time">
        {activities.map((a) => (
          <ActivityRow key={a} name={a} onClick={() => onPick({ jobNo: null, activity: a })} />
        ))}
      </PickGroup>
    </Overlay>
  );
}

/**
 * How many jobs before the filter appears. Roughly where "Shop time" stops fitting below
 * the job list in an 85vh dialog — about seven 56px rows after the header and the note.
 */
const FILTER_FROM = 8;

function PickGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      {/* A banded heading, on `--muted`. Flat text on the same white as the rows read as
          one more row — the list had no rhythm and nothing for the eye to catch. A step
          down in tone is what separates a label from an answer. */}
      {/* Sticky, because one scroll context is worth keeping. Nesting a second scroll
          region inside a dialog that already scrolls gives you two scrollbars and a
          touch flick that moves the wrong one. A pinned band costs nothing and answers
          the same question: which group am I in. */}
      <div className="sticky top-0 z-10 border-y bg-muted px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="divide-y">{children}</div>
    </div>
  );
}

/**
 * A job, in the same shape the day sheet uses one row up the page: the number in a fixed
 * gutter, the work beside it, the customer under that. Rendering it as one flat string —
 * "G-1048 · Unit 14 · full wrap" — gave the identifier and the description the same
 * weight, so five rows were five identical greys and there was nothing to scan by.
 */
function JobRow({ job, onClick }: { job: PickableJob; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-baseline gap-3 px-4 py-2.5 text-left hover:bg-accent"
    >
      <span className="tnum w-[3.75rem] shrink-0 text-xs font-medium text-muted-foreground">
        {job.no}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{job.what}</span>
        {job.customer && (
          <span className="block truncate text-xs text-muted-foreground">{job.customer}</span>
        )}
      </span>
    </button>
  );
}

/**
 * Shop time, with an icon per activity.
 *
 * The job rows have none, and that is not an inconsistency — it is the same test applied
 * twice. A briefcase on every job row repeated the heading above it and distinguished
 * nothing; a brush, a group of people and a mortarboard tell four otherwise identical
 * one-word rows apart at a glance. **An icon earns its place by distinguishing rows from
 * each other, not by decorating them.**
 *
 * The 32px tile is the one the lists already use for a monogram, so a row here weighs the
 * same as a row in the search palette.
 */
const ACTIVITY_ICON: Record<string, LucideIcon> = {
  Cleanup: Brush,
  Meetings: Users,
  Training: GraduationCap,
  "General shop": Wrench,
};

function ActivityRow({ name, onClick }: { name: string; onClick: () => void }) {
  const Icon = ACTIVITY_ICON[name] ?? Wrench;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-accent"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
    </button>
  );
}

/**
 * A heading and its rows, and no box around either.

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
