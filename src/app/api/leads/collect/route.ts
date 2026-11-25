import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { errorResponse, HttpError, json } from "@/lib/http";
import { collectLeadScan } from "@/lib/leads-server";

export const maxDuration = 60;

const schema = z.object({
  runs: z
    .array(z.object({ id: z.string().regex(/^\w{8,32}$/), source: z.enum(["google", "facebook"]) }))
    .min(1)
    .max(2),
  known: z.array(z.string().max(500)).max(5000).default([]),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Búsqueda no válida.");
    return json(await collectLeadScan(parsed.data.runs, new Set(parsed.data.known)));
  } catch (error) {
    return errorResponse(error);
  }
}
