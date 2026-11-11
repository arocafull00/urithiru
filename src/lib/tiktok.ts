import "server-only";
import { HttpError } from "./http";
import type { Transcript } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export function parseTikTokUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new HttpError(400, "Pega un enlace de TikTok válido.");
  }
  if (
    url.protocol !== "https:" ||
    !/(^|\.)tiktok\.com$/.test(url.hostname.toLowerCase())
  )
    throw new HttpError(400, "El enlace debe ser de tiktok.com.");
  url.hash = "";
  return url;
}

type Item = {
  id: string;
  desc?: string;
  createTime?: number | string;
  author?: { uniqueId?: string; nickname?: string };
  video?: {
    duration?: number;
    playAddr?: string;
    bitrateInfo?: { Bitrate?: number; PlayAddr?: { UrlList?: string[] } }[];
  };
};

function cookiesFrom(response: Response) {
  return response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function loadItem(input: URL) {
  let url = input;
  let cookies = "";
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        ...(cookies && { Cookie: cookies }),
      },
      signal: AbortSignal.timeout(15000),
    });
    cookies = [cookies, cookiesFrom(res)].filter(Boolean).join("; ");
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = parseTikTokUrl(new URL(location, url).toString());
      continue;
    }
    if (!res.ok)
      throw new HttpError(502, `TikTok ha respondido con ${res.status}.`);
    const html = await res.text();
    const json = html.match(
      /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/,
    )?.[1];
    const detail = json
      ? JSON.parse(json).__DEFAULT_SCOPE__?.["webapp.video-detail"]
      : undefined;
    const item: Item | undefined = detail?.itemInfo?.itemStruct;
    if (!item?.id)
      throw new HttpError(
        404,
        "No se ha encontrado el vídeo. Comprueba que el enlace es público y apunta a un vídeo.",
      );
    return { item, cookies, url };
  }
  throw new HttpError(502, "El enlace de TikTok redirige demasiadas veces.");
}

function mediaUrls(item: Item) {
  const variants = [...(item.video?.bitrateInfo ?? [])].sort(
    (a, b) => (a.Bitrate ?? 0) - (b.Bitrate ?? 0),
  );
  const urls = [
    ...variants.flatMap((v) => v.PlayAddr?.UrlList ?? []),
    item.video?.playAddr,
  ].filter((u): u is string => Boolean(u));
  if (!urls.length)
    throw new HttpError(
      422,
      "Esta publicación no tiene vídeo (puede ser un carrusel de fotos).",
    );
  return urls;
}

async function downloadMedia(urls: string[], cookies: string, referer: URL) {
  let status = 0;
  for (const url of urls) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Referer: referer.toString(),
        Cookie: cookies,
      },
      signal: AbortSignal.timeout(30000),
    });
    status = res.status;
    if (!res.ok) continue;
    if (Number(res.headers.get("content-length")) > MAX_AUDIO_BYTES)
      throw new HttpError(413, "El vídeo supera los 25 MB que admite Groq.");
    const blob = await res.blob();
    if (blob.size > MAX_AUDIO_BYTES)
      throw new HttpError(413, "El vídeo supera los 25 MB que admite Groq.");
    if (blob.size) return blob;
  }
  throw new HttpError(
    502,
    `TikTok no ha permitido descargar el vídeo (${status || "sin respuesta"}).`,
  );
}

async function transcribe(media: Blob) {
  const key = process.env.GROQ_API_KEY;
  if (!key)
    throw new HttpError(
      503,
      "Configura GROQ_API_KEY en el servidor para transcribir.",
    );
  const form = new FormData();
  form.set("file", new File([media], "tiktok.mp4", { type: "video/mp4" }));
  form.set("model", "whisper-large-v3-turbo");
  form.set("response_format", "verbose_json");
  form.set("temperature", "0");
  const res = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(45000),
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new HttpError(
      res.status === 429 ? 429 : 502,
      res.status === 429
        ? "Se ha alcanzado el límite gratuito de Groq. Prueba dentro de un rato."
        : `Groq no ha podido transcribir: ${body.error?.message ?? res.status}.`,
    );
  return {
    text: String(body.text ?? "").trim(),
    language: typeof body.language === "string" ? body.language : null,
  };
}

export async function transcribeTikTok(input: string): Promise<Transcript> {
  const { item, cookies, url } = await loadItem(parseTikTokUrl(input));
  const media = await downloadMedia(mediaUrls(item), cookies, url);
  const { text, language } = await transcribe(media);
  const author = item.author?.uniqueId ?? "";
  return {
    id: item.id,
    url: `https://www.tiktok.com/@${author}/video/${item.id}`,
    author,
    authorName: item.author?.nickname ?? author,
    description: item.desc ?? "",
    duration: item.video?.duration ?? null,
    publishedAt: item.createTime
      ? new Date(Number(item.createTime) * 1000).toISOString()
      : null,
    language,
    text,
    transcribedAt: new Date().toISOString(),
  };
}
