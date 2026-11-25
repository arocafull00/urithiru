import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { errorResponse, HttpError, json } from "@/lib/http";
import { LEAD_RANGES, LEAD_TOWNS } from "@/lib/leads";
import { startLeadScan } from "@/lib/leads-server";

export const maxDuration = 60;

const groupUrl = z
  .string()
  .trim()
  .regex(/^https:\/\/(www\.|m\.)?facebook\.com\/groups\/[\w.-]+\/?$/, "Enlace de grupo de Facebook no válido.");
const schema = z.object({
  towns: z.array(z.enum(LEAD_TOWNS)).min(1, "Elige al menos un municipio.").max(LEAD_TOWNS.length),
  range: z.enum(Object.keys(LEAD_RANGES) as [keyof typeof LEAD_RANGES]),
  groups: z.array(groupUrl).max(10, "Como máximo 10 grupos.").default([]),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Datos no válidos.");
    return json({ runs: await startLeadScan(parsed.data), startedAt: new Date().toISOString() });
  } catch (error) {
    return errorResponse(error);
  }
}
