import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { departments } from "@/data/sample";
import { useShell } from "./shell-context";
import { cn } from "@/lib/utils";

/**
 * Department and person, in one cluster at the bottom of the rail. Switching context is
 * rare, so it never takes primary nav space — both reference apps put the avatar here
 * and so does VarsityBio.
 *
 * DEPARTMENT IS HERE BY DECISION (Dave, 2026-11-03), overriding the UI half of PLAT-006
 * ("V1 has one department, Graphics, and the UI never shows it"). That clause is
 * Proposed, not Confirmed, so this is a spec change rather than a violation — the
 * catalog needs the matching edit. Graphics is the only real department in V1; the rest
 * of the list is FUT-002.
 *
 * NO BUSINESS CONTROL. ADR-007 allows multi-tenant membership, but the case the Tenancy
 * Model describes is a PORTAL user whose fleet is serviced by two competing shops. The
 * portal is out of V1 and this is the staff app, so the switcher belongs there, not here.
 * The `user <-> membership <-> tenant` model stays; only the control is gone.
 */
export function ContextCluster({ compact = false }: { compact?: boolean }) {
  const { role } = useShell();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const initials = role === "owner" ? "CW" : "JT";
  const who = role === "owner" ? "Owner" : "Technician";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-accent",
          compact && "justify-center px-0"
        )}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
          {initials}
        </span>
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{who}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {departments[0].name}
            </span>
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            "absolute bottom-full z-50 mb-2 w-64 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg",
            compact ? "left-0" : "left-0"
          )}
        >
          <div className="px-2 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Department
          </div>
          {departments.map((d, i) => (
            <button
              key={d.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                i === 0 ? "bg-brand/12 text-brand" : "hover:bg-accent"
              )}
            >
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              {i === 0 && <Check className="size-4 shrink-0" />}
            </button>
          ))}

          <div className="my-1 h-px bg-border" />
          <button type="button" className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent">
            <span className="flex-1">Account</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
          <button type="button" className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
