import { useState } from "react";
import { useParams } from "react-router-dom";
import type { ReactNode } from "react";
import { Ban, Check, Eye, FileText, MoreHorizontal } from "lucide-react";
import {
  invoiceCost,
  invoiceLineCost,
  invoiceLines,
  invoiceSubtotal,
  invoices,
  jobs,
  type InvoiceLine,
} from "@/data/sample";
import { useShell } from "@/shell/shell-context";
import {
  Btn,
  DetailHeader,
  ListDetailLayout,
  ListHeader,
  ListRow,
  Pill,
} from "@/shell/ListDetailLayout";
import { attentionMap } from "@/nav/attention";
import { ConfirmWithReason } from "@/components/ui/confirm";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { toast } from "sonner";
import { Section, Stat, Td, Th } from "./Customers";
import { EstimateEditor, KindTag } from "./EstimateEditor";
import { cn, money } from "@/lib/utils";

export function InvoicesPage() {
  const { id } = useParams();
  const { href, role } = useShell();
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [voiding, setVoiding] = useState(false);
  // Off by default, and not remembered. What the customer sees is the view you should
  // land on when you open their invoice — the breakdown is something you go and ask for.
  const [internal, setInternal] = useState(false);
  const owner = role === "owner";
  const needs = attentionMap("invoices", role);
  const rows = onlyAttention ? invoices.filter((v) => needs.has(v.no)) : invoices;
  const selected = invoices.find((v) => v.no === id);

  return (
    <ListDetailLayout
      hasSelection={Boolean(selected)}
      backTo="/app/invoices"
      empty="Pick an invoice."
      list={
        <>
          <ListHeader
            title="Invoices"
            count={rows.length}
            attention={needs.size}
            filtered={onlyAttention}
            onFilter={setOnlyAttention}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.map((v) => (
              <ListRow
                key={v.no}
                to={href(`/app/invoices/${v.no}`)}
                selected={v.no === id}
                title={`#${v.no} · ${v.customer}`}
                subtitle={`Due ${v.due}`}
                status={
                  <StatusPill
                    section="invoices"
                    id={v.no}
                    status={v.status}
                    calm={v.status === "Paid" ? "good" : "muted"}
                  />
                }
                meta={money(v.balanceCents || v.totalCents)}
                metaSub={v.balanceCents ? "balance" : "paid"}
              />
            ))}
          </div>
        </>
      }
      detail={
        selected && (
          <div>
            <DetailHeader
              eyebrow={`Invoice · ${selected.customer}`}
              title={`#${selected.no}`}
              sub={
                <span className="flex items-center gap-2">
                  <StatusPill
                    section="invoices"
                    id={selected.no}
                    status={selected.status}
                    calm={selected.status === "Paid" ? "good" : "muted"}
                  />
                  <span>Issued {selected.issued} · due {selected.due}</span>
                </span>
              }
              actions={
                <>
                  {/* Send is the only thing you came here to do. Everything else — the
                      internal view, the PDF, the void — is occasional, and three
                      same-weight buttons made the one that matters hard to find. */}
                  <InvoiceActions
                    owner={owner}
                    internal={internal}
                    onInternal={setInternal}
                    onVoid={() => setVoiding(true)}
                  />
                  <Btn primary>Send</Btn>
                </>
              }
            />
            <div className="grid gap-px border-b bg-border sm:grid-cols-3">
              <Stat label="Total" value={money(selected.totalCents)} />
              <Stat label="Deposit applied" value={selected.no === "1184" ? money(100950) : "—"} />
              <Stat label="Balance" value={money(selected.balanceCents)} />
            </div>
            <Section title="Lines">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <Th>Description</Th>
                    {/* Four money columns do not fit a phone. Cost is the one that goes:
                        margin is the number someone opens this view to see, and cost is
                        the detail behind it. */}
                    {internal && <Th right className="hidden lg:table-cell">Cost</Th>}
                    {internal && <Th right>Margin</Th>}
                    <Th right>Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {(invoiceLines[selected.no] ?? []).map((l) => (
                    <InvoiceLineRows key={l.id} line={l} internal={internal} />
                  ))}
                </tbody>
                {/* INV-006, written out rather than asserted: the total is the lines
                    plus tax, and both are computed here from what is above. */}
                <tfoot>
                  <tr className="border-t-2">
                    <Td className="text-muted-foreground">Subtotal</Td>
                    {internal && (
                      <Td right className="hidden text-muted-foreground lg:table-cell">
                        {money(invoiceCost(selected.no))}
                      </Td>
                    )}
                    {internal && (
                      <Td right className="text-muted-foreground">
                        {money(invoiceSubtotal(selected.no) - invoiceCost(selected.no))}
                      </Td>
                    )}
                    <Td right className="text-muted-foreground">
                      {money(invoiceSubtotal(selected.no))}
                    </Td>
                  </tr>
                  <tr className="border-t">
                    <Td className="text-muted-foreground">
                      Sales tax
                      {/* INV-007 is a decision, not an oversight. A placeholder rate here
                          would be read as a real one by everybody reviewing this. */}
                      <span className="ml-2 text-xs">INV-007 · rate not set</span>
                    </Td>
                    {internal && <Td className="hidden lg:table-cell" />}
                    {internal && <Td />}
                    <Td right className="text-muted-foreground">—</Td>
                  </tr>
                  <tr className="border-t">
                    <Td className="font-semibold">Total</Td>
                    {internal && <Td className="hidden lg:table-cell" />}
                    {internal && (
                      <Td right className="text-muted-foreground">
                        {pct(invoiceSubtotal(selected.no), invoiceCost(selected.no))}
                      </Td>
                    )}
                    <Td right className="text-base font-semibold">
                      {money(invoiceSubtotal(selected.no))}
                    </Td>
                  </tr>
                </tfoot>
              </table>
            </Section>
            <p className="px-4 pb-4 text-xs leading-relaxed text-muted-foreground lg:px-5">
              {internal ? (
                <>
                  Internal view — this screen only. Components, cost and margin never
                  reach the customer’s invoice, the PDF or the payment page, and there is
                  no setting that lets them (ROLE-009). Switching back is what the
                  customer sees.
                </>
              ) : (
                <>
                  One line per authorized estimate line (INV-001), plus anything added to
                  the draft by hand (INV-002). The materials, labor and allowances behind
                  each line stay on the job for costing — the estimate is itemized, the
                  invoice is rolled up.
                </>
              )}
            </p>

            {/* INV-012. The second user of ConfirmWithReason, which is the point of it
                being a component rather than a one-off. */}
            <ConfirmWithReason
              open={voiding}
              onOpenChange={setVoiding}
              eyebrow={`Invoice #${selected.no}`}
              title="Void this invoice?"
              confirmLabel="Void invoice"
              consequence={
                <>
                  A finalized invoice is never edited (INV-003). Voiding keeps it on the
                  record, marked void, and leaves the job free to be invoiced again. The
                  number is not reused.
                </>
              }
              reasonLabel="Why is it being voided?"
              onConfirm={(reason) =>
                toast.success(`Invoice #${selected.no} voided`, { description: reason })
              }
            />
          </div>
        )
      }
    />
  );
}

