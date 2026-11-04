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
 * There is no tone. Every badge is the ONE attention colour, because every badge is
 * derived from the one attention function — a red Estimates badge beside an amber
 * Customers one implied a severity the data cannot actually tell them apart by. Two
 * colours would also break the thing the colour is for: the badge, the row chip and the
 * filter count are meant to be recognised as the same mark.
 */
export type Badge = { count?: number; dot?: boolean };

/**
 * There is no "badges off". A badge is not decoration that can be turned down — it is
 * the top of the attention ladder, and the chip on the row and the filter count are the
 * same fact further down. Switching one layer off while the other two stayed on showed
 * a state the app can never actually be in.
 */
export function badgesFor(role: Role): Record<string, Badge> {
  // Every badge is derived from the SAME function the list filters on, so the two can
  // never disagree, and no section carries a badge it cannot explain. See attention.ts.
  const out: Record<string, Badge> = {};
  for (const section of ["jobs", "customers", "invoices"]) {
    const n = attentionFor(section, role).length;
    if (n) out[section] = { count: n };
  }
  return out;
}

/** What rolls up onto the phone's More button: everything not in the bottom bar. */
export function rollUp(badges: Record<string, Badge>, visibleKeys: Set<string>) {
  let count = 0;
  let dot = false;
  for (const [key, b] of Object.entries(badges)) {
    if (visibleKeys.has(key)) continue;
    if (b.count) count += b.count;
    if (b.dot) dot = true;
  }
  return count || dot ? { count: count || undefined, dot: !count && dot } : null;
}
