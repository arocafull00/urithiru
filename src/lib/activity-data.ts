import { HttpError } from "./http";

export const ACTIVITY_TIME_ZONE = "Europe/Madrid";
export type ActivityCommit = {
  sha: string;
  title: string;
  message: string;
  url: string;
  timestamp: string;
  branches: string[];
};
export type ActivityProject = {
  repository: string;
  url: string;
  commits: ActivityCommit[];
  summary: { label: string; count: number }[];
};
export type ActivityDigest = {
  date: string;
  username: string;
  since: string;
  until: string;
  generatedAt: string;
  projects: ActivityProject[];
  issues: string[];
  repositoriesChecked: number;
  aiSummary?: string | null;
};
export type ActivityResult = {
  connected: boolean;
  storage: boolean;
  digest: ActivityDigest | null;
  dates: string[];
};

export function madridDate(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: ACTIVITY_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function activityDate(value: string | null, now = new Date()) {
  const date = value ?? madridDate(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date ||
      date > madridDate(now)) {
    throw new HttpError(400, "Elige una fecha válida que no sea futura.");
  }
  return date;
}

function madridMidnight(date: string) {
  const target = Date.parse(`${date}T00:00:00Z`);
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: ACTIVITY_TIME_ZONE, year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
    const local = Date.parse(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`);
    instant += target - local;
  }
  return instant;
}

export function activityRange(date: string, now = new Date()) {
  activityDate(date, now);
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  return {
    since: new Date(madridMidnight(date)).toISOString(),
    until: new Date(Math.min(madridMidnight(next), now.getTime())).toISOString(),
  };
}

export function summarizeCommits(commits: ActivityCommit[]) {
  const groups = new Map<string, number>();
  for (const commit of commits) {
    const type = /^(\w+)(?:\([^)]*\))?!?:/.exec(commit.title)?.[1].toLowerCase();
    const labels: Record<string, string> = {
      feat: "Funcionalidades", fix: "Correcciones", refactor: "Refactorización",
      perf: "Rendimiento", docs: "Documentación", test: "Pruebas",
      chore: "Mantenimiento", build: "Compilación", ci: "Integración continua",
      style: "Estilo", revert: "Reversiones",
    };
    const label = labels[type ?? ""] ?? "Otros cambios";
    groups.set(label, (groups.get(label) ?? 0) + 1);
  }
  return [...groups].map(([label, count]) => ({ label, count }));
}
