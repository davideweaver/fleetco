import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, Camera, Play } from "lucide-react";
import { isOpenJob, jobs, longJobs, STAGES, wrapComponents, wrapPriceCents } from "@/data/sample";
import { useShell } from "@/shell/shell-context";
import {
  Btn,
  DetailHeader,
  ListDetailLayout,
  ListHeader,
  ListRow,
  ListTail,
  Pill,
} from "@/shell/ListDetailLayout";
import { attentionMap } from "@/nav/attention";
import { StatusPill } from "@/components/ui/status-pill";
import { Overlay } from "@/components/ui/overlay";
import { PhotoGrid, hasUploadedCompletionPhoto, type Photo } from "@/components/ui/photos";
import { useTimeClock } from "@/components/ui/timer";
import { nameOf, punches } from "@/data/time";
import { toast } from "sonner";
import { NewJobPanel } from "./NewJob";
import { Section, Stat, Td, Th } from "./Customers";
import { cn, money } from "@/lib/utils";

/** One page of rows. See `ListTail` for why it is 25 and not 50. */
const PAGE = 25;

export function JobsPage() {
  const { id } = useParams();
  const { href, role } = useShell();
  const [params] = useSearchParams();
  const overlay = params.get("overlay");
  const [creating, setCreating] = useState(overlay === "form" || overlay === "form-errors");
  // Lab only: `?seed=long` swaps in a year of history so the list column can be judged
  // at a length the seven story jobs cannot show. Same screen, same components.
  const all = params.get("seed") === "long" ? longJobs : jobs;
  // ROLE-003: a technician sees only their assigned jobs, in the list and by URL.
  const visible = role === "tech" ? all.filter((j) => j.who === "T1") : all;
  const needs = attentionMap("jobs", role);
  const [onlyAttention, setOnlyAttention] = useState(false);
  // The scope has to contain whatever the URL selected, or you follow a link to a
  // finished job and the list beside it does not have the row you are looking at.
  // The default is the working set; the link wins over the default.
  const [scope, setScope] = useState(() => {
    const target = id && all.find((j) => j.no === id);
    return target && !isOpenJob(target) ? "closed" : "open";
  });
  const [shown, setShown] = useState(PAGE);

  const scopes = [
    { key: "open", label: "Open" },
    { key: "closed", label: "Closed" },
    { key: "all", label: "All" },
  ];

  const inScope = onlyAttention
    ? visible.filter((j) => needs.has(j.no))
    : scope === "all"
      ? visible
      : visible.filter((j) => (scope === "open" ? isOpenJob(j) : !isOpenJob(j)));
  // Paging is a property of the list you are looking at, so changing the slice starts
  // it over. Keeping the old depth meant switching to Closed and landing 200 rows in.
  const rows = inScope.slice(0, shown);
  const selected = visible.find((j) => j.no === id);

  const reslice = (fn: () => void) => {
    fn();
    setShown(PAGE);
  };

  return (
    <ListDetailLayout
      hasSelection={Boolean(selected)}
      backTo="/app/jobs"
      empty="Pick a job."
      list={
        <>
          <ListHeader
            title={role === "tech" ? "My jobs" : "Jobs"}
            count={inScope.length}
            attention={needs.size}
            filtered={onlyAttention}
            onFilter={(v) => reslice(() => setOnlyAttention(v))}
            scopes={scopes}
            scope={scope}
            onScope={(k) => reslice(() => setScope(k))}
            action={
              role === "owner" ? (
                <span onClick={() => setCreating(true)}>
                  <Btn primary>New</Btn>
                </span>
              ) : undefined
            }
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.map((j) => (
              <ListRow
                key={j.no}
                to={href(`/app/jobs/${j.no}`)}
                selected={j.no === id}
                title={`${j.no} · ${j.what}`}
                subtitle={j.customer}
                status={<StatusPill section="jobs" id={j.no} status={STAGES[j.stage]} />}
                meta={role === "owner" ? money(j.valueCents) : undefined}
                metaSub={j.priority !== "Normal" ? j.priority : j.date}
              />
            ))}
            <ListTail
              shown={rows.length}
              total={inScope.length}
              page={PAGE}
              onMore={() => setShown((n) => n + PAGE)}
            />
          </div>
        </>
      }
      detail={selected && <JobDetail no={selected.no} />}
      after={
        <NewJobPanel
          open={creating}
          onOpenChange={setCreating}
          showErrors={overlay === "form-errors"}
        />
      }
    />
  );
}

