/* --- The estimate (EST-002) -----------------------------------------------------------

   An estimate is a FLAT LIST OF ROWS, and only a package has contents. That is the whole
   model, and it is worth saying why it is not the obvious alternative.

   The first shape had every customer line be a container with hidden components inside
   it. It read well on a full wrap and badly on everything else: a single roll of vinyl
   the customer should see had to be wrapped in a one-item container, and "show this to
   the customer" became a display flag on the component — a second mechanism for a thing
   the structure could have said by itself.

   So: five row kinds, four of them leaves, one of them — the package — a container.

     material · custom · labor · allowance   the customer reads the row
     package                                 the customer reads the name and the price

   **Components are the only thing hidden from a customer document.** A material sitting
   at the top level of the estimate is customer-facing; put it in a package and it is not.
   There is no flag, and ROLE-009 stays what it already said.

   Rules this file carries:
     EST-002  the five kinds, and the package as the only container
     EST-003  a typed price wins over the computed one, and the computed one is kept
     EST-006  an allowance has no quantity at all
     EST-007  catalog values are COPIED in, never linked
     EST-014  a package's price follows its contents until someone sets it
     EST-015  a package can be built inside one estimate and live only there
     EST-016  a saved package is copied in, like a template
     EST-017  a package never contains a package
     EST-018  a package row prints rolled up, or itemized without prices
     AUTH-001 approval is per row; a package is approved as one row                      */

export type Approval = "pending" | "approved" | "declined" | "overridden";

/** The four leaf kinds. A package is a row kind but never a component kind (EST-017). */
export type LeafKind = "material" | "custom" | "labor" | "allowance";
export type RowKind = LeafKind | "package";

/** EST-018. Per row on the estimate, so one saved package can print either way. */
export type PrintSetting = "rolled-up" | "itemized";

export type RowComponent = {
  id: string;
  kind: LeafKind;
  item: string;
  /** EST-006: an allowance has no quantity. `null`, not 1. */
  qty: number | null;
  unit: string | null;
  /** Per unit, copied from the catalog at the moment of adding (EST-007). */
  costCents: number;
  sellCents: number;
};

/**
 * One shape for all five kinds rather than a discriminated union, because every editing
 * handler on the screen is generic over rows — set the price, set the quantity, rename,
 * delete — and a union turns each of those into a narrowing exercise for no gain in a
 * lab. `kind` says which fields mean anything: leaves use `qty`/`unit`/`costCents`/
 * `sellCents` and leave `components` empty; a package uses `components` and `print` and
 * has no quantity of its own.
 */
export type EstimateRow = {
  id: string;
  kind: RowKind;
  /** The customer reads this. For a package it is the only description they get. */
  name: string;
  approval: Approval;
  /** One line of provenance under the name — how it was answered, where it came from. */
  how?: string;
  qty: number | null;
  unit: string | null;
  costCents: number;
  sellCents: number;
  /** EST-003 / EST-014: set by hand, and then it wins. */
  setPriceCents: number | null;
  components: RowComponent[];
  print: PrintSetting;
  /** EST-015 vs EST-016: a saved package's name, or undefined for one built here. */
  fromPackage?: string;
};

export const isPackage = (r: EstimateRow) => r.kind === "package";

const leafAmount = (c: { qty: number | null; sellCents: number }) =>
  Math.round((c.qty ?? 1) * c.sellCents);
const leafCost = (c: { qty: number | null; costCents: number }) =>
  Math.round((c.qty ?? 1) * c.costCents);

/** What the contents add up to. Zero for a leaf row, which has no contents. */
export const componentSum = (r: EstimateRow) => r.components.reduce((a, c) => a + leafAmount(c), 0);

/** EST-003's "component total", or a leaf's quantity × price. The number a typed price overrides. */
export const rowComputed = (r: EstimateRow) => (isPackage(r) ? componentSum(r) : leafAmount(r));

/** EST-003 / EST-014: the typed price wins where there is one. */
export const rowPrice = (r: EstimateRow) => r.setPriceCents ?? rowComputed(r);

/** EST-004: cost is the contents' cost, or the leaf's own. Internal (ROLE-005). */
export const rowCost = (r: EstimateRow) =>
  isPackage(r) ? r.components.reduce((a, c) => a + leafCost(c), 0) : leafCost(r);

