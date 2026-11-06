import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useShell } from "./shell-context";

/**
 * The list column and the detail pane are only on screen together at 1024px — the same
 * breakpoint `ListDetailLayout` switches on. Below it the list IS the screen, and
 * auto-selecting would mean every tap on a nav item landed you inside a record you did
 * not ask for, with Back as the only way out.
 */
const DESKTOP = "(min-width: 1024px)";

/** Per tab, not forever: a remembered row is a property of the session you are in. */
const KEY = "fleetco.last-selection";

function read(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    // Private mode, a quota, a hand-edited value — none of it is worth a broken list.
    return {};
  }
}

function write(all: Record<string, string>) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* Forgetting is an acceptable failure here. */
  }
}

/**
 * Keeps the detail pane occupied. On desktop, arriving at a section's bare URL selects
 * the row you last had open there, or the first row if that record is no longer in the
 * list — so clicking a nav item never lands on "Pick a job."
 *
 * `ids` is what the list is CURRENTLY showing, not everything the section owns. That is
 * what makes the fallback right: a remembered row that a filter or a scope has hidden
 * counts as "not in the list", and you get the first visible row instead of a selection
 * the column beside it cannot show as selected.
 */
export function useRestoredSelection({
  section,
  id,
  ids,
  to,
}: {
  section: string;
  /** The id in the URL, if any. */
  id: string | undefined;
  /** Ids of the rows the list is showing, in list order. */
  ids: string[];
  to: (id: string) => string;
}) {
  const navigate = useNavigate();
  const { href } = useShell();
  // Lab only: `?pick=none` keeps a section's bare URL bare, so the lab can still show
  // the empty detail pane. It is screen-scoped, so `AppShell` does not carry it along.
  const [params] = useSearchParams();
  const off = params.get("pick") === "none";

  // Read once per mount. Re-reading on every render would let a write from one frame of
  // the device lab (same tab, same storage) yank another frame's selection mid-session.
  const [last] = useState(() => read()[section]);
  const target = last && ids.includes(last) ? last : ids[0];

  useEffect(() => {
    if (!id) return;
    write({ ...read(), [section]: id });
  }, [section, id]);

  useEffect(() => {
    if (id || off || !target || !window.matchMedia(DESKTOP).matches) return;
    // `replace`, so the empty URL does not become a stop on the way back.
    navigate(href(to(target)), { replace: true });
    // `to` is an inline closure at every call site, so `target` is the dependency that
    // actually carries the meaning here.
  }, [id, off, target, href, navigate]);
}
