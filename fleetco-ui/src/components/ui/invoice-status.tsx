import { invoices } from "@/data/sample";
import { useShell } from "@/shell/shell-context";
import { Pill } from "@/shell/ListDetailLayout";
import { attentionMap } from "@/nav/attention";

type Status = (typeof invoices)[number]["status"];

/**
 * An invoice's status, as a pill.
 *
 * **If the invoice needs attention, the pill is the attention mark.** Not a plain pill
 * with a second amber chip next to it — one record in one state gets one mark, and a
 * record that already shows a status has nowhere better to put it than on that status.
 *
 * Which statuses those are is `attentionMap`'s to say, never a list of strings written
 * out again here. Draft counts today because `JOB-009` creates an invoice unsent and an
 * unsent invoice is money not billed. If that rule changes, this colour follows it.
 *
 * Everything else is just where the invoice is: Paid is the only status worth a positive
 * mark, and the rest are grey.
 */
export function InvoiceStatus({ no, status }: { no: string; status: Status }) {
  const { role } = useShell();
  if (attentionMap("invoices", role).has(no)) {
    return <Pill tone="attention">{status}</Pill>;
  }
  return <Pill tone={status === "Paid" ? "good" : "muted"}>{status}</Pill>;
}
