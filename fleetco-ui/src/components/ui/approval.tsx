import { useEffect, useRef, useState } from "react";
import { Check, ShieldAlert, X } from "lucide-react";
import { Overlay } from "./overlay";
import { Field, Select, TextArea, TextInput } from "./field";
import { Btn, Pill } from "@/shell/ListDetailLayout";
import { cn, money } from "@/lib/utils";

/**
 * Recording a customer's approval.
 *
 * The Rules Catalog calls §5 "the most important section — the record that protects OTC
 * in a dispute", and `AUTH-011` says V1 approvals are recorded by staff rather than
 * clicked by the customer. That makes this form a witness statement, and the design
 * follows from that:
 *
 *   AUTH-002  Records WHO gave it, WHEN they gave it, HOW, and who recorded it.
 *   AUTH-003  Records are permanent. A correction supersedes; both stay visible.
 *   AUTH-004  An override is NOT customer approval, is never shown as one, and needs a
 *             reason.
 *
 * Two deliberate refusals:
 *
 *   - "How" has NO default. Pre-selecting Phone would invent evidence on the customer's
 *     behalf, which is the one thing this record exists not to do.
 *   - "Recorded by you, just now" is SHOWN, not asked. It is required by AUTH-002 and it
 *     is not the user's to choose.
 */
export type ApprovalMethod = "phone" | "email" | "in person" | "text" | "other";

export type ApprovalRecord = {
  id: string;
  kind: "approved" | "declined" | "override";
  /** The customer contact, or absent for an override. */
  contact?: string;
  method?: ApprovalMethod;
  givenAt?: string;
  reason?: string;
  recordedBy: string;
  recordedAt: string;
  supersededBy?: string;
};

/**
 * A checkbox that can say "some of them". `indeterminate` is a DOM property and not an
 * attribute, so it cannot be set in JSX — it has to be written onto the node, which is
 * the whole reason this is a component and not three more lines in the dialog.
 */
function TriCheckbox({
  checked,
  some,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  some: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={onChange}
      className="size-4 disabled:opacity-40"
    />
  );
}

