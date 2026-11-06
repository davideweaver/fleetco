import {
  isAuthorized,
  offeredTotal,
  rowPrice,
  rowsFor,
  type RowComponent,
} from "./estimate";

/* The canonical V1 story, copied from docs/Product/v1-video/lib/wire.js so the lab,
   the client guide and (later) the seed factories all tell the same story.
   Story job: G-1048, Ridgeline Plumbing & Heating, Unit 14 full wrap, $2,019.00. */

export const STAGES = [
  "Ready for production",
  "In production",
  "Production complete",
  "Ready for installation",
  "Installation in progress",
  "Completed",
] as const;

export type Priority = "Normal" | "High" | "Rush";

export type Job = {
  no: string;
  /** JOB-002. Internal and warranty jobs are exempt from the JOB-006 scope gate. */
  billing: "billable" | "internal" | "warranty";
  /** AUTH-005: has at least one approved or overridden line. Drives JOB-006. */
  hasAuthorizedScope: boolean;
  customerId: string;
  customer: string;
  what: string;
  asset: string;
  who: string;
  date: string;
  priority: Priority;
  stage: number;
  /**
   * JOB-007. Closing is a separate act from finishing the work: a technician marks work
   * finished (stage moves to Completed), someone with `job.close` closes it after review
   * and that draws the draft invoice (JOB-009). A job can sit at Completed, not closed,
   * for days — that gap is exactly what the attention rule is pointing at.
   */
  closed: boolean;
  valueCents: number;
};

export type Customer = {
  id: string;
  name: string;
  contact: string;
  phone: string;
  city: string;
  terms: string;
  balanceCents: number;
  openJobs: number;
};

export type Invoice = {
  no: string;
  customerId: string;
  customer: string;
  issued: string;
  due: string;
  /** The real due date, so the aging report buckets from data (RPT-003). */
  dueISO: string | null;
  status: "Draft" | "Sent" | "Partly paid" | "Paid" | "Overdue";
  totalCents: number;
  balanceCents: number;
};

export const customers: Customer[] = [
  { id: "ridgeline", name: "Ridgeline Plumbing & Heating", contact: "Dana Hoff", phone: "(717) 555-0142", city: "Lititz, PA", terms: "Net 30", balanceCents: 243900, openJobs: 2 },
  { id: "keystone", name: "Keystone Dairy Co-op", contact: "Marcus Reed", phone: "(717) 555-0188", city: "Ephrata, PA", terms: "Net 15", balanceCents: 86500, openJobs: 1 },
  { id: "lancaster-kitchen", name: "Lancaster Kitchen Supply", contact: "Priya Shah", phone: "(717) 555-0119", city: "Lancaster, PA", terms: "Net 30", balanceCents: 0, openJobs: 1 },
  { id: "conestoga", name: "Conestoga Tree Care", contact: "Will Baer", phone: "(717) 555-0173", city: "Millersville, PA", terms: "Prepay", balanceCents: 42000, openJobs: 1 },
  { id: "brightway", name: "Brightway Movers", contact: "Tanya Cole", phone: "(717) 555-0160", city: "Columbia, PA", terms: "Net 30", balanceCents: 0, openJobs: 1 },
  { id: "millport", name: "Millport School District", contact: "R. Alvarez", phone: "(717) 555-0105", city: "Leola, PA", terms: "Net 45", balanceCents: 158000, openJobs: 1 },
];

