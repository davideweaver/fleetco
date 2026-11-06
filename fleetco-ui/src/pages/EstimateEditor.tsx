import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Package,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { estimates, type EstimateStatus } from "@/data/sample";
import {
  catalogComponent,
  catalogMaterials,
  componentOf,
  fromCatalog,
  fromSavedPackage,
  isAuthorized,
  isPackage,
  leafRow,
  packageRow,
  rowComputed,
  rowCost,
  rowPrice,
  rowsFor,
  savedPackages,
  type Approval,
  type EstimateRow,
  type LeafKind,
  type RowComponent,
} from "@/data/estimate";
import { useShell } from "@/shell/shell-context";
import { Btn, DetailHeader, Pill } from "@/shell/ListDetailLayout";
import { CellInput, MoneyCell } from "@/components/ui/field";
import { Overlay } from "@/components/ui/overlay";
import { StatusPill } from "@/components/ui/status-pill";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ApprovalHistory,
  ApprovalDialog,
  type ApprovalRecord,
} from "@/components/ui/approval";
import { toast } from "sonner";
import { cn, money } from "@/lib/utils";

/**
 * The estimate editor — the densest screen in V1 and the honest test of the type scale
 * and the spacing.
 *
 * What it has to make obvious, from the rules rather than from taste:
 *
 *   EST-002  An estimate is a FLAT LIST OF ROWS and only a package has contents. A
 *            material, labor or custom row sitting at the top level is what the customer
 *            reads; put it in a package and it is internal. There is no display flag,
 *            because the structure already says it.
 *   EST-003  A set price wins over the component total, and the total is still shown,
 *            because the whole point of keeping it is that someone can compare the two.
 *   EST-006  An allowance has no quantity. The cell is empty, not "1".
 *   EST-015  A package can be built here and live only here. The Add dialog offers that
 *            next to the saved ones, because Cam estimates ad hoc.
 *   EST-017  A package never contains a package. The dialog does not offer one.
 *   EST-018  A package row prints rolled up, or itemized without prices. The control is
 *            an eye in the row's action gutter, and it says what the CUSTOMER will see
 *            rather than what the setting is called.
 *   AUTH-001 Approval is per row, and a package is approved as one row.
 *   AUTH-005 Only authorized rows bill. The footer shows BOTH totals, because "what we
 *            offered" and "what we will invoice" are different numbers and confusing them
 *            is how a shop under-bills.
 *   ROLE-005 A technician sees no cost, no margin, and no component selling price.
 */
