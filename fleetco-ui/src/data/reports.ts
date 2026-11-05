import { invoices, jobs, STAGES } from "./sample";
import type { Col, ReportDef, Row } from "@/components/ui/report";
import { fromISODate, startOfDay } from "@/lib/date";
import { money } from "@/lib/utils";

/**
 * The nine V1 reports (`RPT-001`), as data rather than as nine screens.
 *
 * Each one declares what it means, whether it shows money, and which hours it counts.
 * The shell does the rest. Where a rule is still open the report says so on the page
 * instead of quietly picking an answer — a report that silently resolves `D-A5` is how
 * a definition gets decided by whoever wrote the query.
 */

const cash: Col["align"] = "right";

/** Days past due, from the real due date. Negative means not yet due. */
function pastDue(dueISO: string | null, today: Date): number | null {
  const due = dueISO ? fromISODate(dueISO) : null;
  if (!due) return null;
  return Math.round((startOfDay(today).getTime() - due.getTime()) / 86400000);
}

/** `RPT-003`. Proposed buckets — not yet confirmed, which the report says out loud. */
const BUCKETS = [
  { label: "Current", holds: (d: number) => d <= 0 },
  { label: "1–30 days", holds: (d: number) => d >= 1 && d <= 30 },
  { label: "31–60 days", holds: (d: number) => d >= 31 && d <= 60 },
  { label: "61–90 days", holds: (d: number) => d >= 61 && d <= 90 },
  { label: "90+ days", holds: (d: number) => d > 90 },
];

const arAging: ReportDef = {
  id: "ar-aging",
  name: "A/R aging",
  definition: "Open balances by days past due, as of today. Drafts are not yet owed.",
  unsettled: "RPT-003: the bucket boundaries are proposed, not confirmed.",
  financial: true,
  cols: [
    { key: "customer", head: "Customer" },
    { key: "invoice", head: "Invoice" },
    { key: "due", head: "Due", priority: "low" },
    { key: "days", head: "Days", align: cash, priority: "low" },
    { key: "balance", head: "Balance", align: cash },
  ],
  rows: () => {
    const today = new Date();
    // A draft has never been sent, so nothing is owed on it yet — including it would
    // inflate receivables with money nobody has asked for.
    const open = invoices.filter((i) => i.balanceCents > 0 && i.status !== "Draft");
    const withAge = open.map((i) => ({ i, days: pastDue(i.dueISO, today) ?? 0 }));
    const out: Row[] = [];
    for (const b of BUCKETS) {
      for (const { i, days } of withAge.filter((x) => b.holds(x.days))) {
        out.push({
          id: i.no,
          group: b.label,
          cells: {
            customer: i.customer,
            invoice: `#${i.no}`,
            due: i.due,
            days: days > 0 ? days : "—",
            balance: money(i.balanceCents),
          },
          raw: {
            customer: i.customer,
            invoice: i.no,
            due: i.due,
            days: days > 0 ? days : 0,
            balance: i.balanceCents / 100,
            bucket: b.label,
          },
        });
      }
    }
    return out;
  },
  total: (rows) => ({
    customer: `${rows.length} invoice${rows.length === 1 ? "" : "s"}`,
    balance: money(rows.reduce((a, r) => a + Number(r.raw.balance) * 100, 0)),
  }),
};

const revenue: ReportDef = {
  id: "revenue",
  name: "Revenue",
  definition: "Invoiced, not collected. Finalised unvoided invoices by invoice date.",
  unsettled:
    "RPT-002 / D-A5: before or after tax, and whether deposits count, are not settled.",
  financial: true,
  cols: [
    { key: "invoice", head: "Invoice" },
    { key: "customer", head: "Customer" },
    { key: "issued", head: "Issued", priority: "low" },
    { key: "total", head: "Invoiced", align: cash },
  ],
  rows: () =>
    invoices
      .filter((i) => i.status !== "Draft")
      .map((i) => ({
        id: i.no,
        cells: {
          invoice: `#${i.no}`,
          customer: i.customer,
          issued: i.issued,
          total: money(i.totalCents),
        },
        raw: {
          invoice: i.no,
          customer: i.customer,
          issued: i.issued,
          total: i.totalCents / 100,
        },
      })),
  total: (rows) => ({
    invoice: `${rows.length} invoices`,
    total: money(rows.reduce((a, r) => a + Number(r.raw.total) * 100, 0)),
  }),
};

