import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Search } from "lucide-react";
import { useShell } from "./shell-context";
import { AttentionChip } from "@/components/ui/attention";
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
      {/* The list column is navigation: it picks which record you are looking at. On
          paper there is nothing to pick, so it goes with the rail and the bottom bar. */}
      <aside
        className={cn(
          "print-hide flex min-h-0 w-full flex-col bg-surface-2 lg:w-[272px] lg:shrink-0 xl:w-[312px]",
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
            <div className="print-hide flex h-band shrink-0 items-center border-b px-3 lg:hidden">
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
export type Scope = { key: string; label: string };

export function ListHeader({
  title,
  count,
  action,
  attention = 0,
  filtered = false,
  onFilter,
  scopes,
  scope,
  onScope,
}: {
  title: string;
  count: number;
  action?: ReactNode;
  /** How many rows in this list need someone. Drives the rail badge too. */
  attention?: number;
  filtered?: boolean;
  onFilter?: (v: boolean) => void;
  /**
   * What slice of the section this list is showing. A long list is mostly history, so
   * the answer to "there are 312 of these" is a default scope, not a pager — you open
   * Jobs to work, and the finished ones are somewhere you go on purpose.
   */
  scopes?: Scope[];
  scope?: string;
  onScope?: (key: string) => void;
}) {
  return (
    <>
      <SectionHeader title={title} count={count} action={action} />
      {/* The badge on the rail says a number; this is where that number goes. Without a
          way to see only those rows, a badge tells the user something is wrong and gives
          them nowhere to go.

          Scope and attention share one row because they are the same kind of control —
          both narrow what is below them, and splitting them over two rows made the list
          look like it had two unrelated filters. */}
      {((attention > 0 && onFilter) || scopes) && (
        // Scrolls sideways rather than wrapping. Four chips do not fit a 300px column,
        // and a wrapped chip row changes the list's height depending on how many scopes
        // a section happens to have — the rows below would start in a different place
        // on every screen.
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {scopes
            ? scopes.map((s) => (
                <FilterChip
                  key={s.key}
                  on={!filtered && scope === s.key}
                  onClick={() => {
                    onFilter?.(false);
                    onScope?.(s.key);
                  }}
                >
                  {/* No count on the chip. The header already shows the count for the
                      scope you are in, and four numbers in one strip — three of them
                      for slices you are NOT looking at — is arithmetic nobody asked
                      for. The one count that stays is the attention one, because that
                      number is the whole reason that chip exists. */}
                  {s.label}
                </FilterChip>
              ))
            : onFilter && (
                <FilterChip on={!filtered} onClick={() => onFilter(false)}>
                  All
                </FilterChip>
              )}
          {/* The chip is a control; its COUNT is the attention signal, so the count wears
              the same solid amber as the rail badge and the row chips. Tinting the whole
              control as well would make the filter look like a warning. */}
          {attention > 0 && onFilter && (
            <FilterChip on={filtered} onClick={() => onFilter(true)}>
              Needs you
              <span className="tnum ml-1.5 rounded-full bg-attention px-1.5 text-[10px] font-semibold text-attention-fg">
                {attention}
              </span>
            </FilterChip>
          )}
        </div>
      )}
    </>
  );
}

/**
 * The bottom of a long list.
 *
 * A button rather than loading more when the scroll reaches the end. Auto-loading reads
 * well on a feed you are browsing, and badly on a column you are working: the scrollbar
 * never settles, the keyboard user never reaches the end, and the thing that owns your
 * selection is the thing that keeps moving. A button also makes the count honest — you
 * can see there are 260 more before deciding you would rather search.
 *
 * `page` is 25 and not 50 because the column is 300px wide: 25 rows is about two
 * screens, which is as far as anyone scrolls before they give up and search anyway.
 */
export function ListTail({
  shown,
  total,
  onMore,
  page = 25,
}: {
  shown: number;
  total: number;
  onMore: () => void;
  page?: number;
}) {
  if (total === 0) return null;

  if (shown >= total) {
    return (
      <div className="px-3 py-4 text-center text-xs text-muted-foreground">
        {/* An end marker, so the bottom of a short list and the bottom of a list that
            has stopped loading are not the same ambiguous blank. */}
        {total === 1 ? "1 record" : `All ${total} records`}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1.5 border-t px-3 py-3">
      <button
        type="button"
        onClick={onMore}
        className="w-full rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
      >
        Load {Math.min(page, total - shown)} more
      </button>
      <span className="tnum text-[11px] text-muted-foreground">
        Showing {shown} of {total}
      </span>
    </div>
  );
}

/**
 * One choice out of a strip of them — the scope of a list, or its attention filter.
 *
 * Every chip carries a border, including the ones that are off. A fill on the selected
 * one alone is how this started, and it read as a line of labels with one highlighted
 * word: nothing said the other three could be pressed. The border is the affordance;
 * the fill only says which one won.
 *
 * Exported so a wide screen can grow the same control rather than its own. None do yet.
 */
export function FilterChip({
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
      aria-pressed={on}
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium transition-colors",
        on
          ? "border-foreground/20 bg-accent text-foreground"
          : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

/** The same bar for `pane: "wide"` screens, which have no list column. */
export function PageHeader({
  title,
  aside,
  count,
  action,
}: {
  title: string;
  aside?: ReactNode;
  count?: number;
  action?: ReactNode;
}) {
  return <SectionHeader title={title} aside={aside} count={count} action={action} />;
}

function SectionHeader({
  title,
  aside,
  count,
  action,
}: {
  title: string;
  /**
   * A qualifier that belongs to the title — Today's date, not an action. It reads as
   * part of the heading, so it sits against the title rather than across the band in
   * the action slot, where the eye has to travel the full width to collect half a
   * phrase.
   */
  aside?: ReactNode;
  count?: number;
  action?: ReactNode;
}) {
  const { openSearch } = useShell();
  return (
    <div className="flex h-band shrink-0 items-center gap-2 border-b px-3">
      {/* 18px against the rows' 14px. At text-base the gap was two pixels, so the title
          read as a heavier row rather than a header — bold alone could not carry it. */}
      <span className="text-lg font-bold tracking-tight">{title}</span>
      {/* Same size as the title, so the two sit on one line as one phrase. Weight and
          colour carry the hierarchy on their own — `medium` against `bold`, muted
          against foreground — which is enough to keep it the title's second half rather
          than a second heading competing with it. */}
      {aside && (
        <span className="text-lg font-medium tracking-tight text-muted-foreground">{aside}</span>
      )}
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
 * A labelled break in a list. The label is the point — an unlabelled rule says "these
 * are different" without saying how, which leaves the reader to guess.
 *
 * The gap above it is what separates the two groups; the label just names the lower one.
 * A trailing rule across the rest of the row was a second separator doing the same job,
 * and next to the row borders already in the list it read as clutter.
 */
export function ListDivider({ label }: { label: string }) {
  return (
    <div className="border-b px-3 pb-1.5 pt-6">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
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
  status,
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
  /**
   * The record's own status, as a `StatusPill`. Gets a full-width line of its own below
   * the title block — the column is 272px and the money sits beside the title, so a
   * stage squeezed in next to it has barely 160px and clips every time.
   *
   * A row with a status never also draws the chip: one record in one state gets one
   * mark, and `StatusPill` already turns amber and absorbs the reason.
   */
  status?: ReactNode;
  /** Why this row needs someone, for records with no status to colour. */
  attention?: string;
}) {
  return (
    <Link
      to={to}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "relative block border-b border-border/60 py-2.5 pr-3 text-sm transition-colors",
        // The selected row carries a brand edge; the padding shifts so text does not move
        // when selection changes.
        selected ? "bg-accent pl-[9px]" : "pl-3 hover:bg-accent/50"
      )}
    >
      {selected && (
        <span className="absolute inset-y-0 left-0 w-[3px] rounded-r bg-nav-active" />
      )}
      <span className="flex items-center gap-3">
        {lead}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{title}</span>
          {/* The status used to ride in the subtitle — "Ridgeline Plumbing & Heating ·
              In production" — which needs ~260px in a column that gives it 160. It
              clipped on every row, and the chip then replaced the whole subtitle, so the
              flagged row lost its customer too. Identity stays here; status drops below
              where it has the full width. */}
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
      </span>
      {/* Full width, clear of the money column. `status` wins outright when both are
          passed — a pill and a chip side by side say the same thing twice. */}
      {status ? (
        <span className="mt-1.5 block">{status}</span>
      ) : (
        attention && <AttentionChip reason={attention} className="mt-1" />
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
  tone?: "default" | "muted" | "warn" | "good" | "bad" | "attention";
}) {
  return (
    <span
      className={cn(
        // No border, solid fill, in every tone. An outline and a tint are two ways of
        // drawing the same edge; keeping both made the pills fussy at 10.5px, and the
        // border was doing the work the fill should do.
        "inline-block rounded-full px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide whitespace-nowrap",
        // Default and muted share a fill and differ only in how loudly the text reads —
        // the same chip, said at two volumes.
        tone === "default" && "bg-pill-neutral text-foreground",
        tone === "muted" && "bg-pill-neutral text-pill-neutral-fg",
        tone === "warn" && "bg-pill-warn text-pill-warn-fg",
        tone === "good" && "bg-pill-good text-pill-good-fg",
        tone === "bad" && "bg-pill-bad text-pill-bad-fg",
        // The one saturated fill. It is the rail badge's own colour, worn when the status
        // IS the reason the row is in the attention count — see InvoiceStatus.
        tone === "attention" && "bg-attention text-attention-fg"
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
  big,
  tone,
}: {
  children: ReactNode;
  primary?: boolean;
  /** A 44px tap target, for the few buttons a technician hits with a thumb. */
  big?: boolean;
  /**
   * A solid green or red fill, for the handful of buttons where the COLOUR is the
   * label — clock in and clock out, which a technician finds by hue before they read
   * the word. Everywhere else, green and red mean "it worked" and "this is destructive"
   * and belong on status, not on a control. `tone` outranks `primary`.
   */
  tone?: "success" | "destructive";
}) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-md border font-medium whitespace-nowrap",
        big ? "px-4 py-2.5 text-sm" : "px-3 py-1.5 text-sm",
        tone === "success"
          ? "border-success bg-success text-success-foreground"
          : tone === "destructive"
            ? "border-destructive bg-destructive text-destructive-foreground"
            : primary
              ? "border-primary bg-primary text-primary-foreground"
              : "hover:bg-accent"
      )}
    >
      {children}
    </button>
  );
}
