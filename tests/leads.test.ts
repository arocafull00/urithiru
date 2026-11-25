import test from "node:test";
import assert from "node:assert/strict";
import {
  dedupeCandidates,
  facebookCandidates,
  googleCandidates,
  leadKey,
  leadQueries,
  looksLikeRequest,
  parseClassification,
} from "../src/lib/leads";

test("clientes: una búsqueda por municipio e intención, dentro del límite de palabras", () => {
  const queries = leadQueries(["Torrent", "Riba-roja de Túria"]);
  assert.equal(queries.length, 6);
  assert.ok(queries.every((q) => q.includes("site:milanuncios.com")));
  assert.ok(queries.every((q) => q.split(/\s+/).length <= 32));
  assert.match(queries[0], /^"Torrent" /);
});

test("clientes: Google conserva el municipio de la búsqueda", () => {
  const [c] = googleCandidates([{
    searchQuery: { term: '"Paiporta" ("busco")' },
    organicResults: [{ title: "Busco web", url: "https://www.milanuncios.com/a.htm", description: "Necesito página web" }, { url: "nada" }],
  }]);
  assert.equal(c.town, "Paiporta");
  assert.equal(c.site, "milanuncios.com");
});

test("clientes: Facebook solo deja pasar peticiones", () => {
  const list = facebookCandidates([
    { url: "https://facebook.com/groups/1/posts/2", text: "¿Alguien que haga páginas web en Torrent?", user: { name: "Ana" }, groupTitle: "Torrent", time: "2026-11-01T10:00:00Z" },
    { url: "https://facebook.com/groups/1/posts/3", text: "Vendo bici" },
  ]);
  assert.equal(list.length, 1);
  assert.equal(list[0].author, "Ana");
  assert.ok(looksLikeRequest("Necesito un programador para una app"));
  assert.ok(!looksLikeRequest("Hacemos páginas web baratas"));
});

test("clientes: deduplica por URL normalizada y por los ya vistos", () => {
  assert.equal(leadKey("https://m.facebook.com/groups/1/?fbclid=x"), leadKey("https://www.facebook.com/groups/1"));
  const base = googleCandidates([{ organicResults: [
    { url: "https://reddit.com/r/valencia/1?utm_source=x" }, { url: "https://reddit.com/r/valencia/1" }, { url: "https://reddit.com/r/valencia/2" },
  ] }]);
  assert.equal(dedupeCandidates(base, new Set([leadKey("https://reddit.com/r/valencia/2")])).length, 1);
});

test("clientes: interpreta la respuesta de la IA", () => {
  const r = parseClassification(JSON.stringify({ items: [
    { i: 0, relevant: true, kind: "web", need: "Web para bar", who: "Bar", town: "Torrent", score: 9 },
    { i: 1, relevant: false },
    { i: 7, relevant: true },
  ] }), 2);
  assert.deepEqual(r.get(0), { kind: "web", need: "Web para bar", who: "Bar", town: "Torrent", score: 5 });
  assert.equal(r.get(1), null);
  assert.equal(r.size, 2);
  assert.equal(parseClassification("no json", 2).size, 0);
});