const readyToInvoice: ReportDef = {
  id: "ready-to-invoice",
  name: "Ready to invoice",
  definition:
    "Closed billable jobs whose invoice is still a draft. Internal and warranty jobs never appear.",
  financial: true,
  cols: [
    { key: "job", head: "Job" },
    { key: "customer", head: "Customer" },
    { key: "what", head: "Scope", priority: "low" },
    { key: "value", head: "Value", align: cash },
  ],
  // RPT-004 names two exclusions, so both are written out rather than assumed.
  rows: () =>
    jobs
      .filter((j) => j.closed && j.billing === "billable")
      .map((j) => ({
        id: j.no,
        cells: { job: j.no, customer: j.customer, what: j.what, value: money(j.valueCents) },
        raw: { job: j.no, customer: j.customer, what: j.what, value: j.valueCents / 100 },
      })),
  total: (rows) => ({
    job: `${rows.length} job${rows.length === 1 ? "" : "s"}`,
    value: money(rows.reduce((a, r) => a + Number(r.raw.value) * 100, 0)),
  }),
};

const wipValue: ReportDef = {
  id: "wip-value",
  name: "Work in progress · value",
  definition: "Printed material waiting to be installed — production complete, not yet installed.",
  unsettled: "RPT-005 / D-C17: what counts as work in progress is not settled.",
  financial: true,
  cols: [
    { key: "job", head: "Job" },
    { key: "customer", head: "Customer" },
    { key: "stage", head: "Stage", priority: "low" },
    { key: "value", head: "Value", align: cash },
  ],
  rows: () =>
    jobs
      .filter((j) => j.stage === 2 || j.stage === 3)
      .map((j) => ({
        id: j.no,
        cells: {
          job: j.no,
          customer: j.customer,
          stage: STAGES[j.stage],
          value: money(j.valueCents),
        },
        raw: {
          job: j.no,
          customer: j.customer,
          stage: STAGES[j.stage],
          value: j.valueCents / 100,
        },
      })),
  total: (rows) => ({
    job: `${rows.length} job${rows.length === 1 ? "" : "s"}`,
    value: money(rows.reduce((a, r) => a + Number(r.raw.value) * 100, 0)),
  }),
};

const wipJobs: ReportDef = {
  id: "wip-jobs",
  name: "Work in progress · jobs",
  definition: "Open jobs by stage. A count, not money — every role may read it.",
  financial: false,
  cols: [
    { key: "stage", head: "Stage" },
    { key: "jobs", head: "Jobs", align: cash },
  ],
  rows: () =>
    STAGES.map((name, i) => ({ name, i }))
      .filter((s) => s.i < 5)
      .map((s) => {
        const n = jobs.filter((j) => j.stage === s.i).length;
        return {
          id: String(s.i),
          cells: { stage: s.name, jobs: n },
          raw: { stage: s.name, jobs: n },
        };
      }),
  total: (rows) => ({
    stage: "Open jobs",
    jobs: rows.reduce((a, r) => a + Number(r.raw.jobs), 0),
  }),
};

/**
 * The four time reports wait on the timer and punch clock, which are not built. They
 * are listed with their definitions rather than omitted, so the shape of what is
 * missing is visible — and `RPT-006` is recorded now, while it is cheap, rather than
 * discovered when someone adds a grand total across both kinds of hour.
 */
const payments: ReportDef = {
  id: "payments",
  name: "Payments",
  definition: "Received by day and method. Cash in, kept separate from revenue.",
  financial: true,
  cols: [
    { key: "day", head: "Day" },
    { key: "method", head: "Method" },
    { key: "amount", head: "Amount", align: cash },
  ],
  rows: () => [],
};

const clockedHours: ReportDef = {
  id: "clocked-hours",
  name: "Clocked hours",
  definition: "Attendance — what gets paid. Never added to job hours (RPT-006).",
  financial: false,
  hours: "clocked",
  cols: [
    { key: "who", head: "Employee" },
    { key: "hours", head: "Clocked", align: cash },
  ],
  rows: () => [],
};

const jobHours: ReportDef = {
  id: "job-hours",
  name: "Job hours",
  definition: "Time against jobs, for costing only. Never added to clocked hours (RPT-006).",
  financial: false,
  hours: "job",
  cols: [
    { key: "job", head: "Job" },
    { key: "expected", head: "Expected", align: cash },
    { key: "actual", head: "Actual", align: cash },
    { key: "diff", head: "Difference", align: cash },
  ],
  rows: () => [],
};

const timesheets: ReportDef = {
  id: "timesheets",
  name: "Timesheets",
  definition: "By employee and pay period. Approval locks the period (TIME-009).",
  financial: false,
  hours: "clocked",
  cols: [
    { key: "who", head: "Employee" },
    { key: "period", head: "Pay period" },
    { key: "hours", head: "Hours", align: cash },
  ],
  rows: () => [],
};

export const REPORTS: Record<string, ReportDef> = Object.fromEntries(
  [
    arAging,
    revenue,
    readyToInvoice,
    payments,
    wipValue,
    wipJobs,
    clockedHours,
    jobHours,
    timesheets,
  ].map((r) => [r.id, r])
);
