import "server-only";
import { mapConcurrent } from "./analytics";
import { parseProjectMap, selectOwners, supabaseLog } from "./sources";
import type { LogEntry, LogResult, Period, Project } from "./types";

export const supabaseConfigured = () =>
  Boolean(process.env.SUPABASE_ACCESS_TOKEN);

async function supabaseFetch(
  path: string,
  params: Record<string, string> = {},
) {
  const url = new URL(path, "https://api.supabase.com");
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    let message = `Supabase no está disponible (${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body.message === "string")
        message = body.message.slice(0, 300);
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

const STATUS = "toInt32OrZero(log_attributes['response.status_code'])";

export function supabaseQuery(errorsOnly: boolean) {
  const levels = errorsOnly
    ? "'ERROR','FATAL','PANIC','CRITICAL'"
    : "'WARNING','WARN','ERROR','FATAL','PANIC','CRITICAL'";
  return `select id, timestamp, source, severity_text as severity, event_message,
  log_attributes['request.path'] as path, ${STATUS} as status
from logs
where upper(severity_text) in (${levels}) or ${STATUS} >= ${errorsOnly ? 500 : 400}
order by timestamp desc
limit 200`;
}

export async function getSupabaseLogs(
  projects: Project[],
  projectId: string,
  period: Period,
  errorsOnly: boolean,
): Promise<LogResult> {
  const result: LogResult = {
    logs: [],
    issues: [],
    mode: "live",
    fetchedAt: new Date().toISOString(),
    truncated: false,
  };
  if (!supabaseConfigured()) return result;
  try {
    const all: { ref: string; name: string; status: string }[] =
      await supabaseFetch("/v1/projects");
    const owners = selectOwners(
      all
        .filter((p) => p.status === "ACTIVE_HEALTHY")
        .map((p) => ({ key: p.ref, name: p.name })),
      projects,
      parseProjectMap(process.env.SUPABASE_PROJECTS),
      "supabase",
      projectId,
    );
    const end = new Date();
    const start = new Date(end.getTime() - 86400000);
    const sql = supabaseQuery(errorsOnly);
    const chunks = await mapConcurrent(
      owners,
      4,
      async ({ external, owner }) => {
        try {
          const body = await supabaseFetch(
            `/v1/projects/${encodeURIComponent(external.key)}/analytics/endpoints/logs`,
            {
              sql,
              iso_timestamp_start: start.toISOString(),
              iso_timestamp_end: end.toISOString(),
            },
          );
          if (body.error)
            throw new Error(
              typeof body.error === "string"
                ? body.error.slice(0, 300)
                : "Consulta de logs rechazada.",
            );
          const rows: Record<string, unknown>[] = body.result ?? [];
          if (rows.length >= 200) result.truncated = true;
          return rows
            .map((row) => supabaseLog(row, owner, external.key))
            .filter((log): log is LogEntry => log !== null);
        } catch (error) {
          result.issues.push({
            projectId: owner.id,
            message: `Supabase: ${error instanceof Error ? error.message : "logs no disponibles."}`,
          });
          return [];
        }
      },
    );
    result.logs = chunks.flat();
    if (period > 1 && owners.length)
      result.issues.push({
        projectId: "Supabase",
        message:
          "La API de Supabase limita la consulta a las últimas 24 horas.",
      });
  } catch (error) {
    result.issues.push({
      projectId: "Supabase",
      message: error instanceof Error ? error.message : "Logs no disponibles.",
    });
  }
  return result;
}
