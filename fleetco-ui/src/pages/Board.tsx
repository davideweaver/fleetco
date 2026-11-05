import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { jobs as seedJobs, STAGES, type Job } from "@/data/sample";
import { useShell } from "@/shell/shell-context";
import { PageHeader, Pill } from "@/shell/ListDetailLayout";
import { cn, money } from "@/lib/utils";

/**
 * The job board.
 *
 * Rules it has to obey, and how each one shows up:
 *
 *   JOB-004  Six stages, stored as data. The columns come from STAGES, never hardcoded.
 *   JOB-005  The owner can move a card anywhere — backward, skipping stages — and every
 *            move is audited. So: no "legal next stage" logic, and no disabled columns
 *            except the one case below.
 *   JOB-006  A BILLABLE job with no authorized line cannot enter Ready for production.
 *            Internal and warranty jobs are exempt.
 *   ROLE-008 Whether a technician may move a card is Decision needed (D-C2). Until it is
 *            answered the technician cannot drag, which is the reversible default.
 *
 * No reordering within a column. Nothing in the catalogue gives a card a position inside
 * a stage, and inventing one would be inventing a rule.
 */
export function BoardPage({ onPick }: { onPick: (j: Job) => void }) {
  const { role } = useShell();
  const owner = role === "owner";
  // JOB-007: closing removes a job from the active board. The board is the shop's
  // working set, not the archive.
  const [jobs, setJobs] = useState(() => seedJobs.filter((j) => !j.closed));
  const [dragging, setDragging] = useState<Job | null>(null);

  // A pointer sensor with a small distance threshold, so a tap still opens the panel and
  // only a deliberate drag starts a move. On a touch screen the two are the same gesture
  // until you commit to one.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const blockedReason = (job: Job, stage: number) =>
    stage === 0 && job.billing === "billable" && !job.hasAuthorizedScope
      ? "Needs an approved line before it can go into production."
      : null;

  const onDragStart = (e: DragStartEvent) =>
    setDragging(jobs.find((j) => j.no === e.active.id) ?? null);

  const onDragEnd = (e: DragEndEvent) => {
    const job = jobs.find((j) => j.no === e.active.id);
    setDragging(null);
    if (!job || e.over == null) return;

    const stage = Number(e.over.id);
    if (stage === job.stage) return;

    const reason = blockedReason(job, stage);
    if (reason) {
      // The card snaps back and the toast says why. Refusing silently is how a user
      // decides the software is broken.
      toast.error(`${job.no} cannot move to ${STAGES[stage]}`, { description: reason });
      return;
    }

    setJobs((all) => all.map((j) => (j.no === job.no ? { ...j, stage } : j)));
    toast.success(`${job.no} moved to ${STAGES[stage]}`, {
      description: "Recorded on the job history.",
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Job board" count={jobs.length} />
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="min-h-0 flex-1 overflow-x-auto p-3">
          <div className="flex h-full min-w-max gap-3">
            {STAGES.map((stage, i) => (
              <Column
                key={stage}
                index={i}
                name={stage}
                jobs={jobs.filter((j) => j.stage === i)}
                owner={owner}
                onPick={onPick}
                draggable={owner}
                blocked={dragging ? Boolean(blockedReason(dragging, i)) : false}
                isSource={dragging?.stage === i}
              />
            ))}
          </div>
        </div>

        {/* A card under the cursor, not a ghost left in place: the thing you are moving
            should be the thing that follows your finger. */}
        <DragOverlay dropAnimation={null}>
          {dragging && <Card job={dragging} owner={owner} dragging />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({
  index,
  name,
  jobs,
  owner,
  onPick,
  draggable,
  blocked,
  isSource,
}: {
  index: number;
  name: string;
  jobs: Job[];
  owner: boolean;
  onPick: (j: Job) => void;
  draggable: boolean;
  blocked: boolean;
  isSource: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: String(index) });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[244px] shrink-0 flex-col rounded-xl border bg-surface-2 transition-colors",
        // A refused target reads as refused BEFORE the drop, not after it.
        blocked && !isSource && "border-dashed opacity-50",
        isOver && !blocked && "border-brand bg-brand/5",
        isOver && blocked && "border-destructive/50"
      )}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="truncate text-xs font-semibold uppercase tracking-wide">{name}</span>
        <span className="tnum ml-auto rounded-full bg-surface-3 px-1.5 text-[11px] text-muted-foreground">
          {jobs.length}
        </span>
      </div>

      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {jobs.map((j) => (
          <Draggable key={j.no} job={j} owner={owner} onPick={onPick} draggable={draggable} />
        ))}
        {jobs.length === 0 && (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">Nothing here</p>
        )}
      </div>
    </div>
  );
}

function Draggable({
  job,
  owner,
  onPick,
  draggable,
}: {
  job: Job;
  owner: boolean;
  onPick: (j: Job) => void;
  draggable: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: job.no,
    disabled: !draggable,
  });

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      {...attributes}
      onClick={() => onPick(job)}
      className={cn("text-left", isDragging && "opacity-30")}
    >
      <Card job={job} owner={owner} />
    </div>
  );
}

function Card({
  job,
  owner,
  dragging,
}: {
  job: Job;
  owner: boolean;
  dragging?: boolean;
}) {
  return (
    <div
      className={cn(
        "cursor-pointer rounded-lg border bg-surface-3 p-2.5 text-sm",
        dragging ? "rotate-1 shadow-lg" : "hover:border-brand/50"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium">{job.no}</span>
        {job.priority !== "Normal" && <Pill tone="warn">{job.priority}</Pill>}
        {job.billing !== "billable" && <Pill tone="muted">{job.billing}</Pill>}
      </div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">{job.customer}</div>
      <div className="mt-1 truncate text-xs">{job.what}</div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="grid size-5 place-items-center rounded-full bg-muted text-[9px] font-semibold">
          {job.who}
        </span>
        <span>{job.date}</span>
        {owner && <span className="tnum ml-auto">{money(job.valueCents)}</span>}
      </div>
    </div>
  );
}
