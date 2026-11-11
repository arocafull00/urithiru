import { requireAdmin } from "@/lib/auth";
import { errorResponse, HttpError, json } from "@/lib/http";
import { transcribeTikTok } from "@/lib/tiktok";

export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => null);
    if (typeof body?.url !== "string")
      throw new HttpError(400, "Pega un enlace de TikTok.");
    return json(await transcribeTikTok(body.url));
  } catch (error) {
    return errorResponse(error);
  }
}
