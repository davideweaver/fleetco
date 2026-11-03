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

const SCREENS = [
  { key: "customers", label: "Customers (list → detail)", path: "/app/customers/ridgeline" },
  { key: "customers-empty", label: "Customers (nothing selected)", path: "/app/customers" },
  { key: "jobs", label: "Job detail (G-1048)", path: "/app/jobs/G-1048" },
  { key: "board", label: "Job board (wide, no list)", path: "/app/board" },
  { key: "reports", label: "Reports (sections list)", path: "/app/reports/ar-aging" },
  { key: "form", label: "Form in a panel (new job)", path: "/app/jobs?overlay=form" },
  { key: "form-errors", label: "Form with errors", path: "/app/jobs?overlay=form-errors" },
  { key: "states", label: "Loading / empty / error / not found", path: "/app/_states" },
  { key: "panel", label: "Detail panel (from the board)", path: "/app/board?overlay=panel" },
  { key: "dialog", label: "Dialog (close job)", path: "/app/jobs/G-1048?overlay=dialog" },
  { key: "schedule", label: "Schedule (wide)", path: "/app/schedule" },
  { key: "time", label: "Time & payroll (wide)", path: "/app/time" },
];

export function Lab() {
  const [variant, setVariant] = useState<"rail" | "sidebar">("rail");
  const [rail, setRail] = useState<"expanded" | "collapsed">("collapsed");
  const [badges, setBadges] = useState<"off" | "quiet" | "busy">("quiet");
  const [role, setRole] = useState<"owner" | "tech">("owner");
  const [screen, setScreen] = useState(SCREENS[0]);
  const [scale, setScale] = useState(0.45);
  const [dark, setDark] = useState(false);
  const [palette, setPalette] = useState<"neutral" | "warm">("warm");

  const src = (extra = "") =>
    `${screen.path}${screen.path.includes("?") ? "&" : "?"}v=${variant}&role=${role}&rail=${rail}&badges=${badges}&palette=${palette}${dark ? "&theme=dark" : ""}${extra}`;

  return (
    <div className="flex h-full flex-col bg-neutral-100 text-neutral-900">
      <header className="shrink-0 border-b border-neutral-300 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div>
            <div className="text-sm font-semibold">FleetCo device lab</div>
            <div className="text-xs text-neutral-500">
              Nav shape comparison · V1 graphics
            </div>
          </div>

          <Group label="Nav shape">
            <Seg on={variant === "rail"} onClick={() => setVariant("rail")}>
              Rail + second column
            </Seg>
            <Seg on={variant === "sidebar"} onClick={() => setVariant("sidebar")}>
              Sidebar only
            </Seg>
          </Group>

          <Group label="Rail">
            <Seg on={rail === "collapsed"} onClick={() => setRail("collapsed")}>Collapsed</Seg>
            <Seg on={rail === "expanded"} onClick={() => setRail("expanded")}>Expanded</Seg>
          </Group>

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

        <div className="mt-3 flex flex-wrap gap-1.5">
          {SCREENS.map((s) => (
            <Seg key={s.key} on={s.key === screen.key} onClick={() => setScreen(s)}>
              {s.label}
            </Seg>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="flex items-start gap-5">
          {DEVICES.map((d) => (
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
                  key={`${d.key}-${variant}-${rail}-${role}-${badges}-${palette}-${screen.key}-${dark}`}
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
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
