import postgres from "postgres";

// A single shared connection is reused across warm serverless invocations.
declare global {
  // eslint-disable-next-line no-var
  var _sql: ReturnType<typeof postgres> | undefined;
}

function makeClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.local.example to .env.local and fill it in.");
  }
  return postgres(url, {
    // Supabase's transaction pooler (pgBouncer) does not support prepared statements.
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 15,
  });
}

// Lazily created on first use so `next build` doesn't require DATABASE_URL.
function getSql() {
  return (global._sql ??= makeClient());
}

/**
 * Execute a read-only SELECT statement inside a read-only transaction with a
 * statement timeout. Even if the guard were bypassed, the DB itself refuses writes.
 */
export async function runReadOnly(query: string): Promise<Record<string, unknown>[]> {
  const sql = getSql();
  return sql.begin(async (tx) => {
    await tx.unsafe("SET TRANSACTION READ ONLY");
    await tx.unsafe("SET LOCAL statement_timeout = '10000'");
    const rows = await tx.unsafe(query);
    return rows as unknown as Record<string, unknown>[];
  }) as unknown as Promise<Record<string, unknown>[]>;
}
