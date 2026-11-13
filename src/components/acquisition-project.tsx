"use client";

import useSWR from "swr";
import { ACQUISITION_CHANNELS, diariamenteSurface } from "@/lib/acquisition";
import type { Acquisition, Period, Project } from "@/lib/types";
import { useDashboard } from "@/stores/dashboard";
import { AcquisitionRow } from "./acquisition-row";
import { Skeleton } from "./ui/skeleton";

export function AcquisitionProject({ project, team, period, userId }: {
  project: Project;
  team: string;
  period: Period;
  userId: string;
}) {
  const cacheKey = `${userId}:${team}:${project.id}:${period}`;
  const snapshot = useDashboard((state) => state.acquisitionSnapshots[cacheKey]);
  const { data, error } = useSWR<Acquisition>([
    `/api/acquisition?team=${encodeURIComponent(team)}&project=${encodeURIComponent(project.id)}&period=${period}`,
    userId,
  ], {
    fallbackData: snapshot,
    refreshInterval: 60000,
    onSuccess: (result) => {
      const state = useDashboard.getState();
      if (JSON.stringify(state.acquisitionSnapshots[cacheKey]) === JSON.stringify(result)) return;
      state.patch({ acquisitionSnapshots: Object.fromEntries([
        ...Object.entries(state.acquisitionSnapshots).filter(([key]) => key !== cacheKey).slice(-19),
        [cacheKey, result],
      ]) });
    },
  });
  const app = diariamenteSurface(project) === "app";
  const measured = data?.rows.some((row) => row.pageviews > 0);
  return (
    <section className="panel min-w-0">
      <div className="panel-heading">
        <div>
          <h3 className="font-semibold">{app ? "Aplicación" : "Landing"}</h3>
          <p className="break-all">{project.domain ?? project.name}</p>
        </div>
        <span className="text-xs text-muted-foreground">Visitantes por canal</span>
      </div>
      {error && <p role="status" className="px-4 py-3 text-sm text-destructive">{error.message}{data ? " Se mantiene la última lectura disponible." : ""}</p>}
      {!data && !error && <Skeleton className="m-4 h-40" />}
      {data && !measured && <p className="px-4 py-6 text-sm text-muted-foreground">Sin visitas medidas en este periodo. El desglose empieza al publicar la nueva medición; el tráfico anterior sigue en las métricas generales.</p>}
      {data && measured && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 text-left font-medium">Origen</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Web</th>
                {app && <th scope="col" className="px-4 py-2 text-right font-medium">Android · Google Play</th>}
              </tr>
            </thead>
            <tbody>
              {ACQUISITION_CHANNELS.map((channel) => <AcquisitionRow key={channel.id} channel={channel.id} label={channel.label} rows={data.rows} android={app} />)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
