import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const sql = neon(process.env.DATABASE_URL);
const source = await readFile(
  fileURLToPath(new URL("../migrations/0001_logs.sql", import.meta.url)),
  "utf8",
);
await sql.transaction(
  source
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => sql.query(s)),
);
console.log("Migración 0001 aplicada.");
