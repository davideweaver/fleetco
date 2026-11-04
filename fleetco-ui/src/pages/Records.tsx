import { useState } from "react";
import { useParams } from "react-router-dom";
import { invoices, jobs } from "@/data/sample";
import { useShell } from "@/shell/shell-context";
import { Btn, DetailHeader, ListDetailLayout, ListHeader, ListRow } from "@/shell/ListDetailLayout";
import { attentionMap } from "@/nav/attention";
import { ConfirmWithReason } from "@/components/ui/confirm";
import { InvoiceAttention } from "@/components/ui/invoice-status";
import { toast } from "sonner";
import { Stat } from "./Customers";
import { EstimateEditor } from "./EstimateEditor";
import { money } from "@/lib/utils";

export function InvoicesPage() {
  const { id } = useParams();
  const { href, role } = useShell();
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [voiding, setVoiding] = useState(false);
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
                subtitle={`${v.status} · due ${v.due}`}
                attention={needs.get(v.no)}
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
                  <InvoiceAttention no={selected.no} status={selected.status} />
                  <span>Issued {selected.issued} · due {selected.due}</span>
                </span>
              }
              actions={
                <>
                  <span onClick={() => setVoiding(true)}>
                    <Btn>Void…</Btn>
                  </span>
                  <Btn>Preview PDF</Btn>
                  <Btn primary>Send</Btn>
                </>
              }
            />
            <div className="grid gap-px border-b bg-border sm:grid-cols-3">
              <Stat label="Total" value={money(selected.totalCents)} />
              <Stat label="Deposit applied" value={selected.no === "1184" ? money(100950) : "—"} />
              <Stat label="Balance" value={money(selected.balanceCents)} />
            </div>
            <div className="grid place-items-center p-10 text-sm text-muted-foreground">
              Invoice lines, rolled up for the customer.
            </div>

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
