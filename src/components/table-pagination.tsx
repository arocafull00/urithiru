"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TABLE_PAGE_SIZE } from "@/lib/pagination";
import { Button } from "./ui/button";

export function usePagination<T>(rows: readonly T[], resetKey = "") {
  const [state, setState] = useState({ page: 0, resetKey });
  const pages = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE));
  const page = state.resetKey === resetKey ? Math.min(state.page, pages - 1) : 0;
  if (state.resetKey !== resetKey || state.page !== page) {
    setState({ page, resetKey });
  }
  return {
    page,
    rows: rows.slice(page * TABLE_PAGE_SIZE, (page + 1) * TABLE_PAGE_SIZE),
    setPage: (next: number) => setState({ page: next, resetKey }),
  };
}

export function TablePagination({ page, total, onPageChange, label, disabled = false, summary }: {
  page: number;
  total: number | undefined;
  onPageChange: (page: number) => void;
  label: string;
  disabled?: boolean;
  summary?: string;
}) {
  const pages = Math.max(1, Math.ceil((total ?? 0) / TABLE_PAGE_SIZE));
  const start = total ? page * TABLE_PAGE_SIZE + 1 : 0;
  const end = Math.min((page + 1) * TABLE_PAGE_SIZE, total ?? 0);
  return (
    <nav className="users-pagination" aria-label={`Paginación de ${label}`}>
      <span role="status">
        {summary ?? (total === undefined ? "Pendiente de consulta" : `${start}–${end} de ${total.toLocaleString("es-ES")}`)}
      </span>
      <div>
        <Button type="button" variant="outline" size="sm"
          aria-label={`Página anterior de ${label}`}
          disabled={page === 0 || disabled}
          onClick={() => onPageChange(page - 1)}>
          <ChevronLeft size={14} aria-hidden="true" />
          Anterior
        </Button>
        <span className="whitespace-nowrap" aria-live="polite" aria-atomic="true">{page + 1} / {pages}</span>
        <Button type="button" variant="outline" size="sm"
          aria-label={`Página siguiente de ${label}`}
          disabled={total === undefined || page + 1 >= pages || disabled}
          onClick={() => onPageChange(page + 1)}>
          Siguiente
          <ChevronRight size={14} aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
