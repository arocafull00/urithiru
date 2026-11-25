export const LEAD_TOWNS = [
  "Torrent",
  "Aldaia",
  "Alaquàs",
  "Picanya",
  "Paiporta",
  "Xirivella",
  "Mislata",
  "Quart de Poblet",
  "Manises",
  "Paterna",
  "Picassent",
  "Alcàsser",
  "Catarroja",
  "Massanassa",
  "Benetússer",
  "Sedaví",
  "Alfafar",
  "Albal",
  "Silla",
  "Riba-roja de Túria",
  "Chiva",
  "Cheste",
  "Montserrat",
] as const;

export const DEFAULT_LEAD_TOWNS: string[] = LEAD_TOWNS.slice(0, 12);

export const LEAD_RANGES = { m1: "Último mes", m3: "Últimos 3 meses", y1: "Último año" } as const;
export type LeadRange = keyof typeof LEAD_RANGES;

export const LEAD_KINDS = { web: "Web", captacion: "Captación", software: "Software", otro: "Otro" } as const;
export type LeadKind = keyof typeof LEAD_KINDS;
export type LeadStatus = "nuevo" | "contactado" | "descartado";
export type LeadSource = "google" | "facebook";

export type LeadCandidate = {
  url: string;
  source: LeadSource;
  site: string;
  title: string;
  text: string;
  author: string | null;
  group: string | null;
  postedAt: string | null;
  town: string | null;
};

export type LeadClassification = {
  kind: LeadKind;
  need: string;
  who: string;
  town: string | null;
  score: number;
};

export type Lead = LeadCandidate & {
  id: string;
  kind: LeadKind | null;
  need: string | null;
  who: string | null;
  score: number | null;
  classified: boolean;
  foundAt: string;
  status: LeadStatus;
};

export type LeadRun = { id: string; source: LeadSource };
export type LeadScan = { runs: LeadRun[]; startedAt: string };
export type LeadVerdict = LeadClassification | false | null;

const SITES = ["facebook.com", "milanuncios.com", "reddit.com", "tablondeanuncios.com"];
const INTENTS = [
  '("busco" OR "necesito" OR "recomendáis" OR "alguien que haga") ("página web" OR "tienda online" OR "diseñador web")',
  '("busco" OR "necesito" OR "recomendáis") ("community manager" OR "marketing digital" OR "más clientes" OR "publicidad")',
  '("busco" OR "necesito" OR "tengo una idea") ("programador" OR "desarrollador" OR "aplicación" OR "software")',
];

export function leadQueries(towns: string[]) {
  const sites = `(${SITES.map((s) => `site:${s}`).join(" OR ")})`;
  return towns.flatMap((town) => INTENTS.map((intent) => `"${town}" ${intent} ${sites}`));
}

export function townInQuery(query: string) {
  return /^"([^"]+)"/.exec(query)?.[1] ?? null;
}

const TOPIC = /p[aá]gina web|\bwebs?\b|tienda online|e-?commerce|programador|desarrollador|\bapps?\b|aplicaci[oó]n|software|community manager|redes sociales|marketing|publicidad|\bseo\b|clientes|dise[ñn]ador/i;
const REQUEST = /busco|buscamos|necesito|necesitamos|recomend|alguien (que|sabe|conoce)|conoc[eé]is|qui[eé]n (me|nos|hace|sabe)|presupuesto|ayuda|tengo una idea/i;

export function looksLikeRequest(text: string) {
  return TOPIC.test(text) && REQUEST.test(text);
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function googleCandidates(items: unknown[]): LeadCandidate[] {
  const out: LeadCandidate[] = [];
  for (const item of items as { searchQuery?: { term?: unknown }; organicResults?: unknown[] }[]) {
    const town = townInQuery(str(item?.searchQuery?.term));
    for (const r of (item?.organicResults ?? []) as Record<string, unknown>[]) {
      const url = str(r?.url);
      if (!url.startsWith("http")) continue;
      out.push({
        url,
        source: "google",
        site: hostname(url),
        title: str(r.title),
        text: str(r.description),
        author: null,
        group: null,
        postedAt: null,
        town,
      });
    }
  }
  return out;
}

export function facebookCandidates(items: unknown[]): LeadCandidate[] {
  const out: LeadCandidate[] = [];
  for (const p of items as Record<string, unknown>[]) {
    const url = str(p?.url);
    const text = str(p?.text);
    if (!url.startsWith("http") || !looksLikeRequest(text)) continue;
    const time = str(p.time);
    out.push({
      url,
      source: "facebook",
      site: "facebook.com",
      title: text.split("\n")[0].slice(0, 140),
      text: text.slice(0, 1500),
      author: str((p.user as { name?: unknown } | undefined)?.name) || null,
      group: str(p.groupTitle) || null,
      postedAt: time && !Number.isNaN(Date.parse(time)) ? new Date(time).toISOString() : null,
      town: null,
    });
  }
  return out;
}

export function dedupeCandidates(list: LeadCandidate[], known: Set<string>) {
  const seen = new Set(known);
  return list.filter((c) => {
    const key = leadKey(c.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function leadKey(url: string) {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const p of [...u.searchParams.keys()])
      if (/^(utm_|fbclid|__cft__|__tn__|ref|mibextid)/.test(p)) u.searchParams.delete(p);
    return `${u.hostname.replace(/^www\.|^m\./, "")}${u.pathname.replace(/\/$/, "")}${u.search}`;
  } catch {
    return url;
  }
}

export function classificationPrompt(batch: LeadCandidate[]) {
  return batch
    .map((c, i) => {
      const meta = [c.site, c.group && `grupo: ${c.group}`, c.town && `búsqueda: ${c.town}`, c.postedAt && c.postedAt.slice(0, 10)]
        .filter(Boolean)
        .join(" · ");
      return `[${i}] ${meta}\n${c.title}\n${c.text.replace(/\s+/g, " ").slice(0, 400)}`;
    })
    .join("\n\n");
}

export function parseClassification(content: string, size: number) {
  const result = new Map<number, LeadClassification | null>();
  let body: unknown;
  try {
    body = JSON.parse(content);
  } catch {
    return result;
  }
  const items = (body as { items?: unknown })?.items;
  if (!Array.isArray(items)) return result;
  for (const raw of items as Record<string, unknown>[]) {
    const i = Number(raw?.i);
    if (!Number.isInteger(i) || i < 0 || i >= size) continue;
    if (raw.relevant !== true) {
      result.set(i, null);
      continue;
    }
    const kind = String(raw.kind) in LEAD_KINDS ? (String(raw.kind) as LeadKind) : "otro";
    const score = Math.min(5, Math.max(1, Math.round(Number(raw.score) || 1)));
    result.set(i, {
      kind,
      need: str(raw.need).slice(0, 200),
      who: str(raw.who).slice(0, 120),
      town: str(raw.town) || null,
      score,
    });
  }
  return result;
}
