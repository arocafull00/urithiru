"use client";

import { memo, useCallback, useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  Users as UsersIcon,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Skeleton } from "./ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { UserActionsCell, UserPlanCell } from "./user-billing";
import { DeleteUserDialog } from "./delete-user-dialog";
import { UserAcquisition } from "./user-acquisition";
import { SignupSummaryPanel } from "./signup-summary";
import { useDashboard } from "@/stores/dashboard";
import type {
  ClerkProject,
  ClerkProjectsResult,
  DiariamenteUser,
  Session,
  UsersResult,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import type { UsersOrderBy } from "@/lib/user-data";

const sortableColumns = [
  { field: "first_name", label: "Usuario y correo", sortLabel: "nombre de usuario" },
  { field: "created_at", label: "Fecha de registro", sortLabel: "fecha de registro" },
  { field: "last_sign_in_at", label: "Último acceso", sortLabel: "último acceso" },
  { field: "email_address", label: "Correo", sortLabel: "dirección de correo" },
] as const;

const number = (value: number | undefined) =>
  value?.toLocaleString("es-ES") ?? "—";
const date = (value: number | null) =>
  value === null
    ? "Sin accesos"
    : new Date(value).toLocaleString("es-ES", {
        dateStyle: "medium",
        timeStyle: "short",
      });

function withoutDeletedUser(data: UsersResult, id: string): UsersResult {
  if (!data.project.billing) return data;
  const user = data.users.find((user) => user.id === id);
  if (!user) return data;
  const ageInDays = (Date.parse(data.fetchedAt) - user.createdAt) / 86400000;
  return {
    ...data,
    users: data.users.filter((user) => user.id !== id),
    total: Math.max(0, data.total - 1),
    filteredTotal: Math.max(0, data.filteredTotal - 1),
    newUsers: {
      day: Math.max(0, data.newUsers.day - Number(ageInDays <= 1)),
      week: Math.max(0, data.newUsers.week - Number(ageInDays <= 7)),
      month: Math.max(0, data.newUsers.month - Number(ageInDays <= 30)),
    },
  };
}

const UserRow = memo(function UserRow({
  user,
  onUpdated,
  onDeleted,
  showBilling,
  acquisitionStatus,
  source,
}: {
  user: DiariamenteUser;
  onUpdated: () => void;
  onDeleted: (id: string) => void;
  showBilling: boolean;
  acquisitionStatus: UsersResult["acquisition"];
  source: string;
}) {
  return (
    <tr>
      <td>
        <div className="project-title">
          <span className="project-avatar" aria-hidden="true">
            {user.name.slice(0, 1)}
          </span>
          <div>
            <strong>{user.name}</strong>
            <small>{user.email ?? "Sin correo"}</small>
          </div>
        </div>
      </td>
      <td>
        <time dateTime={new Date(user.createdAt).toISOString()}>
          {date(user.createdAt)}
        </time>
      </td>
      <td>{date(user.lastSignInAt)}</td>
      <td>
        <Badge variant="outline">
          {!user.email
            ? "Sin correo"
            : user.emailVerified
              ? "Verificado"
              : "Sin verificar"}
        </Badge>
      </td>
      {showBilling && (
        <td><UserAcquisition acquisition={user.acquisition} status={acquisitionStatus} /></td>
      )}
      {showBilling && (
        <td>
          <UserPlanCell billing={user.billing} />
        </td>
      )}
      {showBilling && (
        <td className="users-actions">
          <div className="flex flex-col items-end gap-2">
            <UserActionsCell user={user} onUpdated={onUpdated} source={source} />
            <DeleteUserDialog user={user} onDeleted={onDeleted} source={source} />
          </div>
        </td>
      )}
    </tr>
  );
});

export default function Users({
  userId,
  teams,
}: {
  userId: string;
  teams: Session["teams"];
}) {
  const team = useDashboard((s) => s.team);
  const selected = useDashboard((s) => s.usersProject);
  const url = `/api/users/projects?${new URLSearchParams({ team })}`;
  const key = `${userId}:${url}`;
  const snapshot = useDashboard((s) => s.clerkProjects[key]);
  const { data, error, isValidating, mutate } = useSWR<ClerkProjectsResult>(
    [url, userId],
    {
      fallbackData: snapshot,
      refreshInterval: 60000,
      keepPreviousData: false,
    },
  );
  useEffect(() => {
    if (data) useDashboard.getState().rememberClerkProjects(key, data);
  }, [data, key]);
  const catalog = data ?? snapshot;
  const project =
    catalog?.projects.find((item) => item.id === selected) ??
    catalog?.projects.find((item) => item.connected && item.billing) ??
    catalog?.projects.find((item) => item.connected) ??
    catalog?.projects[0];
  return (
    <div className="users-screen">
      <div className="table-toolbar users-toolbar">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={team || "personal"}
            onValueChange={(value) =>
              useDashboard
                .getState()
                .patch({ team: value === "personal" ? "" : value })
            }
          >
            <SelectTrigger
              aria-label="Equipo de los proyectos con Clerk"
              className="w-full sm:w-48"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="personal">Cuenta personal</SelectItem>
              {teams.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={project?.id ?? ""}
            disabled={!catalog?.projects.length}
            onValueChange={(value) =>
              useDashboard.getState().patch({ usersProject: value })
            }
          >
            <SelectTrigger
              aria-label="Proyecto de los usuarios"
              className="w-full sm:w-64"
            >
              <SelectValue
                placeholder={
                  isValidating
                    ? "Buscando proyectos…"
                    : "Sin proyectos con Clerk"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {[true, false].map(
                (connected) =>
                  catalog?.projects.some(
                    (item) => item.connected === connected,
                  ) && (
                    <SelectGroup key={String(connected)}>
                      <SelectLabel>
                        {connected ? "Producción" : "Producción por verificar"}
                      </SelectLabel>
                      {catalog.projects
                        .filter((item) => item.connected === connected)
                        .map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  ),
              )}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={isValidating}
          onClick={() => void mutate()}
        >
          <RefreshCw size={14} className={cn(isValidating && "animate-spin")} />
          Buscar proyectos
        </Button>
      </div>
      {error && (
        <div className="notice notice-error" role="alert">
          {error.message}
        </div>
      )}
      {catalog?.issues.map((issue) => (
        <div className="notice" role="status" key={issue}>
          {issue}
        </div>
      ))}
      {!catalog && !error && <Skeleton className="h-72 w-full" />}
      {catalog && !project && (
        <div className="panel small-empty">
          No se han encontrado proyectos con Clerk en producción en este equipo.
        </div>
      )}
      {project && !project.connected && (
        <div className="panel p-6 space-y-3">
          <h2 className="font-semibold">Conectar {project.name}</h2>
          <p className="text-sm text-muted-foreground">
            Vercel tiene variables de Clerk para este proyecto, pero su clave
            está protegida y no se puede verificar si corresponde a una
            instancia de producción. Urithiru solo consulta instancias de
            producción.
          </p>
          <p className="text-sm break-words">
            Configura <code>{project.secretKeyVariable}</code> en el servidor de
            Urithiru con la clave de producción de Clerk de {project.name} y
            vuelve a desplegar.
          </p>
        </div>
      )}
      {project?.connected && (
        <ProjectUsers
          key={`${team}:${project.id}`}
          userId={userId}
          project={project}
          team={team}
        />
      )}
    </div>
  );
}

function ProjectUsers({
  userId,
  project,
  team,
}: {
  userId: string;
  project: ClerkProject;
  team: string;
}) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    query: "",
    period: 0,
    page: 0,
    orderBy: "-created_at" as UsersOrderBy,
  });
  const { mutate: mutateCached } = useSWRConfig();
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setFilters((previous) =>
          previous.query === search.trim()
            ? previous
            : { ...previous, query: search.trim(), page: 0 },
        ),
      300,
    );
    return () => clearTimeout(timer);
  }, [search]);
  const params = new URLSearchParams({
    project: project.id,
    team,
    q: filters.query,
    period: String(filters.period),
    page: String(filters.page),
    orderBy: filters.orderBy,
  });
  const url = `/api/users?${params}`;
  const key = `${userId}:${url}`;
  const snapshot = useDashboard((s) => s.userSnapshots[key]);
  const lastSnapshot = useDashboard(
    (s) =>
      Object.entries(s.userSnapshots).findLast(([cachedKey]) =>
        cachedKey.startsWith(
          `${userId}:/api/users?${new URLSearchParams({ project: project.id, team })}&`,
        ),
      )?.[1],
  );
  const { data, error, isValidating, mutate } = useSWR<UsersResult>(
    [url, userId],
    {
      fallbackData: snapshot,
      refreshInterval: 60000,
      keepPreviousData: false,
    },
  );
  useEffect(() => {
    if (data) useDashboard.getState().rememberUsers(key, data);
  }, [data, key]);
  const current = snapshot ?? data;
  const refresh = useCallback(() => void mutate(), [mutate]);
  const onDeleted = useCallback(
    (id: string) => {
      const state = useDashboard.getState();
      state.patch({
        userSnapshots: Object.fromEntries(
          Object.entries(state.userSnapshots).map(([cachedKey, result]) => [
            cachedKey,
            withoutDeletedUser(result, id),
          ]),
        ),
      });
      void mutateCached<UsersResult>(
        (key) =>
          Array.isArray(key) &&
          typeof key[0] === "string" &&
          key[0].startsWith("/api/users?"),
        (result) => result && withoutDeletedUser(result, id),
        { revalidate: true },
      );
    },
    [mutateCached],
  );
  const summary = current ?? lastSnapshot;
  const pages = Math.max(
    1,
    Math.ceil((current?.filteredTotal ?? 0) / (current?.pageSize ?? 25)),
  );
  return (
    <div className="users-screen">
      <div className="users-source">
        <div>
          <strong>{project.name}</strong>
          <span>Usuarios registrados en la aplicación</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Clerk · Producción</Badge>
          <Button
            variant="outline"
            size="sm"
            disabled={isValidating}
            onClick={() => void mutate()}
          >
            <RefreshCw
              size={14}
              className={cn(isValidating && "animate-spin")}
            />
            {isValidating ? "Actualizando" : "Actualizar"}
          </Button>
        </div>
      </div>
      {error && (
        <div className="notice notice-error" role="alert">
          <div>
            {error.message}{" "}
            {current
              ? "Se conserva la última lectura guardada."
              : "Los datos aparecerán cuando se pueda consultar la fuente."}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void mutate()}
            disabled={isValidating}
          >
            Reintentar
          </Button>
        </div>
      )}
      {current?.billing === "error" && (
        <div className="notice notice-error" role="alert">
          No se ha podido consultar la facturación en Diariamente. Los planes
          aparecerán cuando vuelva a responder.
        </div>
      )}
      {project.billing && current?.billing === "unconfigured" && (
        <div className="notice" role="status">
          Configura DIARIAMENTE_API_URL y DIARIAMENTE_ADMIN_API_SECRET para ver
          y gestionar los planes de cada usuario.
        </div>
      )}
      <div
        className="metrics-strip users-metrics"
        aria-label={`Resumen de registros de ${project.name}`}
      >
        {[
          {
            label: "Usuarios totales",
            value: summary?.total,
            note: "Cuentas registradas",
            icon: UsersIcon,
          },
          {
            label: "Nuevos en 24 horas",
            value: summary?.newUsers.day,
            note: "Últimas 24 horas",
            icon: CalendarDays,
          },
          {
            label: "Nuevos en 7 días",
            value: summary?.newUsers.week,
            note: "Últimos 7 días",
            icon: CalendarDays,
          },
          {
            label: "Nuevos en 30 días",
            value: summary?.newUsers.month,
            note: "Últimos 30 días",
            icon: CalendarDays,
          },
        ].map((metric) => (
          <div className="metric" key={metric.label}>
            <div>
              <span>{metric.label}</span>
              <metric.icon size={15} />
            </div>
            {!summary && !error ? (
              <Skeleton className="my-3 h-8 w-16" />
            ) : (
              <strong>{number(metric.value)}</strong>
            )}
            <p>{metric.note}</p>
          </div>
        ))}
      </div>
      {project.billing && <SignupSummaryPanel projectId={project.id} team={team} period={filters.period} userId={userId} />}
      <section
        className="panel users-panel"
        aria-labelledby="users-list-title"
        aria-busy={isValidating}
      >
        <div className="panel-heading">
          <div>
            <h2 id="users-list-title">
              {filters.period ? "Nuevos registros" : "Todos los usuarios"}
            </h2>
            <p>Pulsa en una cabecera para cambiar el orden.</p>
          </div>
          <UsersIcon size={18} className="text-muted-foreground" />
        </div>
        <div className="table-toolbar users-toolbar">
          <div className="search-field">
            <Search size={14} aria-hidden="true" />
            <Input
              aria-label="Buscar usuarios por nombre o correo"
              placeholder="Buscar por nombre o correo"
              maxLength={200}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Select
            value={String(filters.period)}
            onValueChange={(value) =>
              setFilters((previous) => ({
                ...previous,
                period: Number(value),
                page: 0,
              }))
            }
          >
            <SelectTrigger
              aria-label="Filtrar usuarios por fecha de registro"
              className="users-period"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Todos los registros</SelectItem>
              <SelectItem value="1">Últimas 24 horas</SelectItem>
              <SelectItem value="7">Últimos 7 días</SelectItem>
              <SelectItem value="30">Últimos 30 días</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div
          className="table-scroll"
          role="region"
          aria-label={`Lista de usuarios de ${project.name}`}
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                {sortableColumns.map(({ field, label, sortLabel }) => {
                  const active = filters.orderBy.slice(1) === field;
                  const ascending = filters.orderBy.startsWith("+");
                  const nextAscending = active
                    ? !ascending
                    : field === "first_name" || field === "email_address";
                  const SortIcon = active
                    ? ascending
                      ? ArrowUp
                      : ArrowDown
                    : ArrowUpDown;
                  return (
                    <th
                      key={field}
                      scope="col"
                      aria-sort={
                        active ? (ascending ? "ascending" : "descending") : "none"
                      }
                    >
                      <button
                        type="button"
                        className="users-sort-button"
                        aria-label={`Ordenar por ${sortLabel} en orden ${nextAscending ? "ascendente" : "descendente"}`}
                        onClick={() =>
                          setFilters((previous) => ({
                            ...previous,
                            page: 0,
                            orderBy: `${nextAscending ? "+" : "-"}${field}`,
                          }))
                        }
                      >
                        {label}
                        <SortIcon size={13} aria-hidden="true" />
                      </button>
                    </th>
                  );
                })}
                {project.billing && <th scope="col">Origen del alta</th>}
                {project.billing && <th scope="col">Plan</th>}
                {project.billing && (
                  <th scope="col" className="users-actions">
                    Acciones
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {!current && !error
                ? Array.from({ length: 5 }, (_, index) => (
                    <tr key={index}>
                      {Array.from(
                        { length: project.billing ? 7 : 4 },
                        (_, cell) => (
                          <td key={cell}>
                            <Skeleton className="h-5 w-24" />
                          </td>
                        ),
                      )}
                    </tr>
                  ))
                : current?.users.map((user) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      onUpdated={refresh}
                      onDeleted={onDeleted}
                      showBilling={project.billing}
                      acquisitionStatus={current?.acquisition}
                      source={new URLSearchParams({
                        project: project.id,
                        team,
                      }).toString()}
                    />
                  ))}
              {current && current.users.length === 0 && (
                <tr>
                  <td colSpan={project.billing ? 7 : 4} className="small-empty">
                    {filters.query
                      ? "No hay usuarios que coincidan con esta búsqueda."
                      : filters.period
                        ? "No se han registrado usuarios en este periodo."
                        : filters.page
                          ? "No hay usuarios en esta página. Vuelve a la anterior."
                          : `${project.name} todavía no tiene usuarios registrados.`}
                  </td>
                </tr>
              )}
              {!current && error && (
                <tr>
                  <td colSpan={project.billing ? 7 : 4} className="small-empty">
                    No se ha podido cargar la lista de usuarios.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="users-pagination">
          <span role="status">
            {current
              ? `${number(current.filteredTotal)} ${current.filteredTotal === 1 ? "usuario" : "usuarios"}${filters.query || filters.period ? " con estos filtros" : " en total"}`
              : "Pendiente de consulta"}
          </span>
          <div>
            <Button
              variant="outline"
              size="sm"
              aria-label="Página anterior de usuarios"
              disabled={filters.page === 0 || isValidating}
              onClick={() =>
                setFilters((previous) => ({
                  ...previous,
                  page: previous.page - 1,
                }))
              }
            >
              <ChevronLeft size={14} />
              Anterior
            </Button>
            <span>
              {filters.page + 1} / {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              aria-label="Página siguiente de usuarios"
              disabled={!current || filters.page + 1 >= pages || isValidating}
              onClick={() =>
                setFilters((previous) => ({
                  ...previous,
                  page: previous.page + 1,
                }))
              }
            >
              Siguiente
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      </section>
      <p className="users-updated" role="status">
        {current
          ? `Última lectura: ${date(Date.parse(current.fetchedAt))}. Actualización automática cada minuto.`
          : "La consulta de usuarios requiere acceso de administrador."}
      </p>
    </div>
  );
}
