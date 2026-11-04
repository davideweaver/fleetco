import { Fragment, useState, type ReactNode } from "react";
import { Printer, Download } from "lucide-react";
import { useShell } from "@/shell/shell-context";
import { Btn, DetailHeader } from "@/shell/ListDetailLayout";
import { DateRangePicker, type DateRange } from "./date-picker";
import { NotFoundState } from "./states";
import { toCSV, csvName, downloadCSV } from "@/lib/csv";
import { fmtDay, fmtRange, toISODate } from "@/lib/date";
import { cn, money } from "@/lib/utils";

/**
 * ONE report shell, not nine.
 *
 * Every V1 report is the same object: a period, some filters, a table with totals, and
 * the two actions `RPT-001` requires — export to CSV and print. Nine shells is nine
 * places for the period control to drift, nine CSV encoders, and nine chances for one
 * report to print without a header.
 *
 * A report supplies its **columns, rows and totals**. The shell owns everything else,
 * including the whole print layout — which is the part that is always discovered late,
 * so it is built in from the start rather than bolted on.
 *
 * Two rules it enforces rather than trusts:
 *
 *   RPT-001  Financial figures need the financial-view permission, Owner in V1. The
 *            check is here, so a report cannot forget it, and it covers the URL as
 *            well as the nav.
 *   RPT-006  Clocked hours and job hours are never added together. A report declares
 *            which it is, and the shell refuses to total a column of the other kind.
 */

export type Col = {
  key: string;
  head: string;
  /** Money and hours are right-aligned and tabular; text is not. */
  align?: "left" | "right";
  /** Dropped first when the window is narrow. The CSV always keeps every column. */
  priority?: "low";
};

export type Row = {
  id: string;
  cells: Record<string, ReactNode>;
  /** What this row contributes to the CSV — strings and numbers, never JSX. */
  raw: Record<string, string | number | null>;
  /** Group heading above this row, for reports grouped by customer or employee. */
  group?: string;
};

export type ReportDef = {
  id: string;
  name: string;
  /**
   * What the numbers MEAN, in one line. It prints.
   *
   * A printed A/R aging with no definition is a column of figures with no provenance,
   * and the first question the accountant asks is the one this sentence answers. It
   * also keeps the unsettled rules honest — see `unsettled`.
   */
  definition: string;
  /** The open decision behind this report, if there is one. Shown, not hidden. */
  unsettled?: string;
  /** `RPT-001`: does this report show money? Then Owner only. */
  financial: boolean;
  /** `RPT-006`: hours reports declare their kind, and the kinds never mix. */
  hours?: "clocked" | "job";
  cols: Col[];
  rows: (period: DateRange) => Row[];
  /** The foot of the table. Omit where a total would be meaningless. */
  total?: (rows: Row[]) => Record<string, ReactNode>;
};

