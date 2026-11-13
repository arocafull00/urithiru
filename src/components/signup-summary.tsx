"use client";

import useSWR from "swr";
import { ACQUISITION_CHANNELS } from "@/lib/acquisition";
import type { SignupSummary } from "@/lib/types";
import { useDashboard } from "@/stores/dashboard";
import { SignupChannelRow } from "./signup-channel-row";
import { Skeleton } from "./ui/skeleton";

export function SignupSummaryPanel({ projectId, team, period, userId }: {
  projectId: string;
  team: string;
  period: number;
  userId: string;
}) {
  const url = `/api/signup-acquisition?${new URLSearchParams({ project: projectId, team, period: String(period) })}`;
  const key = `${userId}:${url}`;
  const snapshot = useDashboard((state) => state.signupSnapshots[key]);
  const { data, error } = useSWR<SignupSummary>([url, userId], {
    fallbackData: snapshot,
    refreshInterval: 60000,
    onSuccess: (result) => {
      const state = useDashboard.getState();
      if (JSON.stringify(state.signupSnapshots[key]) === JSON.stringify(result)) return;
      state.patch({ signupSnapshots: Object.fromEntries([
        ...Object.entries(state.signupSnapshots).filter(([entry]) => entry !== key).slice(-19),
        [key, result],
      ]) });
    },
  });
  const total = data?.rows.reduce((sum, row) => sum + row.signups, 0);
  return (
    <section className="panel min-w-0" aria-labelledby="signup-summary-title">
      <div className="panel-heading">
        <div>
          <h2 id="signup-summary-title">Altas de cuentas por origen</h2>
          <p>Cuentas creadas en Diariamente{period ? ` · ${period === 1 ? "últimas 24 horas" : `últimos ${period} días`}` : " · todas las fechas"}</p>
        </div>
        <strong className="tabular-nums">{total === undefined ? "—" : `${total.toLocaleString("es-ES")} altas`}</strong>
      </div>
      {error && <p role="status" className="px-4 py-3 text-sm text-destructive">{error.message}{data ? " Se mantiene la última lectura guardada." : ""}</p>}
      {!data && !error && <Skeleton className="m-4 h-40" />}
      {data && <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground"><tr>
            <th scope="col" className="px-4 py-2 text-left font-medium">Origen del alta</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Total</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Web</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Android · Google Play</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Desde landing</th>
          </tr></thead>
          <tbody>
            {ACQUISITION_CHANNELS.map((channel) => <SignupChannelRow key={channel.id} channel={channel.id} label={channel.id === "web" ? "Web / directo" : channel.label} rows={data.rows} />)}
            <SignupChannelRow channel={null} label="Sin origen registrado" rows={data.rows} />
          </tbody>
        </table>
      </div>}
      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Cada cuenta con perfil cuenta una vez. Se conserva la primera procedencia detectada en las 24 horas previas al alta. Las cuentas anteriores o sin datos de atribución figuran sin origen ni plataforma registrados. «Desde landing» indica cuántas de esas mismas altas pasaron por una web informativa; está incluido en el total.</p>
    </section>
  );
}
