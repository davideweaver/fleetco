import { useParams } from "react-router-dom";
import { demoScreens, reports, settingsSections } from "@/data/sample";
import { useShell } from "@/shell/shell-context";
import {
  DetailHeader,
  ListDetailLayout,
  ListDivider,
  ListHeader,
  ListRow,
} from "@/shell/ListDetailLayout";
import { ReportShell } from "@/components/ui/report";
import { REPORTS } from "@/data/reports";
import { startOfMonth, startOfDay } from "@/lib/date";
import { useState } from "react";
import type { DateRange } from "@/components/ui/date-picker";
import { DatesDemo } from "./Dates";
import { StatesDemo } from "./States";

/**
 * The second column's other mode: a list of sections rather than records.
 * Reports (nine of them) and Settings are the only two places where "secondary nav"
 * is the right content — everywhere else the column holds data.
 *
 * Settings also carries the **design-system demo screens**, below a labelled divider.
 * They needed a nav home — a screen reachable only by typing a URL is a screen nobody
 * reviews — and Settings is where the app's "everything else" list already lives. The
 * divider is doing real work: these are not settings, and a reader who cannot tell
 * which half they are in will eventually look for a real setting among them.
 */
const DEMOS: Record<string, () => React.ReactElement> = {
  _dates: DatesDemo,
  _states: StatesDemo,
};

export function SectionsPage({ kind }: { kind: "reports" | "settings" }) {
  const { id } = useParams();
  const { href } = useShell();
  // One period for the whole section, so switching reports keeps the period you chose.
  // Resetting it per report is the behaviour that makes people stop trusting the list.
  const [period, setPeriod] = useState<DateRange>(() => {
    const today = startOfDay(new Date());
    return { from: startOfMonth(today), to: today };
  });
  const settings = kind === "reports" ? reports : settingsSections;
  const demos = kind === "settings" ? demoScreens : [];
  const base = `/app/${kind}`;
  const selected =
    settings.find((s) => s.id === id) ?? demos.find((s) => s.id === id);
  const Demo = id ? DEMOS[id] : undefined;
  const report = kind === "reports" && id ? REPORTS[id] : undefined;

  return (
    <ListDetailLayout
      hasSelection={Boolean(selected)}
      backTo={base}
      empty={kind === "reports" ? "Pick a report." : "Pick a setting."}
      list={
        <>
          {/* The count is the real settings only. Counting the demos would overstate
              how much of this app exists. */}
          <ListHeader
            title={kind === "reports" ? "Reports" : "Settings"}
            count={settings.length}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {settings.map((s) => (
              <ListRow
                key={s.id}
                to={href(`${base}/${s.id}`)}
                selected={s.id === id}
                title={s.name}
                subtitle={s.note}
              />
            ))}
            {demos.length > 0 && (
              <>
                <ListDivider label="Design system · demo" />
                {demos.map((s) => (
                  <ListRow
                    key={s.id}
                    to={href(`${base}/${s.id}`)}
                    selected={s.id === id}
                    title={s.name}
                    subtitle={s.note}
                  />
                ))}
              </>
            )}
          </div>
        </>
      }
      detail={
        selected &&
        (report ? (
          <ReportShell def={report} period={period} onPeriod={setPeriod} />
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <DetailHeader
              eyebrow={Demo ? "Design system · demo" : kind === "reports" ? "Report" : "Setting"}
              title={selected.name}
              sub={selected.note}
            />
            {Demo ? (
              <Demo />
            ) : (
              <div className="grid place-items-center p-10 text-sm text-muted-foreground">
                Setting form.
              </div>
            )}
          </div>
        ))
      }
    />
  );
}
