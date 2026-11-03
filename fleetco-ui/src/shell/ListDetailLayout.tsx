import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Search } from "lucide-react";
import { useShell } from "./shell-context";
import { cn } from "@/lib/utils";

/**
 * The one list-detail layout, used by every section whose second column is a list
 * (jobs, customers, estimates, invoices, materials, reports, settings).
 *
 * Six lanes each writing their own is the drift this exists to prevent, and the
 * failure modes are predictable: rebuilding the list inside the detail route,
 * losing selection on navigate, losing the filter when the pane collapses.
 *
 * Responsive is pure CSS, keyed off `hasSelection`:
 *   < 1024px  one pane — list, or detail with a back link
 *   >= 1024px two panes — list keeps its scroll position, selection moves
 *
 * In the `sidebar` variant there is no second column at all: the list is a page and
 * the detail is a page, which is what VarsityBio does today.
 */
export function ListDetailLayout({
  list,
  detail,
  hasSelection,
  backTo,
  empty = "Pick one from the list.",
}: {
  list: ReactNode;
  detail?: ReactNode;
  hasSelection: boolean;
  backTo: string;
  empty?: string;
}) {
  const { variant, href } = useShell();
  const twoPane = variant === "rail";

  return (
    <div className="flex h-full min-h-0">
      <aside
        className={cn(
          "flex min-h-0 w-full flex-col bg-surface-2",
          twoPane && "lg:w-[272px] lg:shrink-0 xl:w-[312px]",
          hasSelection && (twoPane ? "hidden lg:flex" : "hidden")
        )}
      >
        {list}
      </aside>

      <section
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          !hasSelection && (twoPane ? "hidden lg:flex" : "hidden")
        )}
      >
        {hasSelection ? (
          <>
            <div className={cn("flex h-band shrink-0 items-center border-b px-3", twoPane && "lg:hidden")}>
              <Link
                to={href(backTo)}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="size-4" />
                Back
              </Link>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{detail}</div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-sm text-muted-foreground">
            {empty}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * The list column's header, and on a phone the page's header too — which is why the
 * app has no top banner. The banner showed the same section name this already shows.
 */
export function ListHeader({
  title,
  count,
  action,
}: {
  title: string;
  count: number;
  action?: ReactNode;
}) {
  return (
    <SectionHeader title={title} count={count} action={action} />
  );
}

/** The same bar for `pane: "wide"` screens, which have no list column. */
export function PageHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  return <SectionHeader title={title} count={count} action={action} />;
}

function SectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  const { openSearch } = useShell();
  return (
    <div className="flex h-band shrink-0 items-center gap-2 border-b px-3">
      <span className="text-sm font-semibold">{title}</span>
      {count !== undefined && (
        <span className="tnum rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {count}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        {/* Phones have no rail, so this is their only way into search. */}
        <button
          type="button"
          onClick={openSearch}
          aria-label="Search"
          className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent pad:hidden"
        >
          <Search className="size-5" strokeWidth={1.75} />
        </button>
        {action}
      </div>
    </div>
  );
}

/**
 * A list row, not a card. A card per record looks good in a marketing screenshot and
 * falls apart at 200 customers — Cam needs to scan, not admire.
 */
export function ListRow({
  to,
  selected,
  title,
  subtitle,
  meta,
  metaSub,
}: {
  to: string;
  selected: boolean;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  metaSub?: ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex items-center gap-3 border-b border-border/60 px-3 py-2.5 text-sm",
        selected ? "bg-accent" : "hover:bg-accent/50"
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        {subtitle && (
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        )}
      </span>
      {(meta || metaSub) && (
        <span className="shrink-0 text-right">
          {meta && <span className="tnum block text-sm">{meta}</span>}
          {metaSub && <span className="block text-[11px] text-muted-foreground">{metaSub}</span>}
        </span>
      )}
    </Link>
  );
}

export function Pill({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "muted" | "warn" | "good" | "bad";
}) {
  return (
    <span
      className={cn(
        "inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide whitespace-nowrap",
        tone === "default" && "border-border bg-muted text-foreground",
        tone === "muted" && "border-border text-muted-foreground",
        tone === "warn" && "border-warning/40 bg-warning/10 text-warning",
        tone === "good" && "border-success/40 bg-success/10 text-success",
        tone === "bad" && "border-destructive/40 bg-destructive/10 text-destructive"
      )}
    >
      {children}
    </span>
  );
}

/**
 * Two parts: a band row carrying the eyebrow and the actions, then the title block.
 *
 * The actions live in the band rather than beside the title so that they line up with
 * the section header's button and the rail's logo — one horizontal line across all
 * three columns — and so they stay put however long the title runs.
 */
export function DetailHeader({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow?: string;
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="border-b">
      <div className="flex h-band items-center gap-3 px-4 lg:px-5">
        <div className="min-w-0 flex-1 truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {eyebrow}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className="px-4 pb-4 lg:px-5">
        <h2 className="truncate text-lg font-semibold lg:text-xl">{title}</h2>
        {sub && <div className="mt-0.5 text-sm text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

export function Btn({
  children,
  primary,
}: {
  children: ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-md border px-3 py-1.5 text-sm font-medium whitespace-nowrap",
        primary
          ? "border-primary bg-primary text-primary-foreground"
          : "hover:bg-accent"
      )}
    >
      {children}
    </button>
  );
}
