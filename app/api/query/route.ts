import { NextRequest, NextResponse } from "next/server";
import { generateSql } from "@/lib/groq";
import { guardSql } from "@/lib/sql-guard";
import { runReadOnly } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let question = "";
  try {
    const body = await req.json();
    question = (body?.question ?? "").toString().trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!question) {
    return NextResponse.json({ error: "Please enter a question." }, { status: 400 });
  }
  if (question.length > 500) {
    return NextResponse.json({ error: "Question is too long (max 500 chars)." }, { status: 400 });
  }

  // 1. Ask the LLM for SQL.
  let rawSql: string;
  try {
    rawSql = await generateSql(question);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  // 2. Validate it is a safe, single, read-only SELECT.
  const guard = guardSql(rawSql);
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.error, sql: rawSql },
      { status: 400 }
    );
  }

  // 3. Execute read-only against Postgres.
  try {
    const rows = await runReadOnly(guard.sql);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return NextResponse.json({ sql: guard.sql, rows, columns, rowCount: rows.length });
  } catch (e) {
    return NextResponse.json(
      { error: `SQL execution failed: ${(e as Error).message}`, sql: guard.sql },
      { status: 400 }
    );
  }
}
