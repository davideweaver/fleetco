import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Briefcase,
  CornerDownLeft,
  Receipt,
  Search,
  SearchX,
  X,
  type LucideIcon,
} from "lucide-react";
import { STAGES, customers, invoices, jobs } from "@/data/sample";
import { GROUP_LABEL, NAV, type Role, labelFor, navFor } from "@/nav/routes";
import { badgesFor, type Badge } from "@/nav/badges";
import { NavBadge } from "@/components/ui/nav-badge";
import { Monogram } from "./ListDetailLayout";
import { useShell } from "./shell-context";
import { cn, money } from "@/lib/utils";

/**
 * Global search, as a palette rather than a field in a banner.
 *
 * One search, on purpose. "Filter this list" is a different control with a different
 * answer — from the invoices screen, typing "Ridgeline" might mean "show me their
 * invoices" or "take me to them" — and V1's lists are short enough that per-list
 * filtering can wait until one of them is actually long.
 *
 * A result row is built like a `ListRow` and not like a search engine hit: same leading
 * glyph, same title over subtitle, same right-hand money column. Someone who finds a job
 * here and someone who finds it in the jobs list should be looking at the same object.
 *
 * The real one is shadcn's `command` (cmdk), which brings grouping, virtualisation and
 * proper listbox semantics. This is a stand-in so the layout can be judged.
 */
type Hit = {
  id: string;
  label: string;
  sub: string;
  group: string;
  path: string;
  lead: ReactNode;
  /** Right-hand column, same as a list row: the number that decides if this is the one. */
  meta?: string;
  metaSub?: string;
  /** Sections carry the rail's own badge, so "2 waiting" is visible before you jump. */
  badge?: Badge;
};