export function ApprovalDialog({
  open,
  onOpenChange,
  lines,
  onRecord,
  eyebrow,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lines: { id: string; name: string; priceCents: number; pending: boolean }[];
  onRecord: (ids: string[], r: Omit<ApprovalRecord, "id">) => void;
  /** Which estimate this is. Named by the caller, because the dialog serves all of them. */
  eyebrow?: string;
}) {
  const pending = lines.filter((l) => l.pending);
  const [picked, setPicked] = useState<Set<string>>(new Set(pending.map((l) => l.id)));
  const [contact, setContact] = useState("");
  const [method, setMethod] = useState<ApprovalMethod | "">("");
  const [reason, setReason] = useState("");
  /**
   * NO default outcome. The lines are all ticked, which AUTH-001 blesses as "approve
   * all" — but a pre-selected Approved on top of that makes "approve everything the
   * customer was offered" the one-click path through the dialog. On a three-line estimate
   * where they agreed to two and refused one, that is the error this record exists to
   * prevent. Same reasoning as the method field: it is evidence, so it is chosen.
   */
  const [kind, setKind] = useState<"approved" | "declined" | "override" | null>(null);

  const override = kind === "override";
  const ready =
    kind === null
      ? false
      : override
        ? picked.size > 0 && reason.trim().length > 0
        : picked.size > 0 && contact.trim().length > 0 && Boolean(method);
  const total = lines.filter((l) => picked.has(l.id)).reduce((a, l) => a + l.priceCents, 0);

  // The submit says what is about to be filed, in the plainest word for it. "Record the
  // answer" was the old name everywhere here, and it described our bookkeeping rather
  // than the thing the Owner came to do — AUTH-011 is why the record exists, not what to
  // call the button.
  const label =
    kind === "approved"
      ? "Save approval"
      : kind === "declined"
        ? "Save decline"
        : kind === "override"
          ? "Save override"
          : "Save";

  return (
    <Overlay
      kind="dialog"
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setReason("");
          setKind(null);
        }
        onOpenChange(v);
      }}
      eyebrow={eyebrow}
      title="Approval"
      footer={
        <>
          <Btn>Cancel</Btn>
          <button
            type="button"
            disabled={!ready}
            onClick={() => {
              if (kind === null) return;
              onRecord([...picked], {
                kind,
                contact: override ? undefined : contact.trim(),
                method: override ? undefined : (method as ApprovalMethod),
                reason: override ? reason.trim() : undefined,
                givenAt: override ? undefined : "today",
                recordedBy: "Owner",
                recordedAt: "just now",
              });
              setReason("");
              onOpenChange(false);
            }}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium whitespace-nowrap",
              override
                ? "border-warning bg-warning text-white"
                : "border-primary bg-primary text-primary-foreground",
              !ready && "cursor-not-allowed opacity-40"
            )}
          >
            {label}
          </button>
        </>
      }
    >
      <div className="space-y-4 p-4">
        {/* AUTH-001: approval is per line, so the form is per line. */}
        <div>
          {/* The all-switch is a checkbox in the rows' own column, not a "Select all"
              link off on the right. It is the same control doing the same thing one
              level up, so it should be the same shape and in the same place — a word at
              the other end of the row made the reader cross the dialog to find a toggle
              that was already under their cursor.

              Three states, not two: ticked when every line is picked, a dash when some
              are, empty when none. Without the dash, "some picked" and "none picked"
              look identical from the header. */}
          <label className="mb-1.5 flex cursor-pointer items-center gap-2.5">
            <TriCheckbox
              checked={pending.length > 0 && picked.size === pending.length}
              some={picked.size > 0 && picked.size < pending.length}
              disabled={pending.length === 0}
              label={picked.size === pending.length ? "Clear every line" : "Pick every line"}
              onChange={() =>
                setPicked((s) =>
                  s.size === pending.length ? new Set() : new Set(pending.map((l) => l.id))
                )
              }
            />
            <span className="text-sm font-medium">Which lines</span>
          </label>
          {/* Edge to edge, not boxed. A rounded, bordered group inside a rounded,
              bordered dialog is a card inside a card: two radii a few pixels apart and
              two borders doing one job. Borders are for discrete objects, and a dialog's
              own contents are not one — so the rows break the body's padding with
              `-mx-4` and are separated by hairlines, like list rows anywhere else. */}
          <div className="-mx-4 border-y">
            {pending.map((l) => (
              <label
                key={l.id}
                className="flex cursor-pointer items-center gap-2.5 border-b px-4 py-2.5 text-sm last:border-0 hover:bg-accent/40"
              >
                <input
                  type="checkbox"
                  checked={picked.has(l.id)}
                  onChange={() =>
                    setPicked((s) => {
                      const n = new Set(s);
                      n.has(l.id) ? n.delete(l.id) : n.add(l.id);
                      return n;
                    })
                  }
                  className="size-4"
                />
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                <span className="tnum text-muted-foreground">{money(l.priceCents)}</span>
              </label>
            ))}
            {pending.length === 0 && (
              <div className="px-4 py-4 text-sm text-muted-foreground">
                Nothing is pending.
              </div>
            )}
          </div>
          {picked.size > 0 && (
            <div className="mt-1.5 text-xs text-muted-foreground">
              {picked.size} line{picked.size === 1 ? "" : "s"} · {money(total)}
            </div>
          )}
        </div>

        {/* Three peers, none pre-selected. The form below follows the choice, so until
            one is made there is nothing to fill in — which is the point: picking the
            outcome is the first deliberate act, not a correction of a guess. */}
        <div className="text-sm font-medium">What did the customer say?</div>
        <div className="flex gap-2">
          <Choice on={kind === "approved"} onClick={() => setKind("approved")} tone="good">
            <Check className="size-4" /> They approved
          </Choice>
          <Choice on={kind === "declined"} onClick={() => setKind("declined")} tone="bad">
            <X className="size-4" /> They declined
          </Choice>
          <Choice on={kind === "override"} onClick={() => setKind("override")} tone="warn">
            <ShieldAlert className="size-4" /> Override
          </Choice>
        </div>

        {kind === null ? null : override ? (
          <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
            <div className="flex items-start gap-2 text-sm">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>
                No customer approval. These lines become billable anyway, recorded as an{" "}
                <strong>override</strong> — shown that way on every report and in the line
                history, never as customer approval.
              </span>
            </div>
            <Field
              label="Why are you overriding?"
              hint="Permanent. It cannot be edited later."
            >
              {({ id }) => (
                <TextArea
                  id={id}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Customer unreachable, work starts today…"
                />
              )}
            </Field>
          </div>
        ) : (
          <>
            <Field label="Who said so" hint="The customer contact who gave the answer.">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Dana Hoff"
                />
              )}
            </Field>

            <Field label="How" hint="No default on purpose — this is the evidence.">
              {({ id }) => (
                <Select
                  id={id}
                  value={method}
                  onChange={(e) => setMethod(e.target.value as ApprovalMethod)}
                >
                  <option value="" disabled>
                    Choose
                  </option>
                  <option value="phone">By phone</option>
                  <option value="email">By email</option>
                  <option value="in person">In person</option>
                  <option value="text">By text</option>
                  <option value="other">Other</option>
                </Select>
              )}
            </Field>
          </>
        )}

        <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          Recorded by <span className="font-medium text-foreground">you</span>, just now.
          This cannot be edited later — a correction adds a new record and keeps this one.
        </p>
      </div>
    </Overlay>
  );
}