export const jobs: Job[] = [
  { no: "G-1052", billing: "billable", hasAuthorizedScope: true, customerId: "lancaster-kitchen", customer: "Lancaster Kitchen Supply", what: "Box truck logo kit", asset: "Box truck 7", who: "T1", date: "Nov 3", priority: "Normal", stage: 0, closed: false, valueCents: 118500 },
  { no: "G-1053", billing: "billable", hasAuthorizedScope: false, customerId: "conestoga", customer: "Conestoga Tree Care", what: "Bucket truck doors ×3", asset: "Bucket 2", who: "OW", date: "Nov 4", priority: "Normal", stage: 0, closed: false, valueCents: 64000 },
  { no: "G-1048", billing: "billable", hasAuthorizedScope: true, customerId: "ridgeline", customer: "Ridgeline Plumbing & Heating", what: "Unit 14 · full wrap", asset: "Unit 14", who: "T1", date: "Nov 2", priority: "High", stage: 1, closed: false, valueCents: 201900 },
  { no: "G-1046", billing: "billable", hasAuthorizedScope: true, customerId: "brightway", customer: "Brightway Movers", what: "Rear door graphics", asset: "Truck 3", who: "T1", date: "Oct 31", priority: "Normal", stage: 2, closed: false, valueCents: 48000 },
  { no: "G-1044", billing: "billable", hasAuthorizedScope: true, customerId: "keystone", customer: "Keystone Dairy Co-op", what: "Tanker DOT lettering", asset: "Tanker 11", who: "T1", date: "Oct 30", priority: "High", stage: 3, closed: false, valueCents: 86500 },
  { no: "G-1043", billing: "internal", hasAuthorizedScope: false, customerId: "millport", customer: "Millport School District", what: "Shop wall mural", asset: "Bay 2 wall", who: "T1", date: "Oct 29", priority: "Normal", stage: 4, closed: false, valueCents: 158000 },
  { no: "G-1041", billing: "billable", hasAuthorizedScope: true, customerId: "ridgeline", customer: "Ridgeline Plumbing & Heating", what: "Unit 9 · decal refresh", asset: "Unit 9", who: "T1", date: "Oct 27", priority: "Normal", stage: 5, closed: false, valueCents: 42000 },
  /* The one closed story job. Without it "Closed" is an empty chip, Ready to Invoice
     (RPT-004) has nothing to show, and nothing exercises the board dropping a job. */
  { no: "G-1042", billing: "billable", hasAuthorizedScope: true, customerId: "brightway", customer: "Brightway Movers", what: "Cab door decals ×2", asset: "Truck 8", who: "T1", date: "Oct 24", priority: "Normal", stage: 5, closed: true, valueCents: 55000 },
];

/* --- A year of history, for judging the list column at length -------------------------
   Seven rows cannot answer "what happens when this list is long", and that question is
   a design one, not a performance one: where does the count go, what is the default
   scope, what sits at the bottom.

   Generated rather than written out, and deterministic — index arithmetic, no random —
   so the same row is in the same place in every screenshot and every review. The story
   jobs stay at the front, so every link, board card and search hit still lands. */

const ASSETS = ["Box truck 7", "Unit 3", "Tanker 11", "Van 12", "Flatbed 2", "Unit 9", "Truck 3", "Bucket 2"];
const SCOPES = [
  "Door decals",
  "Full wrap",
  "DOT lettering",
  "Partial wrap · rear",
  "Logo kit",
  "Fleet numbering",
  "Window perforated",
  "Tailgate graphics",
];
const MONTHS = ["Oct", "Sep", "Aug", "Jul", "Jun", "May", "Apr", "Mar", "Feb", "Jan"];

export const longJobs: Job[] = [
  ...jobs,
  ...Array.from({ length: 305 }, (_, i) => {
    const c = customers[i % customers.length];
    // Whole dollars, rounded to $5. A shop quotes $420, not $419.87, and a column of
    // random cents makes the money column look like test data instead of work.
    const value = 28000 + ((i * 7919) % 180000);
    return {
      no: `G-${1040 - i}`,
      billing: "billable" as const,
      hasAuthorizedScope: true,
      customerId: c.id,
      customer: c.name,
      what: SCOPES[i % SCOPES.length],
      asset: ASSETS[i % ASSETS.length],
      who: i % 3 === 0 ? "OW" : "T1",
      // Dates run backwards with the job number. Ascending dates on descending numbers
      // read as corrupt data to anyone who works here, which is all a reviewer sees.
      date: `${MONTHS[Math.floor(i / 28) % MONTHS.length]} ${28 - (i % 28)}`,
      priority: "Normal" as const,
      // Everything below the story rows is finished work — a long list is mostly
      // history, and that is why "open" is the default scope rather than "all".
      stage: STAGES.length - 1,
      // History is closed work, not a backlog of jobs waiting to be closed. Leaving it
      // open would put 305 rows behind the attention badge.
      closed: true,
      valueCents: value - (value % 500),
    };
  }),
];

/* --- Estimates (EST-012) ------------------------------------------------------------
   Draft → Sent → Approved, Partially approved, or Declined. The last three are derived
   from line approvals (AUTH-001), which is why the status lives beside the estimate
   rather than being typed in: Draft and Sent are the only two a person sets.

   Most estimates became a job, so they carry its number. E-1039 is the one that did not
   — a declined estimate never becomes work, and a list that cannot show that state is a
   list that implies every estimate eventually wins. */

export type EstimateStatus = "Draft" | "Sent" | "Approved" | "Partially approved" | "Declined";

