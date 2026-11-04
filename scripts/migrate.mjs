import { neon } from "@neondatabase/serverless";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const sql = neon(process.env.DATABASE_URL);
const directory = fileURLToPath(new URL("../migrations/", import.meta.url));
// Migrations are idempotent; run all files in order to update existing installs.
for (const file of (await readdir(directory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()) {
  const source = await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8");
  await sql.transaction(source.split(";").map((s) => s.trim()).filter(Boolean).map((s) => sql.query(s)));
  console.log(`Migración ${file} aplicada.`);
}
