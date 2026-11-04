import { z } from "zod";
import { mapConcurrent } from "./analytics";
import { HttpError } from "./http";
import { activityRange, summarizeCommits, type ActivityCommit, type ActivityDigest } from "./activity-data";

const repositorySchema = z.object({
  full_name: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  pushed_at: z.string().nullable(),
});
const commitSchema = z.object({
  sha: z.string().regex(/^[a-f0-9]{40,64}$/i),
  commit: z.object({
    message: z.string(),
    committer: z.object({ date: z.string() }).nullable(),
  }),
});

// No environment access here: the server wrapper supplies credentials, and tests
// exercise the same collector with a fake transport.
export async function collectActivity({
  token, username: configuredUsername, date, now = new Date(), transport = fetch,
  budgetMs = 250000,
}: {
  token: string; username?: string; date: string; now?: Date;
  transport?: typeof fetch; budgetMs?: number;
}): Promise<ActivityDigest> {
  const { since, until } = activityRange(date, now);
  const deadline = Date.now() + budgetMs;
  const issues: string[] = [];
  const issue = (message: string) => { if (!issues.includes(message)) issues.push(message); };
  async function get(path: string) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new HttpError(504, "Se ha agotado el tiempo de consulta de GitHub.");
    let response: Response;
    try {
      response = await transport(`https://api.github.com${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
        cache: "no-store", signal: AbortSignal.timeout(Math.max(1, Math.min(15000, remaining))),
      });
    } catch {
      throw new HttpError(502, "GitHub no ha respondido a tiempo.");
    }
    if (response.status === 401) throw new HttpError(502, "La credencial de GitHub ha caducado o no es válida.");
    if (response.status === 429 || (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0"))
      throw new HttpError(503, "Se ha alcanzado el límite de consultas de GitHub. Reinténtalo más tarde.");
    if (!response.ok) throw new HttpError(502, `GitHub ha rechazado la consulta (${response.status}). Comprueba los permisos de lectura.`);
    return response;
  }
  async function pages<T>(path: string, schema: z.ZodType<T>, onPage?: (items: T[]) => void) {
    const items: T[] = [];
    for (let page = 1; page <= 20; page++) {
      const response = await get(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
      const batch = z.array(schema).parse(await response.json());
      items.push(...batch);
      onPage?.(batch);
      if (!response.headers.get("link")?.includes('rel="next"')) return items;
    }
    issue("Se ha alcanzado el límite de paginación. La cobertura es parcial.");
    return items;
  }
  const profile = z.object({ login: z.string().regex(/^[a-z0-9-]+$/i) }).parse(await (await get("/user")).json());
  const username = configuredUsername?.trim() || profile.login;
  if (!/^[a-z0-9-]+$/i.test(username)) throw new HttpError(503, "GITHUB_USERNAME no es válido.");
  // Listing is authenticated: includes private and organization repositories the
  // token can access. Never use public events or default-branch-only search.
  const repositories = await pages("/user/repos?sort=pushed&direction=desc&affiliation=owner,collaborator,organization_member", repositorySchema);
  const candidates = repositories.filter((r) => r.pushed_at && Date.parse(r.pushed_at) >= Date.parse(since));
  let repositoriesChecked = 0;
  const results = await mapConcurrent(candidates, 3, async (repository) => {
    const commits = new Map<string, ActivityCommit>();
    const path = `/repos/${repository.full_name.split("/").map(encodeURIComponent).join("/")}`;
    try {
      const branches = await pages(`${path}/branches`, z.object({ name: z.string() }));
      let complete = true;
      // Serial branches avoid an unbounded nested concurrency fan-out.
      for (const branch of branches) {
        try {
        const params = new URLSearchParams({ sha: branch.name, author: username, since, until });
        await pages(`${path}/commits?${params}`, commitSchema, (batch) => {
          for (const raw of batch) {
            const timestamp = raw.commit.committer?.date;
            if (!timestamp || Date.parse(timestamp) < Date.parse(since) || Date.parse(timestamp) >= Date.parse(until)) continue;
            const previous = commits.get(raw.sha);
            if (previous) {
              if (!previous.branches.includes(branch.name)) previous.branches.push(branch.name);
            } else {
              commits.set(raw.sha, {
                sha: raw.sha, title: raw.commit.message.split(/\r?\n/)[0], message: raw.commit.message,
                url: `https://github.com/${repository.full_name}/commit/${raw.sha}`,
                timestamp, branches: [branch.name],
              });
            }
          }
        });
        } catch (error) {
          complete = false;
          issue(`${repository.full_name} (${branch.name}): ${error instanceof HttpError ? error.message : "Respuesta de GitHub inesperada."}`);
        }
      }
      if (complete) repositoriesChecked++;
    } catch (error) {
      issue(`${repository.full_name}: ${error instanceof HttpError ? error.message : "Respuesta de GitHub inesperada."}`);
    }
    const list = [...commits.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return { repository: repository.full_name, url: `https://github.com/${repository.full_name}`, commits: list, summary: summarizeCommits(list) };
  });
  return {
    date, username, since, until, generatedAt: new Date().toISOString(),
    projects: results.filter((r) => r.commits.length).sort((a, b) => b.commits.length - a.commits.length || a.repository.localeCompare(b.repository)),
    issues, repositoriesChecked,
  };
}
