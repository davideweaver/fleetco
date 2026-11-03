import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, Camera, Play } from "lucide-react";
import { jobs, STAGES, wrapComponents, wrapPriceCents } from "@/data/sample";
import { useShell } from "@/shell/shell-context";
import { Btn, DetailHeader, ListDetailLayout, ListHeader, ListRow, Pill } from "@/shell/ListDetailLayout";
import { Overlay } from "@/components/ui/overlay";
import { Section, Stat, Td, Th } from "./Customers";
import { money } from "@/lib/utils";

export function JobsPage() {
  const { id } = useParams();
  const { href, role } = useShell();
  // ROLE-003: a technician sees only their assigned jobs, in the list and by URL.
  const visible = role === "tech" ? jobs.filter((j) => j.who === "T1") : jobs;
  const selected = visible.find((j) => j.no === id);

  return (
    <ListDetailLayout
      hasSelection={Boolean(selected)}
      backTo="/app/jobs"
      empty="Pick a job."
      list={
        <>
          <ListHeader
            title={role === "tech" ? "My jobs" : "Jobs"}
            count={visible.length}
            action={role === "owner" ? <Btn primary>New</Btn> : undefined}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {visible.map((j) => (
              <ListRow
                key={j.no}
                to={href(`/app/jobs/${j.no}`)}
                selected={j.no === id}
                title={`${j.no} · ${j.what}`}
                subtitle={`${j.customer} · ${STAGES[j.stage]}`}
                meta={role === "owner" ? money(j.valueCents) : undefined}
                metaSub={j.priority !== "Normal" ? j.priority : j.date}
              />
            ))}
          </div>
        </>
      }
      detail={selected && <JobDetail no={selected.no} />}
    />
  );
}

function JobDetail({ no }: { no: string }) {
  const { role } = useShell();
  const [params] = useSearchParams();
  const j = jobs.find((x) => x.no === no)!;
  const [open, setOpen] = useState(false);
  // A decision that blocks you: a dialog, not a panel.
  const [closing, setClosing] = useState(params.get("overlay") === "dialog");
  const owner = role === "owner";

  return (
    <div>
      <DetailHeader
        eyebrow={`Job · ${j.customer}`}
        title={`${j.no} · ${j.what}`}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <Pill tone="muted">{STAGES[j.stage]}</Pill>
            {j.priority !== "Normal" && <Pill tone="warn">{j.priority}</Pill>}
            <span>{j.asset}</span>
            <span>·</span>
            <span>Due {j.date}</span>
          </span>
        }
        actions={
          owner ? (
            <>
              <Btn>Move stage</Btn>
              <span onClick={() => setClosing(true)}>
                <Btn primary>Close job</Btn>
              </span>
            </>
          ) : (
            <>
              <Btn>
                <span className="flex items-center gap-1.5">
                  <Camera className="size-4" /> Add photo
                </span>
              </Btn>
              <Btn primary>
                <span className="flex items-center gap-1.5">
                  <Play className="size-4" /> Start timer
                </span>
              </Btn>
            </>
          )
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-px border-b bg-border">
        <Stat label="Assigned" value={j.who === "T1" ? "Technician 1" : "Owner"} />
        <Stat label="Production" value="Nov 1" />
        <Stat label="Installation" value={j.date} />
        {owner && <Stat label="Job value" value={money(j.valueCents)} />}
      </div>

      <Section title="Scope">
        <div className="p-3 text-sm">
          Full vehicle wrap, printed and laminated, installed on site. Customer supplied
          logo artwork; proof approved October 28.
        </div>
      </Section>

      {/* EST-002 / G7: the customer sees one rolled-up line, the shop sees every component.
          ROLE-005: a technician sees neither cost nor margin. */}
      <Section title={owner ? "Estimate line and components" : "What's on this job"}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <Th>Item</Th>
              <Th right className="hidden sm:table-cell">Qty</Th>
              {owner && <Th right className="hidden lg:table-cell">Cost</Th>}
              {owner && <Th right>Price</Th>}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b bg-muted/40">
              <Td>
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  className="flex items-center gap-1.5 font-medium"
                >
                  {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  Unit 14 · full wrap
                </button>
              </Td>
              <Td right className="hidden sm:table-cell">1</Td>
              {owner && <Td right className="hidden lg:table-cell">{money(77130)}</Td>}
              {owner && <Td right className="font-semibold">{money(wrapPriceCents)}</Td>}
            </tr>
            {open &&
              wrapComponents.map((c) => (
                <tr key={c.item} className="border-b last:border-0 text-muted-foreground">
                  <Td className="pl-9">{c.item}</Td>
                  <Td right className="hidden sm:table-cell">
                    {c.qty} {c.unit}
                  </Td>
                  {owner && (
                    <Td right className="hidden lg:table-cell">{money(c.qty * c.costCents)}</Td>
                  )}
                  {owner && <Td right>{money(c.qty * c.priceCents)}</Td>}
                </tr>
              ))}
          </tbody>
        </table>
      </Section>

      <Section title="Photos">
        <div className="flex gap-2 overflow-x-auto p-3">
          {["Before", "Before", "Progress", "Completion"].map((label, i) => (
            <div key={i} className="shrink-0">
              <div className="grid h-20 w-28 place-items-center rounded-md border border-dashed bg-muted/50 text-[11px] text-muted-foreground">
                photo
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </Section>

      <Overlay
        kind="dialog"
        open={closing}
        onOpenChange={setClosing}
        eyebrow={`Job · ${j.no}`}
        title="Close this job?"
        footer={
          <>
            <Btn>Cancel</Btn>
            <Btn primary>Close job</Btn>
          </>
        }
      >
        <div className="space-y-3 p-4 text-sm">
          <p>
            Closing creates one draft invoice from the authorized lines. Nothing is sent
            to the customer until you review it.
          </p>
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">Authorized total</span>
              <span className="tnum font-semibold">{money(j.valueCents)}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-muted-foreground">Deposit applied</span>
              <span className="tnum">{money(Math.round(j.valueCents / 2))}</span>
            </div>
          </div>
          <p className="text-muted-foreground">JOB-009 · one draft invoice per billable job.</p>
        </div>
      </Overlay>
    </div>
  );
}
