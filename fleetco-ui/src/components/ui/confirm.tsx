import { useState } from "react";
import { Overlay } from "./overlay";
import { Btn } from "@/shell/ListDetailLayout";
import { Field, TextArea } from "./field";
import { cn } from "@/lib/utils";

/**
 * A decision that cannot be undone and has to be explained.
 *
 * Four rules want exactly this shape — `INV-012` voiding, `JOB-011` cancelling,
 * `AUTH-004` override, `TIME-008` time corrections — so it is one component rather than
 * four improvisations.
 *
 * Three things it does that a plain confirm does not:
 *
 *   1. States the CONSEQUENCE, not just the question. "Are you sure?" is not a sentence
 *      anyone can act on.
 *   2. Requires a typed reason, and keeps the action disabled until there is one. The
 *      reason is part of the permanent record (AUTH-003, AUTH-004), so an empty one is
 *      not a valid answer.
 *   3. Never makes the destructive choice the easy one. The confirm button carries the
 *      weight; Cancel is plain and first.
 */
export function ConfirmWithReason({
  open,
  onOpenChange,
  eyebrow,
  title,
  consequence,
  reasonLabel = "Reason",
  reasonHint,
  confirmLabel,
  tone = "destructive",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eyebrow?: string;
  title: string;
  consequence: React.ReactNode;
  reasonLabel?: string;
  reasonHint?: string;
  confirmLabel: string;
  tone?: "destructive" | "warning";
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const ready = reason.trim().length > 0;

  return (
    <Overlay
      kind="dialog"
      open={open}
      onOpenChange={(v) => {
        if (!v) setReason("");
        onOpenChange(v);
      }}
      eyebrow={eyebrow}
      title={title}
      footer={
        <>
          <Btn>Cancel</Btn>
          <button
            type="button"
            disabled={!ready}
            onClick={() => {
              onConfirm(reason.trim());
              setReason("");
              onOpenChange(false);
            }}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white",
              tone === "destructive"
                ? "border-destructive bg-destructive"
                : "border-warning bg-warning",
              !ready && "cursor-not-allowed opacity-40"
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-4 p-4">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          {consequence}
        </div>
        <Field
          label={reasonLabel}
          hint={reasonHint ?? "Kept on the record permanently. It cannot be edited later."}
        >
          {({ id }) => (
            <TextArea
              id={id}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why?"
            />
          )}
        </Field>
      </div>
    </Overlay>
  );
}
