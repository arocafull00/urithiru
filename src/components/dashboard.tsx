"use client";
import { memo, useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import useSWR, { SWRConfig, useSWRConfig } from "swr";
import { SignIn, UserButton, useClerk, useUser } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import {
  Activity,
  ArrowDownUp,
  ArrowUpRight,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Sun,
  Terminal,
  Unplug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboard, clearPrivateCache } from "@/stores/dashboard";
import type {
  Dashboard as DashboardData,
  Project,
  Session,
  Period,
  Section,
  Details,
  LogResult,
  TrafficPoint,
  Breakdown,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const TrafficChart = dynamic(() => import("./traffic-chart"), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full" />,
});
const formatNumber = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("es-ES");
const navigation = [
  { id: "overview", name: "Vista general", icon: LayoutDashboard },
  { id: "projects", name: "Proyectos", icon: FolderKanban },
  { id: "logs", name: "Logs", icon: Terminal },
  { id: "errors", name: "Errores", icon: CircleAlert },
  { id: "settings", name: "Configuración", icon: Settings2 },
] as const;
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function fetcher([url]: [string, string]) {
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      await clearPrivateCache();
      window.dispatchEvent(new Event("centralita-session-expired"));
    }
    if (res.status === 403) {
      window.dispatchEvent(
        new CustomEvent("centralita-access-denied", {
          detail: body.error ?? "Esta cuenta no tiene acceso.",
        }),
      );
    }
    throw new ApiError(
      res.status,
      body.error ?? "No se han podido cargar los datos.",
    );
  }
  return body;
}
function navigate(section: Section, project = "") {
  useDashboard.getState().patch({ section, project, search: "" });
  const params = new URLSearchParams({ view: section });
  if (project) params.set("project", project);
  history.replaceState(null, "", `/?${params}`);
}
function Brand() {
  return (
    <span className="brand">
      <span className="brand-symbol">
        <Activity size={18} strokeWidth={2} />
      </span>
      urithiru<span className="brand-dot">.</span>
    </span>
  );
}
function Notice({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={cn("notice", error && "notice-error")}
    >
      <CircleAlert size={16} className="shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function DashboardApp({ configured }: { configured: boolean }) {
  if (!configured)
    return (
      <div className="auth-page">
        <Brand />
        <div className="auth-intro">
          <h1>Conecta Urithiru</h1>
          <p>Configura Clerk en el servidor para iniciar sesión.</p>
          <code>pnpm dlx clerk@latest init</code>
          <p>
            Consulta el README del proyecto para activar Vercel y el acceso de
            administrador.
          </p>
        </div>
      </div>
    );
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: true,
        dedupingInterval: 15000,
        errorRetryCount: 1,
        shouldRetryOnError: (error) =>
          !(error instanceof ApiError && [401, 403].includes(error.status)),
      }}
    >
      <SessionGate />
    </SWRConfig>
  );
}
function SessionGate() {
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  const { mutate } = useSWRConfig();
  const session = useDashboard((s) => s.session);
  const [hydrated, setHydrated] = useState(false);
  const [denied, setDenied] = useState<string | null>(null);
  const { data, error, isValidating } = useSWR<Session>(
    hydrated && (user || session)
      ? ["/api/session", user?.id ?? session?.userId ?? "session"]
      : null,
    { refreshInterval: 300000 },
  );
  const clear = useCallback(async () => {
    await clearPrivateCache();
    await mutate(() => true, undefined, { revalidate: false });
  }, [mutate]);
  useEffect(() => {
    const expired = () => {
      void clear();
      void clerk.signOut({ redirectUrl: "/sign-in" });
    };
    const forbidden = (event: Event) => {
      setDenied(String((event as CustomEvent).detail));
      void clear();
    };
    window.addEventListener("centralita-session-expired", expired);
    window.addEventListener("centralita-access-denied", forbidden);
    return () => {
      window.removeEventListener("centralita-session-expired", expired);
      window.removeEventListener("centralita-access-denied", forbidden);
    };
  }, [clear, clerk]);
  useEffect(() => {
    void Promise.resolve(useDashboard.persist.rehydrate()).then(() => {
      const params = new URLSearchParams(location.search);
      const view = params.get("view");
      if (navigation.some((n) => n.id === view))
        useDashboard.getState().patch({
          section: view as Section,
          project: params.get("project") ?? "",
        });
      setHydrated(true);
    });
  }, []);
  useEffect(() => {
    if (data) {
      const previous = useDashboard.getState().session;
      if (previous && previous.userId !== data.userId) void clear();
      useDashboard.getState().patch({ session: data });
    }
  }, [data, clear]);
  useEffect(() => {
    if (!hydrated) return;
    if (
      (isLoaded && !user && session) ||
      (isLoaded && user && session && user.id !== session.userId) ||
      (error instanceof ApiError && [401, 403].includes(error.status))
    ) {
      void clear();
      if (error?.status === 401 && user)
        void clerk.signOut({ redirectUrl: "/sign-in" });
    }
  }, [isLoaded, user, hydrated, session, error, clear, clerk]);
  if (!hydrated) return <LoadingShell />;
  if (isLoaded && !user)
    return (
      <div className="auth-page">
        <Brand />
        <div className="auth-intro">
          <Badge variant="outline">
            <ShieldCheck size={12} /> Espacio privado
          </Badge>
          <h1>
            Todos tus proyectos.
            <br />
            Un solo lugar.
          </h1>
          <p>
            Tráfico, despliegues y errores, con el contexto que necesitas para
            actuar.
          </p>
        </div>
        <SignIn routing="hash" />
      </div>
    );
  if (denied || (error instanceof ApiError && error.status === 403))
    return (
      <div className="auth-page">
        <Brand />
        <div className="auth-intro">
          <h1>Acceso de administrador</h1>
          <Notice error>{denied ?? error.message}</Notice>
          <p>
            ID de tu cuenta: <code>{user?.id}</code>
          </p>
          <Button onClick={() => clerk.signOut({ redirectUrl: "/sign-in" })}>
            Cambiar de cuenta
          </Button>
        </div>
      </div>
    );
  const active = data ?? session;
  if (!active || (user && active.userId !== user.id))
    return (
      <div className="auth-page">
        <Brand />
        {error ? (
          <>
            <Notice error>{error.message}</Notice>
            <Button
              disabled={isValidating}
              onClick={() => mutate(["/api/session", user?.id ?? "session"])}
            >
              Reintentar
            </Button>
          </>
        ) : (
          <LoadingShell />
        )}
      </div>
    );
  return <Workspace session={active} sessionError={error?.message} />;
}
function LoadingShell() {
  return (
    <div className="loading-shell" aria-label="Cargando Urithiru">
      <Brand />
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

function Sidebar({
  session,
  onNavigate,
}: {
  session: Session;
  onNavigate?: () => void;
}) {
  const section = useDashboard((s) => s.section);
  const clerk = useClerk();
  const { mutate } = useSWRConfig();
  return (
    <div className="sidebar-inner">
      <Brand />
      <div className="workspace-label">
        <span className="avatar">{session.name.charAt(0).toUpperCase()}</span>
        <div>
          <strong>Mi espacio</strong>
          <span>Administrador</span>
        </div>
        <ShieldCheck size={15} />
      </div>
      <nav aria-label="Navegación principal">
        {navigation.map((item) => (
          <button
            key={item.id}
            aria-current={section === item.id ? "page" : undefined}
            onClick={() => {
              navigate(item.id);
              onNavigate?.();
            }}
            className={cn("nav-link", section === item.id && "active")}
          >
            <item.icon size={17} />
            {item.name}
            {section === item.id && <span className="nav-marker" />}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="private-label">
          <ShieldCheck size={14} /> Solo tú tienes acceso
        </div>
        <button
          className="nav-link"
          onClick={async () => {
            await clearPrivateCache();
            await mutate(() => true, undefined, { revalidate: false });
            await clerk.signOut({ redirectUrl: "/sign-in" });
          }}
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function Workspace({
  session,
  sessionError,
}: {
  session: Session;
  sessionError?: string;
}) {
  const section = useDashboard((s) => s.section);
  const period = useDashboard((s) => s.period);
  const storedTeam = useDashboard((s) => s.team);
  const project = useDashboard((s) => s.project);
  const search = useDashboard((s) => s.search);
  const team = storedTeam || session.defaultTeamId;
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const url = `/api/dashboard?period=${period}&team=${team}`;
  const snapshotKey = `${session.userId}:${team}:${period}`;
  const snapshot = useDashboard((s) => s.snapshots[snapshotKey]);
  const { data, error, mutate, isValidating } = useSWR<DashboardData>(
    session.vercel ? [url, session.userId] : null,
    { fallbackData: snapshot, refreshInterval: 60000, keepPreviousData: false },
  );
  useEffect(() => {
    if (data) useDashboard.getState().remember(snapshotKey, data);
  }, [data, snapshotKey]);
  useEffect(() => {
    document.title = `${navigation.find((n) => n.id === section)?.name ?? "Vista general"} · Urithiru`;
  }, [section]);
  const { mutate: mutateAll } = useSWRConfig();
  const clerk = useClerk();
  useEffect(() => {
    if (error instanceof ApiError && [401, 403].includes(error.status)) {
      void clearPrivateCache();
      void mutateAll(() => true, undefined, { revalidate: false });
      if (error.status === 401) void clerk.signOut({ redirectUrl: "/sign-in" });
    }
  }, [error, mutateAll, clerk]);
  const current = snapshot ?? data;
  const projects = current?.projects ?? [];
  const selected = projects.find((p) => p.id === project);
  const title =
    section === "overview" && selected
      ? selected.name
      : navigation.find((n) => n.id === section)?.name;
  const description = {
    overview: selected
      ? "Tráfico y actividad de este proyecto."
      : "Lo que está pasando en todos tus proyectos.",
    projects: "Tu mapa de proyectos, de un vistazo.",
    logs: "La actividad de tus aplicaciones, en un mismo lugar.",
    errors: "Detecta dónde hace falta tu atención.",
    settings: "Conexiones, acceso y preferencias de tu espacio.",
  }[section];
  return (
    <div className="app-shell">
      <aside className="desktop-sidebar">
        <Sidebar session={session} />
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Abrir navegación"
                >
                  <Menu size={18} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetTitle className="sr-only">
                  Navegación de Urithiru
                </SheetTitle>
                <Sidebar
                  session={session}
                  onNavigate={() => setMenuOpen(false)}
                />
              </SheetContent>
            </Sheet>
            <span className="text-muted-foreground hidden sm:inline">
              Mi espacio
            </span>
            <ChevronRight
              size={14}
              className="text-muted-foreground hidden sm:block"
            />
            <span>{navigation.find((n) => n.id === section)?.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="top-private">
              <span className="status-dot" />
              Privado
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={
                theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"
              }
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </Button>
            <UserButton />
          </div>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
            {section !== "settings" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void mutate();
                  void mutateAll(
                    (key) =>
                      Array.isArray(key) &&
                      String(key[0]).startsWith("/api/logs"),
                  );
                }}
                disabled={isValidating}
              >
                <RefreshCw
                  size={14}
                  className={cn(isValidating && "animate-spin")}
                />
                {isValidating ? "Actualizando" : "Actualizar"}
              </Button>
            )}
          </div>
          {sessionError && (
            <Notice error>
              La sesión no se ha podido verificar: {sessionError}. Mostrando la
              última información disponible.
            </Notice>
          )}
          {section !== "settings" && (
            <div className="toolbar">
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={team || "personal"}
                  onValueChange={(value) =>
                    useDashboard.getState().patch({
                      team: value === "personal" ? "" : value,
                      project: "",
                    })
                  }
                >
                  <SelectTrigger
                    aria-label="Equipo de Vercel"
                    className="team-select"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {session.teams.length ? (
                      session.teams.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="personal">Cuenta personal</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Select
                  value={project || "all"}
                  onValueChange={(value) =>
                    useDashboard
                      .getState()
                      .patch({ project: value === "all" ? "" : value })
                  }
                >
                  <SelectTrigger
                    aria-label="Filtrar por proyecto"
                    className="project-select"
                  >
                    <FolderKanban size={14} />
                    <SelectValue placeholder="Todos los proyectos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los proyectos</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div
                className="period-switch"
                role="group"
                aria-label="Periodo de analytics"
              >
                {([1, 7, 30] as Period[]).map((p) => (
                  <button
                    key={p}
                    aria-pressed={period === p}
                    className={cn(period === p && "selected")}
                    onClick={() => useDashboard.getState().patch({ period: p })}
                  >
                    {p === 1 ? "24 horas" : `${p} días`}
                  </button>
                ))}
              </div>
            </div>
          )}
          {error && (
            <Notice error>
              {error.message}.{" "}
              {data
                ? "Se conserva la última lectura."
                : "No se han podido cargar los proyectos."}
            </Notice>
          )}
          {!session.vercel && section !== "settings" ? (
            <ConnectionEmpty />
          ) : section === "settings" ? (
            <Settings session={session} />
          ) : !data ? (
            <div className="space-y-6">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-72 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : (
            <>
              {section === "overview" && (
                <Overview
                  data={current ?? data}
                  session={session}
                  project={selected}
                  period={period}
                  team={team}
                />
              )}
              {section === "projects" && (
                <Projects
                  projects={projects.filter(
                    (p) => !project || p.id === project,
                  )}
                  teamSlug={(current ?? data).teamSlug}
                />
              )}
              {(section === "logs" || section === "errors") && (
                <Logs
                  projects={projects}
                  session={session}
                  period={period}
                  team={team}
                  projectId={project}
                  errorsOnly={section === "errors"}
                  search={search}
                />
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              <span className="status-dot" />
              {data
                ? `Última lectura: ${new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(data.fetchedAt))}`
                : "Pendiente de conexión"}
            </span>
            <span>Urithiru · Espacio personal</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function ConnectionEmpty() {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Unplug size={26} />
      </span>
      <h2>Tu espacio está listo para conectar</h2>
      <p>
        Conecta tu cuenta de Vercel para reunir el tráfico y los logs de tus
        proyectos.
      </p>
      <Button onClick={() => navigate("settings")}>
        Configurar Vercel
        <ArrowUpRight size={15} />
      </Button>
    </div>
  );
}

function Overview({
  data,
  session,
  project,
  period,
  team,
}: {
  data: DashboardData;
  session: Session;
  project?: Project;
  period: Period;
  team: string;
}) {
  const visible = project ? [project] : data.projects;
  const available = visible.filter((p) => p.analytics);
  const active = available.filter((p) => (p.analytics?.pageviews ?? 0) > 0);
  const failures = visible.filter(
    (p) => p.deploymentState === "ERROR" || p.analyticsError,
  );
  const pageviews = available.reduce((n, p) => n + p.analytics!.pageviews, 0);
  const visitors = available.reduce((n, p) => n + p.analytics!.visitors, 0);
  const map = new Map<string, TrafficPoint>();
  for (const p of available)
    for (const point of p.analytics!.series) {
      const previous = map.get(point.timestamp) ?? {
        timestamp: point.timestamp,
        pageviews: 0,
        visitors: 0,
      };
      map.set(point.timestamp, {
        timestamp: point.timestamp,
        pageviews: previous.pageviews + point.pageviews,
        visitors: previous.visitors + point.visitors,
      });
    }
  const series = [...map.values()].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  const hasData = available.length > 0;
  return (
    <>
      <div className="metrics-strip">
        <Metric
          label="Páginas vistas"
          value={hasData ? pageviews : null}
          hint={`${available.length} de ${visible.length} proyectos con datos`}
          icon={<ChartNoAxesCombined size={16} />}
        />
        <Metric
          label={project ? "Visitantes" : "Visitantes por proyecto"}
          value={hasData ? visitors : null}
          hint={
            project
              ? "Según Vercel Analytics"
              : "Suma; no deduplicada entre sitios"
          }
          icon={<Activity size={16} />}
        />
        <Metric
          label="Proyectos con tráfico"
          value={hasData ? active.length : null}
          hint="Con visitas en este periodo"
          icon={<FolderKanban size={16} />}
        />
        <Metric
          label="Fuentes con incidencias"
          value={failures.length}
          hint="Despliegues o consultas fallidas"
          icon={<CircleAlert size={16} />}
        />
      </div>
      <div className="overview-grid">
        <section className="panel traffic-panel">
          <div className="panel-heading">
            <div>
              <h2>Evolución del tráfico</h2>
              <p>
                Páginas vistas{" "}
                {project ? `en ${project.name}` : "en todos los proyectos"}
              </p>
            </div>
            <Badge variant="outline">UTC</Badge>
          </div>
          <TrafficChart data={series} hourly={period === 1} />
        </section>
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h2>Dónde están entrando</h2>
              <p>Proyectos por páginas vistas</p>
            </div>
            <Activity size={16} className="text-primary" />
          </div>
          {hasData && active.length ? (
            <div className="ranking">
              {[...active]
                .sort((a, b) => b.analytics!.pageviews - a.analytics!.pageviews)
                .slice(0, 5)
                .map((p) => (
                  <button key={p.id} onClick={() => navigate("overview", p.id)}>
                    <div>
                      <span className="project-avatar">
                        {p.name.slice(0, 2)}
                      </span>
                      <strong>{p.name}</strong>
                      <span>{formatNumber(p.analytics!.pageviews)}</span>
                    </div>
                    <div className="bar-track">
                      <span
                        style={{
                          width: `${(p.analytics!.pageviews / Math.max(pageviews, 1)) * 100}%`,
                        }}
                      />
                    </div>
                  </button>
                ))}
            </div>
          ) : (
            <div className="small-empty">
              {hasData
                ? "No hay visitas en este periodo."
                : "Todavía no hay métricas disponibles."}
            </div>
          )}
          <button className="panel-link" onClick={() => navigate("projects")}>
            Ver todos los proyectos
            <ArrowUpRight size={14} />
          </button>
        </section>
      </div>
      {project ? (
        <ProjectDetails
          project={project}
          team={team}
          period={period}
          userId={session.userId}
        />
      ) : (
        <Projects projects={data.projects} teamSlug={data.teamSlug} compact />
      )}
      <div className="section-heading">
        <div>
          <h2>Errores y actividad</h2>
          <p>
            Producción ·{" "}
            {session.drains
              ? "Histórico recibido por Drains"
              : "Lectura en vivo de los despliegues actuales"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("errors", project?.id)}
        >
          Ver errores
          <ArrowUpRight size={14} />
        </Button>
      </div>
      <Logs
        projects={visible}
        session={session}
        period={period}
        team={team}
        projectId={project?.id ?? ""}
        errorsOnly
        compact
        search=""
      />
    </>
  );
}
function Metric({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: number | null;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="metric">
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{formatNumber(value)}</strong>
      <p>{hint}</p>
    </div>
  );
}

const ProjectRow = memo(function ProjectRow({
  project: p,
  teamSlug,
}: {
  project: Project;
  teamSlug: string;
}) {
  const favorite = useDashboard((s) => s.favorites.includes(p.id));
  const label =
    p.deploymentState === "READY"
      ? "Publicado"
      : p.deploymentState === "ERROR"
        ? "Fallido"
        : p.deploymentState === "NONE"
          ? "Sin despliegue"
          : p.deploymentState;
  return (
    <tr>
      <td>
        <div className="project-cell">
          <button
            className="favorite-button"
            aria-label={`${favorite ? "Quitar de" : "Añadir a"} favoritos: ${p.name}`}
            aria-pressed={favorite}
            onClick={() => useDashboard.getState().favorite(p.id)}
          >
            <Star size={14} fill={favorite ? "currentColor" : "none"} />
          </button>
          <button
            className="project-title"
            onClick={() => navigate("overview", p.id)}
          >
            <span className="project-avatar">{p.name.slice(0, 2)}</span>
            <span>
              <strong>{p.name}</strong>
              <small>{p.domain ?? p.framework ?? "Sin dominio"}</small>
            </span>
          </button>
        </div>
      </td>
      <td className="tabular-nums text-right">
        {formatNumber(p.analytics?.visitors)}
      </td>
      <td className="tabular-nums text-right font-medium">
        {formatNumber(p.analytics?.pageviews)}
      </td>
      <td>
        <Badge
          variant="outline"
          className={cn(
            "deployment-badge",
            p.deploymentState === "ERROR" && "danger",
          )}
        >
          <span
            className={cn(
              "status-dot",
              p.deploymentState !== "READY" && "status-muted",
              p.deploymentState === "ERROR" && "status-error",
            )}
          />
          {label}
        </Badge>
      </td>
      <td>
        {p.analyticsError ? (
          <span className="source-error" title={p.analyticsError}>
            Error al consultar
          </span>
        ) : p.analytics ? (
          <span className="source-status">Conectado</span>
        ) : (
          <span className="text-muted-foreground">Desactivado</span>
        )}
      </td>
      <td>
        {teamSlug ? (
          <a
            className="external-link"
            href={`https://vercel.com/${encodeURIComponent(teamSlug)}/${encodeURIComponent(p.name)}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`Abrir ${p.name} en Vercel`}
          >
            <ArrowUpRight size={16} />
          </a>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Ver ${p.name}`}
            onClick={() => navigate("overview", p.id)}
          >
            <ChevronRight size={16} />
          </Button>
        )}
      </td>
    </tr>
  );
});
function Projects({
  projects,
  teamSlug,
  compact = false,
}: {
  projects: Project[];
  teamSlug: string;
  compact?: boolean;
}) {
  const search = useDashboard((s) => s.search);
  const favorites = useDashboard((s) => s.favorites);
  const [sort, setSort] = useState("traffic");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [onlyActive, setOnlyActive] = useState(false);
  const rows = projects
    .filter(
      (p) =>
        (!onlyFavorites || favorites.includes(p.id)) &&
        (!onlyActive || (p.analytics?.pageviews ?? 0) > 0) &&
        `${p.name} ${p.domain}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : (b.analytics?.pageviews ?? -1) - (a.analytics?.pageviews ?? -1),
    );
  return (
    <section className="panel projects-panel">
      <div className="panel-heading">
        <div className="flex items-center gap-2">
          <h2>Proyectos</h2>
          <Badge variant="secondary">{rows.length}</Badge>
        </div>
        <div className="table-actions">
          <Button
            variant={onlyActive ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={onlyActive}
            onClick={() => setOnlyActive(!onlyActive)}
          >
            <SlidersHorizontal size={13} />
            Con tráfico
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Mostrar solo favoritos"
            aria-pressed={onlyFavorites}
            onClick={() => setOnlyFavorites(!onlyFavorites)}
          >
            <Star size={14} fill={onlyFavorites ? "currentColor" : "none"} />
          </Button>
        </div>
      </div>
      <div className="table-toolbar">
        <div className="search-field">
          <Search size={15} />
          <Input
            aria-label="Buscar proyecto"
            placeholder="Buscar proyecto…"
            value={search}
            onChange={(e) =>
              useDashboard.getState().patch({ search: e.target.value })
            }
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSort(sort === "traffic" ? "name" : "traffic")}
        >
          <ArrowDownUp size={13} />
          {sort === "traffic" ? "Por tráfico" : "Por nombre"}
        </Button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Proyecto</th>
              <th className="text-right">Visitantes</th>
              <th className="text-right">Páginas vistas</th>
              <th>Producción</th>
              <th>Analytics</th>
              <th>
                <span className="sr-only">Abrir proyecto</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(compact ? rows.slice(0, 8) : rows).map((p) => (
              <ProjectRow key={p.id} project={p} teamSlug={teamSlug} />
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <div className="small-empty">
          {projects.length
            ? "Ningún proyecto coincide con estos filtros."
            : "Este equipo todavía no tiene proyectos."}
        </div>
      )}
      {compact && rows.length > 8 && (
        <button className="panel-link" onClick={() => navigate("projects")}>
          Ver los {rows.length} proyectos
          <ArrowUpRight size={14} />
        </button>
      )}
    </section>
  );
}

function ProjectDetails({
  project,
  team,
  period,
  userId,
}: {
  project: Project;
  team: string;
  period: Period;
  userId: string;
}) {
  const { data, error } = useSWR<Details>(
    project.analytics
      ? [
          `/api/analytics?team=${team}&project=${project.id}&period=${period}`,
          userId,
        ]
      : null,
  );
  if (!project.analytics)
    return (
      <Notice>
        {project.analyticsError ??
          "Activa Web Analytics en Vercel para consultar las páginas, fuentes y países de este proyecto."}
      </Notice>
    );
  if (error) return <Notice error>{error.message}</Notice>;
  return (
    <div className="breakdowns">
      {[
        { title: "Páginas", rows: data?.pages },
        { title: "Fuentes", rows: data?.referrers },
        { title: "Países", rows: data?.countries },
        { title: "Dispositivos", rows: data?.devices },
      ].map((group) => (
        <section className="panel" key={group.title}>
          <div className="panel-heading">
            <h2>{group.title}</h2>
            <span className="text-xs text-muted-foreground">
              Páginas vistas
            </span>
          </div>
          {!group.rows ? (
            <Skeleton className="h-36 m-4" />
          ) : (
            <BreakdownRows rows={group.rows} />
          )}
        </section>
      ))}
    </div>
  );
}
function BreakdownRows({ rows }: { rows: Breakdown[] }) {
  return (
    <div className="breakdown-rows">
      {rows.slice(0, 10).map((r, i) => (
        <div key={`${r.label}-${i}`}>
          <span title={r.label}>{r.label}</span>
          <strong>{formatNumber(r.pageviews)}</strong>
        </div>
      ))}
      {!rows.length && (
        <div className="small-empty">Sin actividad en este periodo.</div>
      )}
    </div>
  );
}

function Logs({
  projects,
  session,
  team,
  projectId,
  period,
  errorsOnly,
  compact = false,
  search,
}: {
  projects: Project[];
  session: Session;
  team: string;
  projectId: string;
  period: Period;
  errorsOnly: boolean;
  compact?: boolean;
  search: string;
}) {
  const [level, setLevel] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, error, isValidating, mutate } = useSWR<LogResult>(
    [
      `/api/logs?team=${team}&period=${period}&project=${projectId}&errors=${errorsOnly ? 1 : 0}`,
      session.userId,
    ],
    { refreshInterval: 60000 },
  );
  const logs = (data?.logs ?? []).filter(
    (l) =>
      (level === "all" || l.level === level) &&
      `${l.projectName} ${l.message} ${l.path} ${l.statusCode}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const failed = projects.filter((p) => p.deploymentState === "ERROR");
  return (
    <div className="logs-section">
      {errorsOnly && failed.length > 0 && (
        <Notice error>
          {failed.length} despliegue(s) de producción fallidos:{" "}
          {failed.map((p) => p.name).join(", ")}.
        </Notice>
      )}
      {!session.drains && !compact && (
        <Notice>
          Lectura en vivo limitada a los despliegues actuales. Para conservar y
          buscar errores históricos, conecta Neon y configura un Log Drain.{" "}
          <button className="text-link" onClick={() => navigate("settings")}>
            Ver configuración
          </button>
        </Notice>
      )}
      {error && (
        <Notice error>
          {error.message}
          <Button variant="ghost" size="sm" onClick={() => mutate()}>
            Reintentar
          </Button>
        </Notice>
      )}
      <section className="panel logs-panel">
        {!compact && (
          <div className="table-toolbar">
            <div className="search-field">
              <Search size={15} />
              <Input
                aria-label="Buscar logs"
                placeholder="Buscar mensaje, ruta o proyecto…"
                value={search}
                onChange={(e) =>
                  useDashboard.getState().patch({ search: e.target.value })
                }
              />
            </div>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger className="w-36" aria-label="Filtrar nivel de log">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["all", "info", "warning", "error", "fatal", "debug"].map(
                  (l) => (
                    <SelectItem key={l} value={l}>
                      {l === "all" ? "Todos los niveles" : l}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        )}
        {!data && !error ? (
          <div className="p-5 space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : logs.length ? (
          <div className="log-list">
            {logs.slice(0, compact ? 5 : 1000).map((log) => (
              <button
                key={`${log.projectId}:${log.id}`}
                className={cn("log-row", expanded === log.id && "expanded")}
                aria-expanded={expanded === log.id}
                onClick={() => setExpanded(expanded === log.id ? null : log.id)}
              >
                <span className="log-time">
                  {new Intl.DateTimeFormat("es", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    ...(period > 1 ? { day: "2-digit", month: "2-digit" } : {}),
                  }).format(new Date(log.timestamp))}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    ["error", "fatal"].includes(log.level) ||
                      (log.statusCode ?? 0) >= 500
                      ? "danger"
                      : "",
                  )}
                >
                  {log.level}
                </Badge>
                <span className="log-project">{log.projectName}</span>
                <span className="log-message">
                  {log.message || log.path || "Petición sin mensaje"}
                  {expanded === log.id && (
                    <small>
                      {log.path} · HTTP {log.statusCode ?? "—"} · {log.source} ·{" "}
                      {log.deploymentId}
                    </small>
                  )}
                </span>
                {log.statusCode && (
                  <span
                    className={cn(
                      "log-code",
                      log.statusCode >= 500 && "text-destructive",
                    )}
                  >
                    {log.statusCode}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="log-empty">
            <span className="empty-icon">
              {errorsOnly ? <ShieldCheck size={23} /> : <Terminal size={23} />}
            </span>
            <h3>
              {search || level !== "all"
                ? "No hay coincidencias"
                : errorsOnly
                  ? "No se han recibido errores"
                  : "No se han recibido logs"}
            </h3>
            <p>
              {data?.mode === "history"
                ? "Se muestran los eventos que llegaron al Drain en el periodo seleccionado."
                : "La lectura en vivo cubre una ventana breve; no confirma la ausencia de errores anteriores."}
            </p>
          </div>
        )}
        {data?.truncated && (
          <Notice>
            La consulta alcanzó su límite de eventos. Filtra por proyecto para
            reducir el volumen.
          </Notice>
        )}
        <div className="logs-footer">
          <span>
            <span
              className={cn(
                "status-dot",
                (!data || data.issues.length > 0) && "status-muted",
              )}
            />
            {isValidating
              ? "Consultando Vercel…"
              : data?.mode === "history"
                ? "Histórico de Neon"
                : "Lectura en vivo"}
          </span>
          <span>{logs.length} eventos recibidos</span>
        </div>
      </section>
      {data?.issues.length ? (
        <details className="coverage">
          <summary>
            {data.issues.length} proyectos con lectura parcial o no disponible
          </summary>
          {data.issues.map((i) => (
            <p key={i.projectId}>
              <strong>
                {projects.find((p) => p.id === i.projectId)?.name ??
                  i.projectId}
                :
              </strong>{" "}
              {i.message}
            </p>
          ))}
        </details>
      ) : null}
    </div>
  );
}

function Settings({ session }: { session: Session }) {
  const { theme, setTheme } = useTheme();
  const [cleared, setCleared] = useState(false);
  const { mutate } = useSWRConfig();
  return (
    <div className="settings-layout">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Conexiones</h2>
            <p>Credenciales guardadas únicamente en el servidor.</p>
          </div>
          <ShieldCheck size={17} />
        </div>
        <div className="setting-row">
          <span className="connection-icon">▲</span>
          <div>
            <h3>Vercel</h3>
            <p>Proyectos, Web Analytics y logs de producción.</p>
          </div>
          <Badge variant="outline">
            {session.vercel ? "Conectado" : "Pendiente"}
          </Badge>
        </div>
        <div className="setting-row">
          <span className="connection-icon">
            <ShieldCheck size={19} />
          </span>
          <div>
            <h3>Clerk</h3>
            <p>Sesión privada y lista de administradores permitidos.</p>
          </div>
          <Badge variant="outline">Conectado</Badge>
        </div>
        <div className="setting-row">
          <span className="connection-icon">
            <Terminal size={19} />
          </span>
          <div>
            <h3>Neon + Log Drain</h3>
            <p>
              Guarda los logs recibidos y permite consultar errores históricos.
            </p>
          </div>
          <Badge variant="outline">
            {session.drains ? "Configurado" : "Opcional"}
          </Badge>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Activar el histórico de logs</h2>
            <p>Configuración en el servidor y en Vercel.</p>
          </div>
        </div>
        <ol className="setup-steps">
          <li>
            <strong>Conecta una base de datos Neon</strong>
            <p>
              Configura <code>DATABASE_URL</code> y ejecuta{" "}
              <code>pnpm db:migrate</code>.
            </p>
          </li>
          <li>
            <strong>Crea un Log Drain en Vercel</strong>
            <p>
              Destino HTTPS: <code>/api/drains/logs</code>. Formato JSON o
              NDJSON, entorno de producción y los proyectos que quieras
              conservar.
            </p>
          </li>
          <li>
            <strong>Configura la firma del Drain</strong>
            <p>
              Guarda su secreto como <code>VERCEL_DRAIN_SECRET</code>. Si Vercel
              solicita verificar el destino, configura{" "}
              <code>VERCEL_DRAIN_VERIFY</code>.
            </p>
          </li>
        </ol>
        <div className="panel-padding">
          <a
            className="text-link"
            href="https://vercel.com/docs/drains/using-drains"
            target="_blank"
            rel="noreferrer"
          >
            Documentación de Vercel
            <ExternalLink size={13} />
          </a>
          <p className="text-xs text-muted-foreground mt-3">
            La disponibilidad y retención dependen de tu plan. El histórico
            empieza cuando el Drain comienza a enviar eventos.
          </p>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Preferencias</h2>
        </div>
        <div className="setting-row">
          <div>
            <h3>Apariencia</h3>
            <p>Se recuerda en este dispositivo.</p>
          </div>
          <Select value={theme ?? "dark"} onValueChange={setTheme}>
            <SelectTrigger aria-label="Apariencia" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Claro</SelectItem>
              <SelectItem value="dark">Oscuro</SelectItem>
              <SelectItem value="system">Sistema</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="setting-row">
          <div>
            <h3>Caché local</h3>
            <p>
              La última lectura se muestra al abrir y se actualiza en segundo
              plano.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              useDashboard.getState().patch({ snapshots: {} });
              await mutate(
                (key) =>
                  Array.isArray(key) && String(key[0]).startsWith("/api/"),
                undefined,
                { revalidate: true },
              );
              setCleared(true);
            }}
          >
            {cleared ? (
              <>
                <Check size={14} />
                Caché renovada
              </>
            ) : (
              "Renovar caché"
            )}
          </Button>
        </div>
        <div className="panel-padding">
          <p className="text-xs text-muted-foreground">
            En iPhone: Safari → Compartir → Añadir a la pantalla de inicio.
          </p>
        </div>
      </section>
    </div>
  );
}
