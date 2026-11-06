import { useEffect, useState } from "react";
import { navFor, type NavItem, type Role } from "./routes";

const KEY = "fleetco.navPrefs";

/**
 * How many sections the phone's bottom bar holds before More takes over. Four plus More
 * is five slots across 390px; a fifth section would put every label under 70px.
 */
export const PHONE_SLOTS = 4;

/**
 * One person's arrangement of the nav, for this browser. Not a role and not a permission:
 * what a user is ALLOWED to see is `NavItem.roles`, and hiding here never grants or
 * removes access — a hidden section is one click further away, not gone.
 *
 * Stored per role. A real user has one role and would never notice, but the lab's role
 * switch would otherwise hand a technician's five-section order to an owner, whose other
 * six sections would all pile up at the end of it.
 */
export type NavPrefs = {
  /**
   * Section keys in rail order. A key the route table has but this list does not keeps
   * its table order, after everything listed — so shipping a new section appends it to
   * the rail instead of dropping it for everyone who has ever touched this screen.
   */
  order: string[];
  /** Section keys kept out of the rail and the phone bar, reachable through More. */
  hidden: string[];
};

export const DEFAULT_PREFS: NavPrefs = { order: [], hidden: [] };

const keys = (v: unknown) =>
  Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : [];

function readAll(): Partial<Record<Role, NavPrefs>> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const byRole = JSON.parse(raw) as Record<string, { order?: unknown; hidden?: unknown }>;
    const out: Partial<Record<Role, NavPrefs>> = {};
    for (const role of ["owner", "tech"] as const) {
      const v = byRole[role];
      if (v) out[role] = { order: keys(v.order), hidden: keys(v.hidden) };
    }
    return out;
  } catch {
    // A hand-edited or half-written value loses the arrangement, not the nav.
    return {};
  }
}

export function readNavPrefs(role: Role): NavPrefs {
  return readAll()[role] ?? DEFAULT_PREFS;
}

export function writeNavPrefs(role: Role, prefs: NavPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [role]: prefs }));
  } catch {
    /* A rail that cannot remember its order is still a working rail. */
  }
  // `storage` only fires in OTHER documents, so the writer has to tell itself.
  window.dispatchEvent(new Event("fleetco.navPrefs"));
}

/**
 * Reads the arrangement and re-reads it whenever it changes — including from another
 * document, which is what the device lab is: four iframes on one origin. Editing the
 * order in the desktop frame moves the phone frame's bottom bar at the same time, which
 * is the whole reason to look at them side by side.
 */
export function useNavPrefs(role: Role): NavPrefs {
  const [prefs, setPrefs] = useState(() => readNavPrefs(role));

  useEffect(() => {
    const sync = () => setPrefs(readNavPrefs(role));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("fleetco.navPrefs", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("fleetco.navPrefs", sync);
    };
  }, [role]);

  return prefs;
}

export type ArrangedNav = {
  /** Every section this role can reach, in the user's order. */
  all: NavItem[];
  /** What the rail and the phone bar draw from, in order. */
  shown: NavItem[];
  /** What only More reaches, in order. */
  hidden: NavItem[];
  /**
   * True while the arrangement is the route table's own. The rail shows its group
   * separators only then: a custom order crosses groups by design — "Customers at the
   * top" means Sales above Work — so a separator in a reordered rail would be drawing a
   * line between sections that no longer share anything.
   */
  grouped: boolean;
};

export function arrangeNav(role: Role, prefs: NavPrefs): ArrangedNav {
  const items = navFor(role);
  const rank = new Map(prefs.order.map((k, i) => [k, i] as const));
  // Stable sort, so unranked sections keep the route table's order among themselves.
  const all = [...items].sort(
    (a, b) => (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity)
  );

  const hiddenKeys = new Set(prefs.hidden);
  const shown = all.filter((i) => !hiddenKeys.has(i.key));
  const hidden = all.filter((i) => hiddenKeys.has(i.key));

  // Hiding everything would leave a rail that is one More button. The arrangement is
  // repaired on read rather than refused on write, so a stale saved order — one that
  // hides sections a role no longer has — cannot lock anyone out of their own nav.
  if (shown.length === 0) {
    return { all, shown: all, hidden: [], grouped: false };
  }

  return { all, shown, hidden, grouped: prefs.order.length === 0 };
}

/** The sections the phone's bottom bar names. Everything else is behind More. */
export const phoneSlots = (shown: NavItem[]) => shown.slice(0, PHONE_SLOTS);