export function EstimateEditor({ estimateId }: { estimateId: string }) {
  const { role } = useShell();
  const [params] = useSearchParams();
  const owner = role === "owner";

  // Editable, and seeded from the estimate you clicked. The old version showed one
  // hardcoded set of three lines whatever the list said, which made the screen and the
  // list contradict each other.
  const [rows, setRows] = useState<EstimateRow[]>(() => rowsFor(estimateId));
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setRows(rowsFor(estimateId));
    setOpen(new Set());
  }, [estimateId]);

  const [, setParams] = useSearchParams();
  // In the URL, like `?overlay=`, so a link can land on the record of who approved what
  // and Back still means Back. `replace` keeps switching tabs out of the history stack —
  // it is a way of looking at the same record, not a place you went.
  const tab = params.get("tab") === "history" && owner ? "history" : "rows";
  const setTab = (key: string) =>
    setParams(
      (p) => {
        key === "rows" ? p.delete("tab") : p.set("tab", key);
        return p;
      },
      { replace: true }
    );

  const overlay = params.get("overlay");
  const [answering, setAnswering] = useState(overlay === "approve");
  const [preview, setPreview] = useState(false);
  /** `null` adds to the estimate; a row id adds into that package. */
  const [adding, setAdding] = useState<string | null | false>(false);

  // AUTH-002/003: the record, seeded from whatever each row already carries. Keyed by
  // row id, and reset with the estimate like everything else here.
  const [history, setHistory] = useState<Record<string, ApprovalRecord[]>>(() =>
    seedHistory(rowsFor(estimateId))
  );
  useEffect(() => setHistory(seedHistory(rowsFor(estimateId))), [estimateId]);

  const est = estimates.find((e) => e.no === estimateId);

  const records = Object.values(history).reduce((a, rs) => a + rs.length, 0);

  const offered = rows.reduce((a, r) => a + rowPrice(r), 0);
  const authorized = rows.filter(isAuthorized).reduce((a, r) => a + rowPrice(r), 0);
  const cost = rows.filter(isAuthorized).reduce((a, r) => a + rowCost(r), 0);

  const patch = (id: string, change: Partial<EstimateRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...change } : r)));

  const patchComponent = (rowId: string, cId: string, change: Partial<RowComponent>) =>
    setRows((rs) =>
      rs.map((r) =>
        r.id === rowId
          ? { ...r, components: r.components.map((c) => (c.id === cId ? { ...c, ...change } : c)) }
          : r
      )
    );

  const addRow = (row: EstimateRow) => {
    setRows((rs) => [...rs, row]);
    // A package arrives with contents, so it opens: the reason you added it is the thing
    // that is now hidden.
    if (isPackage(row)) setOpen((s) => new Set(s).add(row.id));
    toast.success(`Added ${row.name}`, {
      description: isPackage(row)
        ? "Copied in. Editing it here never changes the saved package (EST-016)."
        : "The customer reads this row. Move it into a package to hide it.",
    });
  };

  const addComponent = (rowId: string, c: RowComponent) =>
    setRows((rs) =>
      rs.map((r) => (r.id === rowId ? { ...r, components: [...r.components, c] } : r))
    );

  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));
  const removeComponent = (rowId: string, cId: string) =>
    setRows((rs) =>
      rs.map((r) =>
        r.id === rowId ? { ...r, components: r.components.filter((c) => c.id !== cId) } : r
      )
    );

  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const addingInto = typeof adding === "string" ? rows.find((r) => r.id === adding) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DetailHeader
        eyebrow={`Estimate · ${est?.customer ?? "Ridgeline Plumbing & Heating"}`}
        title={`${estimateId}${est ? ` · ${est.what}` : " · Unit 14 full wrap"}`}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill
              section="estimates"
              id={estimateId}
              status={est?.status ?? "Partially approved"}
              calm={estimateTone(est?.status ?? "Partially approved")}
            />
            <span>
              {est && est.sent !== "—" ? `Sent ${est.sent}` : "Not sent"} ·{" "}
              {rows.length} {rows.length === 1 ? "row" : "rows"}
            </span>
          </span>
        }
        actions={
          owner ? (
            <>
              <span onClick={() => setPreview(true)}>
                <Btn>Preview</Btn>
              </span>
              <span onClick={() => setAnswering(true)}>
                <Btn primary>Approval</Btn>
              </span>
            </>
          ) : undefined
        }
        /* Only the Owner has a second view. One tab is not a tab strip — it is a line
           across the screen saying nothing. */
        tabs={
          owner ? (
            <Tabs
              tabs={[
                { key: "rows", label: "Rows", count: rows.length },
                { key: "history", label: "Approval history", count: records },
              ]}
              active={tab}
              onChange={setTab}
            />
          ) : undefined
        }
      />

      <TabPanel when="rows" active={tab}>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface-3">
              <tr className="border-b text-left text-xs text-muted-foreground">
                <Th className="w-8" />
                <Th>Row</Th>
                {/* Quantity has a column of its own rather than riding beside the name.
                    Inline, "62 ft" and "4 hr" and "1 ea" never landed in the same place,
                    so there was no way to read down the estimate and see how much of
                    anything was on it. */}
                <Th right className="w-24">Qty</Th>
                <Th className="hidden @md:table-cell">Approval</Th>
                {owner && <Th right className="hidden lg:table-cell">Cost</Th>}
                {owner && <Th right className="hidden xl:table-cell">Margin</Th>}
                <Th right>Price</Th>
                {owner && <Th className="w-14" />}
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 && (
                <tr className="border-b">
                  <Td />
                  <Td colSpan={owner ? 7 : 4} className="py-6 text-muted-foreground">
                    Nothing on this estimate yet. Add a material, a saved package, or
                    something you type in yourself.
                  </Td>
                </tr>
              )}

              {/* Banded by GROUP, not by row. Striping every row would cut a package
                  away from the contents underneath it, which is the one relationship
                  this table exists to show. A package and everything inside it share a
                  tone, and the next top-level row changes it. */}
              {rows.map((row, i) => (
                <RowGroup
                  key={row.id}
                  row={row}
                  band={i % 2 === 1}
                  owner={owner}
                  open={open.has(row.id)}
                  onToggle={() => toggle(row.id)}
                  settled={(history[row.id] ?? []).length > 0}
                  onAnswer={() => setAnswering(true)}
                  onPatch={(change) => patch(row.id, change)}
                  onPatchComponent={(cId, change) => patchComponent(row.id, cId, change)}
                  onAddComponent={() => setAdding(row.id)}
                  onRemove={() => removeRow(row.id)}
                  onRemoveComponent={(cId) => removeComponent(row.id, cId)}
                />
              ))}

              {owner && (
                <tr>
                  <td colSpan={8} className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setAdding(null)}
                      className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Plus className="size-4" />
                      Add a row, or a saved package
                    </button>
                  </td>
                </tr>
              )}
            </tbody>

            {/* Two totals, never one. "Offered" is the estimate; "authorized" is what can be
                invoiced (AUTH-005). A single total hides a declined row. */}
            <tfoot className="sticky bottom-0 bg-surface-3">
              <tr className="border-t">
                <Td />
                <Td className="text-muted-foreground">Offered</Td>
                <Td />
                <Td className="hidden @md:table-cell" />
                {owner && <Td className="hidden lg:table-cell" />}
                {owner && <Td className="hidden xl:table-cell" />}
                <Td right className="text-muted-foreground">{money(offered)}</Td>
                {owner && <Td />}
              </tr>
              <tr className="border-t">
                <Td />
                <Td className="font-semibold">Authorized · goes to the invoice</Td>
                <Td />
                <Td className="hidden @md:table-cell" />
                {owner && (
                  <Td right className="hidden text-muted-foreground lg:table-cell">
                    {money(cost)}
                  </Td>
                )}
                {owner && (
                  <Td right className="hidden text-muted-foreground xl:table-cell">
                    {money(authorized - cost)}
                  </Td>
                )}
                <Td right className="text-base font-semibold">{money(authorized)}</Td>
                {owner && <Td />}
              </tr>
            </tfoot>
          </table>
        </div>
      </TabPanel>

      {/* AUTH-003: the history is the point. Showing only the current state would hide
          that someone corrected it, and the correction is part of the record.

          It was underneath the table, which is where it stopped being read: the table is
          as tall as the estimate is long, so on a real wrap the record of who approved
          what sat a screen and a half below the rows it describes. Both halves want the
          whole pane, and the thing they have in common is the estimate named above them
          — which is the test for a tab rather than a section. */}
      <TabPanel when="history" active={tab}>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 lg:px-5">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing on this estimate to approve yet.
            </p>
          ) : (
            <div className="space-y-3">
              {rows.map((r) => (
                <div key={r.id} className="overflow-hidden rounded-lg border">
                  {/* Read-only. The history records what happened; acting happens on the
                      Rows tab, next to the row. */}
                  <div className="flex items-baseline gap-3 border-b bg-muted/40 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{r.name}</span>
                    <span className="tnum shrink-0 text-xs text-muted-foreground">
                      {money(rowPrice(r))}
                    </span>
                  </div>
                  <ApprovalHistory records={history[r.id] ?? []} />
                </div>
              ))}
            </div>
          )}
        </div>
      </TabPanel>

      <AddDialog
        open={adding !== false}
        onOpenChange={(v) => setAdding(v ? null : false)}
        into={addingInto}
        onPickSaved={(p) => {
          addRow(fromSavedPackage(p));
          setAdding(false);
        }}
        onPickMaterial={(m) => {
          if (addingInto) addComponent(addingInto.id, catalogComponent(m));
          else addRow(fromCatalog(m));
          setAdding(false);
        }}
        onPickBlank={(kind) => {
          if (kind === "package") {
            addRow(packageRow("New package", []));
          } else if (addingInto) {
            addComponent(addingInto.id, componentOf(kind, BLANK_LABEL[kind]));
          } else {
            addRow(leafRow(kind, BLANK_LABEL[kind]));
          }
          setAdding(false);
        }}
      />

      <CustomerPreview
        open={preview}
        onOpenChange={setPreview}
        estimateNo={estimateId}
        customer={est?.customer ?? ""}
        rows={rows}
      />

      <ApprovalDialog
        open={answering}
        onOpenChange={setAnswering}
        eyebrow={`Estimate ${estimateId}${est ? ` · ${est.customer}` : ""}`}
        lines={rows.map((r) => ({
          id: r.id,
          name: r.name,
          priceCents: rowPrice(r),
          pending: (history[r.id] ?? []).length === 0,
        }))}
        onRecord={(ids, rec) => {
          setHistory((h) => {
            const next = { ...h };
            for (const id of ids) {
              next[id] = [...(next[id] ?? []), { ...rec, id: `a${Date.now()}${id}` }];
            }
            return next;
          });
          // The row's own state follows the record, so the price column and the totals
          // agree with the history underneath them.
          const approval: Approval =
            rec.kind === "override" ? "overridden" : rec.kind === "declined" ? "declined" : "approved";
          setRows((rs) => rs.map((r) => (ids.includes(r.id) ? { ...r, approval } : r)));
          if (rec.kind === "override") {
            toast.warning(`Overridden on ${ids.length} row${ids.length === 1 ? "" : "s"}`, {
              description: "Shown as an override everywhere, never as customer approval.",
            });
          } else {
            toast.success(`Recorded on ${ids.length} row${ids.length === 1 ? "" : "s"}`, {
              description:
                "Permanent. A correction adds a record rather than editing this one.",
            });
          }
        }}
      />
    </div>
  );
}

