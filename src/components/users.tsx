"use client";

import { memo, useEffect, useState } from "react";
import useSWR from "swr";
import {
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
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { useDashboard } from "@/stores/dashboard";
import type { RegisteredUser, UsersResult } from "@/lib/types";
import { cn } from "@/lib/utils";

const number = (value: number | undefined) =>
  value?.toLocaleString("es-ES") ?? "—";
const date = (value: number | null) =>
  value === null
    ? "Sin accesos"
    : new Date(value).toLocaleString("es-ES", {
        dateStyle: "medium",
        timeStyle: "short",
      });
const UserRow = memo(function UserRow({ user }: { user: RegisteredUser }) {
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
    </tr>
  );
});

export default function Users({ userId }: { userId: string }) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ query: "", period: 0, page: 0 });
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
    q: filters.query,
    period: String(filters.period),
    page: String(filters.page),
  });
  const url = `/api/users?${params}`;
  const key = `${userId}:${url}`;
  const snapshot = useDashboard((s) => s.userSnapshots[key]);
  const lastSnapshot = useDashboard(
    (s) =>
      Object.entries(s.userSnapshots).findLast(([cachedKey]) =>
        cachedKey.startsWith(`${userId}:/api/users?`),
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
  const summary = current ?? lastSnapshot;
  const pages = Math.max(
    1,
    Math.ceil((current?.filteredTotal ?? 0) / (current?.pageSize ?? 25)),
  );
  return (
    <div className="users-screen">
      <div className="users-source">
        <div>
          <strong>Diariamente</strong>
          <span>Usuarios registrados en la aplicación</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {summary && (
            <Badge variant="outline">
              Clerk ·{" "}
              {summary.environment === "production"
                ? "Producción"
                : "Desarrollo"}
            </Badge>
          )}
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
      {summary?.environment === "development" && (
        <div className="notice" role="status">
          Estás viendo la instancia de desarrollo de Diariamente. Para consultar
          las altas de producción, conecta su instancia de producción en
          Configuración.
        </div>
      )}
      <div
        className="metrics-strip users-metrics"
        aria-label="Resumen de registros de Diariamente"
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
            <p>Ordenados del registro más reciente al más antiguo.</p>
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
          aria-label="Lista de usuarios de Diariamente"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Usuario y correo</th>
                <th scope="col">Fecha de registro</th>
                <th scope="col">Último acceso</th>
                <th scope="col">Correo</th>
              </tr>
            </thead>
            <tbody>
              {!current && !error
                ? Array.from({ length: 5 }, (_, index) => (
                    <tr key={index}>
                      {Array.from({ length: 4 }, (_, cell) => (
                        <td key={cell}>
                          <Skeleton className="h-5 w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                : current?.users.map((user) => (
                    <UserRow key={user.id} user={user} />
                  ))}
              {current && current.users.length === 0 && (
                <tr>
                  <td colSpan={4} className="small-empty">
                    {filters.query
                      ? "No hay usuarios que coincidan con esta búsqueda."
                      : filters.period
                        ? "No se han registrado usuarios en este periodo."
                        : filters.page
                          ? "No hay usuarios en esta página. Vuelve a la anterior."
                          : "Diariamente todavía no tiene usuarios registrados."}
                  </td>
                </tr>
              )}
              {!current && error && (
                <tr>
                  <td colSpan={4} className="small-empty">
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
