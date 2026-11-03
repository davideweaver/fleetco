import { invoices, jobs } from "@/data/sample";
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

  if (role === "tech") {
    const mine = jobs.filter((j) => j.who === "T1");
    const notStarted = mine.filter((j) => j.stage === 0).length;
    return level === "busy"
      ? {
          jobs: { count: notStarted + 2, tone: "brand" },
          schedule: { count: 3, tone: "brand" },
          // TIME-013: a timer left running overnight. A number would say nothing.
          time: { dot: true, tone: "alert" },
        }
      : { jobs: { count: notStarted, tone: "brand" } };
  }

  const awaitingClose = jobs.filter((j) => j.stage === 5).length;
  const drafts = invoices.filter((i) => i.status === "Draft").length;
  const overdue = invoices.filter((i) => i.status === "Overdue").length;

  return level === "busy"
    ? {
        // JOB-007: a technician marked work finished; the owner reviews and closes.
        jobs: { count: awaitingClose + 3, tone: "brand" },
        // RPT-004 ready to invoice, plus drafts never sent. Money sitting still.
        invoices: { count: drafts + overdue + 9, tone: "alert" },
        estimates: { count: 4, tone: "brand" },
        // TIME-009: a pay period waiting to be approved.
        time: { count: 1, tone: "brand" },
        materials: { dot: true, tone: "brand" },
      }
    : {
        jobs: { count: awaitingClose, tone: "brand" },
        invoices: { count: overdue, tone: "alert" },
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
