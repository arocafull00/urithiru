"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDashboard } from "@/stores/dashboard";
import {
  LEAD_KINDS,
  LEAD_RANGES,
  LEAD_TOWNS,
  leadKey,
  type Lead,
  type LeadCandidate,
  type LeadRange,
  type LeadScan,
  type LeadStatus,
  type LeadVerdict,
} from "@/lib/leads";
import { cn } from "@/lib/utils";

const POLL_MS = 15000;
const CLASSIFY_BATCH = 15;
const TABS: { id: LeadStatus; name: string }[] = [
  { id: "nuevo", name: "Nuevos" },
  { id: "contactado", name: "Contactados" },
  { id: "descartado", name: "Descartados" },
];

async function post<T>(url: string, payload: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) window.dispatchEvent(new Event("centralita-session-expired"));
  if (res.status === 403)
    window.dispatchEvent(new CustomEvent("centralita-access-denied", { detail: body.error }));
  return { res, body: body as T & { error?: string; retryAfter?: number } };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Leads() {
  const leads = useDashboard((s) => s.leads);
  const scan = useDashboard((s) => s.leadScan);
  const towns = useDashboard((s) => s.leadTowns);
  const range = useDashboard((s) => s.leadRange);
  const groups = useDashboard((s) => s.leadGroups);
  const [groupText, setGroupText] = useState(groups.join("\n"));
  const [tab, setTab] = useState<LeadStatus>("nuevo");
  const [starting, setStarting] = useState(false);
  const [classifying, setClassifying] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const stopped = useRef(false);
  const running = useRef(false);

  const classify = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    stopped.current = false;
    const userId = useDashboard.getState().session?.userId;
    const sameUser = () => Boolean(userId) && useDashboard.getState().session?.userId === userId;
    const pending = () => useDashboard.getState().leads.filter((l) => !l.classified);
    const total = pending().length;
    let done = 0;
    try {
      while (!stopped.current && sameUser()) {
        const batch = pending().slice(0, CLASSIFY_BATCH);
        if (!batch.length) break;
        setClassifying({ done, total });
        const candidates: LeadCandidate[] = batch.map((l) => ({
          url: l.url, source: l.source, site: l.site, title: l.title.slice(0, 500), text: l.text.slice(0, 2000),
          author: l.author, group: l.group, postedAt: l.postedAt, town: l.town,
        }));
        const { res, body } = await post<{ results: LeadVerdict[] }>("/api/leads/classify", { candidates });
        if (res.status === 429) {
          await sleep((body.retryAfter ?? 20) * 1000);
          continue;
        }
        if (!res.ok) {
          setError(`${body.error ?? "No se ha podido filtrar con IA."} Los resultados sin filtrar se muestran igualmente.`);
          break;
        }
        if (!sameUser()) break;
        if (body.results.every((r) => r === null)) {
          setError("La IA no ha devuelto una respuesta válida. Vuelve a pulsar Filtrar pendientes.");
          break;
        }
        const store = useDashboard.getState();
        const rejected: string[] = [];
        batch.forEach((lead, i) => {
          const r = body.results[i];
          if (r === false) rejected.push(lead.id);
          else if (r)
            store.updateLead(lead.id, {
              classified: true, kind: r.kind, need: r.need || null, who: r.who || null,
              town: r.town || lead.town, score: r.score,
            });
          else store.updateLead(lead.id, { classified: true });
        });
        if (rejected.length) store.rejectLeads(rejected);
        done += batch.length;
      }
    } finally {
      running.current = false;
      setClassifying(null);
    }
  }, []);

  useEffect(() => {
    if (!scan) return;
    let cancelled = false;
    const userId = useDashboard.getState().session?.userId;
    async function poll() {
      while (!cancelled) {
        const state = useDashboard.getState();
        const known = [...state.leads.map((l) => l.id), ...state.leadRejected];
        const { res, body } = await post<{
          status: "running" | "done"; candidates?: LeadCandidate[]; failed?: string[];
        }>("/api/leads/collect", { runs: scan!.runs, known });
        if (cancelled || useDashboard.getState().session?.userId !== userId) return;
        if (!res.ok) {
          setError(body.error ?? "No se ha podido consultar la búsqueda.");
          if (res.status < 500 || res.status === 503) useDashboard.getState().patch({ leadScan: null });
          return;
        }
        if (body.status === "done") {
          const foundAt = new Date().toISOString();
          const fresh: Lead[] = (body.candidates ?? []).map((c) => ({
            ...c, id: leadKey(c.url), kind: null, need: null, who: null, score: null,
            classified: false, foundAt, status: "nuevo",
          }));
          useDashboard.getState().addLeads(fresh);
          useDashboard.getState().patch({ leadScan: null });
          setNotice(
            `${fresh.length ? `${fresh.length} resultados nuevos.` : "No hay resultados nuevos."}` +
              (body.failed?.length ? ` Con fallos: ${body.failed.join("; ")}.` : ""),
          );
          if (fresh.length) void classify();
          return;
        }
        await sleep(POLL_MS);
      }
    }
    void poll();
    return () => {
      cancelled = true;
    };
  }, [scan, classify]);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    const list = groupText.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    useDashboard.getState().patch({ leadGroups: list });
    setStarting(true);
    setError("");
    setNotice("");
    try {
      const { res, body } = await post<LeadScan>("/api/leads/scan", {
        towns, range, groups: list,
      });
      if (!res.ok) throw new Error(body.error ?? "No se ha podido iniciar la búsqueda.");
      useDashboard.getState().patch({ leadScan: { runs: body.runs, startedAt: body.startedAt } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se ha podido iniciar la búsqueda.");
    } finally {
      setStarting(false);
    }
  }

  function toggleTown(town: string) {
    const next = towns.includes(town) ? towns.filter((t) => t !== town) : [...towns, town];
    useDashboard.getState().patch({ leadTowns: LEAD_TOWNS.filter((t) => next.includes(t)) });
  }

  const busy = starting || Boolean(scan);
  const unclassified = leads.filter((l) => !l.classified).length;
  const visible = leads
    .filter((l) => l.status === tab)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.foundAt.localeCompare(a.foundAt));

  return (
    <div className="space-y-5">
      <form onSubmit={start} className="panel p-5 space-y-4" aria-busy={busy}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Buscar clientes</h2>
          <Select
            value={range}
            disabled={busy}
            onValueChange={(v) => useDashboard.getState().patch({ leadRange: v as LeadRange })}
          >
            <SelectTrigger aria-label="Antigüedad de las publicaciones">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LEAD_RANGES).map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <fieldset className="space-y-2" disabled={busy}>
          <legend className="sr-only">Municipios</legend>
          <div className="flex flex-wrap gap-1.5">
            {LEAD_TOWNS.map((town) => (
              <button
                key={town}
                type="button"
                aria-pressed={towns.includes(town)}
                onClick={() => toggleTown(town)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
                  towns.includes(town)
                    ? "border-primary bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {town}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="block space-y-1.5">
          <span className="text-xs text-muted-foreground">Grupos públicos de Facebook, uno por línea</span>
          <textarea
            value={groupText}
            onChange={(e) => setGroupText(e.target.value)}
            disabled={busy}
            rows={2}
            placeholder="https://www.facebook.com/groups/…"
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" className="btn-glow" disabled={busy || !towns.length}>
            {starting ? "Iniciando…" : scan ? "Buscando…" : "Buscar"}
          </Button>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {scan
              ? `Búsqueda en curso desde las ${new Date(scan.startedAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}. Suele tardar unos minutos.`
              : classifying
                ? `Filtrando con IA ${Math.min(classifying.done, classifying.total)} de ${classifying.total}…`
                : `${towns.length} municipios · ${towns.length * 3} búsquedas en Google`}
          </span>
          {classifying ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => (stopped.current = true)}>
              Detener
            </Button>
          ) : unclassified > 0 && !scan ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void classify()}>
              Filtrar {unclassified} pendientes
            </Button>
          ) : null}
          {scan && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => useDashboard.getState().patch({ leadScan: null })}
            >
              Olvidar búsqueda
            </Button>
          )}
        </div>
        {notice && <p className="text-sm">{notice}</p>}
        {error && (
          <div className="notice notice-error mb-0" role="alert">
            {error}
          </div>
        )}
      </form>

      <div className="flex gap-1 border-b" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              tab === t.id ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.name} <span className="tabular-nums text-muted-foreground">{leads.filter((l) => l.status === t.id).length}</span>
          </button>
        ))}
      </div>

      {visible.length ? (
        <ul className="panel divide-y">
          {visible.map((lead) => (
            <LeadRow key={lead.id} lead={lead} />
          ))}
        </ul>
      ) : (
        <div className="panel small-empty">
          {tab === "nuevo" ? "Sin clientes potenciales nuevos." : "Nada por aquí."}
        </div>
      )}
    </div>
  );
}

