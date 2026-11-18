import "server-only";
import { mapConcurrent } from "./analytics";
import { database } from "./db";
import { ERROR_THRESHOLD, type ErrorCount } from "./error-alerts-data";
import { getSentryErrorCounts, sentryConfigured } from "./sentry";
import { getSupabaseLogs, supabaseConfigured } from "./supabase";
import { isError } from "./sources";
import type { Project } from "./types";

// The same historical request-log endpoint used by `vercel logs --since`.
// Count requests once even when they contain several console.error lines.
async function vercelCounts(projects: Project[], since: Date, until: Date) {
  if (process.env.VERCEL_DRAIN_SECRET) {
    const rows = await database()`SELECT project_id, count(*)::int AS count FROM centralita_logs
      WHERE timestamp >= ${since.toISOString()}::timestamptz AND timestamp < ${until.toISOString()}::timestamptz
      AND project_id = ANY(${projects.map((p) => p.id)}::text[])
      AND (level IN ('error', 'fatal') OR status_code >= 500) GROUP BY project_id`;
    return rows.map((r) => ({ source: "vercel" as const, projectId: r.project_id as string,
      projectName: projects.find((p) => p.id === r.project_id)?.name ?? r.project_id, count: Number(r.count) }));
  }
  const chunks = await mapConcurrent(projects.filter((p) => p.deploymentId), 6, async (project) => {
    const requests = new Set<string>();
    let atLeast = false;
    // These filters are separate because Vercel combines filters with AND.
    const filters: Record<string, string>[] = [{ level: "error,fatal" }, { statusCode: "5xx" }];
    await Promise.all(filters.map(async (filter) => {
      let page = 0;
      while (true) {
        const params = new URLSearchParams({ projectId: project.id, ownerId: process.env.VERCEL_TEAM_ID!,
          environment: "production", startDate: String(since.getTime()), endDate: String(until.getTime()),
          page: String(page), ...filter });
        const response = await fetch(`https://vercel.com/api/logs/request-logs?${params}`, {
          headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` }, cache: "no-store",
          signal: AbortSignal.timeout(12000), redirect: "error",
        });
        if (!response.ok) throw new Error(`Vercel: consulta de errores rechazada (${response.status}).`);
        const body = await response.json();
        if (!Array.isArray(body.rows)) throw new Error("Vercel: formato de errores desconocido.");
        for (const row of body.rows) {
          const time = new Date(row.timestamp).getTime();
          if (row.requestId && time >= since.getTime() && time < until.getTime()) requests.add(row.requestId);
        }
        if (!body.hasMoreRows) break;
        if (requests.size >= ERROR_THRESHOLD) { atLeast = true; break; }
        if (++page >= 10) throw new Error("Vercel: paginación de errores incompleta.");
      }
    }));
    return { source: "vercel" as const, projectId: project.id, projectName: project.name, count: requests.size, atLeast };
  });
  return chunks;
}

export async function collectErrorCounts(projects: Project[], since: Date, until: Date) {
  const counts: ErrorCount[] = [];
  const issues: string[] = [];
  // Failure in one project/source must not hide a spike in another.
  const tasks = [
    ...projects.map((project) => ({ name: `Vercel/${project.name}`, run: () => vercelCounts([project], since, until) })),
    ...(sentryConfigured() ? [{ name: "Sentry", run: () => getSentryErrorCounts(projects, since, until) }] : []),
    ...(supabaseConfigured() ? [{ name: "Supabase", run: async () => {
      const result = await getSupabaseLogs(projects, "", 1, true, { since, until });
      issues.push(...result.issues.map((issue) => `Supabase/${issue.projectId}: ${issue.message}`));
      const groups = new Map<string, ErrorCount>();
      const seen = new Set<string>();
      for (const log of result.logs) {
        if (!isError(log) || seen.has(log.id) || log.timestamp < since.getTime() || log.timestamp >= until.getTime()) continue;
        seen.add(log.id);
        const group = groups.get(log.projectId) ?? { source: "supabase", projectId: log.projectId, projectName: log.projectName, count: 0 };
        group.count++;
        group.atLeast = result.truncated;
        groups.set(log.projectId, group);
      }
      return [...groups.values()];
    } }] : []),
  ];
  await mapConcurrent(tasks, 6, async ({ name, run }) => {
    try { counts.push(...await run()); }
    catch { issues.push(`${name}: no se pudo consultar la ventana de errores.`); }
  });
  return { counts, issues };
}
