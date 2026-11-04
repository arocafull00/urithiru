"use client";

import { useState } from "react";
import useSWR from "swr";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, GitCommitHorizontal, RefreshCw, Search } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Skeleton } from "./ui/skeleton";
import { madridDate, type ActivityResult } from "@/lib/activity-data";

const clock = (value: string) => new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit",
}).format(new Date(value));
const dayLabel = (value: string) => new Intl.DateTimeFormat("es-ES", {
  timeZone: "UTC", dateStyle: "full",
}).format(new Date(`${value}T12:00:00Z`));

export default function Activity({ userId }: { userId: string }) {
  const [date, setDate] = useState(() => madridDate());
  const [search, setSearch] = useState("");
  const [generating, setGenerating] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const url = `/api/activity?${new URLSearchParams({ date })}`;
  const { data, error, mutate, isValidating } = useSWR<ActivityResult>([url, userId], {
    refreshInterval: 60000, keepPreviousData: false,
  });
  const digest = data?.digest;
  const projects = digest?.projects.filter((p) => p.repository.toLowerCase().includes(search.toLowerCase())) ?? [];
  const count = digest?.projects.reduce((total, p) => total + p.commits.length, 0) ?? 0;

  function changeDate(next: string) {
    if (!next || next > madridDate()) return;
    setDate(next);
    setFeedback(null);
  }
  function offsetDay(offset: number) {
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + offset);
    changeDate(next.toISOString().slice(0, 10));
  }
  async function generate() {
    setGenerating(true);
    setFeedback(null);
    try {
      const response = await fetch(url, { method: "POST" });
      const body = await response.json();
      if (response.status === 401) window.dispatchEvent(new Event("centralita-session-expired"));
      if (response.status === 403) window.dispatchEvent(new CustomEvent("centralita-access-denied", { detail: body.error }));
      if (!response.ok) throw new Error(body.error ?? "No se ha podido generar el resumen. Reinténtalo.");
      await mutate(body, { revalidate: false });
      setFeedback({
        text: body.saved ? "Resumen guardado." : "La consulta no ha mejorado la cobertura. Se conserva el resumen anterior; vuelve a intentarlo.",
        error: !body.saved,
      });
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : "No se ha podido generar el resumen.", error: true });
    } finally { setGenerating(false); }
  }

  return (
    <div className="space-y-6">
      <div className="section-heading max-sm:flex-col max-sm:items-start">
        <div>
          <h2>Tu día en GitHub</h2>
          <p>Lo que has avanzado, proyecto a proyecto. Resumen diario a las 20:00, hora de Madrid.</p>
        </div>
        <Button className="max-sm:self-start" size="sm" onClick={() => void generate()} disabled={generating || !data?.connected || !data.storage}>
          <RefreshCw size={14} />
          {generating ? "Generando resumen…" : digest ? "Regenerar resumen" : "Generar resumen"}
        </Button>
      </div>

      <div className="toolbar">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Día anterior" disabled={generating} onClick={() => offsetDay(-1)}><ChevronLeft size={16} /></Button>
          <label className="flex items-center gap-2 text-sm">
            <CalendarDays size={16} aria-hidden="true" />
            <span className="sr-only">Fecha de actividad</span>
            <Input type="date" className="w-auto" value={date} max={madridDate()} disabled={generating} onChange={(e) => changeDate(e.target.value)} />
          </label>
          <Button variant="outline" size="icon" aria-label="Día siguiente" disabled={generating || date >= madridDate()} onClick={() => offsetDay(1)}><ChevronRight size={16} /></Button>
          <Button variant="ghost" size="sm" disabled={generating || date === madridDate()} onClick={() => changeDate(madridDate())}>Hoy</Button>
        </div>
        <label className="flex items-center gap-2">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Buscar proyecto en el resumen</span>
          <Input placeholder="Buscar proyecto…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {feedback && <div role={feedback.error ? "alert" : "status"} className={`notice ${feedback.error ? "notice-error" : ""}`}>{feedback.text}</div>}
      {generating && <div className="notice" role="status">Consultando tus repositorios y ramas. Puede tardar unos minutos.</div>}
      {error && <div className="notice notice-error" role="alert"><span>{error.message} {digest && "Se conserva el resumen guardado."}</span><Button variant="outline" size="sm" disabled={isValidating} onClick={() => void mutate()}>Reintentar</Button></div>}
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
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{dayLabel(date)}</h2>
          <p className="text-sm">{digest.issues.length ? "Actividad recuperada" : "Tu actividad"}: <strong>{count} {count === 1 ? "commit" : "commits"}</strong> en <strong>{digest.projects.length} {digest.projects.length === 1 ? "proyecto" : "proyectos"}</strong>.</p>
          <p className="text-sm text-muted-foreground">Desde las 00:00 hasta las {clock(digest.until)} · @{digest.username} · Hora de Madrid{date < madridDate() && clock(digest.until) === "00:00" ? " del día siguiente" : ""}</p>
        </div>
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

      {data && data.dates.length > 0 && <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted-foreground">Últimos resúmenes:</span>{data.dates.slice(0, 7).map((day) => <Button key={day} variant="ghost" size="sm" disabled={generating || date === day} onClick={() => changeDate(day)}>{day}</Button>)}</div>}
    </div>
  );
}
