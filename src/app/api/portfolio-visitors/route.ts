import { requireAdmin } from "@/lib/auth";
import { errorResponse, HttpError, json } from "@/lib/http";
import { query } from "@/lib/params";
import { listProjects } from "@/lib/vercel";
import { portfolioVisitorsSchema } from "@/lib/portfolio-visitors";
import { isPortfolioProject } from "@/lib/portfolio-project";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { teamId, projectId, period } = query(request);
    const params = new URL(request.url).searchParams;
    const site = params.get("site") ?? "all";
    const page = Number(params.get("page") ?? 0);
    if (!["all", "business", "portfolio", "products"].includes(site) || !Number.isInteger(page) || page < 0 || page > 100_000) {
      throw new HttpError(400, "Filtros no válidos.");
    }
    const secret = process.env.PORTFOLIO_VISITORS_SECRET;
    if (!secret) throw new HttpError(503, "Falta conectar la medición del porfolio en el servidor.");
    const project = (await listProjects(teamId)).find((item) => item.id === projectId);
    if (!project || !isPortfolioProject(project)) throw new HttpError(404, "Proyecto no encontrado.");
    const url = new URL("/api/visitor-report", process.env.PORTFOLIO_API_URL || "https://adrianrocafulldev.es");
    url.search = new URLSearchParams({ period: String(period), site, page: String(page) }).toString();
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new HttpError(502, "No se pudo consultar la medición del porfolio. Revisa la conexión entre ambos proyectos.");
    return json(portfolioVisitorsSchema.parse(await response.json()));
  } catch (error) { return errorResponse(error); }
}
