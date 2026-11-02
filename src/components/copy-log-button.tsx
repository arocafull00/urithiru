"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatLog } from "@/lib/log-copy";
import type { LogEntry } from "@/lib/types";

export function CopyLogButton({ log }: { log: LogEntry }) {
  const [state, setState] = useState<"idle" | "copying" | "copied" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  async function copy() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setState("copying");
    setError("");
    try {
      if (!navigator.clipboard)
        throw new Error("El navegador no permite acceder al portapapeles.");
      const text = async () => {
        if (log.provider !== "sentry") return formatLog(log);
        const response = await fetch(
          `/api/logs/sentry/${encodeURIComponent(log.id.replace(/^sentry:/, ""))}`,
          {
            cache: "no-store",
          },
        );
        if (response.status === 401) {
          window.dispatchEvent(new Event("centralita-session-expired"));
        }
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error ?? "No se pudo obtener el evento completo de Sentry.",
          );
        return formatLog(log, body.event);
      };
      // Start the clipboard operation during the click, including on Safari.
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": text().then(
              (value) => new Blob([value], { type: "text/plain" }),
            ),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(await text());
      }
      setState("copied");
      resetTimer.current = setTimeout(() => setState("idle"), 2500);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo copiar el log. Inténtalo de nuevo.",
      );
      setState("error");
    }
  }

  const label =
    state === "copying"
      ? "Copiando…"
      : state === "copied"
        ? "Copiado"
        : state === "error"
          ? "Reintentar copia"
          : "Copiar log";
  const Icon =
    state === "copied" ? Check : state === "error" ? CircleAlert : Copy;
  return (
    <div className="log-copy">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={copy}
        disabled={state === "copying"}
        aria-label={label}
        title={error || "Copiar el log completo"}
      >
        <Icon size={14} />
        <span className="log-copy-label">{label}</span>
      </Button>
      <span className="sr-only" role="status">
        {state === "copied"
          ? "Log completo copiado."
          : state === "error"
            ? error
            : ""}
      </span>
      {state === "error" && (
        <small className="log-copy-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
