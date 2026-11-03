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
  { no: "G-1052", billing: "billable", hasAuthorizedScope: true, customerId: "lancaster-kitchen", customer: "Lancaster Kitchen Supply", what: "Box truck logo kit", asset: "Box truck 7", who: "T1", date: "Nov 3", priority: "Normal", stage: 0, valueCents: 118500 },
  { no: "G-1053", billing: "billable", hasAuthorizedScope: false, customerId: "conestoga", customer: "Conestoga Tree Care", what: "Bucket truck doors ×3", asset: "Bucket 2", who: "OW", date: "Nov 4", priority: "Normal", stage: 0, valueCents: 64000 },
  { no: "G-1048", billing: "billable", hasAuthorizedScope: true, customerId: "ridgeline", customer: "Ridgeline Plumbing & Heating", what: "Unit 14 · full wrap", asset: "Unit 14", who: "T1", date: "Nov 2", priority: "High", stage: 1, valueCents: 201900 },
  { no: "G-1046", billing: "billable", hasAuthorizedScope: true, customerId: "brightway", customer: "Brightway Movers", what: "Rear door graphics", asset: "Truck 3", who: "T1", date: "Oct 31", priority: "Normal", stage: 2, valueCents: 48000 },
  { no: "G-1044", billing: "billable", hasAuthorizedScope: true, customerId: "keystone", customer: "Keystone Dairy Co-op", what: "Tanker DOT lettering", asset: "Tanker 11", who: "T1", date: "Oct 30", priority: "High", stage: 3, valueCents: 86500 },
  { no: "G-1043", billing: "internal", hasAuthorizedScope: false, customerId: "millport", customer: "Millport School District", what: "Shop wall mural", asset: "Bay 2 wall", who: "T1", date: "Oct 29", priority: "Normal", stage: 4, valueCents: 158000 },
  { no: "G-1041", billing: "billable", hasAuthorizedScope: true, customerId: "ridgeline", customer: "Ridgeline Plumbing & Heating", what: "Unit 9 · decal refresh", asset: "Unit 9", who: "T1", date: "Oct 27", priority: "Normal", stage: 5, valueCents: 42000 },
];

export const invoices: Invoice[] = [
  { no: "1184", customerId: "ridgeline", customer: "Ridgeline Plumbing & Heating", issued: "—", due: "—", status: "Draft", totalCents: 201900, balanceCents: 100950 },
  { no: "1179", customerId: "ridgeline", customer: "Ridgeline Plumbing & Heating", issued: "Oct 28", due: "Nov 27", status: "Sent", totalCents: 42000, balanceCents: 42000 },
  { no: "1176", customerId: "millport", customer: "Millport School District", issued: "Oct 21", due: "Dec 5", status: "Sent", totalCents: 158000, balanceCents: 158000 },
  { no: "1171", customerId: "keystone", customer: "Keystone Dairy Co-op", issued: "Oct 14", due: "Oct 29", status: "Overdue", totalCents: 86500, balanceCents: 86500 },
  { no: "1168", customerId: "brightway", customer: "Brightway Movers", issued: "Oct 9", due: "Nov 8", status: "Paid", totalCents: 48000, balanceCents: 0 },
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

/* --- Estimate lines (EST-002): customer lines, each with internal components. ---------
   Three lines in three approval states, because AUTH-005 — only authorized lines reach an
   invoice — is the thing the screen has to make obvious. */

export type ComponentKind = "material" | "custom" | "labor" | "allowance";
export type Approval = "pending" | "approved" | "declined" | "overridden";

export type LineComponent = {
  id: string;
  kind: ComponentKind;
  item: string;
  /** Allowances have no quantity at all (EST-006). */
  qty: number | null;
  unit: string | null;
  costCents: number;
  sellCents: number;
};

export type EstimateLine = {
  id: string;
  name: string;
  approval: Approval;
  /** EST-003: when the owner sets a price, it wins and the component sum is kept. */
  setPriceCents: number | null;
  how?: string;
  components: LineComponent[];
};

export const estimateLines: EstimateLine[] = [
  {
    id: "L1",
    name: "Full wrap · Unit 14",
    approval: "approved",
    setPriceCents: null,
    how: "Approved by Dana Hoff by phone, Oct 28",
    components: [
      { id: "c1", kind: "material", item: "Avery MPI 1105 wrap film", qty: 62, unit: "ft", costCents: 310, sellCents: 750 },
      { id: "c2", kind: "material", item: "Avery DOL 1460Z overlaminate", qty: 62, unit: "ft", costCents: 205, sellCents: 450 },
      { id: "c3", kind: "allowance", item: "Latex ink", qty: null, unit: null, costCents: 3800, sellCents: 8500 },
      { id: "c4", kind: "allowance", item: "Install supplies", qty: null, unit: null, costCents: 2200, sellCents: 4500 },
      { id: "c5", kind: "labor", item: "Design", qty: 4, unit: "hr", costCents: 3500, sellCents: 9500 },
      { id: "c6", kind: "labor", item: "Installation", qty: 9, unit: "hr", costCents: 2800, sellCents: 8500 },
    ],
  },
  {
    id: "L2",
    name: "Hood decal kit",
    approval: "declined",
    setPriceCents: null,
    how: "Declined by Dana Hoff by phone, Oct 28",
    components: [
      { id: "c7", kind: "custom", item: "Cut vinyl hood decal (custom item)", qty: 1, unit: "ea", costCents: 4200, sellCents: 11000 },
      { id: "c8", kind: "labor", item: "Installation", qty: 1.5, unit: "hr", costCents: 2800, sellCents: 8500 },
    ],
  },
  {
    id: "L3",
    name: "Rear window perforated",
    approval: "pending",
    // EST-003: priced as a package, not by summing. The component total is kept.
    setPriceCents: 48000,
    components: [
      { id: "c9", kind: "material", item: "Perforated window film", qty: 18, unit: "ft", costCents: 420, sellCents: 980 },
      { id: "c10", kind: "labor", item: "Installation", qty: 2, unit: "hr", costCents: 2800, sellCents: 8500 },
    ],
  },
];

export const componentSum = (l: EstimateLine) =>
  l.components.reduce((a, c) => a + Math.round((c.qty ?? 1) * c.sellCents), 0);
export const lineCost = (l: EstimateLine) =>
  l.components.reduce((a, c) => a + Math.round((c.qty ?? 1) * c.costCents), 0);
/** EST-003: the set price wins where there is one. */
export const linePrice = (l: EstimateLine) => l.setPriceCents ?? componentSum(l);
/** AUTH-005: authorized means approved or overridden. Nothing else bills. */
export const isAuthorized = (l: EstimateLine) =>
  l.approval === "approved" || l.approval === "overridden";