/** AUTH-005: authorized means approved or overridden. Nothing else bills. */
export const isAuthorized = (r: EstimateRow) =>
  r.approval === "approved" || r.approval === "overridden";

/* --- The catalog (PUR-001) ------------------------------------------------------------
   Materials only. Labor, allowances and custom items are typed in on the spot, because
   nothing in the punch list says an ink allowance is a catalog record and PUR-001 only
   describes materials — see the open question in the Rules Catalog before adding one. */

export type CatalogMaterial = {
  id: string;
  name: string;
  unit: string;
  costCents: number;
  sellCents: number;
  vendor: string;
};

export const catalogMaterials: CatalogMaterial[] = [
  { id: "mpi-1105", name: "Avery MPI 1105 wrap film", unit: "ft", costCents: 310, sellCents: 750, vendor: "Grimco" },
  { id: "dol-1460z", name: "Avery DOL 1460Z overlaminate", unit: "ft", costCents: 205, sellCents: 450, vendor: "Grimco" },
  { id: "cast-white", name: "Cast vinyl · white", unit: "ft", costCents: 280, sellCents: 690, vendor: "Fellers" },
  { id: "perf-window", name: "Perforated window film", unit: "ft", costCents: 420, sellCents: 980, vendor: "Grimco" },
  { id: "reflective", name: "Reflective lettering vinyl", unit: "ft", costCents: 600, sellCents: 1500, vendor: "Fellers" },
  { id: "striping", name: "Avery reflective striping", unit: "ft", costCents: 600, sellCents: 1200, vendor: "Fellers" },
  { id: "wall-vinyl", name: "Wall vinyl", unit: "ft", costCents: 390, sellCents: 1250, vendor: "Grimco" },
  { id: "decal-set", name: "Cut vinyl decal set", unit: "ea", costCents: 4800, sellCents: 11000, vendor: "In-house" },
  { id: "door-set", name: "Cut vinyl door set", unit: "ea", costCents: 5200, sellCents: 14000, vendor: "In-house" },
  { id: "graphics-set", name: "Cut vinyl graphics", unit: "ea", costCents: 9500, sellCents: 22000, vendor: "In-house" },
  { id: "laminate-gloss", name: "Gloss laminate", unit: "ft", costCents: 190, sellCents: 420, vendor: "Fellers" },
  { id: "magnetic", name: "Magnetic sheet · 24in", unit: "ft", costCents: 850, sellCents: 1900, vendor: "Grimco" },
];

/* --- Saved packages (PUR-011) ---------------------------------------------------------
   A name, an optional default price, a default print setting, and contents. No stock, no
   vendor, no inventory meaning. Adding one COPIES it in (EST-016): editing the saved
   package later never touches an estimate that used it. */

export type SavedPackage = {
  id: string;
  name: string;
  note: string;
  defaultPriceCents: number | null;
  print: PrintSetting;
  components: Omit<RowComponent, "id">[];
};

export const savedPackages: SavedPackage[] = [
  {
    id: "full-wrap-van",
    name: "Full wrap · one-ton van",
    note: "Film, laminate, ink, design, install",
    defaultPriceCents: null,
    print: "rolled-up",
    components: [
      { kind: "material", item: "Avery MPI 1105 wrap film", qty: 62, unit: "ft", costCents: 310, sellCents: 750 },
      { kind: "material", item: "Avery DOL 1460Z overlaminate", qty: 62, unit: "ft", costCents: 205, sellCents: 450 },
      { kind: "allowance", item: "Latex ink", qty: null, unit: null, costCents: 3800, sellCents: 8500 },
      { kind: "allowance", item: "Install supplies", qty: null, unit: null, costCents: 2200, sellCents: 4500 },
      { kind: "labor", item: "Design", qty: 4, unit: "hr", costCents: 3500, sellCents: 9500 },
      { kind: "labor", item: "Installation", qty: 9, unit: "hr", costCents: 2800, sellCents: 8500 },
    ],
  },
  {
    id: "door-logo-kit",
    name: "Door logo kit · pair",
    note: "Cut vinyl both doors, installed",
    defaultPriceCents: null,
    print: "rolled-up",
    components: [
      { kind: "material", item: "Cut vinyl door set", qty: 2, unit: "ea", costCents: 5200, sellCents: 14000 },
      { kind: "allowance", item: "Install supplies", qty: null, unit: null, costCents: 2200, sellCents: 5000 },
      { kind: "labor", item: "Installation", qty: 2, unit: "hr", costCents: 2800, sellCents: 8500 },
    ],
  },
  {
    id: "dot-lettering",
    name: "DOT lettering set",
    note: "Reflective lettering, both sides",
    defaultPriceCents: null,
    // Cam shows this one to the customer: it is a compliance item and they want to read
    // that it was done. The list prints, the prices do not (EST-018).
    print: "itemized",
    components: [
      { kind: "material", item: "Reflective lettering vinyl", qty: 14, unit: "ft", costCents: 600, sellCents: 1500 },
      { kind: "labor", item: "Design", qty: 1, unit: "hr", costCents: 3500, sellCents: 9500 },
      { kind: "labor", item: "Installation", qty: 6, unit: "hr", costCents: 2800, sellCents: 8500 },
      { kind: "allowance", item: "Install supplies", qty: null, unit: null, costCents: 2200, sellCents: 5000 },
    ],
  },
];

