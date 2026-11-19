"use client";

import { useState } from "react";
import useSWR from "swr";
import type { Period, Project } from "@/lib/types";
import type { PortfolioVisitorsReport } from "@/lib/portfolio-visitors";
import { useDashboard } from "@/stores/dashboard";
import { TablePagination } from "./table-pagination";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

const sites = [["all", "Todas"], ["business", "Servicios"], ["portfolio", "Porfolio profesional"], ["products", "Productos"]] as const;
const date = (value: string) => new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" }).format(new Date(value));

export default function PortfolioVisitors({ project, team, period, userId }: {
  project: Project; team: string; period: Period; userId: string;
}) {
  const [site, setSite] = useState("all");
  const [pagination, setPagination] = useState({ key: "", page: 0 });
  const filterKey = `${userId}:${team}:${project.id}:${period}:${site}`;
  const page = pagination.key === filterKey ? pagination.page : 0;
  const cacheKey = `${filterKey}:${page}`;
  const snapshot = useDashboard((state) => state.visitorSnapshots[cacheKey]);
  const { data, error, isValidating, mutate } = useSWR<PortfolioVisitorsReport>([
    `/api/portfolio-visitors?${new URLSearchParams({ team, project: project.id, period: String(period), site, page: String(page) })}`, userId,
  ], {
    fallbackData: snapshot,
    onSuccess: (result) => {
      const state = useDashboard.getState();
      if (JSON.stringify(state.visitorSnapshots[cacheKey]) === JSON.stringify(result)) return;
      state.patch({ visitorSnapshots: Object.fromEntries([
        ...Object.entries(state.visitorSnapshots).filter(([key]) => key !== cacheKey).slice(-19), [cacheKey, result],
      ]) });
      if (page > 0 && !result.visitors.length) setPagination({ key: filterKey, page: Math.max(0, Math.ceil(result.totals.visitors / 6) - 1) });
    },
  });
  return (
    <section className="panel min-w-0" aria-labelledby="portfolio-visitors-title">
      <div className="panel-heading flex-wrap gap-3">
        <div className="min-w-0">
          <h2 id="portfolio-visitors-title">Visitantes del porfolio</h2>
          <p className="text-xs text-muted-foreground">Navegadores únicos estimados · últimas {period === 1 ? "24 horas" : `${period} jornadas`}</p>
        </div>
        <Button variant="outline" size="sm" disabled={isValidating} onClick={() => void mutate()}>{isValidating ? "Actualizando…" : "Actualizar"}</Button>
      </div>
      <div className="flex flex-wrap gap-2 border-b p-4" role="group" aria-label="Web que quieres consultar">
        {sites.map(([id, label]) => <Button key={id} variant={site === id ? "secondary" : "ghost"} size="sm" aria-pressed={site === id} onClick={() => setSite(id)}>{label}</Button>)}
      </div>
      <p className="px-4 pt-4 text-sm text-muted-foreground">Solo incluye visitantes que aceptan la medición. Un navegador cuenta una vez en el periodo, aunque vuelva varios días. Otro navegador, incógnito o borrar cookies puede contar de nuevo.</p>
      {error && <p role="alert" className="px-4 py-3 text-sm text-destructive">{error.message}{data ? " Se conserva la última lectura." : ""}</p>}
      {!data && !error && <Skeleton className="m-4 h-64" />}
      {data && <>
        <dl className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          {[["Visitantes únicos estimados", data.totals.visitors], ["Nuevos", data.totals.new], ["Recurrentes", data.totals.returning], ["Páginas vistas", data.totals.pageviews]].map(([label, value]) => (
            <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{value.toLocaleString("es-ES")}</dd></div>
          ))}
        </dl>
        <p className="px-4 pb-4 text-xs text-muted-foreground">Nuevo: primera visita registrada en el periodo. Recurrente: ya había visitado alguna de estas webs antes del periodo. Horas de Madrid.
          {data.measuredSince && ` Primer dato conservado: ${date(data.measuredSince)}.`}</p>
        {!data.totals.visitors ? <p className="border-t p-6 text-sm text-muted-foreground">Todavía no hay visitas con consentimiento en este periodo y web. La medición comienza al publicar esta función; las visitas anteriores siguen en Vercel Analytics.</p> : <>
          <div className="border-t p-4">
            <h3 className="mb-3 text-sm font-medium">Dispositivos</h3>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">{data.devices.map((device) => <li key={device.label}>{device.label}: <strong>{device.visitors.toLocaleString("es-ES")}</strong> visitantes · {device.pageviews.toLocaleString("es-ES")} vistas</li>)}</ul>
            <p className="mt-2 text-xs text-muted-foreground">El tipo de dispositivo se estima con el navegador. Un visitante puede aparecer en más de una categoría.</p>
          </div>
          <div className="overflow-x-auto border-t">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Visitantes anónimos, dispositivo y actividad del periodo</caption>
              <thead className="text-xs text-muted-foreground"><tr>
                {["Visitante", "Dispositivo", "Primera visita", "Última visita", "Vistas", "Procedencia / última página"].map((heading) => <th key={heading} scope="col" className="px-4 py-3 font-medium">{heading}</th>)}
              </tr></thead>
              <tbody>{data.visitors.map((visitor) => <tr key={visitor.id} className="border-t align-top">
                <th scope="row" className="whitespace-nowrap px-4 py-3 font-mono text-xs font-normal">{visitor.id.slice(0, 10).toUpperCase()}</th>
                <td className="px-4 py-3"><span className="whitespace-nowrap">{visitor.device}</span><span className="block whitespace-nowrap text-xs text-muted-foreground">{visitor.browser} · {visitor.os}</span></td>
                <td className="whitespace-nowrap px-4 py-3 text-xs">{date(visitor.firstSeen)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs">{date(visitor.lastSeen)}</td>
                <td className="px-4 py-3 tabular-nums">{visitor.pageviews}</td>
                <td className="max-w-64 break-all px-4 py-3 text-xs">{visitor.referrer}<span className="block text-muted-foreground">{visitor.path}</span></td>
              </tr>)}</tbody>
            </table>
          </div>
          <TablePagination label="visitantes del porfolio" page={page} total={data.totals.visitors} disabled={isValidating} onPageChange={(next) => setPagination({ key: filterKey, page: next })} />
        </>}
      </>}
    </section>
  );
}
