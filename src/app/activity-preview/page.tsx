"use client";
import { useState } from "react";
import { SWRConfig } from "swr";
import Activity from "@/components/activity";
import { madridDate, type ActivityResult } from "@/lib/activity-data";

export default function Preview() {
  const [mode, setMode] = useState("normal");
  const today = madridDate();
  const result: ActivityResult = { connected: mode !== "setup", storage: mode !== "setup", dates: [today, "2026-11-03"], digest: ["setup", "missing"].includes(mode) ? null : {
    date: today, username: "usuario-demo", since: `${today}T00:00:00Z`, until: `${today}T19:00:00Z`, generatedAt: new Date().toISOString(), repositoriesChecked: 3,
    issues: mode === "partial" ? ["demo/invoicer: GitHub ha rechazado la consulta (403). Comprueba los permisos de lectura."] : [],
    projects: mode === "empty" ? [] : ["urithiru", "diariamente"].map((name, i) => ({ repository: `demo/${name}`, url: "https://github.com/", summary: [{ label: "Funcionalidades", count: 1 }, { label: "Correcciones", count: 1 }], commits: [
      { sha: `${i}a`.repeat(20), title: i ? "feat: añadir filtros de pacientes por clínica" : "feat: resumen diario de actividad por proyecto", message: i ? "feat: añadir filtros de pacientes por clínica" : "feat: resumen diario de actividad por proyecto\n\nAgrupa los commits de todas las ramas y conserva el histórico.", url: "https://github.com/", timestamp: `${today}T10:15:00Z`, branches: ["main", "feat/daily-activity"] },
      { sha: `${i}b`.repeat(20), title: "fix: conservar los datos al cambiar de proyecto", message: "fix: conservar los datos al cambiar de proyecto", url: "https://github.com/", timestamp: `${today}T15:45:00Z`, branches: ["main"] },
    ] })),
  } };
  return <SWRConfig key={mode} value={{ provider: () => new Map(), fetcher: async () => { if (mode === "error") throw new Error("No se ha podido consultar la fuente. Inténtalo de nuevo."); return result; } }}><div style={{ maxWidth: 1040, padding: 24, margin: "0 auto" }}><p>Vista de prueba · datos ficticios</p><select aria-label="Escenario" value={mode} onChange={(e) => setMode(e.target.value)}>{["normal", "partial", "empty", "missing", "setup", "error"].map((item) => <option key={item}>{item}</option>)}</select><Activity userId="preview" /></div></SWRConfig>;
}
