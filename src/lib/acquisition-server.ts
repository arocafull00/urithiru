import "server-only";
import { ACQUISITION_CHANNELS } from "./acquisition";
import { dateRange, mapConcurrent, metrics } from "./analytics";
import { vercelFetch } from "./vercel";
import type { Acquisition, Period } from "./types";

export async function getAcquisition(projectId: string, teamId: string, period: Period): Promise<Acquisition> {
  const range = dateRange(period);
  const segments = ACQUISITION_CHANNELS.flatMap(({ id: channel }) => (["web", "android"] as const).map((platform) => ({ channel, platform })));
  const rows = await mapConcurrent(segments, 4, async ({ channel, platform }) => {
    const response = await vercelFetch("/v1/query/web-analytics/visits/aggregate", {
      projectId,
      teamId,
      ...range,
      by: "environment",
      filter: `environment eq 'production' and startswith(requestPath, '/__acquisition/${platform}/${channel}/')`,
      limit: "100",
    });
    const { data } = await response.json();
    if (!Array.isArray(data) || data.length > 1) throw new Error("Vercel ha devuelto un desglose de origen no válido.");
    return { channel, platform, ...metrics(data[0] ?? { visitors: 0, pageviews: 0 }) };
  });
  return { rows };
}