function Choice({
  on,
  onClick,
  children,
  tone,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone: "good" | "bad" | "warn";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2 py-2 text-[13px] font-medium",
        on
          ? tone === "good"
            ? "border-success bg-success/10 text-success"
            : tone === "bad"
              ? "border-destructive bg-destructive/10 text-destructive"
              : "border-warning bg-warning/10 text-warning"
          : "text-muted-foreground hover:bg-accent"
      )}
    >
      {children}
    </button>
  );
}

/**
 * The line's approval history. AUTH-003: nothing is ever removed, so a superseded record
 * stays visible and struck rather than disappearing — the fact that someone corrected it
 * is itself part of the record.
 */
export function ApprovalHistory({ records }: { records: ApprovalRecord[] }) {
  if (records.length === 0) {
    return <p className="p-3 text-sm text-muted-foreground">No answer recorded yet.</p>;
  }
  return (
    <ul className="divide-y">
      {records.map((r) => (
        <li
          key={r.id}
          className={cn("flex gap-3 p-3 text-sm", r.supersededBy && "opacity-55")}
        >
          <span className="mt-0.5 shrink-0">
            {r.kind === "override" ? (
              <ShieldAlert className="size-4 text-warning" />
            ) : r.kind === "approved" ? (
              <Check className="size-4 text-success" />
            ) : (
              <X className="size-4 text-destructive" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn("block", r.supersededBy && "line-through")}>
              {r.kind === "override" ? (
                <>
                  {/* AUTH-004: an override is never dressed as customer approval. */}
                  <span className="font-medium">Overridden</span> by {r.recordedBy} —
                  no customer approval
                </>
              ) : (
                <>
                  <span className="font-medium">
                    {r.kind === "approved" ? "Approved" : "Declined"}
                  </span>{" "}
                  by {r.contact}, {r.method === "in person" ? "in person" : `by ${r.method}`}
                </>
              )}
            </span>
            {r.reason && (
              <span className="mt-0.5 block text-xs text-muted-foreground">“{r.reason}”</span>
            )}
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Recorded by {r.recordedBy}, {r.recordedAt}
              {r.supersededBy && " · superseded by a later record"}
            </span>
          </span>
          {r.kind === "override" && <Pill tone="warn">Override</Pill>}
        </li>
      ))}
    </ul>
  );
}
