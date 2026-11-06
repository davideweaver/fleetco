import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The device lab. Each pane is a real iframe at a real pixel width, so media queries
 * see the true viewport — a CSS-scaled div would not. The transform only shrinks what
 * you see, not what the page thinks it is.
 */
const DEVICES = [
  { key: "phone", label: "Phone", sub: "390 × 844", w: 390, h: 844 },
  { key: "pad-p", label: "iPad portrait", sub: "820 × 1180", w: 820, h: 1180 },
  { key: "pad-l", label: "iPad landscape", sub: "1180 × 820", w: 1180, h: 820 },
  { key: "desktop", label: "Desktop", sub: "1440 × 900", w: 1440, h: 900 },
];

/** `label` is what fits on a chip; `note` is the detail, kept as the hover title. */
const SCREENS = [
  // Two shapes behind one screen — flip the role toggle to see the other.
  { key: "today", label: "Today", note: "Where signing in lands. Owner: two columns. Technician: one column, clock first", path: "/app/today" },
  { key: "customers", label: "Customer", note: "Customers · list → detail", path: "/app/customers/ridgeline" },
  // `pick=none` defeats the remembered-selection restore. Without it a desktop frame
  // immediately selects a row and this screen cannot show the empty pane at all.
  { key: "customers-empty", label: "Customer list", note: "Customers · nothing selected", path: "/app/customers?pick=none" },
  { key: "jobs", label: "Job", note: "Job detail · G-1048", path: "/app/jobs/G-1048" },
  { key: "board", label: "Board", note: "Job board · wide, no list column", path: "/app/board" },
  { key: "schedule", label: "Schedule", note: "Schedule · week grid", path: "/app/schedule" },
  { key: "estimate", label: "Estimate", note: "Estimate line editor", path: "/app/estimates/E-1048" },
  { key: "reports", label: "Reports", note: "Reports · sections list", path: "/app/reports/ar-aging" },
  { key: "time", label: "Time", note: "Time & payroll · wide", path: "/app/time" },
  { key: "photos", label: "Photos", note: "Photos · upload lifecycle", path: "/app/jobs/G-1052?photos=demo" },
  { key: "form", label: "Form", note: "Form in a panel · new job", path: "/app/jobs?overlay=form" },
  { key: "form-errors", label: "Form errors", note: "Form with validation errors", path: "/app/jobs?overlay=form-errors" },
  { key: "states", label: "States", note: "Loading / empty / error / not found", path: "/app/settings/_states" },
  { key: "dates", label: "Dates", note: "Date picker and date range picker — one grid", path: "/app/settings/_dates" },
  { key: "panel", label: "Panel", note: "Detail panel · opened from the board", path: "/app/board?overlay=panel" },
  { key: "search", label: "Search", note: "Universal search · simulated query & results", path: "/app/board?search=ridge" },
  { key: "long-list", label: "Long list", note: "List column at length · scope chips, count, load more", path: "/app/jobs?seed=long" },
  { key: "dialog", label: "Dialog", note: "Dialog · close job", path: "/app/jobs/G-1048?overlay=dialog" },
  { key: "approve", label: "Approval", note: "Approve, decline or override, per line (AUTH-002/004)", path: "/app/estimates/E-1048?overlay=approve" },
  { key: "void", label: "Void", note: "Destructive confirm with a required reason (INV-012)", path: "/app/invoices/1179" },
];

