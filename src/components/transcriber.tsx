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
import { useDashboard } from "@/stores/dashboard";
import {
  transcriptFilename,
  transcriptMarkdown,
} from "@/lib/transcript-markdown";
import type { Transcript } from "@/lib/types";

export default function Transcriber() {
  const transcripts = useDashboard((s) => s.transcripts);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
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
      <form onSubmit={submit} className="panel p-5 space-y-3">
        <div>
          <h2 className="font-semibold">Transcribir un TikTok</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Pega el enlace de un vídeo público. Se transcribe con Whisper en el
            plan gratuito de Groq y se guarda en este navegador.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="url"
            inputMode="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.tiktok.com/@usuario/video/…"
            aria-label="Enlace de TikTok"
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
    await navigator.clipboard.writeText(markdown());
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
          {t.description || `TikTok de @${t.author}`}
        </p>
        <p className="text-xs text-muted-foreground">
          @{t.author}
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
            {copied ? "Copiado" : "Copiar Markdown"}
          </Button>
          <Button variant="outline" size="sm" onClick={download}>
            <Download size={14} />
            Descargar .md
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={t.url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} />
              Ver en TikTok
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
