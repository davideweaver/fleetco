import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { customers, invoices, jobs } from "@/data/sample";
import { NAV, type Role, labelFor, navFor } from "@/nav/routes";
import { useShell } from "./shell-context";
import { cn } from "@/lib/utils";

/**
 * Global search, as a palette rather than a field in a banner.
 *
 * One search, on purpose. "Filter this list" is a different control with a different
 * answer — from the invoices screen, typing "Ridgeline" might mean "show me their
 * invoices" or "take me to them" — and V1's lists are short enough that per-list
 * filtering can wait until one of them is actually long.
 *
 * The real one is shadcn's `command` (cmdk), which brings grouping, virtualisation and
 * proper listbox semantics. This is a stand-in so the layout can be judged.
 */
type Hit = { id: string; label: string; sub: string; group: string; path: string };

export function SearchPalette({
  open,
  onClose,
  role,
}: {
  open: boolean;
  onClose: () => void;
  role: Role;
}) {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const { href } = useShell();

  useEffect(() => {
    if (open) setQ("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase();
    const owner = role === "owner";
    const all: Hit[] = [
      ...navFor(role).map((i) => ({
        id: `nav-${i.key}`,
        label: labelFor(i, role),
        sub: "Go to",
        group: "Sections",
        path: i.path,
      })),
      ...(owner ? jobs : jobs.filter((j) => j.who === "T1")).map((j) => ({
        id: `job-${j.no}`,
        label: `${j.no} · ${j.what}`,
        sub: j.customer,
        group: "Jobs",
        path: `/app/jobs/${j.no}`,
      })),
      ...(owner
        ? customers.map((c) => ({
            id: `cust-${c.id}`,
            label: c.name,
            sub: `${c.city} · ${c.terms}`,
            group: "Customers",
            path: `/app/customers/${c.id}`,
          }))
        : []),
      ...(owner
        ? invoices.map((v) => ({
            id: `inv-${v.no}`,
            label: `Invoice #${v.no}`,
            sub: `${v.customer} · ${v.status}`,
            group: "Invoices",
            path: `/app/invoices/${v.no}`,
          }))
        : []),
    ];
    if (!term) return all.filter((h) => h.group === "Sections").slice(0, 6);
    return all
      .filter((h) => `${h.label} ${h.sub}`.toLowerCase().includes(term))
      .slice(0, 12);
  }, [q, role]);

  if (!open) return null;

  const go = (path: string) => {
    navigate(href(path));
    onClose();
  };

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-0 pad:p-6 pad:pt-24">
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/20 backdrop-blur-[1px]"
      />
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-popover shadow-xl pad:h-auto pad:max-h-[28rem] pad:w-[34rem] pad:rounded-xl pad:border">
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search jobs, customers, invoices…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {hits.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing matches “{q}”.
            </div>
          )}
          {hits.map((h) => {
            const header = h.group !== lastGroup ? h.group : null;
            lastGroup = h.group;
            return (
              <div key={h.id}>
                {header && (
                  <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {header}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => go(h.path)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{h.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{h.sub}</span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
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
