import type { Transcript } from "./types";

export function transcriptPlatform(t: Transcript) {
  return t.source === "youtube" ? "YouTube" : "TikTok";
}

export function transcriptTitle(t: Transcript) {
  return t.title?.trim() || t.description.split("\n")[0].trim() ||
    (t.source === "youtube" ? `Vídeo de ${t.authorName || "YouTube"}` : `TikTok de @${t.author}`);
}

export function transcriptAuthor(t: Transcript) {
  return t.source === "youtube" ? t.authorName || "Canal de YouTube" : `${t.authorName} (@${t.author})`;
}

export function transcriptMarkdown(t: Transcript) {
  const title = transcriptTitle(t);
  const meta = [
    `- Fuente: ${t.url}`,
    `- Autor: ${transcriptAuthor(t)}`,
    t.publishedAt && `- Publicado: ${t.publishedAt.slice(0, 10)}`,
    t.duration != null && `- Duración: ${t.duration} s`,
    t.language && `- Idioma: ${t.language}`,
    `- Transcrito: ${t.transcribedAt.slice(0, 10)}`,
  ].filter(Boolean);
  return [
    `# ${title}`,
    "",
    ...meta,
    ...(t.description ? ["", "## Descripción", "", t.description] : []),
    "",
    "## Transcripción",
    "",
    t.text || "_Sin voz detectada._",
    "",
  ].join("\n");
}

export function transcriptFilename(t: Transcript) {
  const slug = (t.title || t.description || t.author)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/#\S+/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `${t.source ?? "tiktok"}-${slug || t.id.replace(/[^a-zA-Z0-9_-]/g, "-")}.md`;
}
