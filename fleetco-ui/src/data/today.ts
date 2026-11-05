/**
 * What Today draws from. Derivation only — every number here is computed from the same
 * seed the rest of the app reads, because a dashboard that keeps its own copy of the
 * truth is the fastest way to have two answers to one question.
 *
 * The attention roll-up is NOT here. It lives in `nav/attention.ts` beside the rule that
 * produces the rail badge, so the page and the badge can never disagree.
 */
import {
  calendarEntries,
  TODAY,
  WEEK,
  type CalendarEntry,
} from "./sample";
import { NOW, punches, type Punch } from "./time";
import type { Role } from "@/nav/routes";

/** A technician is one person; the seed's technician is T1. */
export const ME = "T1";

export type DayPlan = {
  index: number;
  /** "Today", "Tomorrow", then the weekday — a date nobody has to count forward from. */
  heading: string;
  /** "Wed Nov 4". Always shown, because "Tomorrow" alone is a date you cannot write down. */
  date: string;
  isToday: boolean;
  entries: CalendarEntry[];
};

/**
 * Today and the rest of the shop week. It stops at Friday rather than rolling forward
 * seven days because the schedule grid is a Mon–Fri week (`WEEK`) and a dashboard that
 * shows days the schedule cannot is a dashboard you cannot act on.
 */
export function dayPlans(role: Role): DayPlan[] {
  const mine =
    role === "owner" ? calendarEntries : calendarEntries.filter((e) => e.who.includes(ME));
  return WEEK.slice(TODAY).map((d, offset) => {
    const index = TODAY + offset;
    return {
      index,
      heading: offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : d.label,
      date: d.date,
      isToday: offset === 0,
      entries: mine
        .filter((e) => e.day === index)
        .sort((a, b) => a.start - b.start),
    };
  });
}

/** Done, happening now, or still ahead — only meaningful on today's column. */
export type When = "past" | "now" | "ahead";

export const whenIs = (e: CalendarEntry, isToday: boolean): When =>
  !isToday ? "ahead" : e.end <= NOW ? "past" : e.start <= NOW ? "now" : "ahead";

/** Today's work that has not finished yet. The number the day is actually about. */
export const leftToday = (plan: DayPlan) =>
  plan.entries.filter((e) => whenIs(e, plan.isToday) !== "past");

/**
 * The viewer's own open punch, if they are on the clock. A technician opening this page
 * mid-shift wants one fact before any other: am I clocked in, and since when.
 */
export const myPunch = (who: string): Punch | undefined =>
  punches.find((p) => p.who === who && p.out === null);

/** Minutes elapsed on an open punch, as of `NOW`. */
export const elapsed = (p: Punch) => Math.max(0, NOW - p.in);

/** "7h 34m" — a duration, not a decimal. Payroll reads 7.57; a person reads this. */
export const span = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};
