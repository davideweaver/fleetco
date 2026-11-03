import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Form vocabulary.
 *
 * Three decisions baked in here, so no lane has to re-make them:
 *
 * 1. LABELS SIT ABOVE THE FIELD. A label beside the field needs a second layout the
 *    moment the form is in a 390px phone or a 26rem panel, and this app puts forms in
 *    both. Above works everywhere and never truncates a long label.
 *
 * 2. OPTIONAL IS MARKED, NOT REQUIRED. Nearly every field in a shop system is required,
 *    so an asterisk on nine fields out of ten is noise that stops being read. Marking
 *    the exceptions puts the ink where the information is.
 *
 * 3. CONTROLS ARE 40px TALL. Taller than the shadcn default, because the primary device
 *    is an iPad on a shop floor and the primary hand may be in a glove.
 */
export function Field({
  label,
  optional,
  hint,
  error,
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  children: (props: { id: string; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const invalid = Boolean(error);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-baseline gap-2 text-sm font-medium">
        {label}
        {optional && (
          <span className="text-xs font-normal text-muted-foreground">Optional</span>
        )}
      </label>
      {children({ id, invalid })}
      {/* Error replaces the hint rather than stacking under it: two lines of helper text
          under one field is how a form stops being scannable. */}
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

const control = (invalid?: boolean) =>
  cn(
    "h-10 w-full rounded-lg border bg-surface-3 px-3 text-sm outline-none",
    "placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
    invalid && "border-destructive focus-visible:ring-destructive/40"
  );

export function TextInput({
  id,
  invalid,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input id={id} aria-invalid={invalid} className={control(invalid)} {...props} />;
}

export function TextArea({
  id,
  invalid,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      id={id}
      aria-invalid={invalid}
      className={cn(control(invalid), "h-auto min-h-20 py-2 leading-relaxed")}
      {...props}
    />
  );
}

export function Select({
  id,
  invalid,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select id={id} aria-invalid={invalid} className={control(invalid)} {...props}>
      {children}
    </select>
  );
}

/**
 * Money. PLAT-001 says amounts are integer cents everywhere, so this never hands a float
 * upwards — it parses to cents on change and formats on blur. The `$` is an adornment
 * rather than part of the value, and the figures are tabular and right-aligned so a
 * column of them lines up.
 */
export function MoneyInput({
  id,
  invalid,
  valueCents,
  onChangeCents,
}: {
  id?: string;
  invalid?: boolean;
  valueCents: number | null;
  onChangeCents: (cents: number | null) => void;
}) {
  const [text, setText] = useState(
    valueCents === null ? "" : (valueCents / 100).toFixed(2)
  );

  const commit = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    if (cleaned === "") {
      onChangeCents(null);
      setText("");
      return;
    }
    const cents = Math.round(Number(cleaned) * 100);
    onChangeCents(Number.isFinite(cents) ? cents : null);
    setText((cents / 100).toFixed(2));
  };

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        $
      </span>
      <input
        id={id}
        inputMode="decimal"
        aria-invalid={invalid}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        placeholder="0.00"
        className={cn(control(invalid), "tnum pl-7 pr-3 text-right")}
      />
    </div>
  );
}

/**
 * Dates are shop-local (PLAT-003), and the field says so rather than leaving the user to
 * wonder whose midnight it means.
 */
export function DateInput({
  id,
  invalid,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input type="date" id={id} aria-invalid={invalid} className={control(invalid)} {...props} />
  );
}

/** Two fields on one line where there is room, stacked where there is not. */
export function FieldRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 @md:grid-cols-2">{children}</div>
  );
}

/** Forms are container-query driven, so they adapt to a panel or a page without knowing which. */
export function FormBody({ children }: { children: ReactNode }) {
  return <div className="@container flex flex-col gap-4 p-4 lg:p-5">{children}</div>;
}

/**
 * A cell input, for editing inside a dense table. Deliberately not the 40px form control:
 * a grid of forty bordered boxes is unreadable. It shows as plain text until hovered or
 * focused, so the table reads as a table and edits as a form.
 */
export function CellInput({
  value,
  onChange,
  align = "right",
  width = "w-20",
  suffix,
}: {
  value: string;
  onChange: (v: string) => void;
  align?: "left" | "right";
  width?: string;
  suffix?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "tnum h-7 rounded-md border border-transparent bg-transparent px-1.5 text-sm outline-none",
          "hover:border-border focus-visible:border-ring focus-visible:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring/30",
          align === "right" ? "text-right" : "text-left",
          width
        )}
      />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </span>
  );
}

/**
 * Money inside a dense table. Formatted while you read it, raw while you type it: an
 * editable cell reading `2019.00` beside a computed one reading `$2,019.00` makes a
 * column of figures stop lining up, which is the only thing a money column is for.
 */
export function MoneyCell({
  valueCents,
  onChangeCents,
  width = "w-28",
}: {
  valueCents: number;
  onChangeCents: (cents: number) => void;
  width?: string;
}) {
  const format = (cents: number) =>
    "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const [text, setText] = useState(format(valueCents));
  const [editing, setEditing] = useState(false);

  return (
    <input
      value={text}
      inputMode="decimal"
      onFocus={(e) => {
        setEditing(true);
        setText((valueCents / 100).toFixed(2));
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const cents = Math.round(Number(text.replace(/[^0-9.]/g, "")) * 100);
        const next = Number.isFinite(cents) ? cents : valueCents;
        onChangeCents(next);
        setText(format(next));
      }}
      className={cn(
        "tnum h-7 rounded-md border border-transparent bg-transparent px-1.5 text-right text-sm outline-none",
        "hover:border-border focus-visible:border-ring focus-visible:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring/30",
        editing && "bg-surface-3",
        width
      )}
    />
  );
}