/* --- Builders --------------------------------------------------------------------------
   Used by the seed data below and by the editor's Add dialog, so a row added by hand is
   the same shape as a row that shipped with the lab. */

let seq = 0;
const nextId = () => `n${++seq}`;

export const leafRow = (
  kind: LeafKind,
  name: string,
  opts: { qty?: number | null; unit?: string | null; costCents?: number; sellCents?: number; approval?: Approval; how?: string } = {}
): EstimateRow => ({
  id: nextId(),
  kind,
  name,
  approval: opts.approval ?? "pending",
  how: opts.how,
  // EST-006: an allowance has no quantity, whatever the caller passes.
  qty: kind === "allowance" ? null : (opts.qty ?? 1),
  unit: kind === "allowance" ? null : (opts.unit ?? "ea"),
  costCents: opts.costCents ?? 0,
  sellCents: opts.sellCents ?? 0,
  setPriceCents: null,
  components: [],
  print: "rolled-up",
});

export const componentOf = (
  kind: LeafKind,
  item: string,
  opts: { qty?: number | null; unit?: string | null; costCents?: number; sellCents?: number } = {}
): RowComponent => ({
  id: nextId(),
  kind,
  item,
  qty: kind === "allowance" ? null : (opts.qty ?? 1),
  unit: kind === "allowance" ? null : (opts.unit ?? "ea"),
  costCents: opts.costCents ?? 0,
  sellCents: opts.sellCents ?? 0,
});

export const packageRow = (
  name: string,
  components: RowComponent[],
  opts: { approval?: Approval; how?: string; setPriceCents?: number | null; print?: PrintSetting; fromPackage?: string } = {}
): EstimateRow => ({
  id: nextId(),
  kind: "package",
  name,
  approval: opts.approval ?? "pending",
  how: opts.how,
  qty: null,
  unit: null,
  costCents: 0,
  sellCents: 0,
  setPriceCents: opts.setPriceCents ?? null,
  components,
  print: opts.print ?? "rolled-up",
  fromPackage: opts.fromPackage,
});

/** EST-016: copy the saved package in, taking the catalog's current values with it. */
export const fromSavedPackage = (p: SavedPackage): EstimateRow =>
  packageRow(
    p.name,
    p.components.map((c) => ({ ...c, id: nextId() })),
    { setPriceCents: p.defaultPriceCents, print: p.print, fromPackage: p.name }
  );

/** EST-007: a catalog material becomes a leaf row carrying copies of its numbers. */
export const fromCatalog = (m: CatalogMaterial): EstimateRow =>
  leafRow("material", m.name, { qty: 1, unit: m.unit, costCents: m.costCents, sellCents: m.sellCents });

export const catalogComponent = (m: CatalogMaterial): RowComponent =>
  componentOf("material", m.name, { qty: 1, unit: m.unit, costCents: m.costCents, sellCents: m.sellCents });

