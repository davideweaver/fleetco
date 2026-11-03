import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The four states every screen has and nobody remembers to design. They live here so
 * eight lanes do not invent four of them each — factory gate 8 expects a screenshot of
 * every one of these per UI card.
 */

/**
 * Skeletons, not a spinner. A spinner says "something is happening"; a skeleton says
 * what is about to appear and holds the layout, so the page does not jump when it lands.
 */
export function LoadingRows({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border/60 px-3 py-2.5">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Pulse className="h-3.5 w-[60%]" />
            <Pulse className="h-3 w-[40%]" />
          </div>
          <div className="space-y-1.5 text-right">
            <Pulse className="ml-auto h-3.5 w-16" />
            <Pulse className="ml-auto h-3 w-10" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

function Pulse({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} />;
}

/** Empty says what is missing and offers the one action that fixes it. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid flex-1 place-items-center p-8">
      <div className="max-w-xs text-center">
        <Inbox className="mx-auto size-7 text-muted-foreground" strokeWidth={1.5} />
        <h3 className="mt-3 text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

/**
 * Error says what failed and offers a retry. It never prints the raw error: a stack
 * trace tells Cam nothing and tells an attacker something.
 */
export function ErrorState({
  title = "That did not load",
  body = "The shop system could not reach the server. Your work is not lost.",
  onRetry,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="grid flex-1 place-items-center p-8">
      <div className="max-w-xs text-center">
        <AlertTriangle className="mx-auto size-7 text-destructive" strokeWidth={1.5} />
        <h3 className="mt-3 text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <RotateCw className="size-4" />
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A technician who types a URL for someone else's job gets NOT FOUND, not "forbidden".
 *
 * ROLE-003 enforces assignment "across lists, Kanban, calendar, job records and direct
 * URL access". Saying "you do not have access to this job" confirms the job exists and
 * leaks its number; saying it is not found tells the only person who should care — the
 * one who mistyped — exactly as much as they need.
 */
export function NotFoundState({ what = "job" }: { what?: string }) {
  return (
    <div className="grid flex-1 place-items-center p-8">
      <div className="max-w-xs text-center">
        <h3 className="text-sm font-semibold">No such {what}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          It may have been closed, or the link may be wrong.
        </p>
      </div>
    </div>
  );
}
