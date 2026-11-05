import { customers, invoices, jobs } from "@/data/sample";
import { employees, isLeftRunning, punches } from "@/data/time";
import type { Role } from "./routes";

/**
 * What needs someone's attention, per section.
 *
 * This is the single source for BOTH the rail badge and the list's "Needs attention"
 * filter. A badge that says 3 and a list that cannot show you which 3 is a dead end —
 * the user is told something is wrong and given nowhere to go. Deriving both from one
 * function makes disagreement impossible rather than unlikely.
 *
 * Every reason here is a rule, not a guess:
 *   customers  owes money that is past due (INV-010 status is derived)
 *   jobs       owner: work marked finished, waiting to be closed (JOB-007)
 *              tech:  assigned and not started yet
 *   invoices   overdue, or a draft that has never been sent (JOB-009 creates it unsent)
 *   time       owner: a punch left running past 12 hours (TIME-013). Derived, never
 *              stopped automatically, and it blocks approving the period — so it has
 *              to be visible without opening the screen.
 */
/**
 * `reason` is empty when the record's own status already IS the reason — an overdue
 * invoice needs no words beyond `OVERDUE`, in amber. `StatusPill` appends a non-empty
 * reason to the status; `AttentionChip` carries it alone for records with no status.
 */
export type Attention = { id: string; reason: string };

export function attentionFor(section: string, role: Role): Attention[] {
  if (section === "customers" && role === "owner") {
    const overdueBy = new Set(
      invoices.filter((i) => i.status === "Overdue").map((i) => i.customerId)
    );
    return customers
      .filter((c) => overdueBy.has(c.id))
      .map((c) => ({ id: c.id, reason: "Payment overdue" }));
  }

  if (section === "jobs") {
    if (role === "owner") {
      return jobs
        // JOB-007: finished AND not yet closed. Once it is closed there is nothing
        // left for the owner to do, so the flag has to clear.
        .filter((j) => j.stage === 5 && !j.closed)
        // The pill prefixes the stage, so this reads "COMPLETED · WAITING TO BE CLOSED".
        .map((j) => ({ id: j.no, reason: "waiting to be closed" }));
    }
    // "Ready for production", in amber, already says assigned-and-untouched. Spelling
    // out "not started" beside it is the same sentence twice.
    return jobs
      .filter((j) => j.who === "T1" && j.stage === 0)
      .map((j) => ({ id: j.no, reason: "" }));
  }

  if (section === "time" && role === "owner") {
    // TIME-013 says flag, never stop automatically — so the flag has to land somewhere
    // a person looks. The rail badge IS that somewhere.
    return punches.filter(isLeftRunning).map((p) => ({
      id: p.id,
      reason: `${employees.find((e) => e.id === p.who)?.name} · running over 12 h`,
    }));
  }

  if (section === "invoices" && role === "owner") {
    return invoices
      .filter((i) => i.status === "Overdue" || i.status === "Draft")
      .map((i) => ({
        id: i.no,
        // The status pill carries both. OVERDUE needs nothing added; DRAFT does, because
        // a draft is only a problem for having never been sent.
        reason: i.status === "Overdue" ? "" : "never sent",
      }));
  }

  return [];
}

export const attentionMap = (section: string, role: Role) =>
  new Map(attentionFor(section, role).map((a) => [a.id, a.reason]));
