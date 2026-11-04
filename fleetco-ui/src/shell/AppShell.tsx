import { useMemo, useState } from "react";
import { Link, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { Menu, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { SearchPalette, useSearchHotkey } from "./SearchPalette";
import { Toaster } from "sonner";
import { ShellContext } from "./shell-context";
import { ContextCluster } from "./ContextCluster";
import { GROUP_ORDER, itemForPath, labelFor, navFor, phoneNavFor, type Role } from "@/nav/routes";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useHasHover } from "@/lib/use-has-hover";
import { badgesFor, rollUp, type BadgeLevel } from "@/nav/badges";
import { NavBadge } from "@/components/ui/nav-badge";
import { cn } from "@/lib/utils";

const RAIL_KEY = "fleetco.railOpen";

/**
 * Expanded shows labels, collapsed is the 56px rail. Collapsed is only the default on a
 * desktop at 1280px and up: it needs room for a list and a detail beside it, and it needs
 * hover tooltips to replace the labels it drops. Once the user touches the toggle, their
 * choice wins everywhere.
 */
function useRailOpen(): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(() => {
    const saved = localStorage.getItem(RAIL_KEY);
    if (saved !== null) return saved === "true";
    // Collapsed is only a good default where a tooltip can stand in for the label.
    // An iPad has no hover, so it starts expanded however wide it is.
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!canHover) return true;
    return window.matchMedia("(min-width: 1280px)").matches;
  });

  const set = (v: boolean) => {
    setOpen(v);
    localStorage.setItem(RAIL_KEY, String(v));
  };

  return [open, set];
}

