import type { Project } from "./types";

export function isPortfolioProject(project: Pick<Project, "name" | "domain">) {
  return project.name === "portfolio-v3" || /^(portfolio\.)?adrianrocafulldev\.es$/.test(project.domain ?? "");
}
