import "server-only";
import { mapConcurrent } from "./analytics";
import { HttpError } from "./http";
import { clerkProjectSettings, productionClerkVariable } from "./user-data";
import { listProjects, vercelFetch } from "./vercel";
import type { ClerkProject, ClerkProjectsResult } from "./types";

type Connection = { project: ClerkProject; secretKey: string | null };
type Catalog = { connections: Connection[]; issues: string[] };
const cache = new Map<string, { expires: number; value: Promise<Catalog> }>();
const liveKey = (value?: string) =>
  value?.startsWith("sk_live_") ? value : null;

async function discoverProjects(teamId: string): Promise<Catalog> {
  const issues: string[] = [];
  const connections: Connection[] = [];
  if (process.env.VERCEL_TOKEN) {
    try {
      const projects = await listProjects(teamId);
      const results = await mapConcurrent(
        projects.filter((project) => project.deploymentId),
        4,
        async (project): Promise<Connection | null> => {
          try {
            const body = await (
              await vercelFetch(
                `/v10/projects/${encodeURIComponent(project.id)}/env`,
                { teamId },
              )
            ).json();
            if (!Array.isArray(body.envs))
              throw new Error("Invalid environment list");
            const variable = productionClerkVariable(body.envs);
            if (!variable) return null;
            const settings = clerkProjectSettings(project.name);
            let secretKey = liveKey(process.env[settings.secretKeyVariable]);
            // Secret/Sensitive values are write-only in Vercel. Never try to
            // recover them via deployment logs or another environment.
            if (!secretKey && variable.type !== "sensitive" && variable.id) {
              const value = await (
                await vercelFetch(
                  `/v1/projects/${encodeURIComponent(project.id)}/env/${encodeURIComponent(variable.id)}`,
                  { teamId },
                )
              ).json();
              if (typeof value.value === "string") {
                if (value.value.startsWith("sk_test_")) return null;
                secretKey = liveKey(value.value);
              }
            }
            return {
              project: {
                id: project.id,
                ...settings,
                domain: project.domain,
                connected: Boolean(secretKey),
              },
              secretKey,
            };
          } catch {
            issues.push(
              `No se ha podido comprobar la conexión de Clerk de ${project.name}.`,
            );
            return null;
          }
        },
      );
      connections.push(
        ...results.filter((item): item is Connection => item !== null),
      );
    } catch {
      issues.push(
        "No se han podido detectar los proyectos de Vercel. Revisa la conexión y los permisos de lectura de sus variables.",
      );
    }
  }
  // Explicit connections also support projects hosted outside Vercel and keep
  // working when discovery is temporarily unavailable.
  for (const [variable, value] of Object.entries(process.env)) {
    const match = /^([A-Z0-9_]+)_CLERK_SECRET_KEY$/.exec(variable);
    const secretKey = liveKey(value);
    if (
      !match ||
      !secretKey ||
      connections.some((item) => item.project.secretKeyVariable === variable)
    )
      continue;
    const slug = match[1].toLowerCase().replace(/_/g, "-");
    connections.push({
      project: {
        id: slug,
        ...clerkProjectSettings(slug),
        domain: null,
        connected: true,
        secretKeyVariable: variable,
      },
      secretKey,
    });
  }
  connections.sort((a, b) =>
    a.project.name.localeCompare(b.project.name, "es"),
  );
  return { connections, issues };
}

async function getCatalog(teamId: string) {
  const existing = cache.get(teamId);
  if (existing && existing.expires > Date.now()) return existing.value;
  if (cache.size >= 20) cache.delete(cache.keys().next().value!);
  const value = discoverProjects(teamId);
  cache.set(teamId, { expires: Date.now() + 60000, value });
  return value;
}

export async function getClerkProjects(
  teamId: string,
): Promise<ClerkProjectsResult> {
  const catalog = await getCatalog(teamId);
  // Construct the response explicitly: no credentials cross this boundary.
  return {
    projects: catalog.connections.map(({ project }) => project),
    issues: catalog.issues,
  };
}

export async function getClerkConnection(teamId: string, projectId: string) {
  const catalog = await getCatalog(teamId);
  const connection = projectId
    ? catalog.connections.find(({ project }) => project.id === projectId)
    : catalog.connections.find(
        ({ project }) => project.billing && project.connected,
      );
  if (!connection)
    throw new HttpError(404, "El proyecto no está disponible en este equipo.");
  if (!connection.secretKey)
    throw new HttpError(
      503,
      `Conecta Clerk de producción de ${connection.project.name} configurando ${connection.project.secretKeyVariable} en Urithiru. Vercel no permite recuperar sus claves secretas.`,
    );
  return { project: connection.project, secretKey: connection.secretKey };
}
