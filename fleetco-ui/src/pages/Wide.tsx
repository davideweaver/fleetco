import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { jobs, STAGES, type Job } from "@/data/sample";
import { useShell } from "@/shell/shell-context";
import { Btn } from "@/shell/ListDetailLayout";
import { Overlay } from "@/components/ui/overlay";
import { BoardPage as Board } from "./Board";
import { Section, Stat } from "./Customers";
import { nameOf } from "@/data/time";
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
              <Stat label="Assigned" value={nameOf(picked.who)} />
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
