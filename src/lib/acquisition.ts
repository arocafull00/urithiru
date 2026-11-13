import type { Project } from "./types";

export const ACQUISITION_CHANNELS = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "web", label: "Web / directo / sin origen" },
] as const;

export function diariamenteSurface(project: Pick<Project, "name" | "domain">): "landing" | "app" | null {
  const domain = project.domain?.toLowerCase();
  if (domain && ["info.diariamente.es", "clinicas.diariamente.es", "pacientes.diariamente.es"].includes(domain)) return "landing";
  if (domain === "diariamente.es") return "app";
  if (/^diariamente-(landing|clinicas|pacientes)(-|$)/.test(project.name)) return "landing";
  if (["diariamente", "diariamente-web"].includes(project.name)) return "app";
  return null;
}
