import "server-only";
import { HttpError } from "./http";
import {
  dateRange,
  domainBreakdown,
  mapConcurrent,
  metrics,
  splitHost,
  trafficSeries,
} from "./analytics";
import type {
  Dashboard,
  Details,
  Project,
  Period,
  LogEntry,
  LogResult,
} from "./types";

export async function vercelFetch(
  path: string,
  params: Record<string, string> = {},
  signal?: AbortSignal,
) {
  if (!process.env.VERCEL_TOKEN)
    throw new HttpError(
      503,
      "Conecta Vercel configurando VERCEL_TOKEN en el servidor.",
    );
  const url = new URL(path, "https://api.vercel.com");
  for (const [key, value] of Object.entries(params))
    if (value) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
    cache: "no-store",
    signal: signal ?? AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    let message = `Vercel no está disponible (${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body.error?.message === "string")
        message = body.error.message.slice(0, 300);
    } catch {}
    // An upstream token failure must not be confused with an expired Clerk session.
    throw new HttpError(
      [401, 403].includes(response.status) ? 502 : response.status,
      message,
    );
  }
  return response;
}

export async function listTeams() {
  const result = await (
    await vercelFetch("/v2/teams", { limit: "100" })
  ).json();
  return (result.teams ?? []).map(
    (t: { id: string; name: string; slug: string }) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
    }),
  );
}

export async function listProjects(teamId: string): Promise<Project[]> {
  const projects: Project[] = [];
  let until = "";
  const cursors = new Set<string>();
  do {
    const body = await (
      await vercelFetch("/v9/projects", { teamId, limit: "100", until })
    ).json();
    for (const p of body.projects ?? []) {
      const production = p.targets?.production;
      projects.push({
        id: p.id,
        name: p.name,
        domain: production?.alias?.[0] ?? production?.url ?? null,
        framework: p.framework ?? null,
        deploymentId: production?.id ?? null,
        deploymentState: production?.readyState ?? "NONE",
        updatedAt: p.updatedAt,
        analyticsEnabled: Boolean(p.webAnalytics?.enabledAt),
        analytics: null,
        analyticsError: null,
      });
    }
    until = body.pagination?.next ? String(body.pagination.next) : "";
    if (cursors.has(until))
      throw new Error("Vercel ha repetido el cursor de proyectos.");
    cursors.add(until);
  } while (until);
  return projects;
}

async function aggregate(
  projectId: string,
  teamId: string,
  range: { since: string; until: string },
  by?: string,
) {
  const params: Record<string, string> = {
    projectId,
    teamId,
    ...range,
    limit: "100",
  };
  params.by = by ?? "environment";
  return (
    await (
      await vercelFetch("/v1/query/web-analytics/visits/aggregate", params)
    ).json()
  ).data;
}

export async function getDashboard(
  teamId: string,
  period: Period,
): Promise<Dashboard> {
  const range = dateRange(period);
  const [allProjects, teams] = await Promise.all([
    listProjects(teamId),
    listTeams(),
  ]);
  const projects = await mapConcurrent(allProjects, 4, async (project) => {
    if (!project.analyticsEnabled) return project;
    try {
      const [total, series] = await Promise.all([
        aggregate(project.id, teamId, range),
        aggregate(project.id, teamId, range, period === 1 ? "hour" : "day"),
      ]);
      return {
        ...project,
        analytics: {
          ...metrics(
            Array.isArray(total)
              ? (total[0] ?? { pageviews: 0, visitors: 0 })
              : total,
          ),
          series: trafficSeries(series),
        },
      };
    } catch (error) {
      return {
        ...project,
        analyticsError:
          error instanceof Error
            ? error.message
            : "No se han podido cargar las métricas.",
      };
    }
  });
  return {
    projects,
    ...range,
    teamId,
    teamSlug: teams.find((t: { id: string }) => t.id === teamId)?.slug ?? "",
    fetchedAt: new Date().toISOString(),
  };
}

export async function getDetails(
  projectId: string,
  teamId: string,
  period: Period,
): Promise<Details> {
  const range = dateRange(period);
  const groups = [
    "requestPath",
    "referrerHostname",
    "country",
    "deviceType",
  ] as const;
  const result = await Promise.all(
    groups.map(async (group) => {
      const rows = await aggregate(projectId, teamId, range, group);
      if (!Array.isArray(rows)) throw new Error("Desglose no válido.");
      return rows.map((row) => ({
        ...metrics(row),
        label: String(
          row[group] ??
            (group === "referrerHostname" ? "Directo" : "Desconocido"),
        ),
      }));
    }),
  );
  return {
    pages: result[0].map((page) => {
      const { host, path } = splitHost(page.label);
      return host ? { ...page, label: `${host}${path}` } : page;
    }),
    domains: domainBreakdown(result[0]),
    referrers: result[1],
    countries: result[2],
    devices: result[3],
  };
}

export async function getLiveLogs(
  projects: Project[],
  teamId: string,
): Promise<LogResult> {
  const issues: LogResult["issues"] = [];
  const chunks = await mapConcurrent(projects, 6, async (project) => {
    if (!project.deploymentId) return [];
    const logs: LogEntry[] = [];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const res = await vercelFetch(
        `/v1/projects/${encodeURIComponent(project.id)}/deployments/${encodeURIComponent(project.deploymentId)}/runtime-logs`,
        { teamId },
        controller.signal,
      );
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Vercel ha devuelto un flujo vacío.");
      const decoder = new TextDecoder();
      let buffer = "";
      const parseLine = (line: string) => {
        if (!line.trim() || line.startsWith(":")) return;
        try {
          const r = JSON.parse(line.replace(/^data:\s*/, ""));
          if (!r.rowId || !r.timestampInMs) return;
          logs.push({
            id: String(r.rowId),
            provider: "vercel",
            projectId: project.id,
            projectName: project.name,
            timestamp: Number(r.timestampInMs),
            level: String(r.level ?? "info"),
            message: String(r.message ?? ""),
            path: String(r.requestPath ?? ""),
            statusCode: r.responseStatusCode
              ? Number(r.responseStatusCode)
              : null,
            source: String(r.source ?? "runtime"),
            deploymentId: project.deploymentId!,
            url: null,
            count: null,
          });
        } catch {
          /* heartbeat and SSE metadata */
        }
      };
      try {
        while (logs.length < 200) {
          const { value, done } = await reader.read();
          if (done) {
            if (buffer) parseLine(buffer);
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          lines.forEach(parseLine);
          if (buffer.length > 1048576)
            throw new Error("El flujo de Vercel excede el tamaño permitido.");
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
    } catch (error) {
      issues.push({
        projectId: project.id,
        message: controller.signal.aborted
          ? "Lectura en vivo limitada a 2,5 s; puede no incluir actividad previa."
          : error instanceof Error
            ? error.message
            : "Logs no disponibles.",
      });
    } finally {
      clearTimeout(timeout);
    }
    return logs;
  });
  const all = chunks.flat().sort((a, b) => b.timestamp - a.timestamp);
  return {
    logs: all.slice(0, 1000),
    issues,
    mode: "live",
    fetchedAt: new Date().toISOString(),
    truncated: all.length > 1000 || chunks.some((c) => c.length >= 200),
  };
}
