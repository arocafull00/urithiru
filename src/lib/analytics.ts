import type { Metrics, TrafficPoint, Period } from "./types";

export function dateRange(period: Period, now = new Date()) {
  const start = new Date(now);
  if (period === 1) {
    start.setUTCMinutes(0, 0, 0);
    start.setUTCHours(start.getUTCHours() - 23);
  } else {
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - period + 1);
  }
  return { since: start.toISOString(), until: now.toISOString() };
}
export function metrics(value: unknown): Metrics {
  const v = value as Record<string, unknown> | null;
  if (
    !v ||
    typeof v.pageviews !== "number" ||
    typeof v.visitors !== "number" ||
    !Number.isFinite(v.pageviews) ||
    !Number.isFinite(v.visitors)
  )
    throw new Error("Vercel ha devuelto métricas con un formato inesperado.");
  return { pageviews: v.pageviews, visitors: v.visitors };
}
export function trafficSeries(rows: unknown): TrafficPoint[] {
  if (!Array.isArray(rows))
    throw new Error("Vercel ha devuelto una serie con un formato inesperado.");
  return rows
    .map((row) => {
      if (
        typeof row.timestamp !== "string" ||
        !Number.isFinite(Date.parse(row.timestamp))
      )
        throw new Error("Fecha de analytics no válida.");
      return { ...metrics(row), timestamp: row.timestamp };
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const result = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        result[i] = await fn(items[i]);
      }
    }),
  );
  return result;
}
