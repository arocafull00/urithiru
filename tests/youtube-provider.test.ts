import test from "node:test";
import assert from "node:assert/strict";
import { transcribeYouTube } from "../src/lib/youtube";
import { HttpError } from "../src/lib/http";

const video = "https://www.youtube.com/watch?v=tQOUvl6fSmI&t=892s";
const canonical = "https://www.youtube.com/watch?v=tQOUvl6fSmI";

test("YouTube: el proveedor evita el bloqueo, pide solo subtítulos y no envía la clave a YouTube", async () => {
  let providerCalls = 0;
  let metadataCalls = 0;
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    if (url.hostname === "api.supadata.ai") {
      providerCalls++;
      assert.equal(url.pathname, "/v1/transcript");
      assert.equal(url.searchParams.get("url"), canonical);
      assert.equal(url.searchParams.get("mode"), "native");
      assert.equal(url.searchParams.get("text"), "true");
      assert.equal(url.searchParams.get("lang"), "es");
      assert.equal(new Headers(init?.headers).get("x-api-key"), "test-key");
      return Response.json({ content: "Texto transcrito sin marcas de tiempo.", lang: "es" });
    }
    assert.equal(url.hostname, "www.youtube.com");
    assert.equal(url.pathname, "/oembed");
    assert.equal(new Headers(init?.headers).get("x-api-key"), null);
    metadataCalls++;
    return Response.json({ title: "Una marca personal", author_name: "Canal" });
  };
  const result = await transcribeYouTube(video, transport, "test-key");
  assert.equal(result.text, "Texto transcrito sin marcas de tiempo.");
  assert.equal(result.title, "Una marca personal");
  assert.equal(result.authorName, "Canal");
  assert.equal(result.language, "es");
  assert.equal(result.url, canonical);
  assert.equal(providerCalls, 1);
  assert.equal(metadataCalls, 1);
  assert.ok(!JSON.stringify(result).includes("test-key"));
});

test("YouTube: conserva el texto aunque fallen los metadatos y descarta los tiempos de los segmentos", async () => {
  const result = await transcribeYouTube(video, async (input) => {
    if (new URL(String(input)).hostname === "www.youtube.com") throw new Error("bloqueado");
    return Response.json({ content: [{ text: "Hola.", offset: 1000 }, { text: "Adiós.", offset: 2000 }], lang: "es" });
  }, "test-key");
  assert.equal(result.text, "Hola.\nAdiós.");
  assert.equal(result.title, "");
  assert.equal(result.duration, null);
});

test("YouTube: credenciales del proveedor no cierran sesión y la cuota agotada no activa IA", async () => {
  for (const [upstream, expected] of [[401, 503], [403, 503], [402, 429], [429, 429], [404, 422], [500, 502]]) {
    let calls = 0;
    await assert.rejects(transcribeYouTube(video, async (input) => {
      if (new URL(String(input)).hostname === "www.youtube.com") return new Response("", { status: 500 });
      calls++;
      return new Response("", { status: upstream });
    }, "test-key"), (e: unknown) => e instanceof HttpError && e.status === expected);
    assert.equal(calls, 1);
  }
});

test("YouTube: rechaza respuestas vacías o inválidas sin guardar una transcripción", async () => {
  for (const content of ["", "   ", null, 42]) {
    await assert.rejects(transcribeYouTube(video, async (input) => {
      if (new URL(String(input)).hostname === "www.youtube.com") return new Response("", { status: 404 });
      return Response.json({ content });
    }, "test-key"), (e: unknown) => e instanceof HttpError && [422, 502].includes(e.status));
  }
});

test("YouTube: consulta trabajos asíncronos sin crear otra transcripción", async () => {
  let starts = 0;
  let polls = 0;
  const result = await transcribeYouTube(video, async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "www.youtube.com") return new Response("", { status: 404 });
    if (url.pathname === "/v1/transcript") {
      starts++;
      return Response.json({ jobId: "job-123" }, { status: 202 });
    }
    assert.equal(url.pathname, "/v1/transcript/job-123");
    polls++;
    return Response.json({ status: "completed", result: { content: "Resultado largo.", lang: "es" } });
  }, "test-key");
  assert.equal(result.text, "Resultado largo.");
  assert.equal(starts, 1);
  assert.equal(polls, 1);
});

test("YouTube: valida el enlace antes de consumir créditos del proveedor", async () => {
  let calls = 0;
  await assert.rejects(transcribeYouTube("https://evil.test/watch?v=tQOUvl6fSmI", async () => {
    calls++;
    return new Response();
  }, "test-key"), (e: unknown) => e instanceof HttpError && e.status === 400);
  assert.equal(calls, 0);
});