export function ReportShell({
  def,
  period,
  onPeriod,
  filters,
}: {
  def: ReportDef;
  period: DateRange;
  onPeriod: (r: DateRange) => void;
  filters?: ReactNode;
}) {
  const { role } = useShell();
  const today = new Date();
  const rows = def.rows(period);

  // RPT-001. Checked here rather than in the nav, because the nav is not a permission.
  if (def.financial && role !== "owner") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <DetailHeader eyebrow="Report" title={def.name} />
        <NotFoundState what="report" />
      </div>
    );
  }

  function exportCSV() {
    const headers = def.cols.map((c) => c.head);
    const body = rows.map((r) => def.cols.map((c) => r.raw[c.key] ?? null));
    downloadCSV(
      csvName(def.name, toISODate(today)),
      // The period and the definition ride along in the file. A CSV that has been
      // emailed twice has lost every bit of context the screen was giving it.
      [
        `${def.name}`,
        `${def.definition}`,
        `Period,${fmtRange(period.from, period.to, today)}`,
        `Generated,${fmtDay(today, today)}`,
        "",
        toCSV(headers, body),
      ].join("\r\n")
    );
  }

  return (
    <div className="print-flow flex h-full min-h-0 flex-col">
      {/* Screen header: title, definition, and the controls. */}
      <div className="print-hide">
        <DetailHeader
          eyebrow="Report"
          title={def.name}
          sub={def.definition}
          actions={
            <>
              <span onClick={exportCSV}>
                <Btn>
                  <span className="flex items-center gap-1.5">
                    <Download className="size-4" /> Export
                  </span>
                </Btn>
              </span>
              <span onClick={() => window.print()}>
                <Btn>
                  <span className="flex items-center gap-1.5">
                    <Printer className="size-4" /> Print
                  </span>
                </Btn>
              </span>
            </>
          }
        />
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <DateRangePicker value={period} onChange={onPeriod} max={new Date()} />
          {filters}
        </div>
        {/* An open rule is shown, not resolved quietly. A report that silently picks an
            answer to D-A5 is how a definition ends up decided by whoever wrote the
            query, and nobody finds out until the figure is questioned. */}
        {def.unsettled && (
          <p className="border-b bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
            Not settled — {def.unsettled}
          </p>
        )}
      </div>

      {/* Paper header. Repeats nothing from the screen chrome, because none of it
          prints — this IS the header on paper, and it carries what a loose sheet
          needs to be identified: what, over what period, run when. */}
      <div className="print-only print-keep mb-3">
        <div className="flex items-baseline justify-between border-b-2 border-black pb-1">
          <span className="text-base font-bold">OTC Fleet Services · Graphics</span>
          <span className="text-[10pt]">{fmtDay(today, today)}</span>
        </div>
        <h1 className="mt-2 text-lg font-bold">{def.name}</h1>
        <p className="text-[10pt]">
          {fmtRange(period.from, period.to, today)} · {def.definition}
        </p>
        {def.unsettled && (
          <p className="mt-0.5 text-[9pt] italic">Not settled — {def.unsettled}</p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <ReportTable def={def} rows={rows} />
      </div>
    </div>
  );
}

function ReportTable({ def, rows }: { def: ReportDef; rows: Row[] }) {
  const totals = def.total?.(rows);
  let lastGroup: string | undefined;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-muted-foreground">
          {def.cols.map((c) => (
            <th
              key={c.key}
              className={cn(
                "px-3 py-2 font-medium",
                c.align === "right" && "text-right",
                c.priority === "low" && "hidden lg:table-cell print:table-cell"
              )}
            >
              {c.head}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const head = r.group && r.group !== lastGroup ? r.group : null;
          lastGroup = r.group;
          return (
            <Fragment key={r.id}>
              {head && (
                <tr className="print-group">
                  <td
                    colSpan={def.cols.length}
                    className="bg-muted/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
                  >
                    {head}
                  </td>
                </tr>
              )}
              <tr className="border-b last:border-0">
                {def.cols.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-3 py-2",
                      c.align === "right" && "tnum text-right",
                      c.priority === "low" && "hidden lg:table-cell print:table-cell"
                    )}
                  >
                    {r.cells[c.key]}
                  </td>
                ))}
              </tr>
            </Fragment>
          );
        })}
        {rows.length === 0 && (
          <tr>
            <td
              colSpan={def.cols.length}
              className="px-3 py-10 text-center text-sm text-muted-foreground"
            >
              Nothing in this period.
            </td>
          </tr>
        )}
      </tbody>
      {totals && rows.length > 0 && (
        <tfoot>
          <tr className="border-t-2 font-semibold">
            {def.cols.map((c) => (
              <td
                key={c.key}
                className={cn(
                  "px-3 py-2",
                  c.align === "right" && "tnum text-right",
                  c.priority === "low" && "hidden lg:table-cell print:table-cell"
                )}
              >
                {totals[c.key]}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

/** A period control that remembers nothing — the shell owns the state. */
export function useReportPeriod(initial: DateRange) {
  return useState<DateRange>(initial);
}

export { money };
