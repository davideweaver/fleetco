import { useShell } from "@/shell/shell-context";
import { Pill } from "@/shell/ListDetailLayout";
import { attentionMap } from "@/nav/attention";

/**
 * A record's status, as a pill — and the record's attention mark when it has one.
 *
 * **If the record needs attention, its status pill is amber.** One record in one state
 * gets one mark, and a record that already shows a status has nowhere better to put it.
 * The standalone `AttentionChip` is for records with no status to colour.
 *
 * One component for every section on purpose. An invoice's OVERDUE and a job's
 * "Completed · waiting to be closed" are the same situation, and giving each section its
 * own pill is how they drift apart — one ends up asking `attentionMap` and the other
 * ends up with a hardcoded status string that stops matching.
 *
 * `calm` is the tone when nothing is wrong. That is the only thing a caller gets to
 * decide; whether the record needs attention is never the caller's to say.
 */
export function StatusPill({
  section,
  id,
  status,
  calm = "muted",
}: {
  /** The attention section this record belongs to — "jobs", "invoices", "customers". */
  section: string;
  /** The record's id as `attentionFor` reports it: a job number, an invoice number. */
  id: string;
  status: string;
  calm?: "muted" | "good";
}) {
  const { role } = useShell();
  if (attentionMap(section, role).has(id)) {
    return <Pill tone="attention">{status}</Pill>;
  }
  return <Pill tone={calm}>{status}</Pill>;
}