/** Margin as a share of the price. The dollars answer "how much", this answers "how good". */
const pct = (priceCents: number, costCents: number) =>
  priceCents <= 0 ? "—" : `${Math.round(((priceCents - costCents) / priceCents) * 100)}% margin`;

/**
 * Everything you can do to an invoice except send it.
 *
 * The internal view is a document-wide switch rather than a chevron per line — "show me
 * what is behind this invoice" is one question about the invoice, and answering it line
 * by line is six clicks to see the thing you came to see. It sits beside Void and the
 * PDF because all three are things you do to this record occasionally; the one you do
 * every time stays out here as a button.
 */
function InvoiceActions({
  owner,
  internal,
  onInternal,
  onVoid,
}: {
  owner: boolean;
  internal: boolean;
  onInternal: (v: boolean) => void;
  onVoid: () => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      label="More invoice actions"
      trigger={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="More actions"
          aria-expanded={open}
          aria-haspopup="menu"
          className={cn(
            "grid size-8 place-items-center rounded-md border",
            open ? "bg-accent" : "hover:bg-accent"
          )}
        >
          <MoreHorizontal className="size-4" />
        </button>
      }
    >
      <div className="w-full pad:w-56">
        {owner && (
          <>
            <MenuItem
              on={internal}
              onClick={() => {
                onInternal(!internal);
                close();
              }}
            >
              <Eye className="size-4 shrink-0" />
              Internal view
            </MenuItem>
            <MenuRule />
          </>
        )}
        <MenuItem onClick={close}>
          <FileText className="size-4 shrink-0" />
          Preview PDF
        </MenuItem>
        <MenuRule />
        {/* Last, behind a rule, and the only red thing in here. A void is one slip away
            from a destroyed invoice number, so it does not sit next to Preview. */}
        <MenuItem
          danger
          onClick={() => {
            close();
            onVoid();
          }}
        >
          <Ban className="size-4 shrink-0" />
          Void…
        </MenuItem>
      </div>
    </Popover>
  );
}

function MenuRule() {
  return <div className="my-1 h-px bg-border" />;
}

function MenuItem({
  children,
  onClick,
  on,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  /** A state the item turns on, shown with a check — not a one-shot action. */
  on?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      aria-pressed={on === undefined ? undefined : on}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm pad:py-1.5",
        on && "bg-brand/12 text-brand",
        danger && "text-destructive",
        !on && "hover:bg-accent"
      )}
    >
      {children}
      {on && <Check className="ml-auto size-4 shrink-0" />}
    </button>
  );
}