export function SearchPalette({
  open,
  onClose,
  role,
  initialQuery,
}: {
  open: boolean;
  onClose: () => void;
  role: Role;
  /** Lab-only: pre-fills the query so the palette opens already showing results. */
  initialQuery?: string;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const { href } = useShell();
  const listRef = useRef<HTMLDivElement>(null);
  const term = q.trim().toLowerCase();

  useEffect(() => {
    if (open) setQ(initialQuery ?? "");
  }, [open, initialQuery]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const hits = useMemo<Hit[]>(() => {
    const owner = role === "owner";
    const badges = badgesFor(role);
    const all: Hit[] = [
      ...navFor(role).map((i) => ({
        id: `nav-${i.key}`,
        label: labelFor(i, role),
        sub: GROUP_LABEL[i.group],
        group: "Sections",
        // The rail's landing rule applies here too, or Time opens on an empty pane.
        path: i.landing ?? i.path,
        lead: <Glyph icon={i.icon} />,
        badge: badges[i.key],
      })),
      ...(owner ? jobs : jobs.filter((j) => j.who === "T1")).map((j) => ({
        id: `job-${j.no}`,
        label: `${j.no} · ${j.what}`,
        sub: `${j.customer} · ${STAGES[j.stage]}`,
        group: "Jobs",
        path: `/app/jobs/${j.no}`,
        lead: <Glyph icon={Briefcase} />,
        meta: owner ? money(j.valueCents) : undefined,
        metaSub: j.priority !== "Normal" ? j.priority : j.date,
      })),
      ...(owner
        ? customers.map((c) => ({
            id: `cust-${c.id}`,
            label: c.name,
            sub: `${c.city} · ${c.terms}`,
            group: "Customers",
            path: `/app/customers/${c.id}`,
            lead: <Monogram name={c.name} />,
            meta: c.balanceCents ? money(c.balanceCents) : "—",
            metaSub: c.openJobs ? `${c.openJobs} open` : undefined,
          }))
        : []),
      ...(owner
        ? invoices.map((v) => ({
            id: `inv-${v.no}`,
            label: `Invoice #${v.no}`,
            sub: `${v.customer} · ${v.status}`,
            group: "Invoices",
            path: `/app/invoices/${v.no}`,
            lead: <Glyph icon={Receipt} />,
            meta: money(v.balanceCents || v.totalCents),
            metaSub: v.balanceCents ? "balance" : "paid",
          }))
        : []),
    ];
    if (!term) return all.filter((h) => h.group === "Sections").slice(0, 6);
    return all
      .filter((h) => `${h.label} ${h.sub}`.toLowerCase().includes(term))
      .slice(0, 12);
  }, [term, role]);

  // The highlight belongs on the first result of whatever is on screen now. An index
  // left over from a shorter query would point past the end and send Enter nowhere.
  useEffect(() => setActive(0), [term]);

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const go = (path: string) => {
    navigate(href(path));
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!hits.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(hits[active].path);
    }
  };

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-0 pad:p-6 pad:pt-24">
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onKeyDown={onKeyDown}
        className="relative flex h-full w-full flex-col overflow-hidden bg-popover text-popover-foreground shadow-2xl pad:h-auto pad:max-h-[30rem] pad:w-[36rem] pad:rounded-2xl pad:border"
      >
        <div className="flex h-band shrink-0 items-center gap-2.5 border-b px-3.5">
          <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search jobs, customers, invoices…"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
          {hits.length === 0 && (
            <div className="px-6 py-12 text-center">
              <span className="mx-auto grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
                <SearchX className="size-5" strokeWidth={1.75} />
              </span>
              <div className="mt-3 text-sm font-medium">Nothing matches “{q}”</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Try a job number, a customer name or an invoice number.
              </div>
            </div>
          )}
          {hits.map((h, i) => {
            const header = h.group !== lastGroup ? h.group : null;
            lastGroup = h.group;
            const on = i === active;
            return (
              <div key={h.id}>
                {header && (
                  // Sticky, because the group a row belongs to is part of reading it:
                  // scroll past the heading and "#1179" stops saying what it is.
                  <div className="sticky top-0 z-10 bg-popover px-2.5 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {header}
                  </div>
                )}
                <button
                  type="button"
                  data-active={on}
                  onClick={() => go(h.path)}
                  // Pointer and keyboard drive ONE highlight. Two — a hover tint and a
                  // separate keyboard cursor — and Enter opens the row you are not
                  // looking at.
                  onMouseMove={() => setActive(i)}
                  className={cn(
                    "relative flex w-full items-center gap-3 rounded-xl py-2 pr-2.5 text-left transition-colors",
                    on ? "bg-accent pl-[9px]" : "pl-2.5"
                  )}
                >
                  {on && (
                    <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-nav-active" />
                  )}
                  {h.lead}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      <Marked text={h.label} term={term} />
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      <Marked text={h.sub} term={term} />
                    </span>
                  </span>
                  {h.badge && <NavBadge badge={h.badge} placement="inline" />}
                  {(h.meta || h.metaSub) && (
                    <span className="shrink-0 text-right">
                      {h.meta && <span className="tnum block text-sm">{h.meta}</span>}
                      {h.metaSub && (
                        <span className="block text-[11px] text-muted-foreground">
                          {h.metaSub}
                        </span>
                      )}
                    </span>
                  )}
                  {/* Always in the layout, only ever visible on the active row — a hint
                      that appears would push the money column sideways as you arrow. */}
                  <CornerDownLeft
                    className={cn(
                      "hidden size-3.5 shrink-0 text-muted-foreground pad:block",
                      !on && "opacity-0"
                    )}
                  />
                </button>
              </div>
            );
          })}
        </div>

        {/* Desktop only. The phone has no keys to press, and the bottom of a full-screen
            palette is where the keyboard is. */}
        <div className="hidden h-9 shrink-0 items-center gap-1.5 border-t bg-surface-2 px-3 text-[11px] text-muted-foreground pad:flex">
          {/* Keys that do nothing right now are not advice. With no results, esc is the
              only one left that works. */}
          {hits.length > 0 && (
            <>
              <Key>↑</Key>
              <Key>↓</Key>
              <span className="mr-2">move</span>
              <Key>↵</Key>
              <span className="mr-2">open</span>
            </>
          )}
          <Key>esc</Key>
          <span>close</span>
          {Boolean(term) && (
            <span className="tnum ml-auto">
              {hits.length} {hits.length === 1 ? "result" : "results"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** The same 32px tile the lists use for a monogram, holding a section or record icon. */
function Glyph({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
      <Icon className="size-4" strokeWidth={1.75} />
    </span>
  );
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="grid h-5 min-w-5 place-items-center rounded border bg-popover px-1 font-sans text-[10px] text-muted-foreground">
      {children}
    </kbd>
  );
}

/**
 * Marks the part the person typed. Twelve rows that all say "Ridgeline Plumbing &
 * Heating" are a wall; the mark is what turns them back into answers to a question.
 */
function Marked({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const at = text.toLowerCase().indexOf(term);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      {/* `mark` carries a UA yellow background, so the fill here is an override, not a
          decoration — losing it would put highlighter yellow in both themes. */}
      <mark className="rounded-[3px] bg-brand/15 font-semibold text-foreground dark:bg-brand/25">
        {text.slice(at, at + term.length)}
      </mark>
      {text.slice(at + term.length)}
    </>
  );
}

/** ⌘K / Ctrl+K. Desktop affordance; touch users get the magnifier. */
export function useSearchHotkey(onOpen: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onOpen]);
}

export const SEARCH_GROUPS = NAV.length;
