import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Overlay } from "./overlay";
import { Field, TextArea } from "./field";
import { Btn } from "@/shell/ListDetailLayout";
import { at, hours } from "@/data/time";
import { cn } from "@/lib/utils";

/**
 * Correcting a time entry — `TIME-008`.
 *
 * The rule has three parts and all three are load-bearing:
 *
 *   1. A user with `time.correct` (Owner in V1) can **change the entry**. Not approve
 *      it, not comment on it — change the numbers.
 *   2. The reason is **required**.
 *   3. The before and after values are **both kept**.
 *
 * The first part is the one worth stating, because it is what makes the flag on the
 * review screen legitimate. A badge that points at something nobody can resolve is a
 * dead end, and an earlier version of this dialog captured a reason without letting
 * anyone touch the times — so the entry stayed flagged and the badge never cleared.
 *
 * Clocks are typed, not picked. A correction is "he actually left at 16:00", which is
 * four keystrokes; a picker would be slower than the thing it replaces.
 */
export function CorrectTimeDialog({
  open,
  onOpenChange,
  what,
  when,
  start,
  end,
  endRequired,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** What is being corrected — "Technician 2 · punch" or the job. */
  what: string;
  when: string;
  start: number;
  /** null for a punch or timer still running: the correction is to close it. */
  end: number | null;
  endRequired?: boolean;
  onSave: (next: { start: number; end: number; reason: string }) => void;
}) {
  const [from, setFrom] = useState(at(start));
  const [to, setTo] = useState(end === null ? "" : at(end));
  const [reason, setReason] = useState("");

  const fromMin = parseClock(from);
  const toMin = parseClock(to);
  const backwards = fromMin !== null && toMin !== null && toMin < fromMin;
  const ready =
    fromMin !== null && toMin !== null && !backwards && reason.trim().length > 0;

  return (
    <Overlay
      kind="dialog"
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setFrom(at(start));
          setTo(end === null ? "" : at(end));
          setReason("");
        }
        onOpenChange(v);
      }}
      eyebrow={when}
      title="Correct this entry"
      footer={
        <>
          <Btn>Cancel</Btn>
          <button
            type="button"
            disabled={!ready}
            onClick={() => {
              if (!ready) return;
              onSave({ start: fromMin!, end: toMin!, reason: reason.trim() });
              setReason("");
              onOpenChange(false);
            }}
            className={cn(
              "rounded-md border border-warning bg-warning px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white",
              !ready && "cursor-not-allowed opacity-40"
            )}
          >
            Save correction
          </button>
        </>
      }
    >
      <div className="space-y-4 p-4">
        <div className="text-sm font-medium">{what}</div>

        {/* Top-aligned: the hint under "To" is taller than "From", and bottom-aligning
            floated the two labels onto different lines. */}
        <div className="flex items-start gap-2">
          <Field label="From">
            {({ id }) => <Clock id={id} value={from} onChange={setFrom} />}
          </Field>
          <ArrowRight className="mt-9 size-4 shrink-0 text-muted-foreground" />
          <Field
            label="To"
            hint={endRequired ? "Still running — this closes it." : undefined}
          >
            {({ id }) => (
              <Clock id={id} value={to} onChange={setTo} invalid={backwards} />
            )}
          </Field>
        </div>

        {backwards ? (
          <p className="text-sm text-destructive">
            The end is before the start. Overnight entries are split into two days.
          </p>
        ) : (
          ready || (fromMin !== null && toMin !== null) ? (
            <p className="tnum text-sm text-muted-foreground">
              New duration: <span className="font-medium text-foreground">
                {hours(toMin! - fromMin!)} h
              </span>
              {end !== null && (
                <> · was {hours(end - start)} h</>
              )}
            </p>
          ) : null
        )}

        <Field
          label="Why are you changing it?"
          hint="Required. Kept on the record with the original times."
        >
          {({ id }) => (
            <TextArea
              id={id}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Jason confirmed he left at 4."
            />
          )}
        </Field>

        {/* TIME-008's third part, said plainly. The technician who flagged this will see
            that it changed and who changed it — a correction they cannot see is
            indistinguishable from being ignored. */}
        <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          The original {end === null ? "open entry" : `${at(start)}–${at(end)}`} is kept
          beside your change, with your name and this reason. Nothing is overwritten.
        </p>
      </div>
    </Overlay>
  );
}

/** `HH:MM`, or null while it is not one yet. */
function parseClock(v: string): number | null {
  const m = /^(\d{1,2}):?(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function Clock({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  const bad = value.trim() !== "" && parseClock(value) === null;
  return (
    <input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="16:00"
      inputMode="numeric"
      aria-invalid={bad || invalid}
      className={cn(
        "tnum h-9 w-24 rounded-md border px-2.5 text-sm",
        (bad || invalid) && "border-destructive"
      )}
    />
  );
}
