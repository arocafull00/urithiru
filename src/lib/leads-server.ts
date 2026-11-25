import "server-only";
import { HttpError } from "./http";
import {
  classificationPrompt,
  dedupeCandidates,
  facebookCandidates,
  googleCandidates,
  leadQueries,
  parseClassification,
  type LeadCandidate,
  type LeadRange,
  type LeadRun,
  type LeadSource,
} from "./leads";

const APIFY = "https://api.apify.com/v2";
const ACTORS: Record<LeadSource, string> = {
  google: "apify~google-search-scraper",
  facebook: "apify~facebook-groups-scraper",
};
const MAX_CHARGE_USD: Record<LeadSource, number> = { google: 0.5, facebook: 1 };
const RANGE_DAYS: Record<LeadRange, number> = { m1: 30, m3: 90, y1: 365 };

function apifyToken() {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new HttpError(503, "Configura APIFY_TOKEN en el servidor para buscar clientes.");
  return token;
}

async function apify<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${APIFY}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apifyToken()}`, "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.error?.message;
    if (res.status === 401) throw new HttpError(503, "Apify ha rechazado APIFY_TOKEN.");
    if (res.status === 402 || /credit|usage limit/i.test(String(message)))
      throw new HttpError(402, `Apify: ${message ?? "sin créditos disponibles"}.`);
    throw new HttpError(502, `Apify ha respondido ${res.status}${message ? `: ${message}` : ""}.`);
  }
  return body as T;
}

async function startRun(source: LeadSource, input: unknown): Promise<LeadRun> {
  const body = await apify<{ data: { id: string } }>(
    `/acts/${ACTORS[source]}/runs?maxTotalChargeUsd=${MAX_CHARGE_USD[source]}`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return { id: body.data.id, source };
}

export async function startLeadScan({ towns, range, groups }: { towns: string[]; range: LeadRange; groups: string[] }) {
  const google = startRun("google", {
    queries: leadQueries(towns).join("\n"),
    maxPagesPerQuery: 1,
    countryCode: "es",
    languageCode: "es",
    quickDateRange: range,
    mobileResults: false,
    includeUnfilteredResults: false,
    saveHtml: false,
    saveHtmlToKeyValueStore: false,
  });
  const facebook = groups.length
    ? startRun("facebook", {
        startUrls: groups.map((url) => ({ url })),
        resultsLimit: Math.min(50 * groups.length, 200),
        viewOption: "CHRONOLOGICAL",
        onlyPostsNewerThan: `${RANGE_DAYS[range]} days`,
      })
    : null;
  return (await Promise.all([google, facebook])).filter((r): r is LeadRun => r !== null);
}

const FINISHED = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);
type RunInfo = { status: string; defaultDatasetId: string; statusMessage?: string };

export async function collectLeadScan(runs: LeadRun[], known: Set<string>) {
  const infos = await Promise.all(
    runs.map((r) => apify<{ data: RunInfo }>(`/actor-runs/${r.id}`).then((b) => b.data)),
  );
  if (infos.some((i) => !FINISHED.has(i.status))) return { status: "running" as const };
  const failed: string[] = [];
  const lists = await Promise.all(
    runs.map(async (run, n) => {
      const info = infos[n];
      const items = await apify<unknown[]>(`/datasets/${info.defaultDatasetId}/items?clean=true&limit=2000`);
      if (info.status !== "SUCCEEDED")
        failed.push(`${run.source === "google" ? "Google" : "Facebook"}: ${info.statusMessage || info.status}`);
      return run.source === "google" ? googleCandidates(items) : facebookCandidates(items);
    }),
  );
  return { status: "done" as const, candidates: dedupeCandidates(lists.flat(), known), failed };
}

const SYSTEM =
  "Ayudas a un desarrollador web freelance de Torrent (Valencia) a encontrar clientes. Recibirás publicaciones numeradas de foros, grupos de Facebook y anuncios. " +
  "Marca relevant=true SOLO si alguien (negocio local, autónomo, emprendedor o particular) PIDE o BUSCA ayuda con: una página web o tienda online (kind \"web\"), " +
  "conseguir clientes, marketing, redes sociales o publicidad (kind \"captacion\"), o desarrollar una app, software o una idea (kind \"software\"). " +
  "Marca relevant=false si es una agencia o profesional OFRECIENDO sus servicios, una oferta de empleo en plantilla, un tutorial, una noticia, contenido sobre BitTorrent, " +
  "o si es claramente de fuera de la provincia de Valencia. " +
  "Responde solo JSON: {\"items\":[{\"i\":0,\"relevant\":true,\"kind\":\"web\",\"need\":\"qué necesita, en una frase\",\"who\":\"quién lo pide (negocio, sector o nombre)\",\"town\":\"municipio o null\",\"score\":1-5}]} " +
  "con un elemento por publicación. score: 5 = petición clara, reciente y local; 1 = dudosa.";

export async function classifyLeads(batch: LeadCandidate[]) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new HttpError(503, "Configura GROQ_API_KEY para filtrar los resultados con IA.");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.LEADS_AI_MODEL || "openai/gpt-oss-120b",
      temperature: 0,
      max_tokens: 3000,
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: classificationPrompt(batch) },
      ],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
  if (res.status === 429) {
    const wait = Number(res.headers.get("retry-after"));
    throw Object.assign(new HttpError(429, "Límite de Groq alcanzado."), {
      retryAfter: Number.isFinite(wait) && wait > 0 ? wait : 20,
    });
  }
  if (!res.ok) throw new HttpError(502, `Groq ha respondido ${res.status}.`);
  const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = body.choices?.[0]?.message?.content;
  const parsed = parseClassification(typeof content === "string" ? content : "", batch.length);
  return batch.map((_, i) => (parsed.has(i) ? (parsed.get(i) ?? false) : parsed.size ? false : null));
}