const seedHistory = (rows: EstimateRow[]): Record<string, ApprovalRecord[]> => {
  const out: Record<string, ApprovalRecord[]> = {};
  for (const r of rows) {
    if (r.approval === "pending" || !r.how) continue;
    // "Approved by Dana Hoff by phone, Oct 28" is the sentence the seed data carries, so
    // the record is read back out of it rather than written twice.
    const m = /^(\w+) by (.+?) by (\w+), (.+)$/.exec(r.how);
    out[r.id] = [
      {
        id: `seed-${r.id}`,
        kind: r.approval === "declined" ? "declined" : r.approval === "overridden" ? "override" : "approved",
        contact: m?.[2] ?? "—",
        method: (m?.[3] ?? "phone") as ApprovalRecord["method"],
        recordedBy: "Owner",
        recordedAt: m?.[4] ?? "—",
      },
    ];
  }
  return out;
};

const BLANK_LABEL: Record<LeafKind, string> = {
  material: "Material",
  custom: "Custom item",
  labor: "Labor",
  allowance: "Allowance",
};

/* --- One row, and its contents if it has any ----------------------------------------- */

function RowGroup({
  row,
  band,
  owner,
  open,
  onToggle,
  settled,
  onAnswer,
  onPatch,
  onPatchComponent,
  onAddComponent,
  onRemove,
  onRemoveComponent,
}: {
  row: EstimateRow;
  /** Every other group is tinted, so a package and its contents read as one block. */
  band: boolean;
  owner: boolean;
  open: boolean;
  onToggle: () => void;
  /** Already has an answer on the record, so there is nothing to act on. */
  settled: boolean;
  onAnswer: () => void;
  onPatch: (change: Partial<EstimateRow>) => void;
  onPatchComponent: (cId: string, change: Partial<RowComponent>) => void;
  onAddComponent: () => void;
  onRemove: () => void;
  onRemoveComponent: (cId: string) => void;
}) {
  const pkg = isPackage(row);
  const declined = row.approval === "declined";
  const cost = rowCost(row);
  const price = rowPrice(row);
  // AUTH-005 again, at the row: anything not authorized is not going on an invoice, and
  // the price column says so rather than leaving the reader to add it up.
  const billable = isAuthorized(row);

  return (
    <>
      <tr className={cn("border-b", band && "bg-row-band", declined && "opacity-55")}>
        <Td>
          {/* Only a package has anything to expand. A chevron on a material row would be
              a door to an empty room. */}
          {pkg && (
            <button
              type="button"
              onClick={onToggle}
              aria-label={open ? "Hide contents" : "Show contents"}
              aria-expanded={open}
              className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent"
            >
              {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          )}
        </Td>

        <Td>
          <div className="flex flex-wrap items-center gap-2">
            {pkg && <Package className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />}
            {/* Weight is the hierarchy. A package is a customer line worth four figures
                and a material row is one item on it; at the same weight the reader has
                to work out which is which from the indent of the rows below. */}
            {owner ? (
              <NameInput
                value={row.name}
                onChange={(name) => onPatch({ name })}
                strike={declined}
                weight={pkg ? "semibold" : "medium"}
              />
            ) : (
              <span className={cn(pkg ? "font-semibold" : "font-medium", declined && "line-through")}>
                {row.name}
              </span>
            )}
            {!pkg && <KindTag kind={row.kind as LeafKind} />}
          </div>

          <div className="text-xs text-muted-foreground @md:hidden">
            <ApprovalPill approval={row.approval} />
          </div>

          {/* `row.how` — "Approved by Dana Hoff by phone, Oct 28" — used to print here,
              on every answered row. Four of those sentences down one estimate was most
              of the grey on the screen, and every word of it is now on the Approval
              history tab, which is where someone goes to read it. */}

          {pkg && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {row.components.length}{" "}
              {row.components.length === 1 ? "item" : "items"}
              {" · "}
              {/* EST-015 vs EST-016, in the only words that matter at this altitude:
                  where did this come from, and is it linked to anything? It is not. */}
              {row.fromPackage ? `from “${row.fromPackage}”, copied` : "built on this estimate"}
            </div>
          )}

          {/* EST-003 / EST-014: the comparison only earns its keep if it is on screen. */}
          {owner && row.setPriceCents !== null && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              Price set by hand. {pkg ? "Contents" : "Quantity × price"} total{" "}
              {money(rowComputed(row))}.{" "}
              <button
                type="button"
                onClick={() => onPatch({ setPriceCents: null })}
                className="underline decoration-dotted hover:text-foreground"
              >
                Use the total
              </button>
            </div>
          )}
        </Td>

        <Td right>
          {/* A package has no quantity of its own — its quantities live on the rows
              inside it, and a "1" here would be a number that means nothing. */}
          {pkg ? (
            <span className="text-muted-foreground/50">—</span>
          ) : row.kind === "allowance" ? (
            // EST-006: an allowance has no quantity. Say so once, quietly.
            <span className="text-xs text-muted-foreground">none</span>
          ) : owner ? (
            <CellInput
              value={row.qty === null ? "" : String(row.qty)}
              onChange={(v) => onPatch({ qty: v === "" ? null : Number(v) })}
              width="w-10"
              suffix={row.unit ?? ""}
            />
          ) : (
            <span className="tnum text-muted-foreground">
              {row.qty} {row.unit ?? ""}
            </span>
          )}
        </Td>

        {/* The action lives where the state is. A row waiting on an answer is the only
            row you can do anything to, so only that one is actionable — an Override on
            an approved row is meaningless, and offering it invites the mistake. */}
        <Td className="hidden @md:table-cell">
          {owner && !settled ? (
            <PendingButton onClick={onAnswer} />
          ) : (
            <ApprovalPill approval={row.approval} />
          )}
        </Td>

        {owner && (
          <Td right className="hidden text-muted-foreground lg:table-cell">
            {/* What a thing costs you is typed in, not looked up: EST-007 copies the
                catalog's number in once and the catalog never reaches back (a PO that
                changes Last Cost leaves this estimate alone, PUR-006). So the copy has
                to be correctable — Cam knows what he paid for this roll.

                A package has no cost of its own. Its cost IS its contents' cost, and a
                typed number here would contradict the rows directly underneath it with
                no second figure kept to compare. The one number you can set on a package
                is its price, and that one keeps the total beside it. */}
            {pkg ? (
              money(cost)
            ) : (
              <MoneyCell
                valueCents={cost}
                onChangeCents={(cents) => onPatch({ costCents: perUnit(cents, row.qty) })}
                width="w-24"
              />
            )}
          </Td>
        )}
        {owner && (
          <Td right className="hidden xl:table-cell">
            <span className={cn(price - cost <= 0 && "text-destructive")}>
              {money(price - cost)}
            </span>
          </Td>
        )}

        <Td right>
          <span className={cn(!billable && "text-muted-foreground")}>
            {owner ? (
              <MoneyCell
                valueCents={price}
                onChangeCents={(cents) =>
                  // Typing the computed number back in is not a decision, so it does not
                  // become one. Only a different number pins the row (EST-014).
                  onPatch({ setPriceCents: cents === rowComputed(row) ? null : cents })
                }
              />
            ) : (
              <span className="tnum">{money(price)}</span>
            )}
          </span>
        </Td>

        {owner && (
          <Td>
            {/* The row's two verbs, in one gutter. Only a package has something to show
                or hide, so a leaf row has one button here and no empty slot — an eye on
                a material row would offer a choice that does not exist. */}
            <div className="flex items-center justify-end gap-0.5">
              {pkg && <PrintToggle row={row} onPatch={onPatch} />}
              <RemoveButton label={`Remove ${row.name}`} onClick={onRemove} />
            </div>
          </Td>
        )}
      </tr>

      {pkg &&
        open &&
        row.components.map((c) => (
          <ComponentRow
            key={c.id}
            c={c}
            owner={owner}
            dim={declined}
            onPatch={(change) => onPatchComponent(c.id, change)}
            onRemove={() => onRemoveComponent(c.id)}
          />
        ))}

      {pkg && open && owner && (
        <tr className={cn("border-b bg-row-band", declined && "opacity-55")}>
          <Td />
          <Td colSpan={7}>
            <button
              type="button"
              onClick={onAddComponent}
              className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Plus className="size-3.5" />
              Add material, labor, allowance or custom item
            </button>
          </Td>
        </tr>
      )}
    </>
  );
}

