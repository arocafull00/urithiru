import test from "node:test";
import assert from "node:assert/strict";
import {
  transcriptFilename,
  transcriptMarkdown,
} from "../src/lib/transcript-markdown";
import type { Transcript } from "../src/lib/types";

const t: Transcript = {
  id: "7400000000000000000",
  url: "https://www.tiktok.com/@dev/video/7400000000000000000",
  author: "dev",
  authorName: "Dev Tips",
  description: "Cómo usar hooks en Claude Code #ia #programación",
  duration: 42,
  publishedAt: "2026-10-01T10:00:00.000Z",
  language: "spanish",
  text: "Hoy os enseño a configurar hooks.",
  transcribedAt: "2026-11-11T09:00:00.000Z",
};

test("genera Markdown con fuente, autor y transcripción", () => {
  const md = transcriptMarkdown(t);
  assert.ok(md.startsWith("# Cómo usar hooks en Claude Code"));
  for (const value of [t.url, "@dev", "42 s", "2026-10-01", t.text])
    assert.ok(md.includes(value));
  assert.ok(!md.includes("undefined") && !md.includes("null"));
});

test("omite metadatos ausentes y marca vídeos sin voz", () => {
  const md = transcriptMarkdown({
    ...t,
    description: "",
    duration: null,
    publishedAt: null,
    language: null,
    text: "",
  });
  assert.ok(md.startsWith("# TikTok de @dev"));
  assert.ok(md.includes("_Sin voz detectada._"));
  assert.ok(!md.includes("Duración") && !md.includes("null"));
});

test("crea un nombre de archivo limpio sin hashtags ni acentos", () => {
  assert.equal(
    transcriptFilename(t),
    "tiktok-como-usar-hooks-en-claude-code.md",
  );
  assert.equal(
    transcriptFilename({ ...t, description: "#fyp", author: "" }),
    `tiktok-${t.id}.md`,
  );
});

test("YouTube: exporta el título, el canal y un nombre de archivo propio", () => {
  const youtube: Transcript = {
    ...t, id: "youtube:dQw4w9WgXcQ", source: "youtube",
    title: "Cómo hacer una aplicación", author: "UCchannel", authorName: "Canal Dev",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", description: "Una descripción distinta al título.",
  };
  const md = transcriptMarkdown(youtube);
  assert.ok(md.startsWith("# Cómo hacer una aplicación\n"));
  assert.ok(md.includes("- Autor: Canal Dev\n"));
  assert.ok(md.includes(youtube.url) && md.includes(youtube.description));
  assert.ok(!md.includes("TikTok") && !md.includes("@UCchannel"));
  assert.equal(transcriptFilename(youtube), "youtube-como-hacer-una-aplicacion.md");
  assert.ok(transcriptMarkdown({ ...youtube, title: "", description: "" }).startsWith("# Vídeo de Canal Dev"));
});
