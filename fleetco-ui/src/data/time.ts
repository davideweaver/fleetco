/**
 * Time. Two clocks that must never be confused, which is the whole design problem.
 *
 *   TIME-001  A PUNCH is attendance — the day. A TIMER is job or activity time.
 *   TIME-006  Only attendance is payable. Job time never adds payable hours.
 *
 * Jason punching 07:00–15:30 and logging 6.0 h on jobs plus 1.5 h on cleanup is paid
 * 8.50, not 16.00. Everything below keeps the two apart at the data level so no screen
 * can accidentally add them.
 */
import { jobs } from "./sample";

/** `TIME-007`. Seeded; the Owner can add, rename and deactivate. */
export const ACTIVITIES = ["Cleanup", "Meetings", "Training", "General shop"];

export const DAYS = ["Mon Nov 2", "Tue Nov 3", "Wed Nov 4"];
export const TODAY_LABEL = "Wed Nov 4";

/** The real date behind each label, so a period filter compares dates, not strings. */
export const DAY_ISO: Record<string, string> = {
  "Mon Nov 2": "2026-11-02",
  "Tue Nov 3": "2026-11-03",
  "Wed Nov 4": "2026-11-04",
};

export type Employee = { id: string; name: string; initials: string };

export const employees: Employee[] = [
  { id: "T1", name: "Technician 1", initials: "T1" },
  { id: "T2", name: "Technician 2", initials: "T2" },
  { id: "OW", name: "Cam (Owner)", initials: "CW" },
];

/** Minutes since midnight, shop-local. `PLAT-003`. */
export type Punch = {
  id: string;
  who: string;
  day: string;
  in: number;
  /** null while still punched in. */
  out: number | null;
};

export type Entry = {
  id: string;
  who: string;
  day: string;
  /** A job number, or null for a non-job activity. */
  jobNo: string | null;
  activity: string | null;
  start: number;
  /** null while running. */
  end: number | null;
  /** `TIME-008`: a technician cannot edit, only ask for a correction. */
  flagged?: string;
  /** `TIME-008`: the correction kept beside what it replaced. */
  correctedFrom?: { start: number; end: number; reason: string; by: string };
};

const hm = (h: number, m = 0) => h * 60 + m;

export const punches: Punch[] = [
  { id: "p1", who: "T1", day: "Mon Nov 2", in: hm(7), out: hm(15, 30) },
  { id: "p2", who: "T1", day: "Tue Nov 3", in: hm(6, 58), out: hm(15, 20) },
  { id: "p3", who: "T1", day: "Wed Nov 4", in: hm(7, 2), out: null },
  { id: "p4", who: "T2", day: "Mon Nov 2", in: hm(8), out: hm(16, 10) },
  // TIME-013: still running after more than 12 hours. Flagged, never stopped for them.
  { id: "p5", who: "T2", day: "Tue Nov 3", in: hm(7, 45), out: null },
  { id: "p6", who: "OW", day: "Wed Nov 4", in: hm(8), out: null },
];

export const entries: Entry[] = [
  { id: "e1", who: "T1", day: "Mon Nov 2", jobNo: "G-1048", activity: null, start: hm(8), end: hm(10, 30) },
  { id: "e2", who: "T1", day: "Mon Nov 2", jobNo: "G-1044", activity: null, start: hm(10, 30), end: hm(14) },
  { id: "e3", who: "T1", day: "Mon Nov 2", jobNo: null, activity: "Cleanup", start: hm(14), end: hm(15, 15) },
  {
    id: "e4",
    who: "T1",
    day: "Tue Nov 3",
    jobNo: "G-1048",
    activity: null,
    start: hm(7, 15),
    end: hm(12),
    // TIME-008: the technician flags; only the Owner can change it.
    flagged: "Forgot to stop when I went to lunch.",
  },
  { id: "e5", who: "T1", day: "Tue Nov 3", jobNo: "G-1052", activity: null, start: hm(12, 30), end: hm(15, 10) },
  {
    id: "e6",
    who: "T2",
    day: "Mon Nov 2",
    jobNo: "G-1043",
    activity: null,
    start: hm(8, 15),
    end: hm(16),
    correctedFrom: {
      start: hm(8, 15),
      end: hm(17, 30),
      reason: "Left running overnight; Jason confirmed he left at 4.",
      by: "Cam",
    },
  },
  { id: "e7", who: "OW", day: "Wed Nov 4", jobNo: null, activity: "Meetings", start: hm(8, 30), end: hm(9, 45) },
];

/** `TIME-013`. Twelve hours, flagged in review, never stopped automatically. */
export const LEFT_RUNNING_MINUTES = 12 * 60;

/** "Now", so the lab is stable. A running punch is measured against it. */
export const NOW = hm(14, 36);

type Span = {
  day?: string;
  start?: number;
  end?: number | null;
  in?: number;
  out?: number | null;
};

/**
 * Elapsed minutes — and for a RUNNING span, measured across days.
 *
 * Minutes-since-midnight is enough for a closed entry, but a punch still open from
 * yesterday is the whole point of TIME-013, and subtracting two times-of-day makes a
 * 19-hour punch look like a 7-hour one. That is a flag that never fires, which is worse
 * than no flag at all. So an open span counts the days between its own and today.
 */
export const minutesOf = (p: Span) => {
  const start = p.start ?? p.in ?? 0;
  const closed = p.end ?? p.out ?? null;
  if (closed !== null) return Math.max(0, closed - start);
  const daysAgo = Math.max(0, DAYS.indexOf(TODAY_LABEL) - DAYS.indexOf(p.day ?? TODAY_LABEL));
  return Math.max(0, daysAgo * 24 * 60 + NOW - start);
};

/**
 * `TIME-012`: two decimals, no rounding to quarter hours. A shop that rounds to
 * quarters is a shop arguing about six minutes every Friday.
 */
export const hours = (minutes: number) => (minutes / 60).toFixed(2);

/** `08:00`, because a timesheet is read against a clock on the wall. */
export const at = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export const jobLabel = (no: string) => {
  const j = jobs.find((x) => x.no === no);
  return j ? `${j.no} · ${j.what}` : no;
};

/** What a punch or entry is called when it has outrun TIME-013's twelve hours. */
export const isLeftRunning = (p: Span) =>
  (p.end ?? p.out ?? null) === null && minutesOf(p) > LEFT_RUNNING_MINUTES;