export type Estimate = {
  no: string;
  /** The job it became, if it became one. Declined and draft estimates have none. */
  jobNo: string | null;
  customerId: string;
  customer: string;
  what: string;
  /** Sent date (EST-012 records who and when), or "—" for a draft. */
  sent: string;
  status: EstimateStatus;
  /** What was offered. AUTH-005's authorized subtotal is a line-level number. */
  valueCents: number;
};

/**
 * Still waiting on something. A draft has not been sent, a sent estimate has had no
 * answer, and a partially approved one has lines nobody has answered yet (AUTH-001 makes
 * approval per line, so "partially" means the conversation is unfinished). Approved and
 * Declined are the two states where nothing is owed either way.
 *
 * Note this is the open/closed split, NOT an attention rule. Nothing in the catalog says
 * when a quiet estimate starts needing a nudge — EST-013 leaves expiry open (D-C6) — so
 * the Estimates list has scopes and no "Needs you" chip, and that is honest rather than
 * an oversight.
 */
export const isOpenEstimate = (e: Estimate) =>
  e.status === "Draft" || e.status === "Sent" || e.status === "Partially approved";

export const estimates: Estimate[] = [
  { no: "E-1053", jobNo: "G-1053", customerId: "conestoga", customer: "Conestoga Tree Care", what: "Bucket truck doors ×3", sent: "Nov 1", status: "Sent", valueCents: offeredTotal("E-1053") },
  { no: "E-1052", jobNo: "G-1052", customerId: "lancaster-kitchen", customer: "Lancaster Kitchen Supply", what: "Box truck logo kit", sent: "Oct 29", status: "Approved", valueCents: offeredTotal("E-1052") },
  { no: "E-1048", jobNo: "G-1048", customerId: "ridgeline", customer: "Ridgeline Plumbing & Heating", what: "Unit 14 · full wrap", sent: "Oct 27", status: "Partially approved", valueCents: offeredTotal("E-1048") },
  { no: "E-1046", jobNo: "G-1046", customerId: "brightway", customer: "Brightway Movers", what: "Rear door graphics", sent: "Oct 24", status: "Approved", valueCents: offeredTotal("E-1046") },
  { no: "E-1044", jobNo: "G-1044", customerId: "keystone", customer: "Keystone Dairy Co-op", what: "Tanker DOT lettering", sent: "Oct 22", status: "Approved", valueCents: offeredTotal("E-1044") },
  { no: "E-1043", jobNo: "G-1043", customerId: "millport", customer: "Millport School District", what: "Shop wall mural", sent: "—", status: "Draft", valueCents: offeredTotal("E-1043") },
  { no: "E-1041", jobNo: "G-1041", customerId: "ridgeline", customer: "Ridgeline Plumbing & Heating", what: "Unit 9 · decal refresh", sent: "Oct 20", status: "Approved", valueCents: offeredTotal("E-1041") },
  { no: "E-1039", jobNo: null, customerId: "keystone", customer: "Keystone Dairy Co-op", what: "Trailer full wrap", sent: "Oct 16", status: "Declined", valueCents: offeredTotal("E-1039") },
];

/**
 * Open means not yet closed (JOB-007), which is NOT the same as "work unfinished". A job
 * sitting at Completed has had its work marked finished but is still waiting for someone
 * to close it, so it stays in the owner's Open list — it is still their problem, and the
 * attention rule says so in as many words. Reading `stage === Completed` as closed is the
 * bug this replaces: it hid the one job that needed an owner from the scope they check.
 */
export const isOpenJob = (j: Job) => !j.closed;

export const invoices: Invoice[] = [
  { no: "1184", customerId: "ridgeline", customer: "Ridgeline Plumbing & Heating", issued: "—", due: "—", dueISO: null, status: "Draft", totalCents: 201900, balanceCents: 100950 },
  { no: "1179", customerId: "ridgeline", customer: "Ridgeline Plumbing & Heating", issued: "Oct 28", due: "Nov 27", dueISO: "2026-11-27", status: "Sent", totalCents: 42000, balanceCents: 42000 },
  { no: "1176", customerId: "millport", customer: "Millport School District", issued: "Oct 21", due: "Dec 5", dueISO: "2026-12-05", status: "Sent", totalCents: 158000, balanceCents: 158000 },
  { no: "1171", customerId: "keystone", customer: "Keystone Dairy Co-op", issued: "Oct 14", due: "Oct 29", dueISO: "2026-10-29", status: "Overdue", totalCents: 86500, balanceCents: 86500 },
  { no: "1168", customerId: "brightway", customer: "Brightway Movers", issued: "Oct 9", due: "Nov 8", dueISO: "2026-11-08", status: "Paid", totalCents: 48000, balanceCents: 0 },
];

