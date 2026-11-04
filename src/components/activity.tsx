"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ExternalLink, GitCommitHorizontal, RefreshCw, Search, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Skeleton } from "./ui/skeleton";
import { madridDate, type ActivityResult } from "@/lib/activity-data";
import { parseSummary } from "@/lib/activity-summary";

const clock = (value: string) => new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit",
}).format(new Date(value));

export default function Activity({ userId }: { userId: string }) {
  const [date, setDate] = useState(() => madridDate());
  const [search, setSearch] = useState("");
  const [generating, setGenerating] = useState<"data" | "summary" | null>(null);
  const url = `/api/activity?${new URLSearchParams({ date })}`;
  const { data, error, mutate, isValidating } = useSWR<ActivityResult>([url, userId], {
    refreshInterval: 60000, keepPreviousData: false,
  });
  const digest = data?.digest;
  const projects = digest?.projects.filter((p) => p.repository.toLowerCase().includes(search.toLowerCase())) ?? [];
  const count = digest?.projects.reduce((total, p) => total + p.commits.length, 0) ?? 0;
  const summary = digest?.aiSummary ? parseSummary(digest.aiSummary) : null;

  useEffect(() => {
    if (!error) return;
    const id = toast.error(`${error.message}${digest ? " Se conserva el resumen guardado." : ""}`, { action: { label: "Reintentar", onClick: () => void mutate() } });
    return () => { toast.dismiss(id); };
  }, [error, digest, mutate]);

  function changeDate(next: string) {
    if (!next || next > madridDate()) return;
    setDate(next);
  }
  function offsetDay(offset: number) {
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + offset);
    changeDate(next.toISOString().slice(0, 10));
  }
  async function run(kind: "data" | "summary") {
    setGenerating(kind);
    try {
      const response = await fetch(kind === "summary" ? `${url}&action=summary` : url, { method: "POST" });
      const body = await response.json();
      if (response.status === 401) window.dispatchEvent(new Event("centralita-session-expired"));
      if (response.status === 403) window.dispatchEvent(new CustomEvent("centralita-access-denied", { detail: body.error }));
      if (!response.ok) throw new Error(body.error ?? "No se ha podido completar la operación. Reinténtalo.");
      await mutate(body, { revalidate: false });
      if (kind === "data") {
        if (!body.saved) toast.error("La consulta no ha mejorado la cobertura. Se conservan los datos anteriores; vuelve a intentarlo.");
        else toast.success("Datos actualizados.");
      } else if (body.ai === "failed") toast.warning("La IA no ha podido generar el resumen. Revisa GROQ_API_KEY y el modelo en los logs del servidor.");
      else if (body.ai === "disabled") toast.warning("Falta configurar GROQ_API_KEY en el servidor para generar el resumen.");
      else toast.success("Resumen generado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se ha podido completar la operación.");
    } finally { setGenerating(null); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-8 items-center rounded-md border border-input">
            <Button variant="ghost" size="icon" className="size-8 rounded-r-none" aria-label="Día anterior" disabled={!!generating} onClick={() => offsetDay(-1)}><ChevronLeft size={14} /></Button>
            <Input type="date" aria-label="Fecha de actividad" className="h-8 w-auto rounded-none border-0 px-1 text-sm shadow-none focus-visible:ring-0" value={date} max={madridDate()} disabled={!!generating} onChange={(e) => changeDate(e.target.value)} />
            <Button variant="ghost" size="icon" className="size-8 rounded-l-none" aria-label="Día siguiente" disabled={!!generating || date >= madridDate()} onClick={() => offsetDay(1)}><ChevronRight size={14} /></Button>
          </div>
          {date !== madridDate() && <Button variant="ghost" size="sm" disabled={!!generating} onClick={() => changeDate(madridDate())}>Hoy</Button>}
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input aria-label="Buscar proyecto en el resumen" className="h-8 w-44 pl-8 text-sm" placeholder="Buscar proyecto" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {digest && count > 0 && <span className="text-sm text-muted-foreground" title={`Desde las 00:00 hasta las ${clock(digest.until)}${date < madridDate() && clock(digest.until) === "00:00" ? " del día siguiente" : ""} · @${digest.username} · Hora de Madrid`}>
            <strong className="font-medium text-foreground">{count}</strong> {count === 1 ? "commit" : "commits"} · <strong className="font-medium text-foreground">{digest.projects.length}</strong> {digest.projects.length === 1 ? "proyecto" : "proyectos"}
          </span>}
          <Button variant="outline" size="sm" onClick={() => void run("data")} disabled={!!generating || !data?.connected || !data.storage}>
            <RefreshCw size={14} className={generating === "data" ? "animate-spin" : undefined} />
            {generating === "data" ? "Obteniendo…" : digest ? "Actualizar datos" : "Obtener datos"}
          </Button>
          <Button size="sm" onClick={() => void run("summary")} disabled={!!generating || !digest || !count}>
            <Sparkles size={14} className={generating === "summary" ? "animate-pulse" : undefined} />
            {generating === "summary" ? "Generando…" : digest?.aiSummary ? "Regenerar resumen" : "Generar resumen"}
          </Button>
        </div>
      </div>

      {generating === "data" && <div className="notice" role="status">Consultando tus repositorios y ramas. Puede tardar unos minutos.</div>}
      {generating === "summary" && <div className="notice" role="status">Generando el resumen con IA.</div>}
      {!data && !error && <div role="status" aria-label="Cargando actividad"><Skeleton className="h-28 w-full" /><Skeleton className="mt-4 h-72 w-full" /></div>}

      {data && (!data.connected || !data.storage) && (
        <section className="panel panel-padding space-y-3">
          <h2>Conecta tu actividad de GitHub</h2>
          <p className="text-sm text-muted-foreground">Para guardar tu trabajo diario, configura la conexión de GitHub y el histórico en el servidor de Urithiru.</p>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {!data.connected && <li>Configura <code>GITHUB_USERNAME</code> y <code>GITHUB_ACTIVITY_TOKEN</code>, con lectura de los repositorios que quieras incluir.</li>}
            {!data.storage && <li>Configura <code>DATABASE_URL</code> y ejecuta <code>pnpm db:migrate</code>.</li>}
            <li>Activa el cron siguiendo «Actividad diaria de GitHub» en el README.</li>
          </ul>
        </section>
      )}

      {data?.connected && data.storage && !digest && !error && (
        <section className="empty-state panel">
          <GitCommitHorizontal size={24} aria-hidden="true" />
          <h2>Aún no hay resumen para este día</h2>
          <p>Genera uno ahora o elige otro día. El resumen automático se guarda a las 20:00.</p>
        </section>
      )}

      {digest && <>
        {digest.aiSummary && <section className="panel panel-padding space-y-2" aria-label="Resumen del día con IA">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Sparkles size={14} aria-hidden="true" />Resumen del día</h2>
          {summary ? <div className="space-y-4">{summary.map((section) => <div key={section.project} className="space-y-1.5">
            <h3 className="break-all text-sm font-semibold">{section.project}</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">{section.items.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>)}</div> : <p className="text-base leading-relaxed">{digest.aiSummary}</p>}
        </section>}
        {digest.issues.length > 0 && <div className="notice notice-error" role="alert"><div><strong>Resumen incompleto</strong><ul className="mt-2 list-disc space-y-1 pl-5">{digest.issues.map((message) => <li key={message}>{message}</li>)}</ul></div></div>}
        {!count && <section className="empty-state panel"><h2>{digest.issues.length ? "No se ha podido recuperar actividad" : "Sin commits en este periodo"}</h2><p>{digest.issues.length ? "Reintenta la consulta para completar el resumen." : "No se han encontrado commits tuyos en los repositorios accesibles. El trabajo sin subir a GitHub no aparece aquí."}</p></section>}
        {count > 0 && !projects.length && <p className="text-sm text-muted-foreground" role="status">Ningún proyecto coincide con la búsqueda.</p>}
        {projects.map((project) => <section className="panel panel-padding space-y-4" key={project.repository}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="min-w-0 break-all font-semibold"><a className="inline-flex items-center gap-2 hover:underline underline-offset-4" href={project.url} target="_blank" rel="noreferrer">{project.repository}<ExternalLink size={14} className="shrink-0" /></a></h3>
            <Badge variant="outline">{project.commits.length} {project.commits.length === 1 ? "commit" : "commits"}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{project.summary.map((group) => `${group.label}: ${group.count}`).join(" · ")}</p>
          <ul className="divide-y divide-border">
            {project.commits.map((commit) => <li key={commit.sha} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <GitCommitHorizontal size={16} className="mt-1 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-1">
                <a className="break-words text-sm font-medium hover:underline underline-offset-4" href={commit.url} target="_blank" rel="noreferrer">{commit.title || "Commit sin mensaje"}</a>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><time dateTime={commit.timestamp}>{clock(commit.timestamp)}</time><code>{commit.sha.slice(0, 7)}</code><span className="break-all">{commit.branches.join(", ")}</span></div>
                {commit.message !== commit.title && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Mensaje completo</summary><p className="mt-2 whitespace-pre-wrap break-words">{commit.message}</p></details>}
              </div>
            </li>)}
          </ul>
        </section>)}
        <p className="text-xs text-muted-foreground">Resumen a partir de los mensajes de tus commits, clasificados por su prefijo. Se usa la fecha de confirmación del commit, que puede diferir de la fecha del push. Cada commit aparece una vez por repositorio, aunque esté en varias ramas. Solo se incluyen repositorios accesibles y ramas que aún existen.</p>
      </>}

      {data && data.dates.length > 0 && <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted-foreground">Últimos resúmenes:</span>{data.dates.slice(0, 7).map((day) => <Button key={day} variant="ghost" size="sm" disabled={!!generating || date === day} onClick={() => changeDate(day)}>{day}</Button>)}</div>}
    </div>
  );
}
