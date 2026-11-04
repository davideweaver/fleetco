/**
 * The attention chip — the one mark that says "this record needs someone".
 *
 * It is the same component everywhere it appears: a list row, a detail header, a table
 * cell. It used to be markup inlined in `ListRow`, which is why the invoice list showed
 * a draft's reason and the invoice's own screen showed nothing — the detail had no way
 * to render the thing without copying it.
 *
 * It carries the REASON, not a mark. "Never sent" rather than a bare dot: a dot says
 * *something*, the reason says *what*, and it costs the same pixels.
 *
 * The fill is `--attention`, the rail badge's own colour. Coloured text could never tie
 * the two together — the badge sits on a dark rail and the row on a light list, so they
 * can never share a text colour. A fill can, because dark-on-amber is legible on any
 * surface.
 */
export function AttentionChip({
  reason,
  className = "",
}: {
  reason: string;
  className?: string;
}) {
  return (
    <span
      className={
        "inline-block max-w-full truncate rounded bg-attention px-1.5 py-0.5 " +
        "text-xs font-medium text-attention-fg " +
        className
      }
    >
      {reason}
    </span>
  );
}
