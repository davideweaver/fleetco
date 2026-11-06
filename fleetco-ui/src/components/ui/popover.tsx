import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A small anchored popover. No new dependency, for the same reason the calendar has
 * none — what Radix buys you here is collision detection and focus scoping, and this
 * needs one anchor position and one focus trap that Escape closes.
 *
 * On a phone it is **not** a popover. A 320px grid anchored to a field in a 390px
 * viewport ends up half off-screen, so below `pad` it becomes a bottom sheet — the same
 * rule overlays already follow, and it keeps the content identical either way.
 *
 * What we give up and should not forget: it does not FLIP to stay on screen. It is told
 * which way to open instead. The pickers sit in headers and forms near the top and take
 * the default; the rail's More button sits at the foot of a full-height rail and passes
 * `side="above"`. Automatic collision detection is the thing a library would buy, and
 * one honest prop has covered both callers so far.
 */
export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  align = "start",
  side = "below",
  label,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  /** Which way it opens from the trigger. It does not work this out for itself. */
  side?: "below" | "above";
  /** Names the thing for assistive tech — "Choose a date", "Choose a date range". */
  label: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    // `mousedown`, not `click`: a click that starts inside and ends outside should not
    // close it, which is what dragging across a grid of days does.
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={wrap} className="relative">
      {trigger}
      {open && (
        <>
          {/* The sheet needs a scrim; the popover must not have one, or the page behind
              it stops looking live. Same component, two presentations. */}
          <div
            className="fixed inset-0 z-40 bg-black/40 pad:hidden"
            onClick={() => onOpenChange(false)}
          />
          <div
            role="dialog"
            aria-label={label}
            className={cn(
              "z-50 rounded-xl border bg-popover text-popover-foreground shadow-lg",
              "fixed inset-x-0 bottom-0 rounded-b-none p-3",
              "pad:absolute pad:inset-x-auto",
              side === "above"
                ? "pad:top-auto pad:bottom-[calc(100%+6px)]"
                : "pad:bottom-auto pad:top-[calc(100%+6px)]",
              "pad:w-auto pad:rounded-b-xl",
              align === "end" ? "pad:right-0" : "pad:left-0"
            )}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}
