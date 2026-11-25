import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { errorResponse, HttpError, json } from "@/lib/http";
import { classifyLeads } from "@/lib/leads-server";

export const maxDuration = 60;

const text = (max: number) => z.string().max(max);
const schema = z.object({
  candidates: z
    .array(
      z.object({
        url: text(2000),
        source: z.enum(["google", "facebook"]),
        site: text(200),
        title: text(500),
        text: text(2000),
        author: text(200).nullable(),
        group: text(300).nullable(),
        postedAt: text(40).nullable(),
        town: text(100).nullable(),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Resultados no válidos.");
    return json({ results: await classifyLeads(parsed.data.candidates) });
  } catch (error) {
    if (error instanceof HttpError && error.status === 429)
      return json({ error: error.message, retryAfter: (error as HttpError & { retryAfter?: number }).retryAfter ?? 20 }, 429);
    return errorResponse(error);
  }
}
