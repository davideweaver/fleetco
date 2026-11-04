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
  { key: "customers", label: "Customer", note: "Customers · list → detail", path: "/app/customers/ridgeline" },
  { key: "customers-empty", label: "Customer list", note: "Customers · nothing selected", path: "/app/customers" },
  { key: "jobs", label: "Job", note: "Job detail · G-1048", path: "/app/jobs/G-1048" },
  { key: "board", label: "Board", note: "Job board · wide, no list column", path: "/app/board" },
  { key: "schedule", label: "Schedule", note: "Schedule · week grid", path: "/app/schedule" },
  { key: "estimate", label: "Estimate", note: "Estimate line editor", path: "/app/estimates/E-1048" },
  { key: "reports", label: "Reports", note: "Reports · sections list", path: "/app/reports/ar-aging" },
  { key: "time", label: "Time", note: "Time & payroll · wide", path: "/app/time" },
  { key: "photos", label: "Photos", note: "Photos · upload lifecycle", path: "/app/jobs/G-1052?photos=demo" },
  { key: "form", label: "Form", note: "Form in a panel · new job", path: "/app/jobs?overlay=form" },
  { key: "form-errors", label: "Form errors", note: "Form with validation errors", path: "/app/jobs?overlay=form-errors" },
  { key: "states", label: "States", note: "Loading / empty / error / not found", path: "/app/_states" },
  { key: "panel", label: "Panel", note: "Detail panel · opened from the board", path: "/app/board?overlay=panel" },
  { key: "dialog", label: "Dialog", note: "Dialog · close job", path: "/app/jobs/G-1048?overlay=dialog" },
];

/**
 * Controls that only mean something on one screen live beside the preview, not in the
 * global bar. A toggle in the header implies it applies to whatever you are looking at,
 * and "Cal entry" sitting there on the invoices screen is a small lie that costs a few
 * seconds every time someone reads the bar.
 */
const SCREEN_CONTROLS: Record<string, "calEntry"[]> = {
  schedule: ["calEntry"],
};

export function Lab() {
  const [badges, setBadges] = useState<"off" | "quiet" | "busy">("quiet");
  const [role, setRole] = useState<"owner" | "tech">("owner");
  const [screen, setScreen] = useState(SCREENS[0]);
  const [scale, setScale] = useState(0.7);
  // Devices are independent toggles, not a picker: comparing two widths side by side is
  // the whole reason the lab exists, and "all four or one" made that an either/or.
  const [shown, setShown] = useState<Set<string>>(new Set(["desktop"]));
  const [dark, setDark] = useState(false);
  const [palette, setPalette] = useState<"neutral" | "warm">("warm");
  const [nav, setNav] = useState<"light" | "dark">("dark");
  const [entry, setEntry] = useState<"fill" | "stripe" | "both">("both");

  const src = (extra = "") =>
    `${screen.path}${screen.path.includes("?") ? "&" : "?"}role=${role}&badges=${badges}&palette=${palette}&nav=${nav}&entry=${entry}${dark ? "&theme=dark" : ""}${extra}`;

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

          <Group label="Badges">
            <Seg on={badges === "off"} onClick={() => setBadges("off")}>Off</Seg>
            <Seg on={badges === "quiet"} onClick={() => setBadges("quiet")}>Quiet</Seg>
            <Seg on={badges === "busy"} onClick={() => setBadges("busy")}>Busy</Seg>
          </Group>

          <Group label="Palette">
            <Seg on={palette === "neutral"} onClick={() => setPalette("neutral")}>Neutral</Seg>
            <Seg on={palette === "warm"} onClick={() => setPalette("warm")}>Warm</Seg>
          </Group>

          <Group label="Nav">
            <Seg on={nav === "light"} onClick={() => setNav("light")}>Light</Seg>
            <Seg on={nav === "dark"} onClick={() => setNav("dark")}>Dark</Seg>
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

        <div className="mt-2 flex flex-wrap gap-1.5">
          {SCREENS.map((s) => (
            <Seg
              key={s.key}
              on={s.key === screen.key}
              onClick={() => setScreen(s)}
              title={s.note}
            >
              {s.label}
            </Seg>
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
                <span className="text-[11px] text-neutral-400">· {screen.note}</span>
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
                  key={`${d.key}-${role}-${badges}-${palette}-${nav}-${entry}-${screen.key}-${dark}`}
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

          {/* Sits immediately after the last preview rather than pinned to the window
              edge, so it reads as belonging to what is on screen. */}
          {SCREEN_CONTROLS[screen.key] && (
            <aside className="sticky top-0 w-56 shrink-0 rounded-xl border border-neutral-300 bg-white p-3 shadow-sm">
              <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                This screen
              </div>
              {SCREEN_CONTROLS[screen.key].includes("calEntry") && (
                <SideGroup label="Entry style">
                  <Seg on={entry === "fill"} onClick={() => setEntry("fill")}>
                    Fill
                  </Seg>
                  <Seg on={entry === "stripe"} onClick={() => setEntry("stripe")}>
                    Stripe
                  </Seg>
                  <Seg on={entry === "both"} onClick={() => setEntry("both")}>
                    Both
                  </Seg>
                </SideGroup>
              )}
            </aside>
          )}
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

function SideGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2.5">
      <div className="mb-1.5 text-xs font-medium text-neutral-700">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
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
