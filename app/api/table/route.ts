import { NextRequest, NextResponse } from "next/server";
import { runReadOnly } from "@/lib/db";
import { SCHEMA_TABLES } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 30;

// Only these exact table names are allowed, so the name is safe to interpolate.
const ALLOWED = new Set(SCHEMA_TABLES.map((t) => t.name));

export async function GET(req: NextRequest) {
  const name = (req.nextUrl.searchParams.get("name") || "").trim();

  if (!ALLOWED.has(name)) {
    return NextResponse.json({ error: "Unknown table." }, { status: 400 });
  }

  try {
    const rows = await runReadOnly(`SELECT * FROM ${name} LIMIT 100`);
    const def = SCHEMA_TABLES.find((t) => t.name === name)!;
    const columns = rows.length > 0 ? Object.keys(rows[0]) : def.columns.map((c) => c.name);
    return NextResponse.json({ table: name, columns, rows, rowCount: rows.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
