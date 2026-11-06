import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Tabs — two or more views of ONE record, under that record's header.
 *
 * The system already had three ways to move between things, and tabs is a fourth, so the
 * line around it has to be drawn tightly or it eats the other three:
 *
 *   The rail            one section to another. Different kinds of record.
 *   The list column     one record to another. Same kind, you pick which.
 *   Filter chips        the same list, fewer rows in it. `Open · Answered · All` are the
 *                       same estimates — a chip never changes what a row IS.
 *   Tabs (here)         ONE record, looked at a different way. Same subject, different
 *                       facts about it: the rows of an estimate, and the record of who
 *                       approved them.
 *
 * **The test: could the two panels be on screen at once and still make sense?** If yes,
 * they are sections of one page and want a heading, not a tab — tabs would be hiding
 * something for no reason. If they would fight for the same space, each wants the whole
 * pane, and the thing they have in common is the record named in the header above.
 *
 * **Never tabs for a filter**, even when it looks like one. `Open · Answered · All` sits
 * on the list header as chips, and that difference is load-bearing: a chip is a lens over
 * a list, a tab is a different thing to read. Giving them one shape teaches people that
 * clicking either does the same sort of thing, and then the counts stop meaning anything.
 *
 * **Never tabs where a URL should go.** Reports and Settings are a list of sections in
 * the list column, because each is a place you link someone to. A tab is a view of the
 * record you are already on.
 *
 * Drawn as an underline rather than a pill, for the same reason: pills are already filter
 * chips, three inches away on the same screen.
 */

export type Tab = {
  key: string;
  label: string;
  /** Shown after the label, muted. Only where the number is a fact worth knowing. */
  count?: number;
};

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Arrow keys move between tabs, which is what `role="tablist"` promises a screen
  // reader. Roving focus rather than tab-stops per tab: one Tab key gets you into the
  // strip, arrows choose, Tab again leaves it for the panel.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.key === active);
    const go =
      e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (go === null) return;
    e.preventDefault();
    const next = tabs[(go + tabs.length) % tabs.length];
    onChange(next.key);
    ref.current?.querySelector<HTMLButtonElement>(`[data-tab="${next.key}"]`)?.focus();
  };

  return (
    <div
      ref={ref}
      role="tablist"
      onKeyDown={onKeyDown}
      className={cn(
        // Right-aligned, under the header's actions rather than under its title. The
        // left of this band belongs to the record — eyebrow, then name — and a strip of
        // controls starting there competes with the one thing the pane is about. The
        // controls all live on the right, so the tabs join them.
        //
        // `px-1.5` plus the tab's own `px-2.5` lands the last label on the header's
        // `px-4` — the same right margin the buttons above it keep. Hard against the
        // edge reads as a rendering accident.
        //
        // Scrolls sideways rather than wrapping or shrinking. Four tabs on a 390px phone
        // either become two rows of nubs or four unreadable ones; a strip that slides
        // keeps every label full-size and is the gesture people already expect there.
        // Once they overflow, `justify-end` stops applying and the strip reads from the
        // left like any other scroller, which is the right behaviour anyway.
        //
        // The hairline is lighter than a normal border, because it is not separating two
        // things — the strip and the panel under it are the same record. It is the floor
        // the selected tab's mark stands on, and at full strength it competed with that
        // mark instead of carrying it.
        "flex shrink-0 justify-end gap-1 overflow-x-auto border-b border-border/60 px-1.5 [scrollbar-width:none] lg:px-2.5 [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            data-tab={t.key}
            role="tab"
            type="button"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={cn(
              // The underline is -1px so it sits ON the container's border rather than
              // above it, which is the difference between a selected tab and a button
              // with a line under it. 3px, not the hairline's 1: at the same weight as
              // the border it is continuing, "selected" reads as a rendering artifact.
              "relative shrink-0 whitespace-nowrap px-2.5 py-2 text-sm font-medium after:absolute after:inset-x-2.5 after:-bottom-px after:h-[3px] after:rounded-full",
              on
                ? "text-foreground after:bg-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn("ml-1.5 tnum text-xs", on ? "text-muted-foreground" : "text-muted-foreground/70")}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The panel under the strip. One per tab, and only the active one is rendered — a hidden
 * panel that stays mounted keeps its scroll position and its half-typed input, and then
 * someone comes back to a screen they do not remember leaving in that state.
 */
export function TabPanel({ when, active, children }: { when: string; active: string; children: ReactNode }) {
  if (when !== active) return null;
  return (
    <div role="tabpanel" className="flex min-h-0 flex-1 flex-col">
      {children}
    </div>
  );
}
