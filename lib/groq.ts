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

export type GenerateArgs = {
  question: string;
  // When present, ask the model to REPAIR a previous attempt that failed.
  previousSql?: string;
  error?: string;
};

function buildUserMessage({ question, previousSql, error }: GenerateArgs): string {
  if (previousSql && error) {
    return [
      `Your previous SQL for this question failed. Fix it and return only the corrected query.`,
      ``,
      `Question: ${question}`,
      ``,
      `Previous SQL:`,
      previousSql,
      ``,
      `Error: ${error}`,
      ``,
      `Return ONE corrected PostgreSQL SELECT query. Output only the SQL, no explanation.`,
    ].join("\n");
  }
  return question;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Groq's free tier is rate-limited (tokens/minute). On 429 we wait the amount
// Groq tells us to and retry, so a burst of requests degrades gracefully.
function retryDelayMs(res: Response, body: string): number {
  const header = res.headers.get("retry-after");
  if (header && !Number.isNaN(Number(header))) return Number(header) * 1000;
  const m = body.match(/try again in ([\d.]+)\s*(ms|s)/i);
  if (m) return m[2].toLowerCase() === "ms" ? Number(m[1]) : Number(m[1]) * 1000;
  return 3000;
}

export async function generateSql(args: GenerateArgs): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set. Get a free key at https://console.groq.com/keys");
  }
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const MAX_RETRIES = 4;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
          { role: "user", content: buildUserMessage(args) },
        ],
      }),
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const body = await res.text().catch(() => "");
      const wait = Math.min(retryDelayMs(res, body) + 250, 15000);
      await sleep(wait);
      continue;
    }

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

  throw new Error("Groq API rate limit: exceeded retries. Try again in a moment.");
}
