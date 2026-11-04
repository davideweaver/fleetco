import { invoices } from "@/data/sample";
import { useShell } from "@/shell/shell-context";
import { Pill } from "@/shell/ListDetailLayout";
import { attentionMap } from "@/nav/attention";

type Status = (typeof invoices)[number]["status"];

/**
 * An invoice's status, as a pill.
 *
 * When the status is the reason the invoice is in the attention count, the pill wears
 * the attention fill — the same solid colour as the rail badge and the list chip. The
 * status and the reason are one fact here ("Overdue" is both), so showing them as two
 * separate marks would say it twice.
 *
 * The test is `attentionMap`, not a list of statuses spelled out again. If the rule for
 * what needs chasing ever changes, the colour follows it. A hardcoded `=== "Overdue"`
 * would let the badge count one thing and the pill colour another — the exact split
 * this one-derivation rule exists to prevent.
 *
 * Note this asks the INVOICES question even on a customer's screen. The pill describes
 * an invoice, so "does this invoice need someone" is the right question wherever it is
 * drawn; the customer row's own chip answers the separate customer question.
 */
export function InvoiceStatus({ no, status }: { no: string; status: Status }) {
  const { role } = useShell();
  const needs = attentionMap("invoices", role);
  if (needs.has(no)) return <Pill tone="attention">{status}</Pill>;
  // Paid is the only status worth a positive mark. The rest are just where it is.
  return <Pill tone={status === "Paid" ? "good" : "muted"}>{status}</Pill>;
}
