import type { LogEntry } from "./types";

export function formatLog(log: LogEntry, event?: unknown) {
  return [
    `Proyecto: ${log.projectName}`,
    `Fuente: ${log.provider ?? "vercel"}`,
    `Fecha: ${new Date(log.timestamp).toISOString()}`,
    `Nivel: ${log.level}`,
    `ID: ${log.id}`,
    log.path && `Ruta: ${log.path}`,
    log.statusCode != null && `HTTP: ${log.statusCode}`,
    log.source && `Origen: ${log.source}`,
    log.deploymentId && `Despliegue: ${log.deploymentId}`,
    log.count != null && `Eventos: ${log.count}`,
    log.url && `Enlace: ${log.url}`,
    "",
    log.message,
    ...(event === undefined
      ? []
      : [
          "",
          "Último evento completo de Sentry:",
          JSON.stringify(event, null, 2),
        ]),
  ]
    .filter((line) => typeof line === "string")
    .join("\n");
}
