import { customers, invoices, jobs } from "@/data/sample";
import { employees, isLeftRunning, nameOf, punches } from "@/data/time";
import { money } from "@/lib/utils";
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

/* --- The roll-up ----------------------------------------------------------------------
   Everything that needs someone, across every section, in one list. Today is the only
   screen that asks for this; every other surface asks per section.

   The rows carry their own label and path rather than leaving Today to switch over
   sections and rebuild them. The whole argument for `attentionFor` is that a count and
   the rows behind it can never disagree — a roll-up that re-derives "which record is
   this" somewhere else gives that back. */

export type AttentionRow = Attention & {
  section: string;
  /** What the record is called, in a list that mixes sections. */
  label: string;
  sub: string;
  path: string;
};

/**
 * Most-blocking first, and the order is a judgment worth stating: a running punch is
 * first because `TIME-013` says it blocks approving the period, so it holds up payroll
 * for everyone. Money owed to the shop comes next, then a finished job waiting on a
 * decision, then the customer-level view of the same debt — which is last precisely
 * because the invoice above it already said it.
 */
const ROLL_UP_ORDER = ["time", "invoices", "jobs", "customers"];

export function attentionAll(role: Role): AttentionRow[] {
  const rows = ROLL_UP_ORDER.flatMap((section) =>
    attentionFor(section, role).map((a) => ({ ...a, section, ...describe(section, a.id) }))
  );
  return rows;
}

/** Where the record lives and what to call it. One place, so Today and the rail agree. */
function describe(section: string, id: string): { label: string; sub: string; path: string } {
  if (section === "jobs") {
    const j = jobs.find((x) => x.no === id);
    return {
      label: `${id} · ${j?.what ?? ""}`,
      sub: j?.customer ?? "",
      path: `/app/jobs/${id}`,
    };
  }
  if (section === "invoices") {
    const v = invoices.find((x) => x.no === id);
    return {
      label: `Invoice #${id}`,
      sub: v ? `${v.customer} · ${money(v.balanceCents || v.totalCents)}` : "",
      path: `/app/invoices/${id}`,
    };
  }
  if (section === "customers") {
    const c = customers.find((x) => x.id === id);
    return {
      label: c?.name ?? id,
      sub: c ? `${money(c.balanceCents)} outstanding` : "",
      path: `/app/customers/${id}`,
    };
  }
  // Time's ids are punch ids, but the screen you want is the person's.
  const p = punches.find((x) => x.id === id);
  return {
    label: p ? nameOf(p.who) : id,
    sub: "Still on the clock",
    path: `/app/time/${p?.who ?? "summary"}`,
  };
}
