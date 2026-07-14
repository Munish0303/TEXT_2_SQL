"use client";

import { useState } from "react";

type QueryResult = {
  sql: string;
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
};

const EXAMPLES = [
  "What are the top 10 product categories by revenue?",
  "How many orders were placed in each state?",
  "What is the average review score by payment type?",
  "Which sellers have the most orders?",
  "Show monthly order counts in 2018",
  "Average delivery time in days by customer state",
];

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorSql, setErrorSql] = useState<string | null>(null);

  async function run(q: string) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setErrorSql(null);
    setResult(null);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setErrorSql(data.sql || null);
      } else {
        setResult(data as QueryResult);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <div className="header">
        <h1>
          Olist <span className="brand">Text-to-SQL</span>
        </h1>
        <p>Ask the Brazilian e-commerce dataset a question in plain English. It writes the SQL and runs it.</p>
      </div>

      <div className="card">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(question);
          }}
        >
          <input
            type="text"
            placeholder="e.g. Top 10 product categories by revenue"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={500}
          />
          <button type="submit" disabled={loading || !question.trim()}>
            {loading ? <span className="spinner" /> : "Ask"}
          </button>
        </form>

        <div className="examples">
          {EXAMPLES.map((ex) => (
            <span
              key={ex}
              className="chip"
              onClick={() => {
                setQuestion(ex);
                run(ex);
              }}
            >
              {ex}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <div className="card">
          <div className="error">{error}</div>
          {errorSql && (
            <>
              <div className="label" style={{ marginTop: 14 }}>Generated SQL</div>
              <pre className="sql">{errorSql}</pre>
            </>
          )}
        </div>
      )}

      {result && (
        <div className="card">
          <div className="label">Generated SQL</div>
          <pre className="sql">{result.sql}</pre>

          <div className="label" style={{ marginTop: 18 }}>
            Result — {result.rowCount} row{result.rowCount === 1 ? "" : "s"}
          </div>

          {result.rowCount === 0 ? (
            <div className="meta">No rows returned.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {result.columns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i}>
                      {result.columns.map((c) => (
                        <td key={c}>{formatCell(row[c])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="footer">
        Built with Next.js · Groq (Llama 3.3) · Supabase Postgres. Read-only, SELECT queries only.
      </div>
    </main>
  );
}
