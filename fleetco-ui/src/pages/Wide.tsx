import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { jobs, STAGES, type Job } from "@/data/sample";
import { useShell } from "@/shell/shell-context";
import { Btn, PageHeader } from "@/shell/ListDetailLayout";
import { Overlay } from "@/components/ui/overlay";
import { BoardPage as Board } from "./Board";
import { Section, Stat } from "./Customers";
import { money } from "@/lib/utils";

/** The board plus the panel a card opens. `pane: "wide"` has no detail pane to use. */
export function BoardPage() {
  const { role } = useShell();
  const [params] = useSearchParams();
  const owner = role === "owner";
  const [picked, setPicked] = useState<Job | null>(
    params.get("overlay") === "panel" ? (jobs.find((j) => j.no === "G-1048") ?? null) : null
  );

  return (
    <>
      <Board onPick={setPicked} />
      <Overlay
        kind="panel"
        open={Boolean(picked)}
        onOpenChange={(v) => !v && setPicked(null)}
        eyebrow={picked ? `Job · ${picked.customer}` : ""}
        title={picked ? `${picked.no} · ${picked.what}` : ""}
        footer={
          <>
            <Btn>Move stage</Btn>
            {owner && <Btn primary>Close job</Btn>}
          </>
        }
      >
        {picked && (
          <div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-px border-b bg-border">
              <Stat label="Stage" value={STAGES[picked.stage]} />
              <Stat label="Assigned" value={picked.who === "T1" ? "Technician 1" : "Owner"} />
              <Stat label="Due" value={picked.date} />
              {owner && <Stat label="Value" value={money(picked.valueCents)} />}
            </div>
            <Section title="Scope">
              <div className="p-3 text-sm">
                {picked.asset} · {picked.what}. Printed, laminated and installed on site.
              </div>
            </Section>
            <Section title="Photos">
              <div className="flex gap-2 overflow-x-auto p-3">
                {["Before", "Progress"].map((label, i) => (
                  <div key={i} className="shrink-0">
                    <div className="grid h-20 w-28 place-items-center rounded-md border border-dashed bg-muted/50 text-[11px] text-muted-foreground">
                      photo
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}
      </Overlay>
    </>
  );
}

/**
 * `pane: "wide"` — no second column. Six stages minus a 300px list leaves about
 * 140px per column on an iPad, which is why the board does not get one.
 */
export function TimePage() {
  const rows = [
    { who: "Technician 1", day: "Mon", clocked: "8:02", job: "6:45", shop: "1:17" },
    { who: "Technician 1", day: "Tue", clocked: "7:48", job: "7:10", shop: "0:38" },
    { who: "Technician 1", day: "Wed", clocked: "8:15", job: "5:55", shop: "2:20" },
    { who: "Owner", day: "Mon", clocked: "9:10", job: "2:30", shop: "6:40" },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Time & payroll" />
      <div className="min-h-0 flex-1 overflow-auto p-3">
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Employee</th>
              <th className="px-3 py-2 font-medium">Day</th>
              <th className="px-3 py-2 text-right font-medium">Clocked</th>
              <th className="px-3 py-2 text-right font-medium">Job time</th>
              <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Shop</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="px-3 py-2">{r.who}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.day}</td>
                <td className="tnum px-3 py-2 text-right">{r.clocked}</td>
                <td className="tnum px-3 py-2 text-right">{r.job}</td>
                <td className="tnum hidden px-3 py-2 text-right sm:table-cell">{r.shop}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        TIME-006: only clocked attendance is payable. Job time is for costing.
      </p>
      </div>
    </div>
  );
}