/* --- Seed estimates -------------------------------------------------------------------
   Every estimate in the list has rows, because an editor that shows the same three lines
   whatever you clicked is a screen that contradicts the list above it.

   E-1048 is the showcase: all five row kinds, a package priced by its contents, a second
   package priced by hand, a third printed itemized, and three approval states. The other
   seven are shorter and deliberately plainer. */

export const estimateRows: Record<string, EstimateRow[]> = {
  "E-1048": [
    packageRow(
      "Full wrap · Unit 14",
      [
        componentOf("material", "Avery MPI 1105 wrap film", { qty: 62, unit: "ft", costCents: 310, sellCents: 750 }),
        componentOf("material", "Avery DOL 1460Z overlaminate", { qty: 62, unit: "ft", costCents: 205, sellCents: 450 }),
        componentOf("allowance", "Latex ink", { costCents: 3800, sellCents: 8500 }),
        componentOf("allowance", "Install supplies", { costCents: 2200, sellCents: 4500 }),
        componentOf("labor", "Design", { qty: 4, unit: "hr", costCents: 3500, sellCents: 9500 }),
        componentOf("labor", "Installation", { qty: 5, unit: "hr", costCents: 2800, sellCents: 8500 }),
      ],
      { approval: "approved", how: "Approved by Dana Hoff by phone, Oct 28", fromPackage: "Full wrap · one-ton van" }
    ),
    // Top-level material: the customer reads this row. Dana asked for the striping by
    // name and wanted it priced on its own, which in this model needs no setting at all.
    leafRow("material", "Avery reflective striping", {
      qty: 12, unit: "ft", costCents: 600, sellCents: 1200,
      approval: "approved", how: "Approved by Dana Hoff by phone, Oct 28",
    }),
    leafRow("labor", "Removal of old lettering", {
      qty: 2, unit: "hr", costCents: 2800, sellCents: 8500,
      approval: "approved", how: "Approved by Dana Hoff by phone, Oct 28",
    }),
    leafRow("custom", "Outsourced router-cut badge", {
      qty: 1, unit: "ea", costCents: 1200, sellCents: 2600,
      approval: "approved", how: "Approved by Dana Hoff by phone, Oct 28",
    }),
    // EST-015: built here, lives here. EST-014: priced by hand, so the component total
    // is kept beside it rather than driving it.
    packageRow(
      "Rear window perforated",
      [
        componentOf("material", "Perforated window film", { qty: 18, unit: "ft", costCents: 420, sellCents: 980 }),
        componentOf("labor", "Installation", { qty: 2, unit: "hr", costCents: 2800, sellCents: 8500 }),
      ],
      { setPriceCents: 48000 }
    ),
    packageRow(
      "Hood decal kit",
      [
        componentOf("custom", "Cut vinyl hood decal", { qty: 1, unit: "ea", costCents: 4200, sellCents: 11000 }),
        componentOf("labor", "Installation", { qty: 1.5, unit: "hr", costCents: 2800, sellCents: 8500 }),
      ],
      { approval: "declined", how: "Declined by Dana Hoff by phone, Oct 28", print: "itemized" }
    ),
  ],

  "E-1053": [
    packageRow(
      "Door logo kit ×3",
      [
        componentOf("material", "Cut vinyl door set", { qty: 3, unit: "ea", costCents: 5200, sellCents: 14000 }),
        componentOf("labor", "Installation", { qty: 2, unit: "hr", costCents: 2800, sellCents: 8500 }),
        componentOf("allowance", "Install supplies", { costCents: 2200, sellCents: 5000 }),
      ],
      { fromPackage: "Door logo kit · pair" }
    ),
  ],

  "E-1052": [
    packageRow(
      "Box truck logo kit",
      [
        componentOf("material", "Cut vinyl graphics", { qty: 2, unit: "ea", costCents: 9500, sellCents: 22000 }),
        componentOf("material", "Avery MPI 1105 wrap film", { qty: 24, unit: "ft", costCents: 310, sellCents: 750 }),
        componentOf("labor", "Design", { qty: 2, unit: "hr", costCents: 3500, sellCents: 9500 }),
        componentOf("labor", "Installation", { qty: 4, unit: "hr", costCents: 2800, sellCents: 8500 }),
        componentOf("allowance", "Install supplies", { costCents: 1500, sellCents: 3500 }),
      ],
      { approval: "approved", how: "Approved by Ruth Keller by email, Oct 29" }
    ),
  ],

  "E-1046": [
    packageRow(
      "Rear door graphics · Truck 3",
      [
        componentOf("material", "Cut vinyl graphics", { qty: 1, unit: "ea", costCents: 9500, sellCents: 22000 }),
        componentOf("labor", "Installation", { qty: 2, unit: "hr", costCents: 2800, sellCents: 8500 }),
        componentOf("allowance", "Install supplies", { costCents: 1800, sellCents: 9000 }),
      ],
      { approval: "approved", how: "Approved by Marco Tulli by phone, Oct 24", print: "itemized" }
    ),
  ],

  "E-1044": [
    packageRow(
      "DOT lettering · Tanker 11",
      [
        componentOf("material", "Reflective lettering vinyl", { qty: 14, unit: "ft", costCents: 600, sellCents: 1500 }),
        componentOf("labor", "Design", { qty: 1, unit: "hr", costCents: 3500, sellCents: 9500 }),
        componentOf("labor", "Installation", { qty: 6, unit: "hr", costCents: 2800, sellCents: 8500 }),
        componentOf("allowance", "Install supplies", { costCents: 2200, sellCents: 5000 }),
      ],
      { approval: "approved", how: "Approved by Glen Zimmerman by phone, Oct 22", print: "itemized", fromPackage: "DOT lettering set" }
    ),
  ],

  // Still a draft (EST-012), so nothing has been answered. The scaffold is a custom row
  // at the top level because the customer is being told what it is.
  "E-1043": [
    packageRow("Shop wall mural · Bay 2 wall", [
      componentOf("material", "Wall vinyl", { qty: 48, unit: "ft", costCents: 390, sellCents: 1250 }),
      componentOf("labor", "Design", { qty: 3, unit: "hr", costCents: 3500, sellCents: 9500 }),
      componentOf("labor", "Installation", { qty: 6, unit: "hr", costCents: 2800, sellCents: 8500 }),
      componentOf("allowance", "Install supplies", { costCents: 1500, sellCents: 3500 }),
    ]),
    leafRow("custom", "Scaffold rental, billed at cost", {
      qty: 1, unit: "ea", costCents: 15000, sellCents: 15000,
    }),
  ],

  "E-1041": [
    leafRow("material", "Cut vinyl decal set", {
      qty: 2, unit: "ea", costCents: 4800, sellCents: 11000,
      approval: "approved", how: "Approved by Dana Hoff by phone, Oct 20",
    }),
    leafRow("labor", "Installation", {
      qty: 2, unit: "hr", costCents: 2800, sellCents: 10000,
      approval: "approved", how: "Approved by Dana Hoff by phone, Oct 20",
    }),
  ],

  "E-1039": [
    packageRow(
      "Full wrap · 48ft trailer",
      [
        componentOf("material", "Avery MPI 1105 wrap film", { qty: 160, unit: "ft", costCents: 310, sellCents: 750 }),
        componentOf("material", "Avery DOL 1460Z overlaminate", { qty: 160, unit: "ft", costCents: 205, sellCents: 450 }),
        componentOf("allowance", "Latex ink", { costCents: 5400, sellCents: 12000 }),
        componentOf("allowance", "Install supplies", { costCents: 2800, sellCents: 6000 }),
        componentOf("labor", "Design", { qty: 4, unit: "hr", costCents: 3500, sellCents: 9500 }),
        componentOf("labor", "Installation", { qty: 8, unit: "hr", costCents: 2800, sellCents: 8500 }),
      ],
      { approval: "declined", how: "Declined by Glen Zimmerman by phone, Oct 16", fromPackage: "Full wrap · one-ton van" }
    ),
  ],
};

export const rowsFor = (estimateNo: string) => estimateRows[estimateNo] ?? [];

/** What was offered: every row, answered or not. */
export const offeredTotal = (estimateNo: string) =>
  rowsFor(estimateNo).reduce((a, r) => a + rowPrice(r), 0);

/** AUTH-005: what can actually be invoiced. Never the same number as offered. */
export const authorizedTotal = (estimateNo: string) =>
  rowsFor(estimateNo).filter(isAuthorized).reduce((a, r) => a + rowPrice(r), 0);