/**
 * EST-018 as one eye in the row's action gutter, beside the delete.
 *
 * It was a worded two-state button on the package's meta line first — "Customer sees the
 * name only" — and the words were right but the place was wrong: a sentence sitting in
 * the middle of the table was the loudest thing on a row whose actual subject is a wrap,
 * and it repeated itself down every package. The decision is a row action, so it lives
 * where the row's other action lives.
 *
 * **The eye is literal, which is why it survives losing its label.** Crossed out, the
 * customer cannot see inside; open, they can. The sentence is still the tooltip, because
 * an icon that means something precise should be able to say it on demand.
 */
function PrintToggle({
  row,
  onPatch,
}: {
  row: EstimateRow;
  onPatch: (change: Partial<EstimateRow>) => void;
}) {
  const itemized = row.print === "itemized";
  const Icon = itemized ? Eye : EyeOff;
  const says = itemized
    ? "Customer sees what is included"
    : "Customer sees the name only";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onPatch({ print: itemized ? "rolled-up" : "itemized" })}
          aria-pressed={itemized}
          aria-label={`${says}. Click to ${itemized ? "roll it up" : "list what is included"}.`}
          className={cn(
            "grid size-6 place-items-center rounded-md hover:bg-accent hover:text-foreground",
            // An itemized package is the exception, so it is the one that carries weight.
            // Both states have to be readable, though — a 40%-grey icon is a disabled one.
            itemized ? "text-foreground" : "text-muted-foreground/60"
          )}
        >
          <Icon className="size-3.5" strokeWidth={1.75} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">
        {says}
        <span className="block font-normal opacity-75">
          Click to {itemized ? "roll it up" : "list what is included"}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