function JobDetail({ no }: { no: string }) {
  const { role } = useShell();
  const [params] = useSearchParams();
  // Looks in the same set the list drew from, or every seeded row 404s on click.
  const j = (params.get("seed") === "long" ? longJobs : jobs).find((x) => x.no === no)!;
  const [open, setOpen] = useState(false);
  // A decision that blocks you: a dialog, not a panel.
  const [closing, setClosing] = useState(params.get("overlay") === "dialog");
  const clock = useTimeClock(punches.find((p) => p.id === "p3")!.in, null);
  const owner = role === "owner";
  const [photos, setPhotos] = useState<Photo[]>(() => seedPhotos(params.get("photos")));
  const canFinish = hasUploadedCompletionPhoto(photos);

  const added = useRef(0);

  const retry = (id: string) =>
    setPhotos((all) =>
      all.map((p) => (p.id === id ? { ...p, state: "queued", retried: true } : p))
    );
  const retryAll = () =>
    setPhotos((all) =>
      all.map((p) => (p.state === "failed" ? { ...p, state: "queued", retried: true } : p))
    );

  /**
   * Lab-only upload simulator, so the lifecycle can be watched rather than described.
   * Two at a time, so the queue visibly drains; every third photo fails, so the failure
   * path shows up without waiting on luck.
   */
  const add = () => {
    const n = added.current++;
    setPhotos((all) => [
      ...all,
      {
        id: `n${n}`,
        // Tag the first one Completion so the JOB-008 gate can be seen unlocking.
        // Checked against ANY state, not just done: photos are added faster than they
        // upload, so waiting for one to land tagged the whole batch Completion.
        tag: all.some((p) => p.tag === "completion") ? "progress" : "completion",
        state: "queued",
      },
    ]);
  };

  /**
   * Lab: the lifecycle demo opens on an empty job and adds ONE photo, so the band can be
   * watched go queued -> uploading -> confirming -> done without five others competing
   * for attention. Press Add for more; the third one fails, which is the other path.
   */
  // NO ref guard here. StrictMode runs effect -> cleanup -> effect in development, and a
  // ref latched on the first pass made the second pass bail out, so the photo was never
  // added under `npm run dev` while working fine in a production build. The timer plus
  // its cleanup is already idempotent: the first timer is cleared before it fires.
  useEffect(() => {
    if (params.get("photos") !== "demo") return;
    const timer = setTimeout(add, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setPhotos((all) => {
        const active = all.filter(
          (p) => p.state === "uploading" || p.state === "confirming"
        ).length;
        let slots = Math.max(0, 2 - active);

        return all.map((p) => {
          if (p.state === "queued" && slots > 0) {
            slots -= 1;
            return { ...p, state: "uploading" as const, progress: 0 };
          }
          if (p.state === "uploading") {
            const next = (p.progress ?? 0) + 9 + Math.random() * 9;
            return next >= 100
              ? { ...p, state: "confirming" as const, progress: 100, confirmTicks: 5 }
              : { ...p, progress: next };
          }
          if (p.state === "confirming") {
            const left = (p.confirmTicks ?? 0) - 1;
            if (left > 0) return { ...p, confirmTicks: left };
            // Lab: a retry always lands, so the recovery path can be walked without
            // fighting the simulator.
            const failed = !p.retried && Number(p.id.replace(/\D/g, "")) % 5 === 2;
            return failed
              ? { ...p, state: "failed" as const, sizeKb: 2100 + ((Number(p.id.replace(/\D/g, "")) * 137) % 900) }
              : { ...p, state: "done" as const };
          }
          return p;
        });
      });
    }, 180);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <DetailHeader
        eyebrow={`Job · ${j.customer}`}
        title={`${j.no} · ${j.what}`}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill section="jobs" id={j.no} status={STAGES[j.stage]} />
            {j.priority !== "Normal" && <Pill tone="warn">{j.priority}</Pill>}
            <span>{j.asset}</span>
            <span>·</span>
            <span>Due {j.date}</span>
          </span>
        }
        actions={
          owner ? (
            <>
              <Btn>Move stage</Btn>
              <span onClick={() => setClosing(true)}>
                <Btn primary>Close job</Btn>
              </span>
            </>
          ) : (
            <>
              <Btn>
                <span className="flex items-center gap-1.5">
                  <Camera className="size-4" /> Add photo
                </span>
              </Btn>
              {/* Same state machine as the clock on Today. A timer started from a job and one
                  started from the time screen have to obey TIME-002/004/014
                  identically, which they cannot if each screen implements start. */}
              <span
                onClick={() =>
                  clock.start({ jobNo: j.no, activity: null, closed: j.closed })
                }
              >
                <Btn primary>
                  <span className="flex items-center gap-1.5">
                    <Play className="size-4" /> Start this job
                  </span>
                </Btn>
              </span>
            </>
          )
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-px border-b bg-border">
        <Stat label="Assigned" value={nameOf(j.who)} />
        <Stat label="Production" value="Nov 1" />
        <Stat label="Installation" value={j.date} />
        {owner && <Stat label="Job value" value={money(j.valueCents)} />}
      </div>

      <Section title="Scope">
        <div className="p-3 text-sm">
          Full vehicle wrap, printed and laminated, installed on site. Customer supplied
          logo artwork; proof approved October 28.
        </div>
      </Section>

      {/* EST-002 / G7: the customer sees one rolled-up line, the shop sees every component.
          ROLE-005: a technician sees neither cost nor margin. */}
      <Section title={owner ? "Estimate line and components" : "What's on this job"}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <Th>Item</Th>
              <Th right className="hidden sm:table-cell">Qty</Th>
              {owner && <Th right className="hidden lg:table-cell">Cost</Th>}
              {owner && <Th right>Price</Th>}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b bg-muted/40">
              <Td>
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  className="flex items-center gap-1.5 font-medium"
                >
                  {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  Unit 14 · full wrap
                </button>
              </Td>
              <Td right className="hidden sm:table-cell">1</Td>
              {owner && <Td right className="hidden lg:table-cell">{money(77130)}</Td>}
              {owner && <Td right className="font-semibold">{money(wrapPriceCents)}</Td>}
            </tr>
            {open &&
              wrapComponents.map((c) => (
                <tr key={c.item} className="border-b last:border-0 text-muted-foreground">
                  <Td className="pl-9">{c.item}</Td>
                  <Td right className="hidden sm:table-cell">
                    {c.qty} {c.unit}
                  </Td>
                  {owner && (
                    <Td right className="hidden lg:table-cell">{money(c.qty * c.costCents)}</Td>
                  )}
                  {owner && <Td right>{money(c.qty * c.priceCents)}</Td>}
                </tr>
              ))}
          </tbody>
        </table>
      </Section>

      <Section title="Photos">
        <PhotoGrid
          photos={photos}
          onRetry={retry}
          onRetryAll={retryAll}
          onRemove={(id) => setPhotos((all) => all.filter((p) => p.id !== id))}
          onAdd={add}
        />
      </Section>

      {/* JOB-008 as the three-beat refusal: the reason is visible BEFORE the attempt,
          the attempt is refused, and the toast repeats why. A technician on a shop floor
          should not have to guess which of forty photos is holding up his afternoon. */}
      {!owner && (
        <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3 lg:px-5">
          <button
            type="button"
            onClick={() =>
              canFinish
                ? toast.success("Work marked finished", {
                    description: "Sent to the owner to check.",
                  })
                : toast.error("Cannot finish yet", {
                    description: "A completion photo has to finish uploading first.",
                  })
            }
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium",
              canFinish
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground"
            )}
          >
            Mark work finished
          </button>
          {!canFinish && (
            <span className="text-xs text-muted-foreground">
              Needs a completion photo that has finished uploading.
            </span>
          )}
        </div>
      )}

      <Overlay
        kind="dialog"
        open={closing}
        onOpenChange={setClosing}
        eyebrow={`Job · ${j.no}`}
        title="Close this job?"
        footer={
          <>
            <Btn>Cancel</Btn>
            <Btn primary>Close job</Btn>
          </>
        }
      >
        <div className="space-y-3 p-4 text-sm">
          <p>
            Closing creates one draft invoice from the authorized lines. Nothing is sent
            to the customer until you review it.
          </p>
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">Authorized total</span>
              <span className="tnum font-semibold">{money(j.valueCents)}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-muted-foreground">Deposit applied</span>
              <span className="tnum">{money(Math.round(j.valueCents / 2))}</span>
            </div>
          </div>
          <p className="text-muted-foreground">JOB-009 · one draft invoice per billable job.</p>
        </div>
      </Overlay>
    </div>
  );
}

/** `?photos=` lets the lab shoot the states that are hard to reach on purpose. */
function seedPhotos(mode: string | null): Photo[] {
  // The lifecycle demo starts with nothing, so the whole arc can be watched.
  if (mode === "demo") return [];
  if (mode === "uploading")
    return [
      { id: "p1", tag: "before", state: "done" },
      { id: "p2", tag: "before", state: "done" },
      { id: "p3", tag: "progress", state: "uploading", progress: 62 },
      { id: "p4", tag: "progress", state: "confirming" },
      { id: "p5", tag: "completion", state: "queued" },
    ];
  if (mode === "failed")
    return [
      { id: "p1", tag: "before", state: "done" },
      { id: "p2", tag: "before", state: "done" },
      { id: "p3", tag: "progress", state: "done" },
      { id: "p4", tag: "progress", state: "failed", sizeKb: 2180 },
      { id: "p5", tag: "completion", state: "failed", sizeKb: 2640 },
      { id: "p6", tag: "completion", state: "queued" },
    ];
  return [
    { id: "p1", tag: "before", state: "done" },
    { id: "p2", tag: "before", state: "done" },
    { id: "p3", tag: "progress", state: "done" },
    { id: "p4", tag: "completion", state: "done" },
  ];
}
