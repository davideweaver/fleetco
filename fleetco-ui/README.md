# fleetco-ui — device lab

A throwaway-grade harness for deciding the **FleetCo V1 nav shape** before any screen is
built on it. Not the app; it borrows the app's eventual stack (React + Vite + Tailwind 4,
shadcn-style CSS variable tokens) so what you approve here transfers.

```sh
npm install
npm run dev     # http://localhost:5180/lab
```

## What it compares

Four device widths as independent toggles, two roles, two palettes, two themes, three badge
levels, and a rail that collapses — 80px with labels, 56px icons only.

Collapsed is only the default on a desktop at 1280px and up — it needs room beside a
list and a detail, and it needs hover tooltips to replace the labels it drops. An iPad
reports no hover, so it starts expanded at any width. The user's choice then wins
everywhere and is remembered in `localStorage`. `?rail=expanded|collapsed` forces a state for the lab
without writing to storage.

Devices: phone 390×844 · iPad portrait 820×1180 · iPad landscape 1180×820 · desktop 1440×900.

Each pane is a **real iframe at a real pixel width**, so media queries see the true
viewport. The zoom slider only scales what you see.

## The pieces worth reviewing

| File | Why it matters |
|---|---|
| `src/nav/routes.ts` | **One route table.** Rail, sidebar and bottom bar are three renderers over it. VarsityBio keeps two hand-maintained lists and they have already drifted |
| `src/shell/ListDetailLayout.tsx` | **The one list-detail layout**, used by all seven list sections. Responsive collapse is pure CSS keyed off `hasSelection` — no JS width check, so no first-paint flash |
| `src/shell/AppShell.tsx` | Rail / sidebar / bottom bar, and the More sheet |
| `src/nav/badges.ts` | **Counts and dots, derived from state — never per-user read tracking.** Why, and what the roll-up onto More does, is in the file header |
| `src/components/ui/tooltip.tsx` | shadcn's tooltip (Radix). Portaled, because the rail's scroll container would otherwise clip it. Only rendered when the rail is collapsed **and** the device can hover |
| `src/shell/ContextCluster.tsx` | Business / department / person in one cluster at the bottom of the rail. The business row only renders with more than one membership — in V1 the slot exists, the switching machinery does not |
| `src/index.css` | Tokens. `--breakpoint-pad: 744px` is the only non-standard one |
| `src/data/sample.ts` | The canonical story (G-1048, Ridgeline, $2,019.00), copied from `docs/Product/v1-video/lib/wire.js` |

## What it is not

No real data, no auth, no tests, no accessibility pass. Several rules are *shown* rather
than enforced (ROLE-003 filters the list, ROLE-005 hides costs) purely so the screens
read correctly at each size.