export function Lab() {
  const [role, setRole] = useState<"owner" | "tech">("owner");
  const [screen, setScreen] = useState(SCREENS[0]);
  const [scale, setScale] = useState(0.7);
  // Devices are independent toggles, not a picker: comparing two widths side by side is
  // the whole reason the lab exists, and "all four or one" made that an either/or.
  const [shown, setShown] = useState<Set<string>>(new Set(["desktop"]));
  const [dark, setDark] = useState(false);
  const [palette, setPalette] = useState<"neutral" | "warm">("warm");
  // Open question: how a selected list row is marked. Four candidates, live in the lab.
  const [sel, setSel] = useState<"card" | "right" | "tint" | "fill">("card");
  // Screens are LINKS, not a segmented control, and this counter is what makes them
  // behave like one. Clicking the screen you are already on has to mean something —
  // you have navigated three screens deep inside the preview and want to start over —
  // and with only `screen` in state that click is a no-op, because the state does not
  // change. Bumping a visit number on every click puts it in the iframe key, so every
  // click remounts the frame at the screen's own URL, the current one included.
  const [visit, setVisit] = useState(0);

  const openScreen = (s: (typeof SCREENS)[number]) => {
    setScreen(s);
    setVisit((v) => v + 1);
  };

  const src = (extra = "") =>
    `${screen.path}${screen.path.includes("?") ? "&" : "?"}role=${role}&palette=${palette}&sel=${sel}${dark ? "&theme=dark" : ""}${extra}`;

  return (
    <div className="flex h-full flex-col bg-neutral-100 text-neutral-900">
      <header className="shrink-0 border-b border-neutral-300 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div>
            <div className="text-sm font-semibold">FleetCo device lab</div>
            <div className="text-xs text-neutral-500">
              Design system · V1 graphics
            </div>
          </div>



          <Group label="Role">
            <Seg on={role === "owner"} onClick={() => setRole("owner")}>Owner</Seg>
            <Seg on={role === "tech"} onClick={() => setRole("tech")}>Technician</Seg>
          </Group>

          <Group label="Palette">
            <Seg on={palette === "neutral"} onClick={() => setPalette("neutral")}>Neutral</Seg>
            <Seg on={palette === "warm"} onClick={() => setPalette("warm")}>Warm</Seg>
          </Group>



          <Group label="Selected row">
            <Seg on={sel === "card"} onClick={() => setSel("card")} title="The row lifts off the column as a card">Card</Seg>
            <Seg on={sel === "right"} onClick={() => setSel("right")} title="Fill plus an edge on the detail-pane side">Right edge</Seg>
            <Seg on={sel === "tint"} onClick={() => setSel("tint")} title="Fill plus the title in brand colour">Tint</Seg>
            <Seg on={sel === "fill"} onClick={() => setSel("fill")} title="A deeper surface and nothing else">Fill</Seg>
          </Group>

          <Group label="Theme">
            <Seg on={!dark} onClick={() => setDark(false)}>Light</Seg>
            <Seg on={dark} onClick={() => setDark(true)}>Dark</Seg>
          </Group>

          <Group label="Zoom">
            <input
              type="range"
              min={25}
              max={100}
              value={scale * 100}
              onChange={(e) => setScale(Number(e.target.value) / 100)}
              className="w-28"
            />
            <span className="tnum w-10 text-xs text-neutral-500">{Math.round(scale * 100)}%</span>
          </Group>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            Devices
          </span>
          {DEVICES.map((d) => (
            <Seg
              key={d.key}
              on={shown.has(d.key)}
              onClick={() =>
                setShown((s) => {
                  const next = new Set(s);
                  // Never leave nothing on screen — the last one on stays on.
                  if (next.has(d.key)) {
                    if (next.size === 1) return s;
                    next.delete(d.key);
                  } else {
                    next.add(d.key);
                  }
                  return next;
                })
              }
            >
              {d.label}
            </Seg>
          ))}
          <button
            type="button"
            onClick={() => setShown(new Set(DEVICES.map((d) => d.key)))}
            className="ml-1 text-[11px] text-neutral-500 underline-offset-2 hover:underline"
          >
            all four
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            Screens
          </span>
          {SCREENS.map((s) => (
            <ScreenLink key={s.key} onClick={() => openScreen(s)} title={s.note}>
              {s.label}
            </ScreenLink>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="flex items-start gap-5">
          {DEVICES.filter((d) => shown.has(d.key)).map((d) => (
            <div key={d.key} className="shrink-0">
              <div className="mb-1.5 flex items-baseline gap-2">
                <span className="text-xs font-semibold">{d.label}</span>
                <span className="tnum text-[11px] text-neutral-500">{d.sub}</span>
                <a
                  href={src()}
                  target="_blank"
                  rel="noreferrer"
                  title="Open at full size"
                  className="text-neutral-400 hover:text-neutral-700"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
              <div
                className="overflow-hidden rounded-lg border border-neutral-300 bg-white shadow-sm"
                style={{ width: d.w * scale, height: d.h * scale }}
              >
                <iframe
                  key={`${d.key}-${role}-${palette}-${sel}-${screen.key}-${dark}-${visit}`}
                  title={d.label}
                  src={src()}
                  style={{
                    width: d.w,
                    height: d.h,
                    border: 0,
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <p className="mt-5 max-w-3xl text-xs leading-relaxed text-neutral-500">
          Below 744px the shell switches to the bottom bar and one pane. At 1024px and up
          the list and the detail sit side by side. iPad portrait (820) is the case that
          forces the design: a 56px rail plus a 300px list leaves too little for job
          details, so it stays one pane — the same behaviour the phone needs.
        </p>
      </div>

      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

/**
 * A screen link. It goes somewhere, so it looks like a link and carries no state at all —
 * every one of them is identical, including the screen you are looking at. Marking the
 * current screen is what made the row feel like a segmented control, and a control that
 * is already "on" invites a click that does nothing. The preview below says which screen
 * is up; the row only has to take you there.
 */
function ScreenLink({
  onClick,
  children,
  title,
}: {
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="text-xs text-neutral-600 underline-offset-4 hover:text-neutral-900 hover:underline"
    >
      {children}
    </button>
  );
}

function Seg({
  on,
  onClick,
  children,
  title,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs font-medium",
        on
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
      )}
    >
      {children}
    </button>
  );
}
