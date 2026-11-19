import { requireAdmin } from "@/lib/auth";
import { errorResponse, HttpError, json } from "@/lib/http";
import { listTikTokProfile } from "@/lib/tiktok";
import { MAX_PROFILE_VIDEOS, tiktokProfileHandle } from "@/lib/tiktok-profile";

export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => null);
    const handle =
      typeof body?.url === "string" ? tiktokProfileHandle(body.url) : null;
    if (!handle)
      throw new HttpError(400, "Pega el enlace de un perfil, como https://www.tiktok.com/@usuario.");
    const limit = Number(body.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PROFILE_VIDEOS)
      throw new HttpError(400, `Elige entre 1 y ${MAX_PROFILE_VIDEOS} vídeos.`);
    return json(await listTikTokProfile(handle, limit));
  } catch (error) {
    return errorResponse(error);
  }
}
