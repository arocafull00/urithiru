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

// Vercel limits the team's total query time per five minutes. For larger
// portfolios, alternate two stable groups; each project is checked every 10 min.
export function vercelAlertProjects<T extends { id: string }>(projects: T[], now: Date) {
  if (projects.length <= 18) return projects;
  const group = Math.floor(now.getTime() / 300000) % 2;
  return [...projects].sort((a, b) => a.id.localeCompare(b.id)).filter((_, index) => index % 2 === group);
}

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