/* One "Full wrap" saved package. Internal components; the customer sees one rolled-up
   line at $2,019.00 (Rules Catalog EST-002, G7). */
export type Component = { item: string; qty: number; unit: string; costCents: number; priceCents: number };

export const wrapComponents: Component[] = [
  { item: "Avery MPI 1105 wrap film", qty: 62, unit: "ft", costCents: 310, priceCents: 750 },
  { item: "Avery DOL 1460Z overlaminate", qty: 62, unit: "ft", costCents: 205, priceCents: 450 },
  { item: "Latex ink", qty: 1, unit: "job", costCents: 3800, priceCents: 8500 },
  { item: "Install supplies", qty: 1, unit: "job", costCents: 2200, priceCents: 4500 },
  { item: "Design", qty: 4, unit: "hr", costCents: 3500, priceCents: 9500 },
  { item: "Installation", qty: 9, unit: "hr", costCents: 2800, priceCents: 8500 },
];

export const wrapPriceCents = wrapComponents.reduce((a, c) => a + c.qty * c.priceCents, 0);
export const wrapCostCents = wrapComponents.reduce((a, c) => a + c.qty * c.costCents, 0);

export const reports = [
  { id: "ar-aging", name: "A/R aging", note: "Open balances by age bucket" },
  { id: "revenue", name: "Revenue", note: "Invoiced, not collected" },
  { id: "ready-to-invoice", name: "Ready to invoice", note: "Closed jobs with no invoice sent" },
  { id: "payments", name: "Payments", note: "Received by day and method" },
  { id: "wip-value", name: "Work in progress · value", note: "Material on the rack, not installed" },
  { id: "wip-jobs", name: "Work in progress · jobs", note: "Open jobs by stage" },
  { id: "clocked-hours", name: "Clocked hours", note: "Attendance, payable" },
  { id: "job-hours", name: "Job hours", note: "Time against jobs, costing only" },
  { id: "timesheets", name: "Timesheets", note: "By employee and pay period" },
];

export const settingsSections = [
  { id: "departments", name: "Departments", note: "Graphics. Words and stages" },
  { id: "stages", name: "Job stages", note: "Six stages, renameable" },
  { id: "roles", name: "Roles & people", note: "Owner, Technician" },
  { id: "materials", name: "Material catalog", note: "Costs and selling prices" },
  { id: "packages", name: "Saved packages", note: "Full wrap, door kit, lettering" },
  { id: "templates", name: "Email templates", note: "Estimate, invoice" },
  { id: "tax", name: "Sales tax", note: "Rates and what is taxable" },
  { id: "numbering", name: "Numbering", note: "Invoice and job numbers" },
  { id: "quickbooks", name: "QuickBooks", note: "Connection and mapping" },
];

/**
 * Design-system demo screens. They live under Settings because they need a nav home and
 * Settings is where the "everything else" list already is — but they are NOT settings,
 * so the list separates them rather than mixing them in. Expect this to grow.
 */
export const demoScreens = [
  { id: "_dates", name: "Dates", note: "Date picker and date range picker" },
  { id: "_states", name: "States", note: "Loading, empty, error, not found" },
];

export const businesses = [
  { id: "otc", name: "OTC Fleet Services", sub: "Lancaster, PA" },
  { id: "demo", name: "Keystone Wraps (demo)", sub: "Harrisburg, PA" },
];

/* Only Graphics exists in V1. The other two are lab scaffolding so the control can be
   judged with more than one row in it. */
export const departments = [
  { id: "graphics", name: "Graphics" },
  { id: "lancaster", name: "Lancaster shop" },
  { id: "mobile", name: "Mobile" },
];

/* --- Invoice lines (INV-001) ----------------------------------------------------------
   What the customer is handed: one line per authorized ROW, at its authorized price and
   description. A leaf row — a material, labor, a custom item — prints as itself, because
   it was always customer-facing. A package prints its name and its price, and its
   components stay on the job for costing (ROLE-009).

   The one exception is shape, not visibility: a package set to `itemized` (EST-018) also
   prints the component DESCRIPTIONS, with no quantities and no prices. The customer reads
   what is included; the money stays one approved number. */

