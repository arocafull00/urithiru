import { setTimeout } from "node:timers/promises";
import { z } from "zod";
import { HttpError } from "./http";
import type { Transcript } from "./types";

const resultSchema = z.object({
  content: z.union([z.string(), z.array(z.object({ text: z.string() }))]),
  lang: z.string().optional(),
});
const jobSchema = z.object({ jobId: z.string().regex(/^[a-zA-Z0-9-]{1,100}$/) });

export async function youtubeProviderTranscript(
  video: { id: string; url: string },
  apiKey: string,
  transport: typeof fetch,
): Promise<Transcript> {
  const signal = AbortSignal.timeout(45000);
  async function request(url: URL) {
    const response = await transport(url, {
      headers: { "x-api-key": apiKey },
      cache: "no-store", redirect: "error", signal,
    });
    if (response.status === 401 || response.status === 403)
      throw new HttpError(503, "La clave del proveedor de subtítulos no es válida. Revisa SUPADATA_API_KEY en el servidor.");
    if (response.status === 402 || response.status === 429)
      throw new HttpError(429, "Se ha alcanzado la cuota o el límite de consultas de Supadata. Espera a que se renueve la cuota gratuita.");
    if (response.status === 404 || response.status === 422)
      throw new HttpError(422, "No hay subtítulos disponibles para este vídeo de YouTube.");
    if (!response.ok)
      throw new HttpError(502, "El proveedor de subtítulos no está disponible. Inténtalo más tarde.");
    return { response, body: await response.json() };
  }
  async function transcript() {
    const url = new URL("https://api.supadata.ai/v1/transcript");
    url.search = new URLSearchParams({
      url: video.url, text: "true", lang: "es", mode: "native",
    }).toString();
    let { response, body } = await request(url);
    if (response.status === 202) {
      const job = jobSchema.safeParse(body);
      if (!job.success)
        throw new HttpError(502, "El proveedor ha devuelto una consulta no válida.");
      const jobUrl = new URL(`https://api.supadata.ai/v1/transcript/${job.data.jobId}`);
      do {
        await setTimeout(1000, undefined, { signal });
        ({ response, body } = await request(jobUrl));
        if (body?.status === "failed")
          throw new HttpError(422, "El proveedor no ha podido obtener los subtítulos de este vídeo.");
      } while (response.status === 202 || ["queued", "active"].includes(body?.status));
      if (body?.status !== "completed")
        throw new HttpError(502, "El proveedor ha devuelto un estado de consulta desconocido.");
      body = body.result ?? body;
    }
    const parsed = resultSchema.safeParse(body);
    if (!parsed.success)
      throw new HttpError(502, "El proveedor ha devuelto una transcripción no válida.");
    const text = (typeof parsed.data.content === "string"
      ? parsed.data.content
      : parsed.data.content.map((part) => part.text).join("\n")).trim();
    if (!text)
      throw new HttpError(422, "Los subtítulos del vídeo no contienen texto.");
    return { text, language: parsed.data.lang ?? null };
  }
  // oEmbed is free: do not spend another provider credit just for the title.
  async function metadata() {
    try {
      const url = new URL("https://www.youtube.com/oembed");
      url.search = new URLSearchParams({ url: video.url, format: "json" }).toString();
      const response = await transport(url, {
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return null;
      const data = z.object({ title: z.string(), author_name: z.string() })
        .safeParse(await response.json());
      return data.success ? data.data : null;
    } catch {
      return null;
    }
  }
  try {
    const [content, details] = await Promise.all([transcript(), metadata()]);
    return {
      id: `youtube:${video.id}`, source: "youtube", url: video.url,
      title: details?.title ?? "", author: "", authorName: details?.author_name ?? "",
      description: "", duration: null, publishedAt: null,
      ...content, transcribedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (signal.aborted)
      throw new HttpError(504, "El proveedor de subtítulos ha tardado demasiado. Inténtalo de nuevo.");
    throw new HttpError(502, "No se ha podido conectar con el proveedor de subtítulos.");
  }
}
