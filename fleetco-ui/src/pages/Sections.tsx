import { useParams } from "react-router-dom";
import { reports, settingsSections } from "@/data/sample";
import { useShell } from "@/shell/shell-context";
import { DetailHeader, ListDetailLayout, ListHeader, ListRow } from "@/shell/ListDetailLayout";

/**
 * The second column's other mode: a list of sections rather than records.
 * Reports (nine of them) and Settings are the only two places where "secondary nav"
 * is the right content — everywhere else the column holds data.
 */
export function SectionsPage({ kind }: { kind: "reports" | "settings" }) {
  const { id } = useParams();
  const { href } = useShell();
  const items = kind === "reports" ? reports : settingsSections;
  const base = `/app/${kind}`;
  const selected = items.find((s) => s.id === id);

  return (
    <ListDetailLayout
      hasSelection={Boolean(selected)}
      backTo={base}
      empty={kind === "reports" ? "Pick a report." : "Pick a setting."}
      list={
        <>
          <ListHeader title={kind === "reports" ? "Reports" : "Settings"} count={items.length} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {items.map((s) => (
              <ListRow
                key={s.id}
                to={href(`${base}/${s.id}`)}
                selected={s.id === id}
                title={s.name}
                subtitle={s.note}
              />
            ))}
          </div>
        </>
      }
      detail={
        selected && (
          <div>
            <DetailHeader
              eyebrow={kind === "reports" ? "Report" : "Setting"}
              title={selected.name}
              sub={selected.note}
            />
            <div className="grid place-items-center p-10 text-sm text-muted-foreground">
              {kind === "reports"
                ? "Report table, with export and print."
                : "Setting form."}
            </div>
          </div>
        )
      }
    />
  );
}
