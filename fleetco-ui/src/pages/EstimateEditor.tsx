import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import {
  componentSum,
  estimateLines,
  estimates,
  isAuthorized,
  lineCost,
  linePrice,
  type Approval,
  type EstimateLine,
  type EstimateStatus,
  type LineComponent,
} from "@/data/sample";
import { useShell } from "@/shell/shell-context";
import { Btn, DetailHeader, Pill } from "@/shell/ListDetailLayout";
import { CellInput, MoneyCell } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import {
  ApprovalHistory,
  RecordAnswerDialog,
  type ApprovalRecord,
} from "@/components/ui/approval";
import { toast } from "sonner";
import { cn, money } from "@/lib/utils";

/**
 * The estimate line editor — the densest screen in V1 and the honest test of the type
 * scale and the spacing.
 *
 * What it has to make obvious, from the rules rather than from taste:
 *
 *   EST-002  Customer lines are what the customer sees. Components are internal and live
 *            underneath, collapsed by default — the customer's view is the default view.
 *   EST-003  A set price wins over the component sum, and the sum is still shown, because
 *            the whole point of keeping it is that someone can compare the two.
 *   EST-006  An allowance has no quantity. The cell is empty, not "1".
 *   AUTH-001 Approval is per line, not per estimate.
 *   AUTH-005 Only authorized lines bill. The footer shows BOTH totals, because "what we
 *            offered" and "what we will invoice" are different numbers and confusing them
 *            is how a shop under-bills.
 *   ROLE-005 A technician sees no cost, no margin, and no component selling price.
 */
