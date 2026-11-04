import { useState } from "react";
import { useParams } from "react-router-dom";
import { customers, invoices, jobs, STAGES } from "@/data/sample";
import { useShell } from "@/shell/shell-context";
import { Btn, DetailHeader, ListDetailLayout, ListHeader, ListRow, Monogram, Pill } from "@/shell/ListDetailLayout";
import { attentionMap } from "@/nav/attention";
import { InvoiceStatus } from "@/components/ui/invoice-status";
import { money } from "@/lib/utils";

export function CustomersPage() {
  const { id } = useParams();
  const { href, role } = useShell();
  const [onlyAttention, setOnlyAttention] = useState(false);
  const selected = customers.find((c) => c.id === id);
  const needs = attentionMap("customers", role);
  const rows = onlyAttention ? customers.filter((c) => needs.has(c.id)) : customers;

  return (
    <ListDetailLayout
      hasSelection={Boolean(selected)}
      backTo="/app/customers"
      empty="Pick a customer to see their jobs and invoices."
      list={
        <>
          <ListHeader
            title="Customers"
            count={rows.length}
            action={<Btn primary>New</Btn>}
            attention={needs.size}
            filtered={onlyAttention}
            onFilter={setOnlyAttention}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.map((c) => (
              <ListRow
                key={c.id}
                to={href(`/app/customers/${c.id}`)}
                selected={c.id === id}
                lead={<Monogram name={c.name} />}
                title={c.name}
                subtitle={`${c.city} · ${c.terms}`}
                attention={needs.get(c.id)}
                meta={c.balanceCents ? money(c.balanceCents) : "—"}
                metaSub={c.openJobs ? `${c.openJobs} open` : undefined}
              />
            ))}
          </div>
        </>
      }
      detail={selected && <CustomerDetail id={selected.id} />}
    />
  );
}

function CustomerDetail({ id }: { id: string }) {
  const c = customers.find((x) => x.id === id)!;
  const theirJobs = jobs.filter((j) => j.customerId === id);
  const theirInvoices = invoices.filter((i) => i.customerId === id);

  return (
    <div>
      <DetailHeader
        eyebrow="Customer"
        title={c.name}
        sub={`${c.contact} · ${c.phone} · ${c.city}`}
        actions={
          <>
            <Btn>New estimate</Btn>
            <Btn primary>New job</Btn>
          </>
        }
      />

      <div className="grid gap-px border-b bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open balance" value={money(c.balanceCents)} />
        <Stat label="Terms" value={c.terms} />
        <Stat label="Open jobs" value={String(c.openJobs)} />
        <Stat label="Credit account" value={c.terms === "Prepay" ? "No" : "Yes"} />
      </div>

      <Section title="Jobs">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <Th>Job</Th>
              <Th className="hidden sm:table-cell">Asset</Th>
              <Th>Scope</Th>
              <Th className="hidden lg:table-cell">Stage</Th>
              <Th right>Value</Th>
            </tr>
          </thead>
          <tbody>
            {theirJobs.map((j) => (
              <tr key={j.no} className="border-b last:border-0">
                <Td className="font-medium">{j.no}</Td>
                <Td className="hidden text-muted-foreground sm:table-cell">{j.asset}</Td>
                <Td>{j.what}</Td>
                <Td className="hidden lg:table-cell">
                  <Pill tone="muted">{STAGES[j.stage]}</Pill>
                </Td>
                <Td right>{money(j.valueCents)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Invoices">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <Th>Invoice</Th>
              <Th className="hidden sm:table-cell">Issued</Th>
              <Th>Status</Th>
              <Th right className="hidden sm:table-cell">Total</Th>
              <Th right>Balance</Th>
            </tr>
          </thead>
          <tbody>
            {theirInvoices.map((v) => (
              <tr key={v.no} className="border-b last:border-0">
                <Td className="font-medium">#{v.no}</Td>
                <Td className="hidden text-muted-foreground sm:table-cell">{v.issued}</Td>
                <Td>
                  <InvoiceStatus no={v.no} status={v.status} />
                </Td>
                <Td right className="hidden sm:table-cell">{money(v.totalCents)}</Td>
                <Td right>{v.balanceCents ? money(v.balanceCents) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="tnum mt-0.5 text-base font-semibold">{value}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-4 lg:px-5">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <div className="overflow-hidden rounded-lg border">{children}</div>
    </div>
  );
}

export function Th({
  children,
  right,
  className = "",
}: {
  children?: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <th className={`px-3 py-2 font-medium ${right ? "text-right" : ""} ${className}`}>{children}</th>
  );
}

export function Td({
  children,
  right,
  className = "",
}: {
  children?: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td className={`px-3 py-2 ${right ? "tnum text-right" : ""} ${className}`}>{children}</td>
  );
}