export type InvoiceLine = {
  id: string;
  description: string;
  amountCents: number;
  /** INV-002: added to the draft by hand — storage, freight, restocking. */
  custom?: boolean;
  /** A package line, as opposed to a material or labor line that stands on its own. */
  isPackage?: boolean;
  /** EST-018, copied from the estimate row. Absent means rolled up. */
  print?: "rolled-up" | "itemized";
  /**
   * What is behind the line. Carried on the record but never priced on the customer's
   * copy (ROLE-009) — the app can show the money, the document generator cannot.
   */
  components: RowComponent[];
};

export const invoiceLines: Record<string, InvoiceLine[]> = {
  // Derived, not transcribed. #1184 is the draft G-1048 produced on close, so its lines
  // ARE the authorized estimate rows — change an approval in the editor and this follows.
  "1184": rowsFor("E-1048")
    .filter(isAuthorized)
    .map((r) => ({
      id: r.id,
      description: r.name,
      amountCents: rowPrice(r),
      isPackage: r.kind === "package",
      print: r.print,
      components: r.components,
    })),
  "1179": [
    {
      id: "L1",
      description: "Decal refresh · Unit 9",
      amountCents: 42000,
      isPackage: true,
      components: [
        { id: "d1", kind: "material", item: "Cut vinyl decal set", qty: 2, unit: "ea", costCents: 4800, sellCents: 11000 },
        { id: "d2", kind: "labor", item: "Installation", qty: 2, unit: "hr", costCents: 2800, sellCents: 10000 },
      ],
    },
  ],
  // Two lines, one of them added to the draft, because an invoice that is only ever a
  // single rolled-up line never shows what INV-002 is for.
  "1176": [
    {
      id: "L1",
      description: "Shop wall mural · Bay 2 wall",
      amountCents: 143000,
      isPackage: true,
      components: [
        { id: "m1", kind: "material", item: "Wall vinyl", qty: 48, unit: "ft", costCents: 390, sellCents: 1250 },
        { id: "m2", kind: "labor", item: "Design", qty: 3, unit: "hr", costCents: 3500, sellCents: 9500 },
        { id: "m3", kind: "labor", item: "Installation", qty: 6, unit: "hr", costCents: 2800, sellCents: 8500 },
        { id: "m4", kind: "allowance", item: "Install supplies", qty: null, unit: null, costCents: 1500, sellCents: 3500 },
      ],
    },
    {
      id: "L2",
      description: "Scaffold rental, billed at cost",
      amountCents: 15000,
      custom: true,
      // Billed at cost, so sell equals cost and the margin column reads zero. A
      // pass-through that quietly showed full margin is the number that gets trusted.
      components: [
        { id: "m5", kind: "custom", item: "Scaffold rental (vendor)", qty: 1, unit: "ea", costCents: 15000, sellCents: 15000 },
      ],
    },
  ],
  "1171": [
    {
      id: "L1",
      description: "DOT lettering · Tanker 11",
      amountCents: 86500,
      isPackage: true,
      // The estimate row was itemized (EST-018), so the customer's copy lists what is
      // included. Prices stay on this side of the line.
      print: "itemized" as const,
      components: [
        { id: "t1", kind: "material", item: "Reflective lettering vinyl", qty: 14, unit: "ft", costCents: 600, sellCents: 1500 },
        { id: "t2", kind: "labor", item: "Design", qty: 1, unit: "hr", costCents: 3500, sellCents: 9500 },
        { id: "t3", kind: "labor", item: "Installation", qty: 6, unit: "hr", costCents: 2800, sellCents: 8500 },
        { id: "t4", kind: "allowance", item: "Install supplies", qty: null, unit: null, costCents: 2200, sellCents: 5000 },
      ],
    },
  ],
  "1168": [
    {
      id: "L1",
      description: "Rear door graphics · Truck 3",
      amountCents: 48000,
      isPackage: true,
      print: "itemized" as const,
      components: [
        { id: "r1", kind: "material", item: "Cut vinyl graphics", qty: 1, unit: "ea", costCents: 9500, sellCents: 22000 },
        { id: "r2", kind: "labor", item: "Installation", qty: 2, unit: "hr", costCents: 2800, sellCents: 8500 },
        { id: "r3", kind: "allowance", item: "Install supplies", qty: null, unit: null, costCents: 1800, sellCents: 9000 },
      ],
    },
  ],
};

