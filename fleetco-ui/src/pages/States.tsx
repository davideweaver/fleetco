import { Btn } from "@/shell/ListDetailLayout";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  NotFoundState,
} from "@/components/ui/states";

/**
 * All four states side by side, so they can be judged against each other. Lives in the
 * detail pane of Settings' demo section — see Sections.tsx.
 */
export function StatesDemo() {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Loading">
          <LoadingRows rows={4} />
        </Card>
        <Card title="Empty">
          <EmptyState
            title="No open jobs"
            body="Everything in graphics is closed. Nice."
            action={<Btn primary>New job</Btn>}
          />
        </Card>
        <Card title="Error">
          <ErrorState onRetry={() => {}} />
        </Card>
        <Card title="Not found / not yours">
          <NotFoundState what="job" />
        </Card>
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-surface-3">
      <div className="border-b px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="flex min-h-56 flex-col">{children}</div>
    </div>
  );
}
