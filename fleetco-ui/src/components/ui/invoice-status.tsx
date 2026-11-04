import { invoices } from "@/data/sample";
import { useShell } from "@/shell/shell-context";
import { Pill } from "@/shell/ListDetailLayout";
import { attentionMap } from "@/nav/attention";

type Status = (typeof invoices)[number]["status"];

/**
 * An invoice's status, as a pill.
 *
 * The pill wears the attention fill only when the status and the reason are the SAME
 * FACT. "Overdue" is both the status and the whole reason it needs chasing, so one mark
 * does the work of two and it takes the badge's colour.
 *
 * "Draft" is not. The status is where the invoice sits in its life; the reason is "never
 * sent", which is the part that needs someone. The reason says more than the status, so
 * they stay two separate marks — the row chip carries the reason, and the pill stays a
 * plain status. Colouring DRAFT would have told the user the state itself is the alarm.
 *
 * The test is a comparison against `attentionMap`, not a list of statuses written out
 * again, so the colour cannot drift away from what the rail badge counts. If a reason's
 * wording ever changes, the pill falls back to a plain status — the safe direction,
 * since the failure is a missing colour rather than an invented one.
 */
export function InvoiceStatus({ no, status }: { no: string; status: Status }) {
  const { role } = useShell();
  const reason = attentionMap("invoices", role).get(no);
  if (reason === status) return <Pill tone="attention">{status}</Pill>;
  // Paid is the only status worth a positive mark. The rest are just where it is.
  return <Pill tone={status === "Paid" ? "good" : "muted"}>{status}</Pill>;
}
