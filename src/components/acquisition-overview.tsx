import { diariamenteSurface } from "@/lib/acquisition";
import type { Period, Project } from "@/lib/types";
import { AcquisitionProject } from "./acquisition-project";
import { SignupSummaryPanel } from "./signup-summary";

export function AcquisitionOverview({ projects, team, period, userId }: {
  projects: Project[];
  team: string;
  period: Period;
  userId: string;
}) {
  const sites = projects.filter((project) => diariamenteSurface(project));
  const app = sites.find((project) => diariamenteSurface(project) === "app");
  if (!sites.length) return null;
  return (
    <section className="space-y-3" aria-labelledby="diariamente-acquisition-title">
      <div>
        <h2 id="diariamente-acquisition-title" className="text-base font-semibold">De dónde llegan a Diariamente</h2>
        <p className="text-sm text-muted-foreground">LinkedIn, Instagram, Facebook y web, separados por landing y aplicación.</p>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {sites.map((project) => <AcquisitionProject key={project.id} project={project} team={team} period={period} userId={userId} />)}
      </div>
      <p className="text-xs text-muted-foreground">
        Visitantes estimados por Vercel y páginas vistas, no cuentas registradas. El canal se conserva durante la visita (30 minutos de inactividad). No sumes visitantes entre canales, plataformas o sitios: pueden repetirse.
        {" "}Android identifica la app de Google Play; un navegador en Android cuenta como web. La landing solo mide web.
        {" "}El origen se detecta por utm_source o la web de procedencia. Si una red oculta ambos, o el origen se pierde al instalar desde Play Store, figura como sin origen.
      </p>
      {app && <SignupSummaryPanel projectId={app.id} team={team} period={period} userId={userId} />}
    </section>
  );
}
