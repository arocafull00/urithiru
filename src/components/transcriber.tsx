"use client";
import { useId, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDashboard } from "@/stores/dashboard";
import {
  transcriptFilename,
  transcriptMarkdown,
  transcriptPlatform,
  transcriptTitle,
} from "@/lib/transcript-markdown";
import type { Transcript, TranscriptSource } from "@/lib/types";
import {
  MAX_PROFILE_VIDEOS,
  tiktokProfileHandle,
  type ProfileVideo,
} from "@/lib/tiktok-profile";

type Batch = {
  handle: string;
  ids: string[];
  done: number;
  total: number;
  failed: { url: string; error: string }[];
  running: boolean;
  error: string;
};

const MIN_GAP_MS = 3200;

async function requestTranscript(url: string, source: TranscriptSource) {
  const res = await fetch("/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, source }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401)
    window.dispatchEvent(new Event("centralita-session-expired"));
  if (res.status === 403)
    window.dispatchEvent(
      new CustomEvent("centralita-access-denied", { detail: body.error }),
    );
  return { res, body };
}

function downloadFile(content: string, filename: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([content], { type: "text/markdown;charset=utf-8" }),
  );
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function Transcriber() {
  const transcripts = useDashboard((s) => s.transcripts);
  const [source, setSource] = useState<TranscriptSource>("tiktok");
  const [url, setUrl] = useState("");
  const [count, setCount] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [batch, setBatch] = useState<Batch | null>(null);
  const stopped = useRef(false);
  const platform = source === "youtube" ? "YouTube" : "TikTok";
  const handle = source === "tiktok" ? tiktokProfileHandle(url) : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (handle) return transcribeProfile(handle);
    const userId = useDashboard.getState().session?.userId;
    setBusy(true);
    setError("");
    try {
      const { res, body } = await requestTranscript(url, source);
      if (!res.ok)
        throw new Error(body.error ?? "No se ha podido transcribir el vídeo.");
      if (!userId || useDashboard.getState().session?.userId !== userId) return;
      useDashboard.getState().addTranscript(body as Transcript);
      setUrl("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se ha podido transcribir el vídeo.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function transcribeProfile(handle: string) {
    const userId = useDashboard.getState().session?.userId;
    const sameUser = () =>
      Boolean(userId) && useDashboard.getState().session?.userId === userId;
    stopped.current = false;
    setBusy(true);
    setError("");
    setBatch(null);
    try {
      const res = await fetch("/api/transcribe/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, limit: Number(count) }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401)
        window.dispatchEvent(new Event("centralita-session-expired"));
      if (!res.ok)
        throw new Error(body.error ?? "No se ha podido leer el perfil.");
      const videos = body.videos as ProfileVideo[];
      if (!videos.length) throw new Error("El perfil no tiene vídeos públicos.");
      const known = new Set(useDashboard.getState().transcripts.map((t) => t.id));
      const pending = videos.filter((v) => !known.has(v.id));
      let state: Batch = {
        handle: body.author ?? handle,
        ids: videos.map((v) => v.id),
        done: videos.length - pending.length,
        total: videos.length,
        failed: [],
        running: true,
        error: "",
      };
      const update = (patch: Partial<Batch>) => {
        state = { ...state, ...patch };
        setBatch(state);
      };
      update({});
      let last = 0;
      for (const video of pending) {
        if (stopped.current || !sameUser()) break;
        const wait = last + MIN_GAP_MS - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        if (stopped.current || !sameUser()) break;
        last = Date.now();
        const { res, body } = await requestTranscript(video.url, "tiktok");
        if (res.ok && sameUser()) {
          useDashboard.getState().addTranscript(body as Transcript);
          update({ done: state.done + 1 });
          continue;
        }
        const message = body.error ?? `Error ${res.status}.`;
        if ([401, 403, 429, 503].includes(res.status)) {
          update({ error: message });
          break;
        }
        update({ failed: [...state.failed, { url: video.url, error: message }] });
      }
      update({ running: false });
      if (!state.error && !state.failed.length) setUrl("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se ha podido leer el perfil.",
      );
    } finally {
      setBusy(false);
    }
  }

  function downloadBatch(b: Batch) {
    const byId = new Map(transcripts.map((t) => [t.id, t]));
    const list = b.ids
      .map((id) => byId.get(id))
      .filter((t): t is Transcript => Boolean(t));
    downloadFile(
      list.map(transcriptMarkdown).join("\n---\n\n"),
      `tiktok-${b.handle}.md`,
    );
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="panel p-5 space-y-3" aria-busy={busy}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">
            {handle ? `Transcribir el perfil @${handle}` : `Transcribir un vídeo de ${platform}`}
          </h2>
          <Select
            value={source}
            disabled={busy}
            onValueChange={(value) => {
              setSource(value as TranscriptSource);
              setUrl("");
              setError("");
            }}
          >
            <SelectTrigger aria-label="Origen del vídeo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="youtube">YouTube</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {source === "youtube"
            ? "Pega el enlace de un vídeo público o un Short con subtítulos manuales o automáticos. Se priorizan los subtítulos en español."
            : "Pega el enlace de un vídeo público o de un perfil. Se transcribe con Whisper en el plan gratuito de Groq."}
          {" "}Las transcripciones se guardan en este navegador.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="url"
            inputMode="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={source === "youtube"
              ? "https://www.youtube.com/watch?v=…"
              : "https://www.tiktok.com/@usuario"}
            aria-label={`Enlace de ${platform}`}
            disabled={busy}
          />
          {handle && (
            <Input
              type="number"
              min={1}
              max={MAX_PROFILE_VIDEOS}
              required
              value={count}
              onChange={(e) => setCount(e.target.value)}
              aria-label="Número de vídeos"
              title="Número de vídeos más recientes"
              className="sm:w-24"
              disabled={busy}
            />
          )}
          {batch?.running ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                stopped.current = true;
              }}
            >
              Detener
            </Button>
          ) : (
            <Button type="submit" disabled={busy || !url.trim()}>
              {busy ? "Transcribiendo…" : handle ? "Transcribir perfil" : "Transcribir"}
            </Button>
          )}
        </div>
        {batch && (
          <div className="space-y-2 text-sm" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                {batch.running
                  ? `Transcribiendo ${Math.min(batch.done + batch.failed.length + 1, batch.total)} de ${batch.total}…`
                  : `${batch.done} de ${batch.total} transcritos`}
              </span>
              {!batch.running && batch.done > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => downloadBatch(batch)}
                >
                  <Download size={14} />
                  Descargar los {batch.done} (.md)
                </Button>
              )}
            </div>
            <progress
              className="w-full accent-primary"
              value={batch.done + batch.failed.length}
              max={batch.total}
            />
            {batch.error && (
              <div className="notice notice-error mb-0" role="alert">
                {batch.error} Vuelve a pulsar Transcribir perfil para continuar: los ya transcritos se saltan.
              </div>
            )}
            {batch.failed.length > 0 && (
              <ul className="text-xs text-muted-foreground space-y-1">
                {batch.failed.map((f) => (
                  <li key={f.url} className="wrap-anywhere">
                    <a href={f.url} target="_blank" rel="noreferrer" className="underline">
                      {f.url.split("/").pop()}
                    </a>
                    : {f.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {error && (
          <div className="notice notice-error mb-0" role="alert">
            {error}
          </div>
        )}
      </form>
      {transcripts.length ? (
        transcripts.map((t) => (
          <TranscriptCard key={t.id} transcript={t} />
        ))
      ) : (
        <div className="panel small-empty">
          Aún no hay transcripciones en este navegador.
        </div>
      )}
    </div>
  );
}

function TranscriptCard({
  transcript: t,
}: {
  transcript: Transcript;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const textId = useId();
  const markdown = () => transcriptMarkdown(t);
  async function copy() {
    await navigator.clipboard.writeText(t.text.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  function download() {
    downloadFile(markdown(), transcriptFilename(t));
  }
  return (
    <article className="panel">
      <header className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="min-w-0 flex-1 basis-60 space-y-1">
          <h3 className="font-medium line-clamp-2 wrap-anywhere">
            {transcriptTitle(t)}
          </h3>
          <p className="text-xs text-muted-foreground wrap-anywhere">
            {transcriptPlatform(t)} · {t.source === "youtube"
              ? t.authorName || "Canal de YouTube"
              : `@${t.author}`}
            {t.duration != null && ` · ${t.duration} s`}
            {t.language && ` · ${t.language}`}
            {" · "}
            {new Intl.DateTimeFormat("es", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(t.transcribedAt))}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => void copy()}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copiado" : "Copiar texto"}
          </Button>
          <Button variant="outline" size="sm" onClick={download}>
            <Download size={14} />
            Descargar .md
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={t.url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} />
              Ver en {transcriptPlatform(t)}
            </a>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => useDashboard.getState().removeTranscript(t.id)}
          >
            <Trash2 size={14} />
            Borrar
          </Button>
        </div>
      </header>
      <div className="border-t px-5 py-4 space-y-4">
        <p
          id={textId}
          className={`whitespace-pre-wrap wrap-anywhere text-sm leading-relaxed ${expanded ? "" : "max-h-[300px] overflow-hidden"}`}
        >
          {t.text || "Sin voz detectada."}
        </p>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          aria-controls={textId}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? "Ver menos" : "Ver transcripción completa"}
        </Button>
      </div>
    </article>
  );
}
