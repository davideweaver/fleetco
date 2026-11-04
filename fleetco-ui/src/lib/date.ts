/**
 * Date helpers. No dependency, for the same reason the calendar has none: V1 has one
 * shop timezone (`PLAT-003`), no recurrence and no locale switching, and what is left
 * after removing those three is arithmetic on a `Date` at local midnight.
 *
 * Everything here works on **shop-local days**. A day is identified by its midnight,
 * never by a UTC instant, so a date never shifts because someone opened the app at
 * 11pm. If OTC ever runs a shop in a second timezone this is the file that has to
 * change, and it is deliberately small so that it can.
 */

/** Local midnight. Every function here returns one of these. */
export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = startOfDay(d);
  out.setDate(out.getDate() + n);
  return out;
}

/**
 * Month arithmetic clamps rather than overflowing: Jan 31 + 1 month is Feb 28, not
 * Mar 3. Overflow is what makes a "next month" button skip February.
 */
export function addMonths(d: Date, n: number): Date {
  const out = startOfDay(d);
  const day = out.getDate();
  out.setDate(1);
  out.setMonth(out.getMonth() + n);
  const last = daysInMonth(out);
  out.setDate(Math.min(day, last));
  return out;
}

export function startOfMonth(d: Date): Date {
  const out = startOfDay(d);
  out.setDate(1);
  return out;
}

export function endOfMonth(d: Date): Date {
  const out = startOfMonth(d);
  out.setMonth(out.getMonth() + 1);
  out.setDate(0);
  return out;
}

export function daysInMonth(d: Date): number {
  return endOfMonth(d).getDate();
}

/** Weeks start Monday — the shop's week, and the schedule grid already assumes it. */
export function startOfWeek(d: Date): Date {
  const out = startOfDay(d);
  const shift = (out.getDay() + 6) % 7;
  return addDays(out, -shift);
}

export function startOfQuarter(d: Date): Date {
  const out = startOfMonth(d);
  out.setMonth(Math.floor(out.getMonth() / 3) * 3);
  return out;
}

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const isBefore = (a: Date, b: Date) => startOfDay(a) < startOfDay(b);
export const isAfter = (a: Date, b: Date) => startOfDay(a) > startOfDay(b);

/** Inclusive on both ends, which is what "Nov 2 – Nov 6" means to a person. */
export const isWithin = (d: Date, from: Date, to: Date) =>
  !isBefore(d, from) && !isAfter(d, to);

export const clampDay = (d: Date, min?: Date, max?: Date) =>
  min && isBefore(d, min) ? startOfDay(min) : max && isAfter(d, max) ? startOfDay(max) : startOfDay(d);

/**
 * The six-week grid for a month. Always 42 cells, so the popover never changes height
 * when you page between a 4-row month and a 6-row one — a grid that resizes under the
 * cursor makes you re-aim at the day you were about to click.
 */
export function monthGrid(month: Date): Date[] {
  const first = startOfWeek(startOfMonth(month));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
export const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** "Nov 4" — and "Nov 4, 2025" once it leaves the current year. */
export function fmtDay(d: Date, today = new Date()): string {
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === today.getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

export const fmtMonth = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

/**
 * "Nov 2 – 6" when a range sits inside one month, "Oct 28 – Nov 6" when it does not.
 * Repeating the month on both sides of a dash is noise a reader has to skip.
 */
export function fmtRange(from: Date, to: Date, today = new Date()): string {
  if (isSameDay(from, to)) return fmtDay(from, today);
  const sameYear = from.getFullYear() === to.getFullYear();
  if (sameYear && from.getMonth() === to.getMonth()) {
    return `${fmtDay(from, today)} – ${to.getDate()}`;
  }
  return `${fmtDay(from, today)} – ${fmtDay(to, today)}`;
}

/** `yyyy-mm-dd`, built from the local parts so it never slips a day through UTC. */
export function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Parses `yyyy-mm-dd` as a LOCAL day. `new Date("2026-11-04")` would be UTC midnight. */
export function fromISODate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}
