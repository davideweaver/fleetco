import { attentionFor } from "./attention";
import type { Role } from "./routes";

/**
 * Two kinds of badge, and conflating them is the usual mistake:
 *
 *  - COUNT  "there are N things here waiting on you". Derived from state the system
 *           already owns. No per-user read tracking, nothing to mark as seen.
 *  - DOT    "something here is off". Also derived; a number would not help.
 *
 * Deliberately NOT a third kind: "new since you last looked". That needs per-user read
 * state on every record, it has to stay in step across the shop computer and a phone,
 * and it is the kind of thing that produces "the badge will not go away" support calls.
 * Everything below approximates it from real state instead — a technician's "new jobs"
 * is "assigned to me and not started yet", which is true without anybody tracking reads.
 *
 * Tone is two values on purpose. `alert` is money that is late. Everything else is
 * `brand`, or the red stops meaning anything.
 */
export type Badge = { count?: number; dot?: boolean; tone: "brand" | "alert" };

export type BadgeLevel = "off" | "quiet" | "busy";

export function badgesFor(role: Role, level: BadgeLevel): Record<string, Badge> {
  if (level === "off") return {};

  // Sections that have a list derive their badge from the SAME function the list filters
  // on, so the two can never disagree. See nav/attention.ts.
  const derived: Record<string, Badge> = {};
  for (const section of ["jobs", "customers", "invoices"]) {
    const n = attentionFor(section, role).length;
    if (n) derived[section] = { count: n, tone: section === "invoices" ? "alert" : "brand" };
  }

  if (level === "quiet") return derived;

  // Busy adds the sections that have no list of their own yet, purely to see a crowded
  // rail. Nothing here contradicts a list, because none of these have one.
  return role === "tech"
    ? { ...derived, schedule: { count: 3, tone: "brand" }, time: { dot: true, tone: "alert" } }
    : {
        ...derived,
        estimates: { count: 4, tone: "brand" },
        // TIME-009: a pay period waiting to be approved.
        time: { count: 1, tone: "brand" },
        materials: { dot: true, tone: "brand" },
      };
}

/** What rolls up onto the phone's More button: everything not in the bottom bar. */
export function rollUp(badges: Record<string, Badge>, visibleKeys: Set<string>) {
  let count = 0;
  let dot = false;
  let tone: Badge["tone"] = "brand";
  for (const [key, b] of Object.entries(badges)) {
    if (visibleKeys.has(key)) continue;
    if (b.count) count += b.count;
    if (b.dot) dot = true;
    if (b.tone === "alert") tone = "alert";
  }
  return count || dot ? { count: count || undefined, dot: !count && dot, tone } : null;
}
