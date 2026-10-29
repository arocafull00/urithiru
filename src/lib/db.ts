import "server-only";
import { neon } from "@neondatabase/serverless";
import type { LogEntry, LogResult, Project } from "./types";
export function database() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL no está configurada.");
  return neon(process.env.DATABASE_URL);
}
export async function historyLogs(
  projects: Project[],
  since: string,
  errorsOnly: boolean,
): Promise<LogResult> {
  if (!projects.length)
    return {
      logs: [],
      issues: [],
      mode: "history",
      fetchedAt: new Date().toISOString(),
      truncated: false,
    };
  const sql = database();
  const ids = projects.map((p) => p.id);
  const rows =
    await sql`SELECT id, project_id, deployment_id, timestamp, level, message, path, status_code, source
    FROM centralita_logs WHERE project_id = ANY(${ids}::text[]) AND timestamp >= ${since}::timestamptz
    AND (${errorsOnly}::boolean = false OR level IN ('error', 'fatal') OR status_code >= 500)
    ORDER BY timestamp DESC LIMIT 1001`;
  const logs: LogEntry[] = rows
    .slice(0, 1000)
    .map((r) => ({
      id: r.id,
      provider: "vercel",
      projectId: r.project_id,
      projectName:
        projects.find((p) => p.id === r.project_id)?.name ?? r.project_id,
      deploymentId: r.deployment_id,
      timestamp: new Date(r.timestamp).getTime(),
      level: r.level,
      message: r.message,
      path: r.path,
      statusCode: r.status_code,
      source: r.source,
      url: null,
      count: null,
    }));
  return {
    logs,
    issues: [],
    mode: "history",
    fetchedAt: new Date().toISOString(),
    truncated: rows.length > 1000,
  };
}
