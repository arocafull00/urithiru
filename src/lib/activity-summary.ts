import type { ActivityDigest } from "./activity-data";

export const DEFAULT_SUMMARY_MODEL = "openai/gpt-oss-120b";
const MAX_PROMPT_CHARS = 12000;

export function buildSummaryPrompt(digest: Pick<ActivityDigest, "date" | "projects">) {
  const lines: string[] = [];
  for (const project of digest.projects) {
    lines.push(`## ${project.repository} (${project.commits.length} commits)`);
    for (const commit of project.commits) {
      const body = commit.message.slice(commit.title.length).trim().replace(/\s+/g, " ").slice(0, 300);
      lines.push(`- ${commit.title}${body ? ` — ${body}` : ""}`);
    }
  }
  return lines.join("\n").slice(0, MAX_PROMPT_CHARS);
}

// Returns null when the AI is not configured or fails: the digest is still
// valuable without it, so callers must never fail because of the summary.
export async function summarizeActivity({
  apiKey, model = DEFAULT_SUMMARY_MODEL, digest, transport = fetch,
}: {
  apiKey: string; model?: string;
  digest: Pick<ActivityDigest, "date" | "projects">; transport?: typeof fetch;
}): Promise<string | null> {
  if (!apiKey || !digest.projects.some((p) => p.commits.length)) return null;
  try {
    const response = await transport("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, temperature: 0.3, max_tokens: 1000, reasoning_effort: "low",
        messages: [
          {
            role: "system",
            content: "Eres un asistente que resume la jornada de trabajo de un desarrollador a partir de sus commits. " +
              "Responde en español, en segunda persona del singular (\"Has...\"), en un párrafo de 2 a 4 frases, " +
              "sin listas ni encabezados ni markdown. Agrupa por logros y proyectos, destaca lo más importante y no inventes nada que no aparezca en los commits. " +
              "No menciones hashes ni cifras de commits.",
          },
          { role: "user", content: `Commits del ${digest.date}:\n\n${buildSummaryPrompt(digest)}` },
        ],
      }),
      cache: "no-store", signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return null;
    const body = await response.json() as { choices?: { message?: { content?: unknown } }[] };
    const text = body.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}
