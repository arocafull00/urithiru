import {
  fetchTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
  type FetchParams,
} from "youtube-transcript-plus";
import { HttpError } from "./http";
import type { Transcript } from "./types";
import { youtubeProviderTranscript } from "./youtube-provider";

const VIDEO_HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
  "youtu.be", "www.youtube-nocookie.com", "youtube-nocookie.com",
]);

export function parseYouTubeUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new HttpError(400, "Pega un enlace de YouTube válido.");
  }
  if (
    url.protocol !== "https:" || !VIDEO_HOSTS.has(url.hostname) ||
    url.username || url.password || url.port
  )
    throw new HttpError(400, "El enlace debe ser de youtube.com o youtu.be y usar HTTPS.");

  const pathId = url.hostname === "youtu.be"
    ? url.pathname.match(/^\/([\w-]+)\/?$/)?.[1]
    : url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)\/?$/)?.[1];
  const id = pathId ?? (url.pathname === "/watch" ? url.searchParams.get("v") : null);
  if (!id || !/^[\w-]{11}$/.test(id))
    throw new HttpError(400, "Pega el enlace de un vídeo de YouTube, no de un canal o una lista.");
  return { id, url: `https://www.youtube.com/watch?v=${id}` };
}

export async function transcribeYouTube(
  input: string,
  transport: typeof fetch = fetch,
  apiKey = "",
): Promise<Transcript> {
  const video = parseYouTubeUrl(input);
  if (apiKey.trim())
    return youtubeProviderTranscript(video, apiKey.trim(), transport);
  const signal = AbortSignal.timeout(45000);
  // Validate caption URLs too, and never follow redirects to arbitrary hosts.
  async function youtubeFetch(params: FetchParams) {
    const url = new URL(params.url);
    if (
      url.protocol !== "https:" || url.username || url.password || url.port ||
      !["www.youtube.com", "youtube.com", "video.google.com"].includes(url.hostname)
    )
      throw new HttpError(502, "YouTube ha devuelto una dirección de subtítulos no válida.");
    const response = await transport(url, {
      method: params.method ?? "GET",
      body: params.body,
      headers: { "User-Agent": params.userAgent ?? "", ...params.headers },
      signal,
      redirect: "error",
      cache: "no-store",
    });
    if (response.status === 429)
      throw new HttpError(429, "YouTube ha limitado las consultas. Prueba dentro de un rato.");
    if (response.status >= 500)
      throw new HttpError(502, "YouTube no está disponible. Inténtalo de nuevo.");
    return response;
  }

  async function playerFetch(params: FetchParams) {
    const response = await youtubeFetch(params);
    if (!response.ok) return response;
    const data = await response.json();
    if (data.playabilityStatus?.status === "LOGIN_REQUIRED")
      throw new HttpError(503, "YouTube bloquea las consultas desde este servidor. Configura SUPADATA_API_KEY para activar el proveedor de subtítulos gratuito.");
    const list = data.captions?.playerCaptionsTracklistRenderer ?? data.playerCaptionsTracklistRenderer;
    if (Array.isArray(list?.captionTracks)) {
      const rank = (track: { languageCode?: string; kind?: string }) =>
        track.languageCode?.toLowerCase().split("-")[0] === "es"
          ? track.kind === "asr" ? 1 : 0 : 2;
      list.captionTracks.sort((a: { languageCode?: string; kind?: string }, b: { languageCode?: string; kind?: string }) => rank(a) - rank(b));
    }
    return Response.json(data);
  }

  try {
    const { videoDetails: details, segments } = await fetchTranscript(video.id, {
      videoDetails: true,
      signal,
      videoFetch: youtubeFetch,
      playerFetch,
      transcriptFetch: youtubeFetch,
    });
    const text = segments.map((s) => s.text.trim()).filter(Boolean).join("\n").trim();
    if (!text)
      throw new HttpError(422, "Los subtítulos del vídeo no contienen texto.");
    return {
      id: `youtube:${video.id}`,
      source: "youtube",
      url: video.url,
      title: details.title,
      author: details.channelId,
      authorName: details.author,
      description: details.description,
      duration: Number.isFinite(details.lengthSeconds) && details.lengthSeconds > 0
        ? details.lengthSeconds : null,
      publishedAt: null,
      language: segments[0]?.lang || null,
      text,
      transcribedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (signal.aborted)
      throw new HttpError(504, "YouTube ha tardado demasiado. Inténtalo de nuevo.");
    if (error instanceof YoutubeTranscriptTooManyRequestError)
      throw new HttpError(429, "YouTube ha bloqueado la consulta desde el servidor. Prueba más tarde.");
    if (error instanceof YoutubeTranscriptDisabledError)
      throw new HttpError(422, "Este vídeo no tiene subtítulos disponibles. Prueba con otro vídeo que tenga subtítulos manuales o automáticos.");
    if (error instanceof YoutubeTranscriptVideoUnavailableError)
      throw new HttpError(404, "No se puede acceder al vídeo de YouTube. Comprueba que sea público y esté disponible.");
    if (error instanceof YoutubeTranscriptNotAvailableError)
      throw new HttpError(422, "No se han podido leer los subtítulos directamente desde YouTube. Si el vídeo tiene subtítulos, configura SUPADATA_API_KEY para usar el proveedor gratuito desde este servidor.");
    throw new HttpError(502, "No se ha podido conectar con YouTube. Inténtalo de nuevo.");
  }
}
