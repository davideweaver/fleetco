import { AlertTriangle, Camera, Check, RotateCw, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Job photos.
 *
 * The design brief is G13, almost word for word: "what happens when a 40-photo upload
 * dies at photo 31 on shop wifi". That single sentence rules out the obvious answer —
 * a batch progress bar — because a batch bar cannot tell Jason WHICH photo failed, and
 * JOB-008 means a missing completion photo is what stops him finishing the job.
 *
 * So: PER-PHOTO state, retryable one at a time or all at once.
 *
 * Second decision: a failed upload is NOT an error state for the screen. `ErrorState`
 * would blank the gallery and hide the eleven photos that did land. The tile carries its
 * own failure and everything else stays usable.
 */
/**
 * Four live states and one terminal one.
 *
 *   queued      Before the bytes move. Forty photos and a few parallel uploads means
 *               most of them sit here. Shown as an EMPTY track — nothing is happening to
 *               this photo yet, and a moving bar would claim otherwise.
 *   uploading   Determinate. The only phase that knows how far along it is.
 *   confirming  Bytes have landed; the server has not said it kept them. No percentage
 *               exists, so this one sweeps.
 */
export type PhotoState = "done" | "queued" | "uploading" | "confirming" | "failed";
export type PhotoTag = "before" | "progress" | "completion" | "condition";

export type Photo = {
  id: string;
  tag: PhotoTag;
  state: PhotoState;
  /** 0–100, only meaningful while uploading. */
  progress?: number;
  /** Lab-only: ticks remaining before `confirming` resolves. Not a real field. */
  confirmTicks?: number;
  /** Shown on the tile so a stalled upload is explicable, not mysterious. */
  sizeKb?: number;
};

const TAG_LABEL: Record<PhotoTag, string> = {
  before: "Before",
  progress: "Progress",
  completion: "Completion",
  condition: "Condition",
};

export function PhotoGrid({
  photos,
  onRetry,
  onRetryAll,
  onRemove,
  onAdd,
}: {
  photos: Photo[];
  onRetry?: (id: string) => void;
  onRetryAll?: () => void;
  onRemove?: (id: string) => void;
  onAdd?: () => void;
}) {
  const failed = photos.filter((p) => p.state === "failed");
  const pending = photos.filter((p) => p.state !== "done" && p.state !== "failed");

  return (
    <div className="p-3">
      {/* One line of truth about the batch, above the grid. Counts, not a bar: a bar
          implies the whole thing succeeds or fails together, and it does not. */}
      {(failed.length > 0 || pending.length > 0) && (
        <div
          className={cn(
            "mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs",
            failed.length > 0 ? "border-destructive/40 bg-destructive/5" : "bg-muted/40"
          )}
        >
          {failed.length > 0 ? (
            <>
              <AlertTriangle className="size-4 shrink-0 text-destructive" />
              <span className="font-medium">
                {failed.length} of {photos.length} did not upload
              </span>
              <span className="text-muted-foreground">
                They are still on this device. Nothing is lost.
              </span>
              {onRetryAll && (
                <button
                  type="button"
                  onClick={onRetryAll}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-medium hover:bg-accent"
                >
                  <RotateCw className="size-3.5" />
                  Retry {failed.length}
                </button>
              )}
            </>
          ) : (
            <>
              <RotateCw className="size-4 shrink-0 animate-spin text-muted-foreground" />
              <span>
                Uploading {pending.length} of {photos.length}. You can keep working.
              </span>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="grid aspect-square place-items-center rounded-lg border border-dashed text-muted-foreground hover:border-brand hover:text-brand"
          >
            <span className="text-center">
              <Camera className="mx-auto size-5" strokeWidth={1.75} />
              <span className="mt-1 block text-[11px]">Add</span>
            </span>
          </button>
        )}
        {photos.map((p) => (
          <Tile key={p.id} photo={p} onRetry={onRetry} onRemove={onRemove} />
        ))}
      </div>
    </div>
  );
}

function Tile({
  photo,
  onRetry,
  onRemove,
}: {
  photo: Photo;
  onRetry?: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  const failed = photo.state === "failed";

  return (
    <div
      className={cn(
        "relative aspect-square overflow-hidden rounded-lg border bg-muted",
        failed && "border-destructive/50",
        photo.state !== "done" && "opacity-90"
      )}
    >
      {!failed && (
        <div className="grid h-full place-items-center text-[11px] text-muted-foreground">
          photo
        </div>
      )}

      {/* The tag is the thing JOB-008 reads, so it is always legible, never on hover.
          It only goes brand-filled once the photo has ARRIVED. Amber means "this one
          counts" everywhere else in the app, and a completion photo still sitting in the
          queue does not count — colouring it early promises what the gate refuses. */}
      <span
        className={cn(
          "absolute left-1 top-1 rounded px-1 py-px text-[9px] font-medium uppercase tracking-wide",
          photo.tag === "completion" && photo.state === "done"
            ? "bg-brand text-brand-foreground"
            : "bg-surface-3/90 text-muted-foreground"
        )}
      >
        {TAG_LABEL[photo.tag]}
      </span>



      {/* One band, one height, and always a bar — never a bar that turns into words.
          The tile goes queued -> uploading -> confirming without the status changing
          shape, so a grid of them does not twitch as uploads land. */}
      {(photo.state === "queued" ||
        photo.state === "uploading" ||
        photo.state === "confirming") && (
        <div className="absolute inset-x-0 bottom-0 flex h-5 items-center bg-foreground/70 px-1.5">
          <div className="h-1 w-full overflow-hidden rounded-full bg-background/30">
            {/* queued: an EMPTY track. Nothing is happening to this photo yet, and a
                moving bar would say otherwise. The track alone says "in the queue". */}
            {photo.state === "uploading" && (
              <div
                className="h-full rounded-full bg-background transition-all"
                style={{ width: `${photo.progress ?? 0}%` }}
              />
            )}
            {photo.state === "confirming" && (
              <div className="band-sweep h-full w-[28%] rounded-full bg-background/80" />
            )}
          </div>
        </div>
      )}

      {failed && (
        <button
          type="button"
          onClick={() => onRetry?.(photo.id)}
          className="absolute inset-0 grid place-items-center bg-destructive/10 text-destructive"
        >
          <span className="text-center">
            <RotateCw className="mx-auto size-4" />
            <span className="mt-0.5 block text-[10px] font-medium">Retry</span>
            {photo.sizeKb && (
              <span className="block text-[9px] opacity-70">{photo.sizeKb} KB</span>
            )}
          </span>
        </button>
      )}

      {/* Discard. Rendered last so it sits above the full-tile retry target, and present
          on a failed tile as well as a landed one: retrying nine failures on bad wifi is
          only sensible if the three you no longer want can leave the queue. */}
      {(photo.state === "done" || failed) && onRemove && (
        <button
          type="button"
          onClick={() => onRemove(photo.id)}
          aria-label={failed ? "Discard this photo" : "Remove photo"}
          className={cn(
            "absolute right-1 top-1 z-10 grid size-5 place-items-center rounded-full text-background",
            failed ? "bg-destructive" : "bg-foreground/60"
          )}
        >
          <X className="size-3" />
        </button>
      )}

      {photo.state === "done" && photo.tag === "completion" && (
        <span className="absolute bottom-1 right-1 grid size-4 place-items-center rounded-full bg-brand text-brand-foreground">
          <Check className="size-2.5" strokeWidth={3} />
        </span>
      )}
    </div>
  );
}

/**
 * JOB-008: work cannot be marked finished without at least one photo tagged as a
 * completion photo — and crucially, one that has actually ARRIVED. A completion photo
 * sitting in a failed upload queue is not evidence of anything.
 */
export function hasUploadedCompletionPhoto(photos: Photo[]) {
  return photos.some((p) => p.tag === "completion" && p.state === "done");
}