export function AppShell() {
  const [params] = useSearchParams();
  const location = useLocation();
  const role = (params.get("role") as Role) ?? "owner";
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [railOpen, setRailOpen] = useRailOpen();
  const hasHover = useHasHover();
  // Tooltips stand in for the labels the collapsed rail drops, so they are only
  // wanted when the rail is collapsed and the device can actually hover.
  const showTips = !railOpen && hasHover;
  useSearchHotkey(() => setSearchOpen(true));
  const badges = badgesFor(role, (params.get("badges") as BadgeLevel) ?? "quiet");

  // Carry the environment across in-app navigation. Without this, clicking a rail item
  // dropped every lab setting but `role` and the preview snapped back to defaults.
  // Screen-scoped params (overlay, photos) are deliberately NOT carried: they belong to
  // the screen that was opened with them, not to the session.
  const query = (() => {
    const keep = ["role", "badges", "palette", "theme", "entry"];
    const q = new URLSearchParams();
    for (const k of keep) {
      const v = params.get(k);
      if (v) q.set(k, v);
    }
    const s = q.toString();
    return s ? `?${s}` : "";
  })();
  const shell = useMemo(
    () => ({
      role,
      href: (path: string) => `${path}${query}`,
      openSearch: () => setSearchOpen(true),
    }),
    [role, query]
  );

  const items = navFor(role);
  const phoneItems = phoneNavFor(role);
  const moreBadge = rollUp(badges, new Set(phoneItems.map((i) => i.key)));
  const active = itemForPath(location.pathname);

  return (
    <ShellContext value={shell}>
      <TooltipProvider delayDuration={400} skipDelayDuration={200}>
      <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
        {/* The rail. Hidden below 744px — the phone gets the bottom bar instead. Pure
            CSS, so there is no first-paint flash from a JS width check. */}
        <nav
            className={cn(
              "nav-surface hidden shrink-0 flex-col bg-surface-1 pad:flex",
              railOpen ? "w-52 items-stretch px-2" : "w-14 items-center"
            )}
          >
            <div
              className={cn(
                // No border under the logo. The band sets the height, which is what does the
                // aligning; the rule under it just chopped the rail in two.
                "flex h-band shrink-0 items-center",
                railOpen ? "gap-2 px-1" : "w-full justify-center"
              )}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-[10px] font-bold text-primary-foreground">
                OTC
              </span>
              {railOpen && <span className="truncate text-sm font-semibold">OTC Fleet Graphix</span>}
            </div>

            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-1 py-2",
                railOpen ? "items-stretch" : "items-center"
              )}
            >
              {(() => {
                const btn = (
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    aria-label="Search"
                    className={cn(
                      "flex items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                      railOpen ? "gap-2.5 px-2.5 py-2" : "size-10 justify-center"
                    )}
                  >
                    <Search className="size-5 shrink-0" strokeWidth={1.75} />
                    {railOpen && (
                      <>
                        <span className="flex-1 truncate text-left text-sm">Search</span>
                        <kbd className="rounded border px-1 text-[10px] text-muted-foreground">
                          ⌘K
                        </kbd>
                      </>
                    )}
                  </button>
                );
                return showTips ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{btn}</TooltipTrigger>
                    <TooltipContent side="right">Search · ⌘K</TooltipContent>
                  </Tooltip>
                ) : (
                  btn
                );
              })()}
              <span className={cn("my-0.5 h-px bg-border", railOpen ? "mx-2.5" : "w-6")} />

              {GROUP_ORDER.filter((g) => items.some((i) => i.group === g)).map((group, gi, groups) => {
                const inGroup = items.filter((i) => i.group === group);
                return (
                  <div
                    key={group}
                    className={cn(
                      "flex flex-col gap-1.5",
                      railOpen ? "items-stretch" : "items-center"
                    )}
                  >
                    {inGroup.map((item) => {
                      const on = active?.key === item.key;
                      const label = labelFor(item, role);
                      const badge = badges[item.key];
                      const link = (
                        <Link
                          to={shell.href(item.path)}
                          aria-label={label}
                          aria-current={on ? "page" : undefined}
                          className={cn(
                            "relative flex items-center rounded-xl transition-colors",
                            railOpen ? "gap-2.5 px-2.5 py-2" : "size-10 justify-center",
                            on
                              ? "bg-nav-active text-nav-active-fg"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground"
                          )}
                        >
                          <item.icon className="size-5 shrink-0" strokeWidth={1.75} />
                          {railOpen && (
                            <span className={cn("flex-1 truncate text-sm", on && "font-medium")}>
                              {label}
                            </span>
                          )}
                          {badge &&
                            (railOpen ? (
                              <NavBadge badge={badge} placement="inline" />
                            ) : (
                              <NavBadge badge={badge} placement="overlay" ring="ring-surface-1" />
                            ))}
                        </Link>
                      );
                      return showTips ? (
                        <Tooltip key={item.key}>
                          <TooltipTrigger asChild>{link}</TooltipTrigger>
                          <TooltipContent side="right">
                            {label}
                            {badge?.count ? ` · ${badge.count}` : ""}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span key={item.key} className="contents">
                          {link}
                        </span>
                      );
                    })}
                    {gi < groups.length - 1 && (
                      <span className={cn("my-0.5 h-px bg-border", railOpen ? "mx-2.5" : "w-6")} />
                    )}
                  </div>
                );
              })}
            </div>

            <div className={cn("shrink-0 pb-2", railOpen ? "" : "w-full")}>
              {(() => {
                const toggle = (
                  <button
                    type="button"
                    onClick={() => setRailOpen(!railOpen)}
                    aria-label={railOpen ? "Collapse menu" : "Expand menu"}
                    aria-expanded={railOpen}
                    className={cn(
                      "flex items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                      railOpen ? "mb-1 w-full gap-2.5 px-2.5 py-2" : "mx-auto mb-1 size-10 justify-center"
                    )}
                  >
                    {railOpen ? (
                      <PanelLeftClose className="size-5 shrink-0" strokeWidth={1.75} />
                    ) : (
                      <PanelLeftOpen className="size-5 shrink-0" strokeWidth={1.75} />
                    )}
                    {railOpen && <span className="truncate text-sm">Collapse</span>}
                  </button>
                );
                return showTips ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{toggle}</TooltipTrigger>
                    <TooltipContent side="right">Expand menu</TooltipContent>
                  </Tooltip>
                ) : (
                  toggle
                );
              })()}
              <ContextCluster compact={!railOpen} />
            </div>
        </nav>

        {/* No top banner. It repeated the section title the list header already shows,
            and cost 56px on every screen. Search moved to the rail and the palette. */}
        <main className="flex min-w-0 flex-1 flex-col bg-surface-3 pb-16 pad:pb-0">
          <Outlet />
        </main>

        {/* Phone bottom bar. Four items plus More, which opens the full list —
            the VarsityBio pattern, driven off the same route table. */}
        <nav className="nav-surface fixed inset-x-0 bottom-0 z-40 bg-surface-1 pb-[env(safe-area-inset-bottom)] pad:hidden">
          <div className="flex h-16 items-stretch">
            {phoneItems.map((item) => {
              const on = !moreOpen && active?.key === item.key;
              return (
                <Link
                  key={item.key}
                  to={shell.href(item.path)}
                  onClick={() => setMoreOpen(false)}
                  aria-current={on ? "page" : undefined}
                  style={{ width: `${100 / (phoneItems.length + 1)}%` }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 text-[11px]",
                    on ? "font-medium text-foreground" : "text-muted-foreground"
                  )}
                >
                  {/* Same tinted chip as the rail, so "where am I" looks identical on
                      every device. No underline — one cue, used consistently. */}
                  <span
                    className={cn(
                      "relative grid h-8 w-14 place-items-center rounded-xl transition-colors",
                      on && "bg-nav-active text-nav-active-fg"
                    )}
                  >
                    <item.icon className="size-5" strokeWidth={1.75} />
                    {badges[item.key] && (
                      <NavBadge
                        badge={badges[item.key]}
                        placement="overlay"
                        ring="ring-surface-1"
                      />
                    )}
                  </span>
                  <span>{item.short}</span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              style={{ width: `${100 / (phoneItems.length + 1)}%` }}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[11px]",
                moreOpen ? "font-medium text-foreground" : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "relative grid h-8 w-14 place-items-center rounded-xl transition-colors",
                  moreOpen && "bg-nav-active text-nav-active-fg"
                )}
              >
                {moreOpen ? (
                  <X className="size-5" strokeWidth={1.75} />
                ) : (
                  <Menu className="size-5" strokeWidth={1.75} />
                )}
                {/* A badge behind More would otherwise be invisible until you opened it. */}
                {!moreOpen && moreBadge && (
                  <NavBadge badge={moreBadge} placement="overlay" ring="ring-surface-1" />
                )}
              </span>
              <span>More</span>
            </button>
          </div>
        </nav>

        {moreOpen && (
          <div className="fixed inset-x-0 bottom-16 top-0 z-30 overflow-y-auto bg-background p-3 pad:hidden">
            <div className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              All sections
            </div>
            <div className="flex flex-col gap-0.5">
              {items.map((item) => {
                const on = active?.key === item.key;
                return (
                  <Link
                    key={item.key}
                    to={shell.href(item.path)}
                    onClick={() => setMoreOpen(false)}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-sm",
                      on ? "bg-nav-active text-nav-active-fg" : "hover:bg-accent"
                    )}
                  >
                    <item.icon
                      className={cn("size-5 shrink-0", !on && "text-muted-foreground")}
                      strokeWidth={1.75}
                    />
                    <span className={cn("flex-1", on && "font-medium")}>
                      {labelFor(item, role)}
                    </span>
                    {badges[item.key] && (
                      <NavBadge badge={badges[item.key]} placement="inline" />
                    )}
                  </Link>
                );
              })}
            </div>
            <div className="mt-3 border-t pt-2">
              <ContextCluster />
            </div>
          </div>
        )}
        <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} role={role} />
        {/* Bottom-right on a desktop, top on a phone — the bottom bar owns the bottom. */}
        <Toaster
          position="bottom-right"
          mobileOffset={{ top: 12 }}
          toastOptions={{
            classNames: {
              toast: "!bg-popover !text-popover-foreground !border-border !rounded-xl",
              description: "!text-muted-foreground",
            },
          }}
        />
      </div>
      </TooltipProvider>
    </ShellContext>
  );
}