function InvoiceLineRows({ line, internal }: { line: InvoiceLine; internal: boolean }) {
  const cost = invoiceLineCost(line);
  const margin = line.amountCents - cost;

  return (
    <>
      <tr className="border-b last:border-0">
        <Td>
          <span className="flex items-center gap-2">
            {line.description}
            {/* An added line did not come from anything the customer approved, so the
                reviewer is told which ones those are. */}
            {line.custom && <Pill tone="muted">Added</Pill>}
          </span>
        </Td>
        {internal && (
          <Td right className="hidden text-muted-foreground lg:table-cell">{money(cost)}</Td>
        )}
        {internal && (
          // Red at BELOW zero, not at zero — unlike the estimate, where a zero-margin
          // line is a slip. An invoice is where freight and rentals get passed through
          // at cost on purpose, and colouring those red teaches people to ignore red.
          <Td right>
            <span className={cn(margin < 0 && "text-destructive")}>{money(margin)}</span>
          </Td>
        )}
        <Td right>{money(line.amountCents)}</Td>
      </tr>

      {internal &&
        line.components.map((c) => (
          <tr key={c.id} className="border-b border-border/50 bg-muted/25 text-muted-foreground">
            <Td>
              <span className="flex flex-wrap items-center gap-2 pl-4">
                <span>{c.item}</span>
                <KindTag kind={c.kind} />
                {/* EST-006: an allowance has no quantity. Say so rather than print "1". */}
                <span className="tnum text-xs">
                  {c.kind === "allowance" ? "no quantity" : `${c.qty} ${c.unit ?? ""}`}
                </span>
              </span>
            </Td>
            <Td right className="hidden text-xs lg:table-cell">
              {money(Math.round((c.qty ?? 1) * c.costCents))}
            </Td>
            <Td />
            <Td right className="text-xs">{money(Math.round((c.qty ?? 1) * c.sellCents))}</Td>
          </tr>
        ))}
    </>
  );
}

export function EstimatesPage() {
  const { id } = useParams();
  const { href } = useShell();
  const rows = jobs.map((j) => ({ ...j, est: `E-${j.no.slice(2)}` }));
  const selected = rows.find((r) => r.est === id);

  return (
    <ListDetailLayout
      hasSelection={Boolean(selected)}
      backTo="/app/estimates"
      empty="Pick an estimate."
      list={
        <>
          <ListHeader title="Estimates" count={rows.length} action={<Btn primary>New</Btn>} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.map((r) => (
              <ListRow
                key={r.est}
                to={href(`/app/estimates/${r.est}`)}
                selected={r.est === id}
                title={`${r.est} · ${r.customer}`}
                subtitle={r.what}
                meta={money(r.valueCents)}
                metaSub={r.stage > 0 ? "approved" : "sent"}
              />
            ))}
          </div>
        </>
      }
      detail={selected && <EstimateEditor estimateId={selected.est} />}
    />
  );
}

const materials = [
  { id: "mpi-1105", name: "Avery MPI 1105 wrap film", unit: "ft", costCents: 310, priceCents: 750, vendor: "Grimco" },
  { id: "dol-1460z", name: "Avery DOL 1460Z overlaminate", unit: "ft", costCents: 205, priceCents: 450, vendor: "Grimco" },
  { id: "latex-ink", name: "Latex ink", unit: "job", costCents: 3800, priceCents: 8500, vendor: "HP" },
  { id: "install-kit", name: "Install supplies", unit: "job", costCents: 2200, priceCents: 4500, vendor: "Fellers" },
  { id: "cast-vinyl", name: "Cast vinyl · white", unit: "ft", costCents: 280, priceCents: 690, vendor: "Fellers" },
];

export function MaterialsPage() {
  const { id } = useParams();
  const { href } = useShell();
  const selected = materials.find((m) => m.id === id);

  return (
    <ListDetailLayout
      hasSelection={Boolean(selected)}
      backTo="/app/materials"
      empty="Pick a material, or start a purchase order."
      list={
        <>
          <ListHeader title="Materials" count={materials.length} action={<Btn primary>New PO</Btn>} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {materials.map((m) => (
              <ListRow
                key={m.id}
                to={href(`/app/materials/${m.id}`)}
                selected={m.id === id}
                title={m.name}
                subtitle={`${m.vendor} · per ${m.unit}`}
                meta={money(m.priceCents)}
                metaSub={`cost ${money(m.costCents)}`}
              />
            ))}
          </div>
        </>
      }
      detail={
        selected && (
          <div>
            <DetailHeader eyebrow="Material" title={selected.name} sub={`${selected.vendor} · priced per ${selected.unit}`} />
            <div className="grid gap-px border-b bg-border sm:grid-cols-3">
              <Stat label="Last cost" value={money(selected.costCents)} />
              <Stat label="Selling price" value={money(selected.priceCents)} />
              <Stat label="Margin" value={`${Math.round((1 - selected.costCents / selected.priceCents) * 100)}%`} />
            </div>
            <div className="grid place-items-center p-10 text-sm text-muted-foreground">
              PUR-009: receiving records cost. V1 keeps no live stock count.
            </div>
          </div>
        )
      }
    />
  );
}
