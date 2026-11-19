import { z } from "zod";

const count = z.number().int().nonnegative();
export const portfolioVisitorsSchema = z.object({
  totals: z.object({ pageviews: count, visitors: count, new: count, returning: count }),
  devices: z.array(z.object({ label: z.string(), pageviews: count, visitors: count })),
  visitors: z.array(z.object({
    id: z.string(), firstSeen: z.iso.datetime({ offset: true }), lastSeen: z.iso.datetime({ offset: true }),
    pageviews: count, device: z.string(), browser: z.string(), os: z.string(), path: z.string(), referrer: z.string(),
  })),
  measuredSince: z.iso.datetime({ offset: true }).nullable(),
  since: z.iso.datetime({ offset: true }), until: z.iso.datetime({ offset: true }), page: count,
});
export type PortfolioVisitorsReport = z.infer<typeof portfolioVisitorsSchema>;
