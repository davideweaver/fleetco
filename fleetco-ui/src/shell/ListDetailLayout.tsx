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
 */
export function ListDetailLayout({
  list,
  detail,
  hasSelection,
  backTo,
  empty = "Pick one from the list.",
  after,
}: {
  list: ReactNode;
  detail?: ReactNode;
  hasSelection: boolean;
  backTo: string;
  empty?: string;
  /** Overlays owned by this section — a create form, say. */
  after?: ReactNode;
}) {
  const { href } = useShell();

  return (
    <div className="flex h-full min-h-0">
      <aside
        className={cn(
          "flex min-h-0 w-full flex-col bg-surface-2 lg:w-[272px] lg:shrink-0 xl:w-[312px]",
          hasSelection && "hidden lg:flex"
        )}
      >
        {list}
      </aside>

      <section
        className={cn(
          "@container flex min-h-0 flex-1 flex-col",
          !hasSelection && "hidden lg:flex"
        )}
      >
        {hasSelection ? (
          <>
            <div className="flex h-band shrink-0 items-center border-b px-3 lg:hidden">
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
      {after}
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
  attention = 0,
  filtered = false,
  onFilter,
}: {
  title: string;
  count: number;
  action?: ReactNode;
  /** How many rows in this list need someone. Drives the rail badge too. */
  attention?: number;
  filtered?: boolean;
  onFilter?: (v: boolean) => void;
}) {
  return (
    <>
      <SectionHeader title={title} count={count} action={action} />
      {/* The badge on the rail says a number; this is where that number goes. Without a
          way to see only those rows, a badge tells the user something is wrong and gives
          them nowhere to go. */}
      {attention > 0 && onFilter && (
        <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
          <FilterChip on={!filtered} onClick={() => onFilter(false)}>
            All
          </FilterChip>
          {/* The chip is a control; its COUNT is the attention signal, so the count wears
              the same solid amber as the rail badge and the row chips. Tinting the whole
              control as well would make the filter look like a warning. */}
          <FilterChip on={filtered} onClick={() => onFilter(true)}>
            Needs you
            <span className="tnum ml-1.5 rounded-full bg-attention px-1.5 text-[10px] font-semibold text-attention-fg">
              {attention}
            </span>
          </FilterChip>
        </div>
      )}
    </>
  );
}

function FilterChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium",
        on
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      )}
    >
      {children}
    </button>
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
      {/* 18px against the rows' 14px. At text-base the gap was two pixels, so the title
          read as a heavier row rather than a header — bold alone could not carry it. */}
      <span className="text-lg font-bold tracking-tight">{title}</span>
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
  lead,
  attention,
}: {
  to: string;
  selected: boolean;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  metaSub?: ReactNode;
  /** A monogram or icon. Gives the eye something to land on when scanning. */
  lead?: ReactNode;
  /** Why this row needs someone. Replaces the subtitle when present. */
  attention?: string;
}) {
  return (
    <Link
      to={to}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "relative flex items-center gap-3 border-b border-border/60 py-2.5 pr-3 text-sm transition-colors",
        // The selected row carries a brand edge; the padding shifts so text does not move
        // when selection changes.
        selected ? "bg-accent pl-[9px]" : "pl-3 hover:bg-accent/50"
      )}
    >
      {selected && (
        <span className="absolute inset-y-0 left-0 w-[3px] rounded-r bg-nav-active" />
      )}
      {lead}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        {attention ? (
          /* A solid chip in the badge's own colour. Coloured text could never tie the two
             together — the badge sits on a dark rail and the row on a light list, so the
             two can never share a text colour. A fill can: this chip IS the badge colour,
             and dark-on-amber stays legible in both themes. */
          <span className="mt-0.5 inline-block max-w-full truncate rounded bg-attention px-1.5 py-0.5 text-xs font-medium text-attention-fg">
            {attention}
          </span>
        ) : (
          subtitle && (
            <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
          )
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

/** A two-letter monogram. Cheap identity, and it makes a long list scannable. */
export function Monogram({ name }: { name: string }) {
  const initials = name
    .replace(/[^a-zA-Z ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-[11px] font-semibold text-muted-foreground">
      {initials}
    </span>
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
