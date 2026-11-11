import test from "node:test";
import assert from "node:assert/strict";
import { parseYouTubeUrl, transcribeYouTube } from "../src/lib/youtube";
import { HttpError } from "../src/lib/http";

const id = "dQw4w9WgXcQ";
const canonical = `https://www.youtube.com/watch?v=${id}`;

test("YouTube: normaliza vídeos, enlaces cortos, Shorts, directos y embed", () => {
  for (const url of [
    `${canonical}&list=PLtest&t=30#test`,
    `https://youtu.be/${id}?si=shared`,
    `https://www.youtube.com/shorts/${id}`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    `https://youtube.com/live/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `  ${canonical}  `,
  ]) {
    assert.deepEqual(parseYouTubeUrl(url), { id, url: canonical });
  }
});

test("YouTube: rechaza destinos externos, credenciales, puertos y enlaces sin vídeo", async () => {
  let requests = 0;
  const transport: typeof fetch = async () => { requests++; return new Response(); };
  for (const url of [
    "no es un enlace", id,
    `http://youtube.com/watch?v=${id}`,
    `https://youtube.com.evil.test/watch?v=${id}`,
    `https://evil.test/?url=${canonical}`,
    `https://youtube.com@127.0.0.1/watch?v=${id}`,
    `https://user:pass@youtube.com/watch?v=${id}`,
    `https://youtube.com:8080/watch?v=${id}`,
    "https://www.youtube.com/playlist?list=PLtest",
    "https://youtube.com/@canal",
    "https://www.youtube.com/watch?v=corto",
    `https://youtu.be/${id}/otra-ruta`,
  ]) {
    await assert.rejects(transcribeYouTube(url, transport), (e: unknown) =>
      e instanceof HttpError && e.status === 400);
  }
  assert.equal(requests, 0);
});

function fixture({
  captions = true,
  captionUrl = "https://www.youtube.com/api/timedtext?v=test",
  xml = '<transcript><text start="0" dur="2">Hola &amp; adiós.</text><text start="2" dur="3">Una prueba.</text></transcript>',
  status = 200,
}: { captions?: boolean; captionUrl?: string; xml?: string; status?: number } = {}) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (status !== 200) return new Response("", { status });
    if (url.pathname === "/watch")
      return new Response('<html>"INNERTUBE_API_KEY":"fixture-key"</html>');
    if (url.pathname === "/youtubei/v1/player") {
      assert.equal(init?.method, "POST");
      assert.equal(JSON.parse(String(init?.body)).videoId, id);
      return Response.json({
        playabilityStatus: { status: "OK" },
        videoDetails: {
          videoId: id, title: "Vídeo de prueba", author: "Canal de prueba",
          channelId: "UCtest", lengthSeconds: "123", shortDescription: "Descripción del vídeo",
        },
        ...(captions && { captions: { playerCaptionsTracklistRenderer: {
          captionTracks: [{ baseUrl: captionUrl, languageCode: "es", kind: "asr" }],
        } } }),
      });
    }
    return new Response(xml);
  };
  return { transport, calls };
}

test("YouTube: obtiene texto y metadatos con subtítulos automáticos sin Groq", async () => {
  const { transport, calls } = fixture();
  const result = await transcribeYouTube(`https://youtu.be/${id}`, transport);
  assert.equal(result.id, `youtube:${id}`);
  assert.equal(result.source, "youtube");
  assert.equal(result.url, canonical);
  assert.equal(result.title, "Vídeo de prueba");
  assert.equal(result.authorName, "Canal de prueba");
  assert.equal(result.description, "Descripción del vídeo");
  assert.equal(result.duration, 123);
  assert.equal(result.language, "es");
  assert.equal(result.text, "Hola & adiós.\nUna prueba.");
  assert.equal(result.publishedAt, null);
  assert.ok(Number.isFinite(Date.parse(result.transcribedAt)));
  assert.equal(calls.length, 3);
  for (const { init } of calls) {
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal);
  }
});

test("YouTube: informa de subtítulos ausentes y respuestas vacías", async () => {
  for (const options of [{ captions: false }, { xml: "" }, { xml: '<text start="0" dur="1">   </text>' }]) {
    await assert.rejects(transcribeYouTube(canonical, fixture(options).transport),
      (e: unknown) => e instanceof HttpError && e.status === 422);
  }
});

test("YouTube: bloquea URLs de subtítulos externas antes de consultarlas", async () => {
  const { transport, calls } = fixture({ captionUrl: "http://127.0.0.1/private" });
  await assert.rejects(transcribeYouTube(canonical, transport),
    (e: unknown) => e instanceof HttpError && e.status === 502);
  assert.equal(calls.length, 2);
});

test("YouTube: distingue límites, vídeo inaccesible y fallos de conexión", async () => {
  for (const [status, expected] of [[429, 429], [404, 404], [503, 502]]) {
    await assert.rejects(transcribeYouTube(canonical, fixture({ status }).transport),
      (e: unknown) => e instanceof HttpError && e.status === expected);
  }
  await assert.rejects(transcribeYouTube(canonical, async () => { throw new TypeError("network"); }),
    (e: unknown) => e instanceof HttpError && e.status === 502);
});
