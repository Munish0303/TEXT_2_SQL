// Defense-in-depth: make sure the LLM-generated SQL is a single read-only query
// before it ever reaches the database (which is also set to READ ONLY).

const FORBIDDEN = [
  "insert", "update", "delete", "drop", "alter", "create", "truncate",
  "grant", "revoke", "comment", "copy", "vacuum", "analyze", "reindex",
  "call", "do", "merge", "lock", "set ", "reset", "begin", "commit",
  "rollback", "savepoint", "listen", "notify", "prepare", "execute",
  "pg_sleep", "pg_read_file", "pg_ls_dir", "dblink", "into ",
];

export function extractSql(raw: string): string {
  let s = raw.trim();
  // Strip ```sql ... ``` or ``` ... ``` fences if the model added them.
  const fence = s.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // Drop a trailing semicolon.
  s = s.replace(/;\s*$/, "").trim();
  return s;
}

export type GuardResult =
  | { ok: true; sql: string }
  | { ok: false; error: string };

export function guardSql(raw: string): GuardResult {
  const sql = extractSql(raw);

  if (!sql) return { ok: false, error: "Model returned an empty query." };

  // Only a single statement is allowed.
  if (sql.includes(";")) {
    return { ok: false, error: "Only a single SQL statement is allowed." };
  }

  const lower = sql.toLowerCase();

  // Must start with SELECT or WITH (CTEs).
  if (!/^\s*(select|with)\b/.test(lower)) {
    return { ok: false, error: "Only SELECT queries are allowed." };
  }

  // Reject any forbidden keyword (word-boundary matched).
  for (const kw of FORBIDDEN) {
    const pattern = new RegExp(`(^|[^a-z_])${kw.trim()}([^a-z_]|$)`, "i");
    if (pattern.test(lower)) {
      return { ok: false, error: `Query contains a disallowed keyword: "${kw.trim()}".` };
    }
  }

  return { ok: true, sql: enforceLimit(sql) };
}

// Append a LIMIT if the (top-level) query has none, to keep result sets small.
function enforceLimit(sql: string, max = 200): string {
  if (/\blimit\b/i.test(sql)) return sql;
  return `${sql}\nLIMIT ${max}`;
}
