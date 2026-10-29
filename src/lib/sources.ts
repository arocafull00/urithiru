import type { LogEntry, LogResult, Project } from "./types";

export type ExternalProject = { key: string; name: string };
export type Owner = { id: string; name: string };

const normalize = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function parseProjectMap(value = "") {
  const map = new Map<string, string>();
  for (const pair of value.split(",")) {
    const [from, to] = pair.split(":").map((s) => s.trim());
    if (from && to) map.set(normalize(from), normalize(to));
  }
  return map;
}

export function ownerOf(
  external: ExternalProject,
  projects: Project[],
  map: Map<string, string>,
  prefix: string,
): Owner {
  const target =
    map.get(normalize(external.key)) ??
    map.get(normalize(external.name)) ??
    normalize(external.name);
  const match = projects.find(
    (p) => normalize(p.name) === target || normalize(p.id) === target,
  );
  return match
    ? { id: match.id, name: match.name }
    : { id: `${prefix}:${external.key}`, name: external.name };
}

export function selectOwners(
  externals: ExternalProject[],
  projects: Project[],
  map: Map<string, string>,
  prefix: string,
  projectId: string,
) {
  return externals
    .map((external) => ({
      external,
      owner: ownerOf(external, projects, map, prefix),
    }))
    .filter(({ owner }) => !projectId || owner.id === projectId);
}

const ERROR_LEVELS = ["error", "fatal"];

export function isError(log: Pick<LogEntry, "level" | "statusCode">) {
  return ERROR_LEVELS.includes(log.level) || (log.statusCode ?? 0) >= 500;
}

export function sentryLog(
  issue: Record<string, unknown>,
  owner: Owner,
): LogEntry | null {
  const lastSeen = Date.parse(String(issue.lastSeen ?? ""));
  if (!issue.id || !Number.isFinite(lastSeen)) return null;
  const count = Number(issue.count);
  return {
    id: `sentry:${issue.id}`,
    provider: "sentry",
    projectId: owner.id,
    projectName: owner.name,
    timestamp: lastSeen,
    level: String(issue.level ?? "error"),
    message: String(issue.title ?? ""),
    path: String(issue.culprit ?? ""),
    statusCode: null,
    source: "issue",
    deploymentId: "",
    url:
      typeof issue.permalink === "string" &&
      issue.permalink.startsWith("https://")
        ? issue.permalink
        : null,
    count: Number.isFinite(count) ? count : null,
  };
}

export function supabaseTimestamp(value: unknown) {
  if (typeof value === "number")
    return value > 1e14 ? Math.floor(value / 1000) : value;
  const text = String(value ?? "");
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text}Z`);
}

function supabaseLevel(severity: string, status: number) {
  const s = severity.toLowerCase();
  if (["fatal", "panic", "critical"].includes(s)) return "fatal";
  if (s === "error" || status >= 500) return "error";
  if (s === "warning" || s === "warn" || status >= 400) return "warning";
  return s || "info";
}

export function supabaseLog(
  row: Record<string, unknown>,
  owner: Owner,
  ref: string,
): LogEntry | null {
  const timestamp = supabaseTimestamp(row.timestamp);
  if (!row.id || !Number.isFinite(timestamp)) return null;
  const status = Number(row.status) || 0;
  return {
    id: `supabase:${ref}:${row.id}`,
    provider: "supabase",
    projectId: owner.id,
    projectName: owner.name,
    timestamp,
    level: supabaseLevel(String(row.severity ?? ""), status),
    message: String(row.event_message ?? "").slice(0, 32000),
    path: String(row.path ?? ""),
    statusCode: status || null,
    source: String(row.source ?? "logs"),
    deploymentId: "",
    url: `https://supabase.com/dashboard/project/${encodeURIComponent(ref)}/logs/explorer`,
    count: null,
  };
}

export function mergeResults(base: LogResult, extras: LogResult[]): LogResult {
  const all = [base, ...extras]
    .flatMap((r) => r.logs)
    .sort((a, b) => b.timestamp - a.timestamp);
  return {
    ...base,
    logs: all.slice(0, 1000),
    issues: [base, ...extras].flatMap((r) => r.issues),
    truncated: all.length > 1000 || [base, ...extras].some((r) => r.truncated),
  };
}