function ComponentRow({
  c,
  owner,
  dim,
  onPatch,
  onRemove,
}: {
  c: RowComponent;
  owner: boolean;
  dim: boolean;
  onPatch: (change: Partial<RowComponent>) => void;
  onRemove: () => void;
}) {
  return (
    <tr
      className={cn(
        // A step down in tone AND a step down in weight. Contents were set in the same
        // medium as the row that owns them, which is most of why a long package read as
        // one grey block with no top to it.
        //
        // Two tones in the whole table, doing two jobs at once. Contents are ALWAYS
        // tinted, so nesting reads everywhere; a banded top-level row takes the same
        // tint, so a banded package and its contents become one block and the next
        // top-level row starts clean. Three or four tones were tried on paper and each
        // extra one only made "which package is this inside" harder, not easier.
        "border-b border-border/50 bg-row-band text-muted-foreground",
        dim && "opacity-55"
      )}
    >
      <Td />
      <Td>
        <div className="flex flex-wrap items-center gap-2 pl-5">
          {owner ? (
            <NameInput value={c.item} onChange={(item) => onPatch({ item })} weight="normal" />
          ) : (
            <span>{c.item}</span>
          )}
          <KindTag kind={c.kind} />
        </div>
      </Td>
      <Td right>
        {/* EST-006: an allowance has no quantity. Empty, not "1". */}
        {c.kind === "allowance" ? (
          <span className="text-xs">none</span>
        ) : owner ? (
          <CellInput
            value={c.qty === null ? "" : String(c.qty)}
            onChange={(v) => onPatch({ qty: v === "" ? null : Number(v) })}
            width="w-10"
            suffix={c.unit ?? ""}
          />
        ) : (
          <span className="tnum text-xs">
            {c.qty} {c.unit ?? ""}
          </span>
        )}
      </Td>
      <Td className="hidden @md:table-cell" />
      {owner && (
        <Td right className="hidden lg:table-cell">
          <MoneyCell
            valueCents={Math.round((c.qty ?? 1) * c.costCents)}
            onChangeCents={(cents) => onPatch({ costCents: perUnit(cents, c.qty) })}
            width="w-24"
          />
        </Td>
      )}
      {owner && <Td className="hidden xl:table-cell" />}
      {/* ROLE-005: a technician sees the scope, never a price. */}
      <Td right>
        {owner ? (
          <MoneyCell
            valueCents={Math.round((c.qty ?? 1) * c.sellCents)}
            onChangeCents={(cents) => onPatch({ sellCents: perUnit(cents, c.qty) })}
          />
        ) : (
          ""
        )}
      </Td>
      {owner && (
        <Td>
          <RemoveButton label={`Remove ${c.item}`} onClick={onRemove} />
        </Td>
      )}
    </tr>
  );
}

