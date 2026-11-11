import type { Transcript } from "./types";

export function transcriptMarkdown(t: Transcript) {
  const title = t.description.split("\n")[0].trim() || `TikTok de @${t.author}`;
  const meta = [
    `- Fuente: ${t.url}`,
    `- Autor: ${t.authorName} (@${t.author})`,
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
  const slug = (t.description || t.author)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/#\S+/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `tiktok-${slug || t.id}.md`;
}
