import test from "node:test";
import assert from "node:assert/strict";
import { summarizeActivity } from "../src/lib/activity-summary";

const digest = {
  date: "2026-11-04",
  projects: [{
    repository: "owner/app", url: "", summary: [],
    commits: [{ sha: "a".repeat(40), title: "feat: resumen con IA", message: "feat: resumen con IA\n\nDetalle", url: "", timestamp: "2026-11-04T10:00:00Z", branches: ["main"] }],
  }],
};

test("resumen IA: devuelve el texto del modelo y envía los commits", async () => {
  let sent = "";
  const transport: typeof fetch = async (_url, init) => {
    sent = String(init?.body);
    return Response.json({ choices: [{ message: { content: " Has añadido el resumen. " } }] });
  };
  assert.equal(await summarizeActivity({ apiKey: "k", digest, transport }), "Has añadido el resumen.");
  assert.match(sent, /feat: resumen con IA/);
});

test("resumen IA: sin clave, sin commits o con error devuelve null sin lanzar", async () => {
  const boom: typeof fetch = async () => { throw new Error("red"); };
  assert.equal(await summarizeActivity({ apiKey: "", digest }), null);
  assert.equal(await summarizeActivity({ apiKey: "k", digest: { ...digest, projects: [] } }), null);
  assert.equal(await summarizeActivity({ apiKey: "k", digest, transport: boom }), null);
  assert.equal(await summarizeActivity({ apiKey: "k", digest, transport: async () => new Response("no", { status: 429 }) }), null);
});