function LeadRow({ lead }: { lead: Lead }) {
  const update = useDashboard((s) => s.updateLead);
  const date = lead.postedAt ?? lead.foundAt;
  const meta = [
    lead.kind && LEAD_KINDS[lead.kind],
    lead.who,
    lead.town,
    lead.group ?? lead.site,
    new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(new Date(date)),
  ].filter(Boolean);
  return (
    <li className="flex flex-wrap items-start gap-x-6 gap-y-3 px-5 py-4">
      <div className="min-w-0 flex-1 basis-72 space-y-1">
        <div className="flex items-baseline gap-2">
          {lead.score != null && (
            <span
              className={cn("text-xs font-semibold tabular-nums", lead.score >= 4 ? "text-primary" : "text-muted-foreground")}
              title="Prioridad según la IA"
            >
              {lead.score}/5
            </span>
          )}
          <h3 className="font-medium wrap-anywhere">{lead.need ?? lead.title}</h3>
        </div>
        <p className="text-xs text-muted-foreground wrap-anywhere">
          {meta.join(" · ")}
          {!lead.classified && " · sin filtrar"}
        </p>
        <p className="text-sm text-muted-foreground line-clamp-3 wrap-anywhere">{lead.text || lead.title}</p>
      </div>
      <div className="ml-auto flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={lead.url} target="_blank" rel="noreferrer">
            Abrir
            <ExternalLink size={14} />
          </a>
        </Button>
        {lead.status === "nuevo" ? (
          <>
            <Button variant="outline" size="sm" onClick={() => update(lead.id, { status: "contactado" })}>
              Contactado
            </Button>
            <Button variant="ghost" size="sm" onClick={() => update(lead.id, { status: "descartado" })}>
              Descartar
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => update(lead.id, { status: "nuevo" })}>
            Mover a nuevos
          </Button>
        )}
      </div>
    </li>
  );
}
