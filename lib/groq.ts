import { SCHEMA_PROMPT } from "./schema";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = `You are an expert PostgreSQL analyst. Convert the user's question into ONE
valid PostgreSQL SELECT query for the schema below.

RULES
- Output ONLY the SQL. No explanations, no markdown fences, no comments.
- Use a single SELECT (CTEs with WITH are fine). Never write INSERT/UPDATE/DELETE/DDL.
- Never use semicolons.
- Always include a LIMIT (<= 200) unless the question is a single aggregate value.
- Use only tables/columns that exist in the schema. Qualify columns when joining.
- Prefer readable column aliases (e.g. AS total_revenue).
- When the user asks about category names, join the English translation table.

${SCHEMA_PROMPT}`;

export async function generateSql(question: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set. Get a free key at https://console.groq.com/keys");
  }
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 700,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: question },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Groq API error (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Groq returned an empty response.");
  return content;
}
