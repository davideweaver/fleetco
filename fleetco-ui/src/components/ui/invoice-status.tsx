import { invoices } from "@/data/sample";
import { useShell } from "@/shell/shell-context";
import { Pill } from "@/shell/ListDetailLayout";
import { AttentionChip } from "./attention";
import { attentionMap } from "@/nav/attention";

type Status = (typeof invoices)[number]["status"];

/**
 * Whether this invoice needs someone, and whether its status already says so.
 *
 * One function so the pill and the chip cannot disagree. They are two halves of a single
 * decision — if the status IS the reason, the pill carries it and there is no chip; if
 * the reason says more than the status, the status stays plain and the chip carries it.
 * Splitting that across two components is what let the list show a draft's reason while
 * the invoice's own screen showed nothing.
 */
function useInvoiceAttention(no: string, status: Status) {
  const { role } = useShell();
  const reason = attentionMap("invoices", role).get(no);
  return { reason, statusIsReason: reason === status };
}

/**
 * An invoice's status, as a pill.
 *
 * It takes the attention fill only when the status and the reason are the SAME FACT.
 * "Overdue" is both the status and the whole reason it needs chasing, so one mark does
 * the work of two.
 *
 * "Draft" is not. The status is where the invoice sits in its life; the reason is that
 * it was never sent. Colouring DRAFT would say the state itself is the alarm, and every
 * invoice is a draft for a moment on its way out the door — so the pill stays plain and
 * {@link InvoiceAttention} draws the reason beside it.
 */
export function InvoiceStatus({ no, status }: { no: string; status: Status }) {
  const { statusIsReason } = useInvoiceAttention(no, status);
  if (statusIsReason) return <Pill tone="attention">{status}</Pill>;
  // Paid is the only status worth a positive mark. The rest are just where it is.
  return <Pill tone={status === "Paid" ? "good" : "muted"}>{status}</Pill>;
}

/**
 * The status, plus the reason when the reason says more than the status does.
 *
 * Use this wherever a single invoice is on display — the detail header, a table cell.
 * The list row builds the same pair itself from `attentionMap`, because there the chip
 * replaces the subtitle rather than sitting beside the status.
 */
export function InvoiceAttention({ no, status }: { no: string; status: Status }) {
  const { reason, statusIsReason } = useInvoiceAttention(no, status);
  return (
    <span className="inline-flex items-center gap-1.5">
      <InvoiceStatus no={no} status={status} />
      {reason && !statusIsReason && <AttentionChip reason={reason} />}
    </span>
  );
}
