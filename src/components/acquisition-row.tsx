import type { Acquisition } from "@/lib/types";

export function AcquisitionRow({ channel, label, rows, android }: {
  channel: Acquisition["rows"][number]["channel"];
  label: string;
  rows: Acquisition["rows"];
  android: boolean;
}) {
  const web = rows.find((row) => row.channel === channel && row.platform === "web");
  const app = rows.find((row) => row.channel === channel && row.platform === "android");
  return (
    <tr className="border-t border-border">
      <th scope="row" className="px-4 py-3 text-left font-medium">{label}</th>
      <td className="px-4 py-3 text-right tabular-nums">
        <strong>{(web?.visitors ?? 0).toLocaleString("es-ES")}</strong>
        <span className="block text-xs text-muted-foreground">{(web?.pageviews ?? 0).toLocaleString("es-ES")} páginas vistas</span>
      </td>
      {android && (
        <td className="px-4 py-3 text-right tabular-nums">
          <strong>{(app?.visitors ?? 0).toLocaleString("es-ES")}</strong>
          <span className="block text-xs text-muted-foreground">{(app?.pageviews ?? 0).toLocaleString("es-ES")} páginas vistas</span>
        </td>
      )}
    </tr>
  );
}
