"use client";
import { useState } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  LoaderCircle,
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

export default function Transcriber() {
  const transcripts = useDashboard((s) => s.transcripts);
  const [source, setSource] = useState<TranscriptSource>("tiktok");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const platform = source === "youtube" ? "YouTube" : "TikTok";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const userId = useDashboard.getState().session?.userId;
    setBusy(true);
    setError("");
    try {
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

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="panel p-5 space-y-3" aria-busy={busy}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Transcribir un vídeo de {platform}</h2>
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
            : "Pega el enlace de un vídeo público. Se transcribe con Whisper en el plan gratuito de Groq."}
          {" "}La transcripción se guarda en este navegador.
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
              : "https://www.tiktok.com/@usuario/video/…"}
            aria-label={`Enlace de ${platform}`}
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !url.trim()}>
            {busy && <LoaderCircle size={15} className="animate-spin" />}
            {busy ? "Transcribiendo…" : "Transcribir"}
          </Button>
        </div>
        {error && (
          <div className="notice notice-error mb-0" role="alert">
            {error}
          </div>
        )}
      </form>
      {transcripts.length ? (
        transcripts.map((t, i) => (
          <TranscriptCard key={t.id} transcript={t} open={i === 0} />
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
  open,
}: {
  transcript: Transcript;
  open: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const markdown = () => transcriptMarkdown(t);
  async function copy() {
    await navigator.clipboard.writeText(t.text.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  function download() {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([markdown()], { type: "text/markdown;charset=utf-8" }),
    );
    link.download = transcriptFilename(t);
    link.click();
    URL.revokeObjectURL(link.href);
  }
  return (
    <details className="panel group" open={open}>
      <summary className="cursor-pointer list-none p-5 space-y-1">
        <p className="font-medium line-clamp-2">
          {transcriptTitle(t)}
        </p>
        <p className="text-xs text-muted-foreground">
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
      </summary>
      <div className="border-t px-5 py-4 space-y-4">
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {t.text || "Sin voz detectada."}
        </p>
        <div className="flex flex-wrap gap-2">
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
      </div>
    </details>
  );
}