export function EstimateEditor({ estimateId }: { estimateId: string }) {
  const { role } = useShell();
  const [params] = useSearchParams();
  const owner = role === "owner";
  const [openLines, setOpenLines] = useState<Set<string>>(new Set(["L1"]));
  const overlay = params.get("overlay");
  // One dialog, three outcomes, picked inside it.
  const [answering, setAnswering] = useState(overlay === "approve");
  const [history, setHistory] = useState<Record<string, ApprovalRecord[]>>({
    L1: [
      {
        id: "a0",
        kind: "approved",
        contact: "Dana Hoff",
        method: "phone",
        recordedBy: "Owner",
        recordedAt: "Oct 28, 9:14am",
      },
    ],
    L2: [
      {
        id: "a1",
        kind: "declined",
        contact: "Dana Hoff",
        method: "phone",
        recordedBy: "Owner",
        recordedAt: "Oct 28, 9:14am",
      },
    ],
  });

  const toggle = (id: string) =>
    setOpenLines((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // The line table below is one hardcoded set (L1 approved, L2 declined, L3 pending) and
  // every estimate still shows it. The header at least reads the row you clicked, so the
  // list and the screen it opens no longer contradict each other.
  const est = estimates.find((e) => e.no === estimateId);

  const offered = estimateLines.reduce((a, l) => a + linePrice(l), 0);
  const authorized = estimateLines.filter(isAuthorized).reduce((a, l) => a + linePrice(l), 0);
  const cost = estimateLines.filter(isAuthorized).reduce((a, l) => a + lineCost(l), 0);

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
              {est && est.sent !== "—" ? `Sent ${est.sent}` : "Not sent"} · 3 lines
            </span>
          </span>
        }
        actions={
          owner ? (
            <>
              <Btn>Preview</Btn>
              <span onClick={() => setAnswering(true)}>
                <Btn primary>Record answer</Btn>
              </span>
            </>
          ) : undefined
        }
      />

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-surface-3">
            <tr className="border-b text-left text-xs text-muted-foreground">
              <Th className="w-8" />
              <Th>Line</Th>
              <Th className="hidden @md:table-cell">Approval</Th>
              {owner && <Th right className="hidden lg:table-cell">Cost</Th>}
              {owner && <Th right className="hidden xl:table-cell">Margin</Th>}
              <Th right>Price</Th>
            </tr>
          </thead>

          <tbody>
            {estimateLines.map((line) => (
              <LineRows
                key={line.id}
                line={line}
                owner={owner}
                open={openLines.has(line.id)}
                onToggle={() => toggle(line.id)}
                settled={(history[line.id] ?? []).length > 0}
                onAnswer={() => setAnswering(true)}
              />
            ))}

            <tr>
              <td colSpan={6} className="px-3 py-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Plus className="size-4" />
                  Add line, or a saved package
                </button>
              </td>
            </tr>
          </tbody>

          {/* Two totals, never one. "Offered" is the estimate; "authorized" is what can be
              invoiced (AUTH-005). A single total hides a declined line. */}
          <tfoot className="sticky bottom-0 bg-surface-3">
            <tr className="border-t">
              <Td />
              <Td className="text-muted-foreground">Offered</Td>
              <Td className="hidden @md:table-cell" />
              {owner && <Td className="hidden lg:table-cell" />}
              {owner && <Td className="hidden xl:table-cell" />}
              <Td right className="text-muted-foreground">{money(offered)}</Td>
            </tr>
            <tr className="border-t">
              <Td />
              <Td className="font-semibold">Authorized · goes to the invoice</Td>
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
            </tr>
          </tfoot>
        </table>

        {/* AUTH-003: the history is the point. Showing only the current state would hide
            that someone corrected it, and the correction is part of the record. */}
        {owner && (
          <div className="px-4 py-4 lg:px-5">
            <div className="mb-2 text-sm font-semibold">Approval history</div>
            <div className="space-y-3">
              {estimateLines.map((l) => (
                <div key={l.id} className="overflow-hidden rounded-lg border">
                  {/* Read-only. The history records what happened; acting happens in the
                      table above, next to the line. */}
                  <div className="border-b bg-muted/40 px-3 py-2 text-xs font-medium">
                    {l.name}
                  </div>
                  <ApprovalHistory records={history[l.id] ?? []} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <RecordAnswerDialog
        open={answering}
        onOpenChange={setAnswering}
        lines={estimateLines.map((l) => ({
          id: l.id,
          name: l.name,
          priceCents: linePrice(l),
          pending: (history[l.id] ?? []).length === 0,
        }))}
        onRecord={(ids, rec) => {
          setHistory((h) => {
            const next = { ...h };
            for (const id of ids) {
              next[id] = [...(next[id] ?? []), { ...rec, id: `a${Date.now()}${id}` }];
            }
            return next;
          });
          if (rec.kind === "override") {
            toast.warning(`Overridden on ${ids.length} line${ids.length === 1 ? "" : "s"}`, {
              description: "Shown as an override everywhere, never as customer approval.",
            });
          } else {
            toast.success(`Recorded on ${ids.length} line${ids.length === 1 ? "" : "s"}`, {
              description:
                "Permanent. A correction adds a record rather than editing this one.",
            });
          }
        }}
      />
    </div>
  );
}

function LineRows({
  line,
  owner,
  open,
  onToggle,
  settled,
  onAnswer,
}: {
  line: EstimateLine;
  owner: boolean;
  open: boolean;
  onToggle: () => void;
  /** Already has an answer on the record, so there is nothing to act on. */
  settled: boolean;
  onAnswer: () => void;
}) {
  const [price, setPrice] = useState(linePrice(line));
  const sum = componentSum(line);
  const cost = lineCost(line);
  const declined = line.approval === "declined";
  // AUTH-005 again, at the row: anything not authorized is not going on an invoice, and
  // the price column says so rather than leaving the reader to add it up.
  const billable = isAuthorized(line);

  return (
    <>
      <tr className={cn("border-b", declined && "opacity-55")}>
        <Td>
          <button
            type="button"
            onClick={onToggle}
            aria-label={open ? "Hide components" : "Show components"}
            aria-expanded={open}
            className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent"
          >
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        </Td>

        <Td>
          <div className={cn("font-medium", declined && "line-through")}>{line.name}</div>
          <div className="text-xs text-muted-foreground @md:hidden">
            <ApprovalPill approval={line.approval} />
          </div>
          {line.how && <div className="mt-0.5 text-xs text-muted-foreground">{line.how}</div>}
          {/* EST-003: the comparison only earns its keep if it is on screen. */}
          {owner && line.setPriceCents !== null && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              Package price set. Components total {money(sum)}.
            </div>
          )}
        </Td>

        {/* The action lives where the state is. A line waiting on an answer is the only
            line you can do anything to, so only that one is actionable — an Override on
            an approved line is meaningless, and offering it invites the mistake. */}
        <Td className="hidden @md:table-cell">
          {owner && !settled ? (
            <PendingButton onClick={onAnswer} />
          ) : (
            <ApprovalPill approval={line.approval} />
          )}
        </Td>

        {owner && (
          <Td right className="hidden text-muted-foreground lg:table-cell">
            {money(cost)}
          </Td>
        )}
        {owner && (
          <Td right className="hidden xl:table-cell">
            <span className={cn(linePrice(line) - cost <= 0 && "text-destructive")}>
              {money(linePrice(line) - cost)}
            </span>
          </Td>
        )}

        <Td right>
          <span className={cn(!billable && "text-muted-foreground")}>
            {owner ? (
              <MoneyCell valueCents={price} onChangeCents={setPrice} />
            ) : (
              <span className="tnum">{money(linePrice(line))}</span>
            )}
          </span>
        </Td>
      </tr>

      {open &&
        line.components.map((c) => (
          <ComponentRow key={c.id} c={c} owner={owner} dim={declined} />
        ))}

      {open && (
        <tr className={cn("border-b", declined && "opacity-55")}>
          <Td />
          <Td colSpan={owner ? 5 : 2}>
            <button
              type="button"
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

function ComponentRow({
  c,
  owner,
  dim,
}: {
  c: LineComponent;
  owner: boolean;
  dim: boolean;
}) {
  const [qty, setQty] = useState(c.qty === null ? "" : String(c.qty));

  return (
    <tr className={cn("border-b border-border/50 bg-muted/25 text-muted-foreground", dim && "opacity-55")}>
      <Td />
      <Td>
        <div className="flex flex-wrap items-center gap-2 pl-4">
          <span>{c.item}</span>
          <KindTag kind={c.kind} />
          {/* EST-006: an allowance has no quantity. Empty, not "1". */}
          {c.kind === "allowance" ? (
            <span className="text-xs">no quantity</span>
          ) : (
            <CellInput value={qty} onChange={setQty} width="w-14" suffix={c.unit ?? ""} />
          )}
        </div>
      </Td>
      <Td className="hidden @md:table-cell" />
      {owner && (
        <Td right className="hidden lg:table-cell">
          {money(Math.round((c.qty ?? 1) * c.costCents))}
        </Td>
      )}
      {owner && <Td className="hidden xl:table-cell" />}
      {/* ROLE-005: a technician sees the scope, never a price. */}
      <Td right>{owner ? money(Math.round((c.qty ?? 1) * c.sellCents)) : ""}</Td>
    </tr>
  );
}

/**
 * A pending line's approval cell is a button, not a label. One dialog covers all three
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

const KIND_LABEL: Record<LineComponent["kind"], string> = {
  material: "Material",
  custom: "Custom item",
  labor: "Labor",
  allowance: "Allowance",
};

export function KindTag({ kind }: { kind: LineComponent["kind"] }) {
  return (
    <span className="rounded bg-pill-neutral px-1 py-px text-[10px] uppercase tracking-wide text-pill-neutral-fg">
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
