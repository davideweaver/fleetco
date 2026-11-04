import { customers, invoices, jobs } from "@/data/sample";
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
        .filter((j) => j.stage === 5)
        .map((j) => ({ id: j.no, reason: "Finished · waiting for you to close" }));
    }
    return jobs
      .filter((j) => j.who === "T1" && j.stage === 0)
      .map((j) => ({ id: j.no, reason: "Not started" }));
  }

  if (section === "invoices" && role === "owner") {
    return invoices
      .filter((i) => i.status === "Overdue" || i.status === "Draft")
      .map((i) => ({
        id: i.no,
        reason: i.status === "Overdue" ? "Overdue" : "Draft · never sent",
      }));
  }

  return [];
}

export const attentionMap = (section: string, role: Role) =>
  new Map(attentionFor(section, role).map((a) => [a.id, a.reason]));