/* --- Adding -------------------------------------------------------------------------- */

/**
 * One dialog for both questions — "what goes on this estimate" and "what goes in this
 * package" — because they are the same question asked one level apart, and the only
 * difference is that a package is not on the menu inside a package (EST-017).
 *
 * Built on the job picker's rules, which were learnt the hard way on the clock screen: a
 * plain question for a title, ONE list with one row shape, groups banded on `--muted` and
 * named for what they hold, no chevrons, and a filter only once there is something to
 * filter.
 */
function AddDialog({
  open,
  onOpenChange,
  into,
  onPickSaved,
  onPickMaterial,
  onPickBlank,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The package being filled, or undefined when adding to the estimate itself. */
  into?: EstimateRow;
  onPickSaved: (p: (typeof savedPackages)[number]) => void;
  onPickMaterial: (m: (typeof catalogMaterials)[number]) => void;
  onPickBlank: (kind: LeafKind | "package") => void;
}) {
  const [q, setQ] = useState("");
  useEffect(() => {
    if (open) setQ("");
  }, [open]);

  const term = q.trim().toLowerCase();
  const materials = useMemo(
    () =>
      term
        ? catalogMaterials.filter((m) => `${m.name} ${m.vendor}`.toLowerCase().includes(term))
        : catalogMaterials,
    [term]
  );

  // Same threshold and the same reason as the job picker: below it the whole list is on
  // screen and a search box is a control that can only slow you down.
  const filtering = catalogMaterials.length >= 8;

  return (
    <Overlay
      kind="dialog"
      open={open}
      onOpenChange={onOpenChange}
      title={into ? `What goes in ${into.name}?` : "What are you adding?"}
      note={
        <>
          {/* The consequence of the choice, pinned above the rows it governs. Which half
              of the model you land in is decided here, and it is the one thing about this
              dialog that is not obvious from the list. */}
          <p className="px-4 py-3 text-sm text-muted-foreground">
            {into ? (
              <>
                Anything in here is <span className="font-medium text-foreground">internal</span> —
                the customer reads “{into.name}” and its price.
              </>
            ) : (
              <>
                A row here is{" "}
                <span className="font-medium text-foreground">what the customer reads</span>. Put it
                inside a package instead and it becomes internal.
              </>
            )}
          </p>
          {filtering && (
            <div className="flex items-center gap-2.5 border-t px-4 py-2.5">
              <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Filter ${catalogMaterials.length} materials…`}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}
        </>
      }
    >
      {/* EST-017: no packages inside a package, so the group is simply not here. An
          offered-then-refused option is worse than one that never appeared. */}
      {!into && (
        <PickGroup label="Saved packages">
          {savedPackages.map((p) => (
            <PickRow
              key={p.id}
              lead={<Package className="size-4" strokeWidth={1.75} />}
              title={p.name}
              sub={`${p.note} · ${p.components.length} items`}
              onClick={() => onPickSaved(p)}
            />
          ))}
        </PickGroup>
      )}

      <PickGroup label="Material catalog">
        {materials.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            No material matches “{q.trim()}”. Add it as a custom item below.
          </p>
        ) : (
          materials.map((m) => (
            <PickRow
              key={m.id}
              gutter={money(m.sellCents)}
              title={m.name}
              sub={`${m.vendor} · per ${m.unit}`}
              onClick={() => onPickMaterial(m)}
            />
          ))
        )}
      </PickGroup>

      {/* Named for what it holds. EST-008 and EST-015 both live in this group: a line with
          no catalog record, and a package with no catalog record. */}
      <PickGroup label="Type it in">
        <PickRow title="Custom item" sub="No catalog record (EST-008)" onClick={() => onPickBlank("custom")} />
        <PickRow title="Labor" sub="Hours and a rate" onClick={() => onPickBlank("labor")} />
        <PickRow title="Allowance" sub="Ink, alcohol, supplies — no quantity (EST-006)" onClick={() => onPickBlank("allowance")} />
        {!into && (
          <PickRow
            lead={<Package className="size-4" strokeWidth={1.75} />}
            title="Empty package"
            sub="Build one here; it lives on this estimate only (EST-015)"
            onClick={() => onPickBlank("package")}
          />
        )}
      </PickGroup>
    </Overlay>
  );
}

function PickGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="sticky top-0 z-10 border-y bg-muted px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="divide-y">{children}</div>
    </div>
  );
}

/**
 * One row shape for every answer in the dialog, which is the rule the job picker paid for
 * the hard way. The gutter carries a price where there is one, in the same fixed column
 * the day sheet uses for a time — the identifier and the description never get the same
 * weight.
 */
function PickRow({
  title,
  sub,
  gutter,
  lead,
  onClick,
}: {
  title: string;
  sub?: string;
  gutter?: string;
  lead?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-baseline gap-3 px-4 py-2.5 text-left hover:bg-accent"
    >
      {gutter && (
        <span className="tnum w-[3.75rem] shrink-0 text-xs font-medium text-muted-foreground">
          {gutter}
        </span>
      )}
      {lead && (
        <span className="grid size-8 shrink-0 translate-y-1 place-items-center rounded-lg bg-muted text-muted-foreground">
          {lead}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
      </span>
    </button>
  );
}

/* --- What the customer reads --------------------------------------------------------- */

/**
 * ROLE-009 and EST-018, on one screen, because the whole argument for the flat list is
 * about what this document says. Nothing here is a setting — the document generator shows
 * rows and package names, and there is no toggle anywhere that can make it print a
 * component's price.
 */
function CustomerPreview({
  open,
  onOpenChange,
  estimateNo,
  customer,
  rows,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  estimateNo: string;
  customer: string;
  rows: EstimateRow[];
}) {
  const total = rows.reduce((a, r) => a + rowPrice(r), 0);
  const hidden = rows.filter(isPackage).reduce((a, r) => a + r.components.length, 0);

  return (
    <Overlay
      kind="dialog"
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={`${estimateNo} · ${customer}`}
      title="What the customer reads"
      note={
        <p className="px-4 py-3 text-sm text-muted-foreground">
          {hidden} internal {hidden === 1 ? "item" : "items"} inside your packages are not on
          this document, and no setting can put their prices on it (ROLE-009).
        </p>
      }
      footer={
        <span onClick={() => onOpenChange(false)}>
          <Btn>Close</Btn>
        </span>
      }
    >
      <div className="divide-y">
        {rows.map((r) => (
          <div key={r.id} className="px-4 py-3">
            <div className="flex items-baseline gap-3">
              <span className="min-w-0 flex-1 text-sm font-medium">{r.name}</span>
              <span className="tnum shrink-0 text-sm">{money(rowPrice(r))}</span>
            </div>
            {/* EST-018: descriptions, never quantities, never prices. */}
            {isPackage(r) && r.print === "itemized" && r.components.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {r.components.map((c) => (
                  <li key={c.id}>Includes {c.item.toLowerCase()}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        <div className="flex items-baseline gap-3 px-4 py-3">
          <span className="min-w-0 flex-1 text-sm font-semibold">Total offered</span>
          <span className="tnum shrink-0 text-base font-semibold">{money(total)}</span>
        </div>
      </div>
      <p className="px-4 pb-4 text-xs leading-relaxed text-muted-foreground">
        Sales tax is not on this preview (INV-007 · rate not set). Declined rows stay here
        on the estimate as a record and never reach the invoice (AUTH-005).
      </p>
    </Overlay>
  );
}

/* --- Small parts --------------------------------------------------------------------- */

/**
 * Every money cell in this table shows a LINE total and stores a UNIT figure, so typing
 * one means dividing by the other. A quantity of zero — or none at all, which is what an
 * allowance has (EST-006) — would otherwise divide by nothing and store Infinity, and the
 * row would read `$NaN` from then on.
 */
const perUnit = (cents: number, qty: number | null) =>
  qty ? Math.round(cents / qty) : cents;

/** A name you can type over, with no box until you reach for it — the same bargain the
 *  quantity and money cells make, so a dense table does not read as a form. */
function NameInput({
  value,
  onChange,
  strike,
  weight = "medium",
}: {
  value: string;
  onChange: (v: string) => void;
  strike?: boolean;
  /** Semibold for a package, medium for a row, normal for something inside one. */
  weight?: "semibold" | "medium" | "normal";
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-7 min-w-0 max-w-full rounded-md border border-transparent bg-transparent px-1.5 text-sm outline-none",
        "hover:border-border focus-visible:border-ring focus-visible:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring/30",
        strike && "line-through",
        weight === "semibold" ? "font-semibold" : weight === "medium" ? "font-medium" : "font-normal"
      )}
      style={{ width: `${Math.max(value.length, 8)}ch` }}
    />
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-6 place-items-center rounded-md text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 className="size-3.5" strokeWidth={1.75} />
    </button>
  );
}

/**
 * A pending row's approval cell is a button, not a label. One dialog covers all three
 * outcomes, so there is nothing to choose between before opening it.
 */
function PendingButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground hover:border-solid hover:bg-accent hover:text-foreground"
    >
      Pending
      <ChevronDown className="size-3" />
    </button>
  );
}

/** EST-012's five statuses, each in its calm tone. Amber is not among them — that is
 *  `StatusPill`'s to assign, from `attentionMap`, if an estimate rule ever lands. */
export const estimateTone = (s: EstimateStatus): "muted" | "good" | "warn" | "bad" =>
  s === "Approved" ? "good" : s === "Partially approved" ? "warn" : s === "Declined" ? "bad" : "muted";

function ApprovalPill({ approval }: { approval: Approval }) {
  if (approval === "approved") return <Pill tone="good">Approved</Pill>;
  if (approval === "declined") return <Pill tone="bad">Declined</Pill>;
  if (approval === "overridden") return <Pill tone="warn">Overridden</Pill>;
  return <Pill tone="muted">Pending</Pill>;
}

const KIND_LABEL: Record<LeafKind, string> = {
  material: "Material",
  custom: "Custom item",
  labor: "Labor",
  allowance: "Allowance",
};

/**
 * The kind, as a word rather than a chip. A filled pill on every row of a long estimate
 * was forty small boxes competing with the names beside them — and the kind is the least
 * urgent thing on the row, not the most. Plain micro-type says it to anyone looking for
 * it and disappears for everyone else.
 */
export function KindTag({ kind }: { kind: LeafKind }) {
  return (
    <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
      {KIND_LABEL[kind]}
    </span>
  );
}

function Th({
  children,
  right,
  className = "",
}: {
  children?: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <th className={cn("px-3 py-2 font-medium", right && "text-right", className)}>{children}</th>
  );
}

function Td({
  children,
  right,
  colSpan,
  className = "",
}: {
  children?: React.ReactNode;
  right?: boolean;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td colSpan={colSpan} className={cn("px-3 py-2 align-top", right && "tnum text-right", className)}>
      {children}
    </td>
  );
}
