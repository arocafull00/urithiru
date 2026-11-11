import { requireAdmin } from "@/lib/auth";
import { errorResponse, HttpError, json } from "@/lib/http";
import { transcribeTikTok } from "@/lib/tiktok";
import { transcribeYouTube } from "@/lib/youtube";

export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => null);
    if (typeof body?.url !== "string")
      throw new HttpError(400, "Pega un enlace de vídeo.");
    const source = body.source ?? "tiktok";
    if (source !== "tiktok" && source !== "youtube")
      throw new HttpError(400, "Elige TikTok o YouTube como origen del vídeo.");
    return json(await (source === "youtube"
      ? transcribeYouTube(body.url, fetch, process.env.SUPADATA_API_KEY)
      : transcribeTikTok(body.url)));
  } catch (error) {
    return errorResponse(error);
  }
}
