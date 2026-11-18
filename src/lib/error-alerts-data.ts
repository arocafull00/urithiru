import type { LogProvider } from "./types";

export type ErrorCount = {
  source: LogProvider;
  projectId: string;
  projectName: string;
  count: number;
  atLeast?: boolean;
};

export const ERROR_WINDOW_MINUTES = 15;
export const ERROR_THRESHOLD = 10;
export const ERROR_COOLDOWN_MINUTES = 60;

export function alertMessage(count: ErrorCount, appUrl: string) {
  const url = new URL("/", appUrl);
  url.searchParams.set("view", "errors");
  // Do not send exception messages, user data or request paths to WhatsApp.
  return [
    "⚠️ Urithiru: muchos errores",
    `Proyecto: ${count.projectName}`,
    `Fuente: ${count.source}`,
    `${count.atLeast ? "Al menos " : ""}${count.count} errores en los últimos ${ERROR_WINDOW_MINUTES} minutos.`,
    `Avisos limitados a uno por hora para este proyecto y fuente.`,
    url.toString(),
  ].join("\n");
}

export function exceedsThreshold(count: ErrorCount) {
  return Number.isFinite(count.count) && count.count >= ERROR_THRESHOLD;
}
