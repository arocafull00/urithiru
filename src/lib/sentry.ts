import "server-only";
import { parseProjectMap, selectOwners, sentryLog } from "./sources";
import type { LogEntry, LogResult, Period, Project } from "./types";

export const sentryConfigured = () =>
  Boolean(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG);

async function sentryFetch(path: string, params: Record<string, string> = {}) {
  const base = process.env.SENTRY_URL || "https://sentry.io";
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    let message = `Sentry no está disponible (${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") message = body.detail.slice(0, 300);
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

export async function getSentryLogs(
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
  if (!sentryConfigured()) return result;
  const org = encodeURIComponent(process.env.SENTRY_ORG!);
  try {
    const sentryProjects: { id: string; slug: string }[] = await sentryFetch(
      `/api/0/organizations/${org}/projects/`,
    );
    const owners = selectOwners(
      sentryProjects.map((p) => ({ key: p.slug, name: p.slug })),
      projects,
      parseProjectMap(process.env.SENTRY_PROJECTS),
      "sentry",
      projectId,
    );
    if (!owners.length) return result;
    const params = new URLSearchParams({
      statsPeriod: `${period}d`,
      sort: "date",
      limit: "100",
      query: errorsOnly ? "is:unresolved level:[error,fatal]" : "is:unresolved",
    });
    const ids = new Map(sentryProjects.map((p) => [p.slug, String(p.id)]));
    for (const { external } of owners)
      params.append("project", ids.get(external.key)!);
    const url = `/api/0/organizations/${org}/issues/?${params}`;
    const issues: Record<string, unknown>[] = await sentryFetch(url);
    const bySlug = new Map(owners.map((o) => [o.external.key, o.owner]));
    result.logs = issues
      .map((issue) => {
        const slug =
          (issue.project as { slug?: string } | undefined)?.slug ?? "";
        const owner = bySlug.get(slug);
        return owner ? sentryLog(issue, owner) : null;
      })
      .filter((log): log is LogEntry => log !== null);
    result.truncated = issues.length >= 100;
  } catch (error) {
    result.issues.push({
      projectId: "Sentry",
      message:
        error instanceof Error ? error.message : "Issues no disponibles.",
    });
  }
  return result;
}