/** INV-006: subtotal is the sum of line amounts. Never stored. */
export const invoiceSubtotal = (no: string) =>
  (invoiceLines[no] ?? []).reduce((a, l) => a + l.amountCents, 0);

/** EST-004 at the invoice: cost is the components', margin is what is left of the price. */
export const invoiceLineCost = (l: InvoiceLine) =>
  l.components.reduce((a, c) => a + Math.round((c.qty ?? 1) * c.costCents), 0);

export const invoiceCost = (no: string) =>
  (invoiceLines[no] ?? []).reduce((a, l) => a + invoiceLineCost(l), 0);

/* --- Calendar entries (JOB-014) -------------------------------------------------------
   Either production or installation, one job, own start and end, one or more employees.
   A job can have several of each. Week of Mon 2 Nov 2026; today is Wed 4 Nov. */

export type EntryKind = "production" | "installation";

export type CalendarEntry = {
  id: string;
  jobNo: string;
  customer: string;
  what: string;
  kind: EntryKind;
  /** Day index within the shown week, 0 = Monday. */
  day: number;
  /** Minutes from midnight, shop time (PLAT-003). */
  start: number;
  end: number;
  who: string[];
};

const hm = (h: number, m = 0) => h * 60 + m;

export const WEEK = [
  { label: "Mon", date: "Nov 2" },
  { label: "Tue", date: "Nov 3" },
  { label: "Wed", date: "Nov 4" },
  { label: "Thu", date: "Nov 5" },
  { label: "Fri", date: "Nov 6" },
];
export const TODAY = 2;

export const DAY_START = hm(7);
export const DAY_END = hm(18);

export const calendarEntries: CalendarEntry[] = [
  { id: "e1", jobNo: "G-1048", customer: "Ridgeline Plumbing & Heating", what: "Unit 14 · full wrap", kind: "production", day: 0, start: hm(8), end: hm(12), who: ["T1"] },
  // JOB-016: this overlaps e1 and shares T1. V1 allows it and says nothing.
  { id: "e2", jobNo: "G-1044", customer: "Keystone Dairy Co-op", what: "Tanker DOT lettering", kind: "installation", day: 0, start: hm(10), end: hm(14), who: ["T1", "OW"] },
  { id: "e3", jobNo: "G-1052", customer: "Lancaster Kitchen Supply", what: "Box truck logo kit", kind: "production", day: 0, start: hm(13), end: hm(16, 30), who: ["T1"] },
  { id: "e4", jobNo: "G-1048", customer: "Ridgeline Plumbing & Heating", what: "Unit 14 · full wrap", kind: "installation", day: 1, start: hm(9), end: hm(15), who: ["T1", "OW"] },
  { id: "e5", jobNo: "G-1046", customer: "Brightway Movers", what: "Rear door graphics", kind: "production", day: 2, start: hm(8), end: hm(11), who: ["T1"] },
  { id: "e6", jobNo: "G-1053", customer: "Conestoga Tree Care", what: "Bucket truck doors ×3", kind: "production", day: 2, start: hm(13), end: hm(17), who: ["OW"] },
  { id: "e7", jobNo: "G-1043", customer: "Millport School District", what: "Shop wall mural", kind: "installation", day: 3, start: hm(7, 30), end: hm(16), who: ["T1"] },
  { id: "e8", jobNo: "G-1041", customer: "Ridgeline Plumbing & Heating", what: "Unit 9 · decal refresh", kind: "production", day: 4, start: hm(9), end: hm(11, 30), who: ["T1"] },
];

export const clock = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`;
};

/**
 * JOB-016 allows overlaps, so the grid has to lay them out rather than prevent them.
 * Entries that overlap share the column width; everything else gets the full width.
 */
export function layoutDay(entries: CalendarEntry[]) {
  const sorted = [...entries].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: { entry: CalendarEntry; lane: number; lanes: number }[] = [];
  let cluster: CalendarEntry[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const lanes: CalendarEntry[][] = [];
    for (const e of cluster) {
      let lane = lanes.findIndex((l) => l[l.length - 1].end <= e.start);
      if (lane === -1) { lanes.push([e]); lane = lanes.length - 1; }
      else lanes[lane].push(e);
      out.push({ entry: e, lane, lanes: 0 });
    }
    for (const o of out.slice(-cluster.length)) o.lanes = lanes.length;
    cluster = [];
    clusterEnd = -1;
  };

  for (const e of sorted) {
    if (cluster.length && e.start >= clusterEnd) flush();
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, e.end);
  }
  if (cluster.length) flush();
  return out;
}
