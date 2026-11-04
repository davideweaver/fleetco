import type { Badge } from "@/nav/badges";
import { cn } from "@/lib/utils";

const label = (n: number) => (n > 99 ? "99+" : String(n));

/**
 * A nav badge. One colour, and the PLACEMENT decides the shape.
 *
 *   overlay  on the corner of a bare icon — collapsed rail, bottom bar, More. Always a
 *            DOT. A number stacked on a 20px glyph is a rail you read instead of glance
 *            at, and the count is one tap away in the list header anyway.
 *   inline   at the end of a labelled row — expanded rail, More sheet. A COUNT, because
 *            there is room for it and the label already says what it counts.
 *
 * Deciding here rather than at each call site is deliberate: the bottom bar and the
 * collapsed rail are the same situation, and they used to disagree because each one
 * chose for itself.
 *
 * The fill is `--attention`, the same token as the row chip and the filter count — not
 * `--brand`. They matched by coincidence in the warm palette and came apart in the
 * neutral one, where the rail's brand is purple.
 */
export function NavBadge({
  badge,
  placement,
}: {
  badge: Badge;
  placement: "overlay" | "inline";
}) {
  if (placement === "overlay") {
    if (!badge.count && !badge.dot) return null;
    return (
      <span
        aria-hidden
        className="absolute right-1 top-1 size-2 rounded-full bg-attention"
      />
    );
  }

  if (badge.dot) {
    return <span aria-hidden className="size-2 shrink-0 rounded-full bg-attention" />;
  }
  if (!badge.count) return null;

  return (
    <span
      className={cn(
        "tnum grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px]",
        "font-semibold leading-none bg-attention text-attention-fg"
      )}
    >
      {label(badge.count)}
    </span>
  );
}
