import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, Outlet, useLocation, useSearchParams } from "react-router-dom";
import {
  ChevronUp,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
} from "lucide-react";
import { SearchPalette, useSearchHotkey } from "./SearchPalette";
import { Toaster } from "sonner";
import { ShellContext } from "./shell-context";
import { ContextCluster } from "./ContextCluster";
import { GROUP_ORDER, itemForPath, labelFor, type NavItem, type Role } from "@/nav/routes";
import { arrangeNav, phoneSlots, useNavPrefs } from "@/nav/preferences";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useHasHover } from "@/lib/use-has-hover";
import { badgesFor, rollUp } from "@/nav/badges";
import { NavBadge } from "@/components/ui/nav-badge";
import { Popover } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const RAIL_KEY = "fleetco.railOpen";

/** The phone sheet's section headings. Two of them now, so it stopped being inline. */
const SheetLabel = ({ children }: { children: ReactNode }) => (
  <div className="mb-2 mt-3 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground first:mt-0">
    {children}
  </div>
);

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
  const [railMoreOpen, setRailMoreOpen] = useState(false);
  // Closed every time the sheet opens. "Where things are" has to be the same on the
  // second visit as the first, and a sheet that remembered being expanded would greet
  // half the users with the long list they asked not to see.
  const [sheetMoreOpen, setSheetMoreOpen] = useState(false);
  const openSheet = (v: boolean) => {
    setMoreOpen(v);
    if (!v) setSheetMoreOpen(false);
  };
  // Lab-only: `?search=<query>` opens the palette already showing results, so the lab
  // can display the search experience without a click.
  const labSearchQuery = params.get("search");
  const [searchOpen, setSearchOpen] = useState(() => labSearchQuery !== null);
  const [railOpen, setRailOpen] = useRailOpen();
  const hasHover = useHasHover();
  // Tooltips stand in for the labels the collapsed rail drops, so they are only
  // wanted when the rail is collapsed and the device can actually hover.
  const showTips = !railOpen && hasHover;
  useSearchHotkey(() => setSearchOpen(true));
  const badges = badgesFor(role);

  // Carry the environment across in-app navigation. Without this, clicking a rail item
  // dropped every lab setting but `role` and the preview snapped back to defaults.
  // Screen-scoped params (overlay, photos) are deliberately NOT carried: they belong to
  // the screen that was opened with them, not to the session.
  const query = (() => {
    // `seed` is carried even though `overlay` and `photos` are not. Those belong to one
    // screen; seed defines which records the section HAS, so dropping it on the way from
    // a list row to its detail would land on a job that no longer exists.
    const keep = ["role", "palette", "theme", "seed", "sel"];
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

  // The rail draws the user's arrangement of the route table, not the table itself.
  const nav = arrangeNav(role, useNavPrefs(role));
  const phoneItems = phoneSlots(nav.shown);
  // Each More wears the badges of what it is holding — the rail's button and the phone
  // sheet's row both. Without this, the section you hid because you rarely need it is the
  // one section that can never ask for you.
  const hiddenBadge = rollUp(badges, new Set(nav.shown.map((i) => i.key)));
  const phoneMoreBadge = rollUp(badges, new Set(phoneItems.map((i) => i.key)));
  const active = itemForPath(location.pathname);

  /** One row of the rail. The group loop and the flat list render the same thing. */
  const railItem = (item: NavItem) => {
    const on = active?.key === item.key;
    const label = labelFor(item, role);
    const badge = badges[item.key];
    const link = (
      <Link
        to={shell.href(item.landing ?? item.path)}
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
          <span className={cn("flex-1 truncate text-sm", on && "font-medium")}>{label}</span>
        )}
        {badge && <NavBadge badge={badge} placement={railOpen ? "inline" : "overlay"} />}
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
  };

  /** A row in either More menu: always labelled, because both have room for a label. */
  const moreItem = (item: NavItem, onPick?: () => void) => {
    const on = active?.key === item.key;
    return (
      <Link
        key={item.key}
        to={shell.href(item.landing ?? item.path)}
        onClick={onPick}
        aria-current={on ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
          on ? "bg-nav-active text-nav-active-fg" : "hover:bg-accent"
        )}
      >
        <item.icon
          className={cn("size-5 shrink-0", !on && "text-muted-foreground")}
          strokeWidth={1.75}
        />
        <span className={cn("flex-1 truncate", on && "font-medium")}>{labelFor(item, role)}</span>
        {badges[item.key] && <NavBadge badge={badges[item.key]} placement="inline" />}
      </Link>
    );
  };

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

              {/* Groups while the arrangement is the route table's own, one flat list once
                  the user has made their own. A custom order crosses groups on purpose —
                  "Customers at the top" puts Sales above Work — so keeping the separators
                  would mean drawing lines between sections that no longer share anything. */}
              {nav.grouped ? (
                GROUP_ORDER.filter((g) => nav.shown.some((i) => i.group === g)).map(
                  (group, gi, groups) => (
                    <div
                      key={group}
                      className={cn(
                        "flex flex-col gap-1.5",
                        railOpen ? "items-stretch" : "items-center"
                      )}
                    >
                      {nav.shown.filter((i) => i.group === group).map(railItem)}
                      {gi < groups.length - 1 && (
                        <span
                          className={cn("my-0.5 h-px bg-border", railOpen ? "mx-2.5" : "w-6")}
                        />
                      )}
                    </div>
                  )
                )
              ) : (
                <div
                  className={cn(
                    "flex flex-col gap-1.5",
                    railOpen ? "items-stretch" : "items-center"
                  )}
                >
                  {nav.shown.map(railItem)}
                </div>
              )}
            </div>

            <div className={cn("shrink-0 pb-2", railOpen ? "" : "w-full")}>
              {/* More, only when something is behind it. An always-present More on a rail
                  that hides nothing is a button whose job is to disappoint you. It sits
                  above Collapse because it navigates and Collapse only changes the
                  furniture — the nav keeps the nav's half of the rail. */}
              {nav.hidden.length > 0 && (
                <Popover
                  open={railMoreOpen}
                  onOpenChange={setRailMoreOpen}
                  side="above"
                  label="Sections hidden from the menu"
                  trigger={(() => {
                    const btn = (
                      <button
                        type="button"
                        onClick={() => setRailMoreOpen((v) => !v)}
                        aria-label="More sections"
                        aria-expanded={railMoreOpen}
                        /* `relative` on the button, not on a wrapper round the glyph:
                           the overlay badge is positioned against its corner, and a 20px
                           box to anchor to put the dot on top of the ellipsis. */
                        className={cn(
                          "relative flex items-center rounded-xl transition-colors",
                          railOpen
                            ? "mb-1 w-full gap-2.5 px-2.5 py-2"
                            : "mx-auto mb-1 size-10 justify-center",
                          railMoreOpen
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <MoreHorizontal className="size-5 shrink-0" strokeWidth={1.75} />
                        {railOpen && (
                          <span className="flex-1 truncate text-left text-sm">More</span>
                        )}
                        {/* Same rule as a nav item: a dot on a bare icon, the count once
                            there is a label beside it. Unlike the phone's More, it stays
                            put while the menu is open — the popover sits above the button
                            rather than over the screen, so both are in view and a number
                            that vanished would read as the attention going away. */}
                        {hiddenBadge && (
                          <NavBadge
                            badge={hiddenBadge}
                            placement={railOpen ? "inline" : "overlay"}
                          />
                        )}
                      </button>
                    );
                    return showTips ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{btn}</TooltipTrigger>
                        <TooltipContent side="right">
                          More · {nav.hidden.length} hidden
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      btn
                    );
                  })()}
                >
                  <div className="flex w-56 flex-col gap-0.5">
                    <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Hidden from the menu
                    </div>
                    {nav.hidden.map((item) => moreItem(item, () => setRailMoreOpen(false)))}
                  </div>
                </Popover>
              )}
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

        {/* Phone bottom bar. The first four sections of the user's rail order, plus More
            for the rest — one arrangement drives both devices, so moving Customers to the
            top of the rail is also what puts it in the phone's first slot. */}
        <nav className="nav-surface fixed inset-x-0 bottom-0 z-40 bg-surface-1 pb-[env(safe-area-inset-bottom)] pad:hidden">
          <div className="flex h-16 items-stretch">
            {phoneItems.map((item) => {
              const on = !moreOpen && active?.key === item.key;
              return (
                <Link
                  key={item.key}
                  to={shell.href(item.landing ?? item.path)}
                  onClick={() => openSheet(false)}
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
                      <NavBadge badge={badges[item.key]} placement="overlay" />
                    )}
                  </span>
                  <span>{item.short}</span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => openSheet(!moreOpen)}
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
                {!moreOpen && phoneMoreBadge && (
                  <NavBadge badge={phoneMoreBadge} placement="overlay" />
                )}
              </span>
              <span>More</span>
            </button>
          </div>
        </nav>

        {moreOpen && (
          /* A column: the menu scrolls, and everything that is not the menu is pinned to
             the bottom edge. More and the account are the two fixed points of this screen
             — the first is how you reach what is not listed, the second is who you are —
             so neither should move about with the length of the list above them. */
          <div className="fixed inset-x-0 bottom-16 top-0 z-30 flex flex-col bg-background pad:hidden">
            <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-0">
              <SheetLabel>Menu</SheetLabel>
              <div className="flex flex-col gap-0.5 pb-3">
                {nav.shown.map((item) => moreItem(item, () => openSheet(false)))}
              </div>
            </div>

            <div className="shrink-0 px-3 pb-3">
              {/* Hidden sections are reachable, not on show — the same deal the rail's
                  More button offers, so hiding a section means the same thing on both
                  devices. They keep their badges, and the roll-up rides on this row while
                  it is closed, because hiding a section must never be the reason nobody
                  sees that it needs them. */}
              {nav.hidden.length > 0 && (
                <div className="border-t pt-2">
                  <button
                    type="button"
                    onClick={() => setSheetMoreOpen((v) => !v)}
                    aria-expanded={sheetMoreOpen}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent"
                  >
                    <MoreHorizontal className="size-5 shrink-0" strokeWidth={1.75} />
                    <span className="flex-1 text-left">
                      {sheetMoreOpen ? "Hidden from the menu" : "More"}
                    </span>
                    {!sheetMoreOpen && hiddenBadge && (
                      <NavBadge badge={hiddenBadge} placement="inline" />
                    )}
                    {/* Up when closed, because that is the way the block grows: the foot
                        gets taller and More rises off the account. Pointing down would be
                        promising a drawer that opens into the bottom bar. */}
                    <ChevronUp
                      className={cn(
                        "size-4 shrink-0 transition-transform",
                        sheetMoreOpen && "rotate-180"
                      )}
                      strokeWidth={1.75}
                    />
                  </button>
                  {/* Capped and scrollable. The pinned foot grows when this opens, and
                      without a ceiling a shop with a dozen hidden sections would squeeze
                      the menu above it down to nothing. */}
                  {sheetMoreOpen && (
                    <div className="flex max-h-[40vh] flex-col gap-0.5 overflow-y-auto">
                      {nav.hidden.map((item) => moreItem(item, () => openSheet(false)))}
                    </div>
                  )}
                </div>
              )}
              {/* Who you are signed in as, not another place to go — so it sits at the
                  edge of the sheet the way it sits at the foot of the rail. */}
              <div className="mt-2 border-t pt-2">
                <ContextCluster />
              </div>
            </div>
          </div>
        )}
        <SearchPalette
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          role={role}
          initialQuery={labSearchQuery ?? undefined}
        />
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
