import type { Badge } from "@/nav/badges";
import { cn } from "@/lib/utils";

const label = (n: number) => (n > 99 ? "99+" : String(n));

/**
 * `overlay` sits on the corner of an icon chip (collapsed rail, bottom bar) and needs a
 * ring in the surface colour to separate it from the icon underneath. It sits INSIDE the
 * chip rather than outdented: the collapsed rail scrolls on the y axis, and a box that
 * overhangs by even 2px gets clipped, because `overflow-y: auto` clips x as well.
 * `inline` sits at the end of a labelled row (expanded rail, More sheet).
 */
export function NavBadge({
  badge,
  placement,
  ring = "ring-surface-1",
}: {
  badge: Badge;
  placement: "overlay" | "inline";
  ring?: string;
}) {
  const alert = badge.tone === "alert";

  if (badge.dot) {
    return (
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          alert ? "bg-destructive" : "bg-brand",
          placement === "overlay" && cn("absolute right-1 top-1 ring-2", ring)
        )}
      />
    );
  }

  if (!badge.count) return null;

  return (
    <span
      className={cn(
        "tnum grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold leading-none text-brand-foreground",
        alert ? "bg-destructive text-white" : "bg-brand",
        placement === "overlay" && cn("absolute right-0 top-0 ring-2", ring)
      )}
    >
      {label(badge.count)}
    </span>
  );
}
