import { NextRequest, NextResponse } from "next/server";
import { answerQuestion } from "@/lib/agent";

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

  const result = await answerQuestion(question);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, sql: result.sql, attempts: result.attempts, corrections: result.corrections },
      { status: 400 }
    );
  }

  return NextResponse.json({
    sql: result.sql,
    rows: result.rows,
    columns: result.columns,
    rowCount: result.rowCount,
    attempts: result.attempts,
    corrections: result.corrections,
  });
}
