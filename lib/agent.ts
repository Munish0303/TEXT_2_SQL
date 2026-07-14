import { generateSql } from "./groq";
import { guardSql, extractSql } from "./sql-guard";
import { runReadOnly } from "./db";

// One correction attempt: what the model produced and why it was rejected.
export type Attempt = { sql: string; error: string };

export type AgentSuccess = {
  ok: true;
  sql: string;
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
  attempts: number; // 1 = right on the first try
  corrections: Attempt[]; // the failed tries it recovered from
};

export type AgentFailure = {
  ok: false;
  error: string;
  sql?: string;
  attempts: number;
  corrections: Attempt[];
};

export type AgentResult = AgentSuccess | AgentFailure;

const MAX_ATTEMPTS = 3;

/**
 * Self-correcting text-to-SQL agent.
 * Generates SQL, and if the guard rejects it OR Postgres errors on it, it feeds
 * the failing SQL + the error back to the model and retries, up to MAX_ATTEMPTS.
 */
export async function answerQuestion(question: string): Promise<AgentResult> {
  const corrections: Attempt[] = [];
  let previousSql: string | undefined;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // 1. Ask the model (repair mode after the first failure).
    let raw: string;
    try {
      raw = await generateSql(
        previousSql && lastError ? { question, previousSql, error: lastError } : { question }
      );
    } catch (e) {
      return { ok: false, error: (e as Error).message, attempts: attempt, corrections };
    }

    // 2. Validate: must be a single read-only SELECT.
    const guard = guardSql(raw);
    if (!guard.ok) {
      previousSql = extractSql(raw);
      lastError = guard.error;
      corrections.push({ sql: previousSql, error: guard.error });
      if (attempt === MAX_ATTEMPTS) {
        return { ok: false, error: guard.error, sql: previousSql, attempts: attempt, corrections };
      }
      continue; // retry with the error fed back
    }

    // 3. Execute read-only.
    try {
      const rows = await runReadOnly(guard.sql);
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      return {
        ok: true,
        sql: guard.sql,
        rows,
        columns,
        rowCount: rows.length,
        attempts: attempt,
        corrections,
      };
    } catch (e) {
      const msg = (e as Error).message;
      previousSql = guard.sql;
      lastError = msg;
      corrections.push({ sql: guard.sql, error: msg });
      if (attempt === MAX_ATTEMPTS) {
        return {
          ok: false,
          error: `SQL execution failed: ${msg}`,
          sql: guard.sql,
          attempts: attempt,
          corrections,
        };
      }
      // else loop and let the model repair it
    }
  }

  return { ok: false, error: "Could not produce a working query.", attempts: MAX_ATTEMPTS, corrections };
}
