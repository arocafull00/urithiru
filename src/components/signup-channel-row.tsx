import type { SignupSummary } from "@/lib/types";

export function SignupChannelRow({ channel, label, rows }: {
  channel: SignupSummary["rows"][number]["channel"];
  label: string;
  rows: SignupSummary["rows"];
}) {
  const matching = rows.filter((row) => row.channel === channel);
  const total = matching.reduce((sum, row) => sum + row.signups, 0);
  const web = matching.filter((row) => row.platform === "web").reduce((sum, row) => sum + row.signups, 0);
  const android = matching.filter((row) => row.platform === "android").reduce((sum, row) => sum + row.signups, 0);
  const landing = matching.filter((row) => row.landingHost).reduce((sum, row) => sum + row.signups, 0);
  return (
    <tr className="border-t border-border">
      <th scope="row" className="px-4 py-3 text-left font-medium">{label}</th>
      <td className="px-4 py-3 text-right font-semibold tabular-nums">{total.toLocaleString("es-ES")}</td>
      <td className="px-4 py-3 text-right tabular-nums">{web.toLocaleString("es-ES")}</td>
      <td className="px-4 py-3 text-right tabular-nums">{android.toLocaleString("es-ES")}</td>
      <td className="px-4 py-3 text-right tabular-nums">{landing.toLocaleString("es-ES")}</td>
    </tr>
  );
}
