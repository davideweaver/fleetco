import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One overlay primitive, two presentations. Both are a Radix Dialog underneath, so
 * focus trapping, escape, scroll lock and the aria wiring are identical and are not
 * each lane's problem.
 *
 *   DIALOG  a decision or a short form that blocks you. You answer, then carry on.
 *           Centred on a desktop, full screen on a phone.
 *           "Close this job?", "Record approval", "Void invoice — reason?"
 *
 *   PANEL   inspecting or editing a record while its context stays on screen behind.
 *           From the right on a desktop, up from the bottom on a phone.
 *           A card on the board, an entry on the schedule, a row on a timesheet.
 *
 * The rule that keeps agents from guessing: **a list section never uses a panel.** Those
 * screens already have a detail pane, and a panel on top of it is a second detail view
 * of the same record. Panels exist for `pane: "wide"` screens, which have no detail pane.
 */
export function Overlay({
  kind,
  open,
  onOpenChange,
  title,
  eyebrow,
  footer,
  children,
}: {
  kind: "dialog" | "panel";
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  eyebrow?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const panel = kind === "panel";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/25" />
        <Dialog.Content
          className={cn(
            "fixed z-50 flex flex-col bg-surface-3 shadow-xl outline-none",
            panel
              ? // Phone: a sheet up from the bottom, capped so the context stays visible.
                // Desktop: full height from the right.
                "inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl pad:inset-y-0 pad:left-auto pad:right-0 pad:max-h-none pad:w-[26rem] pad:rounded-none lg:w-[30rem]"
              : // Phone: full screen, because a centred card on a 390px screen is a
                // postage stamp with a keyboard over it.
                "inset-0 pad:inset-auto pad:left-1/2 pad:top-1/2 pad:max-h-[85vh] pad:w-[30rem] pad:-translate-x-1/2 pad:-translate-y-1/2 pad:rounded-xl"
          )}
        >
          <div className="flex h-band shrink-0 items-center gap-3 border-b px-4">
            <div className="min-w-0 flex-1">
              {eyebrow && (
                <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {eyebrow}
                </div>
              )}
              <Dialog.Title className="truncate text-base font-semibold leading-tight">
                {title}
              </Dialog.Title>
            </div>
            {/* 40px, same as a form control: this is the escape hatch, and on an iPad it
                is hit with a thumb. A 32px target in the corner of a dialog is the one
                nobody can reach in a hurry. */}
            <Dialog.Close
              aria-label="Close"
              className="grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="size-6" strokeWidth={1.75} />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

          {footer && (
            <div className="flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
